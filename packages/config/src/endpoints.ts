/**
 * Every API path both clients use, in one place.
 *
 * The backend does not care whether a request came from the web or from Android,
 * and there is deliberately no `/web-api` or `/android-api` split. Naming the
 * paths here means a route rename is a compile error in both clients rather than
 * a 404 discovered in the field.
 */

/** Paths are relative to the API base (default `http://host:5000/api`). */
export const ENDPOINTS = {
  auth: {
    signup: "/auth/signup",
    login: "/auth/login",
    logout: "/auth/logout",
    refresh: "/auth/refresh",
    me: "/auth/me",
  },
  events: {
    list: "/events",
    byId: (eventId: string) => `/events/${eventId}`,
    venue: (eventId: string) => `/events/${eventId}/venue`,
    destinations: (eventId: string) => `/events/${eventId}/venue/destinations`,
    snapshot: (eventId: string) => `/events/${eventId}/snapshot`,
    guidance: (eventId: string) => `/events/${eventId}/guidance`,
    exitRoute: (eventId: string) => `/events/${eventId}/exit-route`,
    incidents: (eventId: string) => `/events/${eventId}/incidents`,
    ingest: (eventId: string) => `/events/${eventId}/ingest`,
    broadcasts: (eventId: string) => `/events/${eventId}/broadcasts`,
  },
  ai: {
    assistantAsk: "/ai/assistant/ask",
  },
} as const;

/**
 * Socket.IO events on the live feed. The server emits these; a client subscribes
 * with `subscribe { eventId }` and stops with `unsubscribe`.
 */
export const SOCKET_EVENTS = {
  subscribe: "subscribe",
  unsubscribe: "unsubscribe",
  /** Per-second frame: zones, cells, clusters, totals. */
  tick: "crowd:tick",
  /** A zone crossed an escalation threshold. */
  alert: "alert:new",
  /** An approved agent action took effect (a gate flipped, a corridor re-routed). */
  agentAction: "agent:action",
  /** An announcement reached the crowd. */
  broadcast: "agent:broadcast",
} as const;

/**
 * How often a phone reports its position while sharing. 4s matches the web
 * client's heartbeat, so one device does not weigh differently in the density
 * estimate depending on which client it is running.
 */
export const HEARTBEAT_INTERVAL_MS = 4000;

/**
 * Auth cookie names set by the backend. The mobile client needs them by name
 * because it replays the cookies itself; the web client never touches them
 * (they are httpOnly and the browser handles them).
 */
export const AUTH_COOKIES = { access: "accessToken", refresh: "refreshToken" } as const;

/**
 * Requests that must never trigger a refresh-and-retry, or a 401 loops forever.
 * Mirrors the interceptor list in the web client's axios setup.
 */
export const NO_REFRESH_PATHS: readonly string[] = [
  ENDPOINTS.auth.login,
  ENDPOINTS.auth.signup,
  ENDPOINTS.auth.refresh,
  ENDPOINTS.auth.me,
  ENDPOINTS.auth.logout,
];
