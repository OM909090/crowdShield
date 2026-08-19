import type { BroadcastSeverity, BroadcastSource, IncidentCategory, LanguageCode, UserClassification } from "@crowdshield/config";
import type { LatLng, Path } from "./geo";

/**
 * Personal, risk-aware routing for one citizen — the citizen-facing half of the
 * product. `POST /events/:id/guidance` and `POST /events/:id/exit-route`.
 */

export interface GuidanceRoute {
  /** Drawable path in `[lat, lng]`. */
  readonly waypoints: Path;
  readonly lengthM: number;
  readonly etaSec: number;
  /**
   * Overall condition of the route.
   *
   * `null` deliberately means "we have no readings for this path" and MUST NOT be
   * rendered as safe. A route the system could not measure is not a route the
   * system has cleared.
   */
  readonly riskLevel?: string | null;
  readonly worstDensity?: number | null;
  /** 0..1 — how much of the path actually has live readings. */
  readonly measuredFraction?: number | null;
  /** Named streets the person will walk along, in order. */
  readonly roads?: readonly string[];
  /** Turn-by-turn text, already assembled by the server. */
  readonly directions?: string | null;
}

export interface Guidance {
  readonly classification: UserClassification;
  /** The single sentence to show. Always present, even with no route. */
  readonly instruction: string;
  readonly route?: GuidanceRoute;
  /** How many comparable routes existed — the anti-herding pick chose one. */
  readonly alternatives?: number;
  readonly assignedGateId?: string;
  /** True when the safest advice is to wait rather than move. */
  readonly hold?: boolean;
  /** Which router answered: the drawn corridors or the imported streets. */
  readonly via?: string;
}

export interface ExitAlternative {
  readonly gateId: string;
  readonly gateName: string;
  readonly distanceMeters: number;
  readonly maxRisk?: number | null;
  readonly roads?: readonly string[];
}

/** "Get me out safely" — the urgent counterpart to destination routing. */
export interface ExitRoute {
  readonly recommendedGateId: string;
  readonly gateName: string;
  readonly gateAt: LatLng | null;
  readonly distanceMeters: number;
  readonly durationSec: number;
  /** null when no segment on the route has readings. Never render as "clear". */
  readonly maxRisk: number | null;
  readonly unsafe: boolean;
  readonly reason: string | null;
  readonly waypoints: Path;
  readonly directions?: string | null;
  readonly roads?: readonly string[];
  readonly measuredFraction?: number | null;
  readonly consideredGates: number;
  /**
   * Other open gates. Offered so the app can spread people out instead of
   * funnelling every phone to the same gate.
   */
  readonly alternatives: readonly ExitAlternative[];
  readonly allRoutesRisky: boolean;
  readonly source: string;
}

/** `exit: null` with a message is a valid, non-error answer. */
export interface ExitRouteResponse {
  readonly exit: ExitRoute | null;
  readonly message?: string;
}

/* ------------------------------------------------------------------ *
 * Announcements and reports
 * ------------------------------------------------------------------ */

export interface Broadcast {
  readonly id: string;
  /** Default-language copy. */
  readonly message: string;
  /** Per-language copies, so a citizen reads it in their own language. */
  readonly messages?: Partial<Record<LanguageCode, string>>;
  readonly severity: BroadcastSeverity;
  readonly source: BroadcastSource;
  readonly createdAt: string;
  readonly cohorts?: readonly string[];
  readonly zoneIds?: readonly string[];
}

/** What a citizen sends when they report something or press SOS. */
export interface IncidentReport {
  readonly category: IncidentCategory;
  readonly note?: string;
  readonly lat?: number;
  readonly lng?: number;
}

export interface Incident extends IncidentReport {
  readonly _id: string;
  readonly event: string;
  readonly status?: string;
  readonly createdAt: string;
}

/** One anonymous position report. Carries a device hash, never a user id. */
export interface Heartbeat {
  readonly deviceHash: string;
  readonly lat: number;
  readonly lng: number;
  readonly heading?: number;
  readonly speed?: number;
}
