import { ENDPOINTS, NO_REFRESH_PATHS } from "@crowdshield/config";
import type { SessionAdapter } from "./session";

/**
 * The request layer. One fetch wrapper, shared by both clients, with the
 * refresh-and-retry behaviour the web's axios interceptor already implements —
 * reproduced here rather than reinvented so the two clients handle an expired
 * access token identically.
 */

export class ApiError extends Error {
  readonly status: number;
  /** Per-field messages when the server returned a 422 with details. */
  readonly fields: Record<string, string>;
  /** True for a transport failure (no signal, DNS, timeout), not an HTTP error. */
  readonly offline: boolean;

  constructor(
    message: string,
    options: { status?: number; fields?: Record<string, string>; offline?: boolean } = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? 0;
    this.fields = options.fields ?? {};
    this.offline = options.offline ?? false;
  }

  /** The session is gone and refreshing did not help — the caller should sign out. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** Signed in, but not allowed. Usually an unverified authority account. */
  get isForbidden(): boolean {
    return this.status === 403;
  }
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

const DEFAULT_TIMEOUT_MS = 15_000;

/** Pull a useful message out of whatever the server sent. */
function messageFrom(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
  }
  if (status === 0) return "No connection. Check your network and try again.";
  return `Request failed (${status})`;
}

/** The backend's 422 shape: `details: [{ field, message }]`. */
function fieldsFrom(payload: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const details = (payload as { details?: unknown })?.details;
  if (!Array.isArray(details)) return out;
  for (const item of details) {
    const field = (item as { field?: unknown })?.field;
    const message = (item as { message?: unknown })?.message;
    if (typeof field === "string" && typeof message === "string" && !(field in out)) {
      out[field] = message;
    }
  }
  return out;
}

export function createHttp(options: ApiClientOptions) {
  const resolveBase = (): string => {
    const value = typeof options.baseUrl === "function" ? options.baseUrl() : options.baseUrl;
    return value.replace(/\/+$/, "");
  };
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  /**
   * A single in-flight refresh shared by every concurrent 401. Without this, six
   * screens mounting at once fire six refreshes, five of which race and lose —
   * and on a rotating-refresh-token server that logs the user out.
   */
  let refreshing: Promise<boolean> | null = null;

  const refresh = async (): Promise<boolean> => {
    refreshing ??= (async () => {
      try {
        await send<unknown>(ENDPOINTS.auth.refresh, { method: "POST", noRefresh: true });
        return true;
      } catch {
        return false;
      } finally {
        // Cleared on the next tick so callers awaiting this one all see the same result.
        setTimeout(() => {
          refreshing = null;
        }, 0);
      }
    })();
    return refreshing;
  };

  async function send<T>(path: string, request: RequestOptions = {}): Promise<T> {
    const method = request.method ?? "GET";
    const url = `${resolveBase()}${path}`;

    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(await options.session.headers()),
    };
    if (request.body !== undefined) headers["Content-Type"] = "application/json";

    // Own timeout, combined with any caller-supplied signal.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const abortFromCaller = () => controller.abort();
    request.signal?.addEventListener("abort", abortFromCaller);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        credentials: options.session.credentials,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: controller.signal,
      });
    } catch (error) {
      // A caller-initiated abort is not a failure to report.
      if (request.signal?.aborted) throw error;
      throw new ApiError("No connection. Check your network and try again.", { offline: true });
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", abortFromCaller);
    }

    // Let the session adapter harvest any Set-Cookie before we inspect the body.
    await options.session.capture(response);

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (response.ok) return payload as T;

    // Expired access token: refresh once, then replay the original request.
    const skipRefresh = request.noRefresh || NO_REFRESH_PATHS.some((p) => path.startsWith(p));
    if (response.status === 401 && !skipRefresh) {
      if (await refresh()) return send<T>(path, { ...request, noRefresh: true });
      await options.session.clear();
      options.onUnauthorized?.();
    }

    throw new ApiError(messageFrom(payload, response.status), {
      status: response.status,
      fields: fieldsFrom(payload),
    });
  }

  return {
    request: send,
    get: <T>(path: string, signal?: AbortSignal) => send<T>(path, { method: "GET", signal }),
    post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
      send<T>(path, { method: "POST", body, signal }),
    patch: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
      send<T>(path, { method: "PATCH", body, signal }),
    /** The address currently in use. Read it, don't cache it — it can change. */
    get baseUrl() {
      return resolveBase();
    },
  };
}

export type Http = ReturnType<typeof createHttp>;
