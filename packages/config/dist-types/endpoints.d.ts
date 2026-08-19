/**
 * Every API path both clients use, in one place.
 *
 * The backend does not care whether a request came from the web or from Android,
 * and there is deliberately no `/web-api` or `/android-api` split. Naming the
 * paths here means a route rename is a compile error in both clients rather than
 * a 404 discovered in the field.
 */
/** Paths are relative to the API base (default `http://host:5000/api`). */
export declare const ENDPOINTS: {
    readonly auth: {
        readonly signup: "/auth/signup";
        readonly login: "/auth/login";
        readonly logout: "/auth/logout";
        readonly refresh: "/auth/refresh";
        readonly me: "/auth/me";
    };
    readonly events: {
        readonly list: "/events";
        readonly byId: (eventId: string) => string;
        readonly venue: (eventId: string) => string;
        readonly destinations: (eventId: string) => string;
        readonly snapshot: (eventId: string) => string;
        readonly guidance: (eventId: string) => string;
        readonly exitRoute: (eventId: string) => string;
        readonly incidents: (eventId: string) => string;
        readonly ingest: (eventId: string) => string;
        readonly broadcasts: (eventId: string) => string;
    };
    readonly ai: {
        readonly assistantAsk: "/ai/assistant/ask";
    };
};
/**
 * Socket.IO events on the live feed. The server emits these; a client subscribes
 * with `subscribe { eventId }` and stops with `unsubscribe`.
 */
export declare const SOCKET_EVENTS: {
    readonly subscribe: "subscribe";
    readonly unsubscribe: "unsubscribe";
    /** Per-second frame: zones, cells, clusters, totals. */
    readonly tick: "crowd:tick";
    /** A zone crossed an escalation threshold. */
    readonly alert: "alert:new";
    /** An approved agent action took effect (a gate flipped, a corridor re-routed). */
    readonly agentAction: "agent:action";
    /** An announcement reached the crowd. */
    readonly broadcast: "agent:broadcast";
};
/**
 * How often a phone reports its position while sharing. 4s matches the web
 * client's heartbeat, so one device does not weigh differently in the density
 * estimate depending on which client it is running.
 */
export declare const HEARTBEAT_INTERVAL_MS = 4000;
/**
 * Auth cookie names set by the backend. The mobile client needs them by name
 * because it replays the cookies itself; the web client never touches them
 * (they are httpOnly and the browser handles them).
 */
export declare const AUTH_COOKIES: {
    readonly access: "accessToken";
    readonly refresh: "refreshToken";
};
/**
 * Requests that must never trigger a refresh-and-retry, or a 401 loops forever.
 * Mirrors the interceptor list in the web client's axios setup.
 */
export declare const NO_REFRESH_PATHS: readonly string[];
