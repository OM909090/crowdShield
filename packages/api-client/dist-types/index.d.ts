import type { AuthResponse, Broadcast, Destination, Event, ExitRouteResponse, Guidance, Heartbeat, Incident, IncidentReport, Snapshot, User, Venue } from "@crowdshield/types";
import type { GuidanceInput, LoginInput, SignupInput } from "@crowdshield/validation";
import { type ApiClientOptions } from "./http";
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
export declare function createApiClient(options: ApiClientOptions): {
    http: {
        request: <T>(path: string, request?: import("./http").RequestOptions) => Promise<T>;
        get: <T>(path: string, signal?: AbortSignal) => Promise<T>;
        post: <T>(path: string, body?: unknown, signal?: AbortSignal) => Promise<T>;
        patch: <T>(path: string, body?: unknown, signal?: AbortSignal) => Promise<T>;
        readonly baseUrl: string;
    };
    baseUrl: string;
    auth: {
        /** Mobile only ever creates citizens; authority accounts need admin approval. */
        signup: (input: SignupInput) => Promise<AuthResponse>;
        /** Takes `identifier` (mobile OR email), not `email`. */
        login: (input: LoginInput) => Promise<AuthResponse>;
        logout: () => Promise<{
            message: string;
        }>;
        me: (signal?: AbortSignal) => Promise<{
            user: User;
        }>;
    };
    events: {
        /** Every event the user may join. Filter with `JOINABLE_STATUSES`. */
        list: (signal?: AbortSignal) => Promise<{
            events: Event[];
        }>;
        /** The venue graph: coverage boundary, zones, gates, corridors. */
        venue: (eventId: string, signal?: AbortSignal) => Promise<{
            venue: Venue | null;
        }>;
        /** Places a citizen may ask to be routed to. */
        destinations: (eventId: string, signal?: AbortSignal) => Promise<{
            destinations: Destination[];
        }>;
        /**
         * A one-shot read of the live situation. The socket feed is the normal
         * source; this is for a cold start before the first tick arrives.
         *
         * The response is wrapped — `{ snapshot }`, not a bare Snapshot. Typing it
         * unwrapped made every field read `undefined`, which the Home screen would
         * have shown as a permanent "crowd level unknown" even with live data.
         */
        snapshot: (eventId: string, signal?: AbortSignal) => Promise<{
            snapshot: Snapshot;
        }>;
        /** Recent announcements, so someone joining late sees what the crowd was told. */
        broadcasts: (eventId: string, signal?: AbortSignal) => Promise<{
            broadcasts: Broadcast[];
        }>;
    };
    /** The citizen's own routing and reporting. */
    citizen: {
        /** Route to a destination the person picked. */
        guidance: (eventId: string, input: GuidanceInput, signal?: AbortSignal) => Promise<{
            guidance: Guidance;
        }>;
        /**
         * "Get me out safely." Returns `{ exit: null, message }` when there is no
         * open gate or no walkable route — a valid answer, not an error, and the
         * message is written to be shown to the person as-is.
         */
        exitRoute: (eventId: string, position: {
            lat: number;
            lng: number;
        }, signal?: AbortSignal) => Promise<ExitRouteResponse>;
        /** SOS or a category report. */
        report: (eventId: string, input: IncidentReport, signal?: AbortSignal) => Promise<{
            incident: Incident;
        }>;
        /**
         * Anonymous position heartbeats — the phone-as-sensor stream that the whole
         * density estimate is built from. Carries a random device hash, never a
         * user id, which is what makes the privacy promise true rather than a claim.
         */
        ingest: (eventId: string, heartbeats: readonly Heartbeat[], signal?: AbortSignal) => Promise<{
            accepted: number;
        }>;
    };
};
export type ApiClient = ReturnType<typeof createApiClient>;
