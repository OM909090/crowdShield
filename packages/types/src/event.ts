import type { EventStatus, NodeState, NodeType, ZoneType, EdgeDirection } from "@crowdshield/config";
import type { GeoJsonPoint, LatLng, Path, Ring } from "./geo";

export const EVENT_TYPES = [
  "Festival",
  "Sports",
  "Concert",
  "Religious Gathering",
  "Political Rally",
  "Other",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface EventLocation {
  readonly venueName: string;
  readonly address: string;
  /** GeoJSON — `[lng, lat]`. Use `fromGeoJson` before handing it to a map. */
  readonly coordinates?: GeoJsonPoint;
}

export interface Event {
  readonly _id: string;
  readonly name: string;
  readonly type: EventType;
  readonly description?: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly location: EventLocation;
  readonly expectedAttendance?: number;
  readonly bannerUrl?: string;
  /** Stored value. Only `cancelled` is set by hand. */
  readonly status: EventStatus;
  /**
   * Derived from the clock against start/end and attached on serialization.
   * Prefer this over `status` when deciding what to show a user — a stored
   * "upcoming" on an event that started an hour ago is stale, `liveStatus` is not.
   */
  readonly liveStatus?: EventStatus;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/* ------------------------------------------------------------------ *
 * Venue graph — what the authority drew
 * ------------------------------------------------------------------ */

export interface VenueZone {
  readonly id: string;
  readonly name: string;
  readonly type: ZoneType;
  /** `[lat, lng]` ring. */
  readonly polygon: Ring;
  /** Derived server-side from the polygon; never trusted from a client. */
  readonly areaM2: number;
  readonly capacity: number;
}

export interface VenueNode {
  readonly id: string;
  readonly name?: string;
  readonly type: NodeType;
  /** `[lat, lng]`. */
  readonly at: LatLng;
  readonly widthM?: number;
  readonly throughputPerMin?: number;
  readonly state: NodeState;
  readonly isDestination?: boolean;
}

export interface VenueEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly path: Path;
  readonly widthM: number;
  readonly direction: EdgeDirection;
  readonly state: "open" | "closed" | "restricted";
  readonly lengthM: number;
  readonly capacityPerMin: number;
}

export interface Venue {
  readonly _id: string;
  readonly event: string;
  /** The monitored boundary. Everything outside it is deliberately not watched. */
  readonly aor: { readonly polygon: Ring; readonly areaM2: number };
  /** How far outside the boundary still counts as "approaching". */
  readonly bufferMeters: number;
  readonly zones: readonly VenueZone[];
  readonly nodes: readonly VenueNode[];
  readonly edges: readonly VenueEdge[];
  readonly h3: { readonly analysisRes: number; readonly rollupRes: number };
  /**
   * Fraction of attendees estimated to be running the app. Sampled counts are
   * divided by this to estimate the real population, so it is the single number
   * every headcount in the product depends on.
   */
  readonly calibration: { readonly participationRate: number };
  readonly updatedAt: string;
}

/** A place a citizen may ask to be routed to. */
export interface Destination {
  readonly id: string;
  readonly name: string;
  readonly type: NodeType;
  readonly at: LatLng;
}
