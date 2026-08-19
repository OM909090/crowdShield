import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_EVENTS } from "@crowdshield/config";
import type { ActiveAlert, Broadcast, CrowdFrame } from "@crowdshield/types";
import { api, getApiBaseUrl } from "../api";

/**
 * The live feed, over the same Socket.IO channel the web dashboard uses.
 *
 * Subscribing is what starts the server's per-second broadcaster for an event, so
 * this hook is deliberately scoped: pass `null` and it disconnects. A phone in a
 * pocket should not be holding a socket open and keeping a risk loop spinning.
 */

const MAX_ALERTS = 20;
const MAX_BROADCASTS = 10;

export type FeedStatus = "idle" | "connecting" | "live" | "offline";

export interface CrowdFeed {
  readonly frame: CrowdFrame | null;
  readonly alerts: readonly ActiveAlert[];
  readonly broadcasts: readonly Broadcast[];
  readonly status: FeedStatus;
  /** True once a frame has arrived, so a screen can tell "waiting" from "empty". */
  readonly hasData: boolean;
}

export function useCrowdFeed(eventId: string | null | undefined): CrowdFeed {
  const [frame, setFrame] = useState<CrowdFrame | null>(null);
  const [alerts, setAlerts] = useState<readonly ActiveAlert[]>([]);
  const [broadcasts, setBroadcasts] = useState<readonly Broadcast[]>([]);
  const [status, setStatus] = useState<FeedStatus>("idle");
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Resolve the socket origin from the RUNTIME base URL, not the build-time
    // constant. The REST client already follows the Server-address override via
    // a getter; the socket used a frozen copy, so on any real device — where the
    // baked-in address is a dev machine's localhost — the live feed dialed the
    // phone itself and sat "offline" forever even after the user fixed the
    // address. The feed is the core safety surface, so it must obey the override.
    // The socket lives at the server root, not under /api.
    const origin = getApiBaseUrl().replace(/\/api\/?$/, "");
    if (!eventId) {
      setStatus("idle");
      setFrame(null);
      setAlerts([]);
      setBroadcasts([]);
      return undefined;
    }

    let cancelled = false;
    setStatus("connecting");

    /**
     * Seed from the REST snapshot immediately. The socket only carries what
     * happens while we are watching, so without this the first screen a citizen
     * sees is empty for a second — long enough to read as "nothing is wrong".
     */
    void api.events
      .snapshot(eventId)
      .then(({ snapshot }) => {
        if (cancelled || !snapshot) return;
        // Only seed: a socket tick that already landed is fresher than this read.
        setFrame((current) => current ?? (snapshot as CrowdFrame));
        // Seed the alerts already standing, too. `alert:new` only fires on the
        // transition, so a citizen who opens the app after a zone escalated would
        // otherwise see "No alerts right now" on the home screen while that zone
        // is ELEVATED — a false all-clear, the one thing a safety app must never
        // show. The snapshot carries the open alerts, so take them once.
        const standing = snapshot.activeAlerts ?? [];
        if (standing.length) {
          setAlerts((current) => (current.length ? current : standing.slice(0, MAX_ALERTS)));
        }
      })
      .catch(() => undefined);

    void api.events
      .broadcasts(eventId)
      .then(({ broadcasts: history }) => {
        if (!cancelled) setBroadcasts((current) => (current.length ? current : history));
      })
      .catch(() => undefined);

    const socket = io(origin, {
      transports: ["websocket"],
      // Keep trying: a phone at a festival loses signal constantly, and the feed
      // coming back on its own is the difference between a useful app and one the
      // user has to restart.
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 10_000,
    });
    socketRef.current = socket;

    const subscribe = () => {
      setStatus("live");
      socket.emit(SOCKET_EVENTS.subscribe, { eventId });
    };

    socket.on("connect", subscribe);
    socket.on("disconnect", () => setStatus("offline"));
    socket.on("connect_error", () => setStatus("offline"));

    socket.on(SOCKET_EVENTS.tick, (next: CrowdFrame) => {
      // Frames for another event can arrive briefly while switching.
      if (String(next.eventId) !== String(eventId)) return;
      setFrame(next);
    });

    socket.on(SOCKET_EVENTS.alert, (alert: ActiveAlert) => {
      setAlerts((current) => {
        if (alert.id && current.some((a) => a.id === alert.id)) return current;
        return [alert, ...current].slice(0, MAX_ALERTS);
      });
    });

    socket.on(SOCKET_EVENTS.broadcast, (broadcast: Broadcast) => {
      if (!broadcast) return;
      setBroadcasts((current) => {
        if (broadcast.id && current.some((b) => b.id === broadcast.id)) return current;
        return [broadcast, ...current].slice(0, MAX_BROADCASTS);
      });
    });

    if (socket.connected) subscribe();

    return () => {
      cancelled = true;
      socket.emit(SOCKET_EVENTS.unsubscribe);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [eventId]);

  return { frame, alerts, broadcasts, status, hasData: frame !== null };
}
