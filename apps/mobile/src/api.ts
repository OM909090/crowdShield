import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createApiClient, nativeSession, type SecureStore as Store } from "@crowdshield/api-client";

/**
 * The single API client for the app.
 *
 * It talks to the SAME backend as the web console — same routes, same validators,
 * same auth. Nothing mobile-specific exists on the server, and this file is where
 * that stays true: the only platform-specific piece is where the session is kept.
 */

/**
 * Tokens are credentials, so they go in the OS keystore rather than AsyncStorage.
 * SecureStore is hardware-backed where the device supports it.
 */
const keystore: Store = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  remove: (key) => SecureStore.deleteItemAsync(key),
};

export const session = nativeSession(keystore);

const OVERRIDE_KEY = "crowdshield.apiBaseUrl";

/**
 * Where the API lives, by default.
 *
 * `localhost` on a phone means the phone itself, so it can never reach a dev
 * server on a laptop. Resolution order:
 *   1. EXPO_PUBLIC_API_URL — baked in at build time.
 *   2. The host serving the Metro bundle. Only present in a development build;
 *      a release APK has no Metro host, which is why 1 or the runtime override
 *      matters for a real installed app.
 *   3. 10.0.2.2, the Android emulator's alias for the host machine's localhost.
 */
function resolveDefaultBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (explicit) return explicit;

  const port = process.env.EXPO_PUBLIC_API_PORT?.trim() || "5000";
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(":")[0];
  if (host && host !== "localhost" && host !== "127.0.0.1") return `http://${host}:${port}/api`;

  return Platform.OS === "android" ? `http://10.0.2.2:${port}/api` : `http://localhost:${port}/api`;
}

export const DEFAULT_API_BASE_URL = resolveDefaultBaseUrl();

/**
 * The address in use right now.
 *
 * Mutable on purpose. A build-time address is a liability in the field: a LAN IP
 * changes with the network, and the only other remedy is rebuilding a 54 MB APK.
 * Being able to retarget the app from a settings screen turns a dead install into
 * a ten-second fix.
 */
let currentBaseUrl = DEFAULT_API_BASE_URL;

export const getApiBaseUrl = (): string => currentBaseUrl;

/** Normalise whatever a person typed into something fetchable. */
export function normaliseBaseUrl(input: string): string {
  let value = input.trim();
  if (!value) return DEFAULT_API_BASE_URL;
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
  value = value.replace(/\/+$/, "");
  // The API is mounted under /api; accept an address with or without it.
  if (!/\/api$/i.test(value)) value = `${value}/api`;
  return value;
}

/** Persist and apply a new address. Takes effect on the next request, no restart. */
export async function setApiBaseUrl(input: string): Promise<string> {
  const next = normaliseBaseUrl(input);
  currentBaseUrl = next;
  await AsyncStorage.setItem(OVERRIDE_KEY, next);
  return next;
}

export async function clearApiBaseUrl(): Promise<string> {
  currentBaseUrl = DEFAULT_API_BASE_URL;
  await AsyncStorage.removeItem(OVERRIDE_KEY);
  return currentBaseUrl;
}

/**
 * Load a stored override. Called once during boot, before the first request —
 * the provider awaits this so no request can go to the wrong host first.
 */
export async function loadApiBaseUrl(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(OVERRIDE_KEY);
    if (stored) currentBaseUrl = stored;
  } catch {
    /* fall back to the built-in default */
  }
  return currentBaseUrl;
}

/**
 * Is the server actually reachable, and is it ours?
 *
 * Used by the server settings screen so a person can confirm an address works
 * before trying to sign in through it. A 401 is a *success* here: it means
 * something answered and asked us to authenticate, which is exactly right for an
 * unauthenticated probe.
 */
export async function probeApi(
  baseUrl: string,
  timeoutMs = 6000
): Promise<{ ok: boolean; detail: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${normaliseBaseUrl(baseUrl)}/auth/me`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (response.status === 401) return { ok: true, detail: "Reachable — server answered" };
    if (response.ok) return { ok: true, detail: "Reachable — already signed in" };
    return { ok: false, detail: `Answered with ${response.status} — is this the API address?` };
  } catch (error) {
    const aborted = (error as Error)?.name === "AbortError";
    return {
      ok: false,
      detail: aborted
        ? "Timed out. Wrong address, or the phone is on a different network."
        : "No route to that address. Check Wi-Fi and that the server is running.",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Kept for call sites that only need the address for display. */
export const API_BASE_URL = DEFAULT_API_BASE_URL;

/** Set by the session provider so an unrecoverable 401 can bounce to sign-in. */
let onSessionLost: (() => void) | undefined;
export const setSessionLostHandler = (fn: () => void): void => {
  onSessionLost = fn;
};

export const api = createApiClient({
  // A getter, not a string: the address can change at runtime.
  baseUrl: getApiBaseUrl,
  session,
  // A phone in a crowd may be on a very slow connection; still, an unanswered
  // request has to fail rather than hang a screen forever.
  timeoutMs: 20_000,
  onUnauthorized: () => onSessionLost?.(),
});
