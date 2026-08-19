import { ENDPOINTS } from "@crowdshield/config";
import type {
  AuthResponse,
  Broadcast,
  Destination,
  Event,
  ExitRouteResponse,
  Guidance,
  Heartbeat,
  Incident,
  IncidentReport,
  Snapshot,
  User,
  Venue,
} from "@crowdshield/types";
import type { GuidanceInput, LoginInput, SignupInput } from "@crowdshield/validation";
import { createHttp, type ApiClientOptions, type Http } from "./http";

export { ApiError, createHttp } from "./http";
export type { ApiClientOptions, Http, RequestOptions } from "./http";
export { browserSession, nativeSession } from "./session";
export type { SecureStore, SessionAdapter } from "./session";
export { streamAssistant } from "./assistant";
export type { AssistantStreamOptions } from "./assistant";

/**
 * @crowdshield/api-client — the one way either client talks to the API.
 *
 * There is deliberately no `/web-api` and no `/android-api`: the backend does not
 * know or care which client is calling, and every path here is a route that
 * already exists and is already verified. This package adds types and one place
 * to fix a mistake, nothing else.
 *
 * Everything platform-specific lives behind `SessionAdapter` (cookies in a
 * browser, captured-and-replayed cookies on native). The functions below are
 * identical on both.
 */
export function createApiClient(options: ApiClientOptions) {
  const http: Http = createHttp(options);

  return {
    http,
    baseUrl: http.baseUrl,

    auth: {
      /** Mobile only ever creates citizens; authority accounts need admin approval. */
      signup: (input: SignupInput) => http.post<AuthResponse>(ENDPOINTS.auth.signup, input),
      /** Takes `identifier` (mobile OR email), not `email`. */
      login: (input: LoginInput) => http.post<AuthResponse>(ENDPOINTS.auth.login, input),
      logout: () => http.post<{ message: string }>(ENDPOINTS.auth.logout),
      me: (signal?: AbortSignal) => http.get<{ user: User }>(ENDPOINTS.auth.me, signal),
    },

    events: {
      /** Every event the user may join. Filter with `JOINABLE_STATUSES`. */
      list: (signal?: AbortSignal) =>
        http.get<{ events: Event[] }>(ENDPOINTS.events.list, signal),

      /** The venue graph: coverage boundary, zones, gates, corridors. */
      venue: (eventId: string, signal?: AbortSignal) =>
        http.get<{ venue: Venue | null }>(ENDPOINTS.events.venue(eventId), signal),

      /** Places a citizen may ask to be routed to. */
      destinations: (eventId: string, signal?: AbortSignal) =>
        http.get<{ destinations: Destination[] }>(ENDPOINTS.events.destinations(eventId), signal),

      /**
       * A one-shot read of the live situation. The socket feed is the normal
       * source; this is for a cold start before the first tick arrives.
       *
       * The response is wrapped — `{ snapshot }`, not a bare Snapshot. Typing it
       * unwrapped made every field read `undefined`, which the Home screen would
       * have shown as a permanent "crowd level unknown" even with live data.
       */
      snapshot: (eventId: string, signal?: AbortSignal) =>
        http.get<{ snapshot: Snapshot }>(ENDPOINTS.events.snapshot(eventId), signal),

      /** Recent announcements, so someone joining late sees what the crowd was told. */
      broadcasts: (eventId: string, signal?: AbortSignal) =>
        http.get<{ broadcasts: Broadcast[] }>(ENDPOINTS.events.broadcasts(eventId), signal),
    },

    /** The citizen's own routing and reporting. */
    citizen: {
      /** Route to a destination the person picked. */
      guidance: (eventId: string, input: GuidanceInput, signal?: AbortSignal) =>
        http.post<{ guidance: Guidance }>(ENDPOINTS.events.guidance(eventId), input, signal),

      /**
       * "Get me out safely." Returns `{ exit: null, message }` when there is no
       * open gate or no walkable route — a valid answer, not an error, and the
       * message is written to be shown to the person as-is.
       */
      exitRoute: (eventId: string, position: { lat: number; lng: number }, signal?: AbortSignal) =>
        http.post<ExitRouteResponse>(ENDPOINTS.events.exitRoute(eventId), position, signal),

      /** SOS or a category report. */
      report: (eventId: string, input: IncidentReport, signal?: AbortSignal) =>
        http.post<{ incident: Incident }>(ENDPOINTS.events.incidents(eventId), input, signal),

      /**
       * Anonymous position heartbeats — the phone-as-sensor stream that the whole
       * density estimate is built from. Carries a random device hash, never a
       * user id, which is what makes the privacy promise true rather than a claim.
       */
      ingest: (eventId: string, heartbeats: readonly Heartbeat[], signal?: AbortSignal) =>
        http.post<{ accepted: number }>(
          ENDPOINTS.events.ingest(eventId),
          { heartbeats },
          signal
        ),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
