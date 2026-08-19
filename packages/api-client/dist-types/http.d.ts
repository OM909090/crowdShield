import type { SessionAdapter } from "./session";
/**
 * The request layer. One fetch wrapper, shared by both clients, with the
 * refresh-and-retry behaviour the web's axios interceptor already implements —
 * reproduced here rather than reinvented so the two clients handle an expired
 * access token identically.
 */
export declare class ApiError extends Error {
    readonly status: number;
    /** Per-field messages when the server returned a 422 with details. */
    readonly fields: Record<string, string>;
    /** True for a transport failure (no signal, DNS, timeout), not an HTTP error. */
    readonly offline: boolean;
    constructor(message: string, options?: {
        status?: number;
        fields?: Record<string, string>;
        offline?: boolean;
    });
    /** The session is gone and refreshing did not help — the caller should sign out. */
    get isUnauthorized(): boolean;
    /** Signed in, but not allowed. Usually an unverified authority account. */
    get isForbidden(): boolean;
}
export interface ApiClientOptions {
    /**
     * e.g. `http://10.0.2.2:5000/api` from an Android emulator.
     *
     * May be a getter, resolved per request. That matters on mobile: the server
     * address is baked into an APK at build time, and when it is wrong — a laptop's
     * LAN IP changes, or the phone is on cellular — the alternative is a rebuild.
     * A getter lets the app point itself somewhere else at runtime.
     */
    readonly baseUrl: string | (() => string);
    readonly session: SessionAdapter;
    /** Abort a request that hangs. Phones on bad networks need this. */
    readonly timeoutMs?: number;
    /** Called when the session is unrecoverable, so the app can show the login screen. */
    readonly onUnauthorized?: () => void;
}
export interface RequestOptions {
    readonly method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    readonly body?: unknown;
    readonly signal?: AbortSignal;
    /** Skip the refresh-and-retry dance (used by the auth calls themselves). */
    readonly noRefresh?: boolean;
}
export declare function createHttp(options: ApiClientOptions): {
    request: <T>(path: string, request?: RequestOptions) => Promise<T>;
    get: <T>(path: string, signal?: AbortSignal) => Promise<T>;
    post: <T>(path: string, body?: unknown, signal?: AbortSignal) => Promise<T>;
    patch: <T>(path: string, body?: unknown, signal?: AbortSignal) => Promise<T>;
    /** The address currently in use. Read it, don't cache it — it can change. */
    readonly baseUrl: string;
};
export type Http = ReturnType<typeof createHttp>;
