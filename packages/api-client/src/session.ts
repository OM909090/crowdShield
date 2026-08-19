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

/* ------------------------------------------------------------------ *
 * Web — let the browser do it
 * ------------------------------------------------------------------ */

export const browserSession = (): SessionAdapter => ({
  credentials: "include",
  async headers() {
    return {};
  },
  async capture() {
    /* the browser stored it; we are not allowed to see it, and should not */
  },
  async clear() {
    /* the server clears the cookies on /auth/logout */
  },
  async hasSession() {
    // Unknowable from JS by design. Callers ask /auth/me instead.
    return true;
  },
});

/* ------------------------------------------------------------------ *
 * Mobile — capture and replay
 * ------------------------------------------------------------------ */

const STORE_KEY = "crowdshield.session.cookies";

/**
 * Parse one or more `Set-Cookie` lines into name → value.
 *
 * Two formats are easy to confuse, and confusing them silently loses the refresh
 * token: in a `Set-Cookie` line `;` separates METADATA (`Path`, `Expires`,
 * `HttpOnly`, `SameSite`), so only the first `k=v` is the cookie. In a `Cookie`
 * request header `;` separates COOKIES. This function handles the former only —
 * the stored jar is JSON, never re-parsed as a cookie string.
 *
 * The comma split is conditional because `Expires=Tue, 18 Aug 2026` contains a
 * comma: we only split where the next token genuinely looks like `name=`.
 */
function parseSetCookie(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of raw.split(/,(?=\s*[A-Za-z0-9_-]+=)/)) {
    const pair = part.split(";")[0]?.trim();
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    // A cookie being cleared is sent with an empty value. Record the removal so
    // logout actually logs out instead of replaying a dead token forever.
    if (value) out.set(name, value);
    else out.set(name, "");
  }
  return out;
}

/**
 * Read every Set-Cookie from a response.
 *
 * `Headers.getSetCookie()` is the correct API and exists in modern runtimes.
 * React Native's Headers may not implement it, in which case `get()` returns the
 * values comma-joined — which is why the parser above splits on a comma only
 * when the next token looks like `name=`, rather than on every comma (dates
 * inside `Expires=` contain commas).
 */
function readSetCookie(response: Response): string[] {
  const anyHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") {
    const list = anyHeaders.getSetCookie();
    if (list?.length) return list;
  }
  const joined = response.headers.get("set-cookie");
  return joined ? [joined] : [];
}

export function nativeSession(store: SecureStore): SessionAdapter {
  // Mirrored in memory so the common case costs no keystore read.
  let cache: Map<string, string> | null = null;

  const load = async (): Promise<Map<string, string>> => {
    if (cache) return cache;
    const raw = await store.get(STORE_KEY);
    // JSON, not a cookie string: round-tripping through `name=value; name=value`
    // and back is what dropped the refresh token, because the reader treated the
    // second cookie as metadata of the first.
    if (!raw) {
      cache = new Map();
      return cache;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      const entries = Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0
      );
      cache = new Map(entries);
    } catch {
      // Corrupt or from an older format — start clean rather than half-authed.
      cache = new Map();
    }
    return cache;
  };

  const persist = async (jar: Map<string, string>): Promise<void> => {
    cache = jar;
    if (jar.size === 0) {
      await store.remove(STORE_KEY);
      return;
    }
    await store.set(STORE_KEY, JSON.stringify(Object.fromEntries(jar)));
  };

  return {
    // No ambient credentials on native; we send the header explicitly.
    credentials: "omit",

    async headers(): Promise<Record<string, string>> {
      const jar = await load();
      if (jar.size === 0) return {};
      return { Cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ") };
    },

    async capture(response) {
      const incoming = readSetCookie(response);
      if (!incoming.length) return;
      const jar = new Map(await load());
      let changed = false;
      for (const line of incoming) {
        for (const [name, value] of parseSetCookie(line)) {
          // An empty value is the server clearing the cookie (logout, or a
          // rejected refresh). Honour it, or the app replays a dead token.
          if (value === "") {
            if (jar.delete(name)) changed = true;
          } else if (jar.get(name) !== value) {
            jar.set(name, value);
            changed = true;
          }
        }
      }
      if (changed) await persist(jar);
    },

    async clear() {
      await persist(new Map());
    },

    async hasSession() {
      const jar = await load();
      // The refresh cookie is the one that matters: the access token expires in
      // minutes, and a client holding only a dead access token is not signed in.
      return jar.has("refreshToken");
    },
  };
}
