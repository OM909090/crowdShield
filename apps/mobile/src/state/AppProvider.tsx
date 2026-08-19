import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LANGUAGE,
  HEARTBEAT_INTERVAL_MS,
  fromAccountLanguage,
  isLanguageCode,
  type LanguageCode,
} from "@crowdshield/config";
import type { Event, Fix, User } from "@crowdshield/types";
import { ApiError } from "@crowdshield/api-client";
import { api, loadApiBaseUrl, session, setSessionLostHandler } from "../api";
import { translator, type Translate } from "../i18n";

/**
 * One provider for the things every screen needs: who is signed in, which
 * language they read, which event they joined, and whether they are sharing
 * location.
 *
 * Deliberately not a state library. There are four pieces of state and one of
 * them changes once a second; a reducer library would add indirection without
 * removing any of the actual complexity, which lives in the location lifecycle.
 */

const LANG_KEY = "crowdshield.language";
const DEVICE_KEY = "crowdshield.deviceHash";
/** After this long with no GPS fix, stop showing "Locating…" (the watch stays live). */
const GPS_ACQUIRE_TIMEOUT_MS = 25_000;

interface AppState {
  /* --- language --- */
  readonly lang: LanguageCode;
  readonly t: Translate;
  readonly setLang: (lang: LanguageCode) => void;
  /** False until the stored language has been read — the splash waits on this. */
  readonly ready: boolean;
  /** True when the user has never chosen a language, so we ask. */
  readonly needsLanguage: boolean;

  /* --- session --- */
  readonly user: User | null;
  readonly authChecked: boolean;
  readonly signIn: (identifier: string, password: string) => Promise<void>;
  readonly signOut: () => Promise<void>;

  /* --- event --- */
  readonly event: Event | null;
  readonly selectEvent: (event: Event | null) => void;

