/**
 * Session handling — the one place the two platforms genuinely differ.
 *
 * The backend authenticates with two httpOnly cookies (`accessToken`, ~15 min;
 * `refreshToken`, 7 days) and reads the access token from `req.cookies` only.
 * That is deliberate, verified behaviour and it is not changing to accommodate a
 * new client. So the client adapts:
 *
 *   Web    — the browser owns the cookie jar. The adapter does nothing except
 *            set `credentials: "include"`. Tokens stay unreadable to JavaScript,
 *            which is the entire point of httpOnly.
 *
 *   Mobile — React Native has no browser jar we can rely on across cold starts,
 *            so the adapter captures `Set-Cookie` on the way out, persists the
 *            pair in the OS keystore, and replays a `Cookie` header on every
 *            request. Same wire format the server already expects: from the
 *            backend's point of view it is indistinguishable from a browser.
 *
 * Keeping this behind an interface means the request layer below has no idea
 * which platform it is on, and neither does the server.
 */
/**
 * Storage the mobile adapter persists into. Deliberately tiny so it can be
 * backed by expo-secure-store (preferred — it is a credential) or AsyncStorage.
 */
export interface SecureStore {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
}
export interface SessionAdapter {
    /** Extra headers to attach. Mobile returns a `Cookie` header; web returns {}. */
    headers(): Promise<Record<string, string>>;
    /** Whether fetch should send ambient credentials (browser only). */
    readonly credentials: RequestCredentials;
    /** Called with every response so the adapter can harvest `Set-Cookie`. */
    capture(response: Response): Promise<void>;
    /** Drop the session (logout, or an unrecoverable 401). */
    clear(): Promise<void>;
    /** True when we appear to hold a session — used to skip pointless requests. */
    hasSession(): Promise<boolean>;
}
export declare const browserSession: () => SessionAdapter;
export declare function nativeSession(store: SecureStore): SessionAdapter;