  /* --- location --- */
  readonly sharing: boolean;
  readonly locating: boolean;
  readonly permissionDenied: boolean;
  readonly fix: Fix | null;
  readonly startSharing: () => Promise<boolean>;
  readonly stopSharing: () => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { readonly children: ReactNode }) {
  const [lang, setLangState] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  const [needsLanguage, setNeedsLanguage] = useState(false);
  const [ready, setReady] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [event, setEvent] = useState<Event | null>(null);

  const [sharing, setSharing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);

  // Read by the heartbeat timer, which must not re-create itself on every fix.
  const fixRef = useRef<Fix | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventIdRef = useRef<string | null>(null);
  // A monotonic id for each start attempt. `startSharing` has several awaits
  // (permission prompt, watch handle); if the user stops sharing — or leaves the
  // event, or signs out — during one of them, the attempt is stale and must not
  // install a watch/heartbeat that nothing will ever clear. Bumping this on stop
  // (and on the next start) invalidates any in-flight attempt.
  const shareGenRef = useRef(0);
  // Stops the "Locating…" state from lasting forever when a GPS fix never comes.
  const locateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    eventIdRef.current = event?._id ?? null;
  }, [event]);

  /* ---------------- boot: language, then session ---------------- */

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Before any request: apply a stored server override, or the first call
      // goes to the address baked in at build time and fails for no visible reason.
      await loadApiBaseUrl();

      // Language next: a citizen who does not read English must not be shown an
      // English error while we work out whether they are signed in.
      try {
        const stored = await AsyncStorage.getItem(LANG_KEY);
        if (!cancelled) {
          if (isLanguageCode(stored)) setLangState(stored);
          else setNeedsLanguage(true);
        }
      } catch {
        if (!cancelled) setNeedsLanguage(true);
      }
      if (!cancelled) setReady(true);

      // Only ask the server who we are if we hold a session at all — otherwise
      // that is a guaranteed 401 and a wasted round trip on a cold start.
      try {
        if (await session.hasSession()) {
          const { user: me } = await api.auth.me();
          if (!cancelled) {
            setUser(me);
            // Respect the account's language if the device has no preference.
            if (!isLanguageCode(await AsyncStorage.getItem(LANG_KEY))) {
              setLangState(fromAccountLanguage(me.language));
            }
          }
        }
      } catch (err) {
        // Only a real server answer (401 and the like) means the stored session
        // is dead. A transport failure at a cold start — the phone is still on
        // aeroplane mode, weak signal at a venue gate — must NOT force a valid
        // user back to the login screen; keep the session and let a later authed
        // request bounce them via onUnauthorized if it truly is gone.
        const offline = err instanceof ApiError && err.offline;
        if (!offline && !cancelled) setUser(null);
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** An unrecoverable 401 anywhere in the app lands here. */
  useEffect(() => {
    setSessionLostHandler(() => {
      setUser(null);
      setEvent(null);
    });
  }, []);

  const setLang = useCallback((next: LanguageCode) => {
    setLangState(next);
    setNeedsLanguage(false);
    void AsyncStorage.setItem(LANG_KEY, next);
  }, []);

  /* ---------------- location sharing ---------------- */

  const stopSharing = useCallback(() => {
    // Invalidate any startSharing still working through its awaits.
    shareGenRef.current += 1;
    watchRef.current?.remove();
    watchRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (locateTimerRef.current) clearTimeout(locateTimerRef.current);
    locateTimerRef.current = null;
    setSharing(false);
    setLocating(false);
    setFix(null);
    fixRef.current = null;
  }, []);

  /**
   * Ask for permission, start watching, and begin the heartbeat.
   *
   * Returns false when the person declined, so the caller can route them to the
   * browse-only experience instead of a screen that waits forever for a fix.
   */
  const startSharing = useCallback(async (): Promise<boolean> => {
    // Claim this attempt. Any await below re-checks that it is still the current
    // one; if stopSharing (or a newer start) has run, we abort and clean up.
    const gen = (shareGenRef.current += 1);
    const superseded = () => shareGenRef.current !== gen;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (superseded()) return false;
    if (status !== Location.PermissionStatus.GRANTED) {
      setPermissionDenied(true);
      setSharing(false);
      return false;
    }
    setPermissionDenied(false);
    setLocating(true);
    setSharing(true);

    watchRef.current?.remove();
    watchRef.current = null;

    // watchPositionAsync rejects when device location SERVICES are off (even with
    // permission granted). Catch it so the caller gets `false` instead of an
    // unhandled throw that would strand the consent screen.
    let subscription: Location.LocationSubscription;
    try {
      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          // A crowd moves slowly. 5 m / 2 s is enough to see someone drift toward a
          // chokepoint without draining the battery they may need for hours.
          distanceInterval: 5,
          timeInterval: 2000,
        },
        (position) => {
          if (superseded()) return; // a stale callback from a torn-down watch
          const next: Fix = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            heading: position.coords.heading ?? undefined,
            speed: position.coords.speed ?? undefined,
          };
          fixRef.current = next;
          setFix(next);
          setLocating(false);
          if (locateTimerRef.current) {
            clearTimeout(locateTimerRef.current);
            locateTimerRef.current = null;
          }
        }
      );
    } catch {
      if (!superseded()) {
        setLocating(false);
        setSharing(false);
      }
      return false;
    }

    // Stopped (or restarted) while we were awaiting the watch handle: don't leak it.
    if (superseded()) {
      subscription.remove();
      return false;
    }
    watchRef.current = subscription;

    // If no fix arrives, stop pretending to locate forever. The watch stays live
    // (a fix may still land), but the UI stops showing an endless "Locating…".
    if (locateTimerRef.current) clearTimeout(locateTimerRef.current);
    locateTimerRef.current = setTimeout(() => {
      if (!superseded()) setLocating(false);
    }, GPS_ACQUIRE_TIMEOUT_MS);

    // The anonymous sensor id. A random value, stored on the device, never sent
    // with the account — this is what makes "the system sees hexagons, not
    // people" true rather than a marketing line.
    let deviceHash = await AsyncStorage.getItem(DEVICE_KEY);
    if (superseded()) return false;
    if (!deviceHash) {
      deviceHash = `dev-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
      await AsyncStorage.setItem(DEVICE_KEY, deviceHash);
      if (superseded()) return false;
    }

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const current = fixRef.current;
      const eventId = eventIdRef.current;
      if (!current || !eventId) return;
      // A dropped heartbeat every four seconds is not worth telling anyone about;
      // the next one is along shortly.
      void api.citizen
        .ingest(eventId, [
          {
            deviceHash: deviceHash as string,
            lat: current.lat,
            lng: current.lng,
            heading: current.heading,
            speed: current.speed,
          },
        ])
        .catch(() => undefined);
    }, HEARTBEAT_INTERVAL_MS);

    return true;
  }, []);

  /** Never leave a watch or a timer running behind us. */
  useEffect(() => stopSharing, [stopSharing]);

  /* ---------------- auth actions ---------------- */

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      const { user: me } = await api.auth.login({ identifier, password, rememberMe: true });
      setUser(me);
    },
    []
  );

  const signOut = useCallback(async () => {
    stopSharing();
    try {
      await api.auth.logout();
    } catch {
      // Even if the server never hears about it, this device is signed out.
    }
    await session.clear();
    setUser(null);
    setEvent(null);
  }, [stopSharing]);

  const selectEvent = useCallback(
    (next: Event | null) => {
      // Leaving an event must stop the sensor with it, or a phone keeps reporting
      // into a crowd its owner has walked away from.
      if (!next) stopSharing();
      setEvent(next);
    },
    [stopSharing]
  );

  const value = useMemo<AppState>(
    () => ({
      lang,
      t: translator(lang),
      setLang,
      ready,
      needsLanguage,
      user,
      authChecked,
      signIn,
      signOut,
      event,
      selectEvent,
      sharing,
      locating,
      permissionDenied,
      fix,
      startSharing,
      stopSharing,
    }),
    [
      lang, setLang, ready, needsLanguage, user, authChecked, signIn, signOut,
      event, selectEvent, sharing, locating, permissionDenied, fix, startSharing, stopSharing,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside an AppProvider");
  return ctx;
}
