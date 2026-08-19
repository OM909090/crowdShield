/**
 * Domain enums that both clients render and the backend validates.
 *
 * Every list here has a counterpart in a Mongoose schema or an express-validator
 * chain. A client that offers an option the server rejects produces a 422 the
 * user cannot act on — sending `"barricade"` where the enum wants `"Barricade"`
 * is exactly that class of bug, and it happened during testing.
 */

/** Roles on a session. `backend/models/User.js`. */
export const USER_ROLES = ["citizen", "authority", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Event lifecycle. `backend/models/Event.js`. */
export const EVENT_STATUSES = ["upcoming", "ongoing", "completed", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/** Venue graph node kinds. `backend/models/Venue.js`. */
export const NODE_TYPES = ["gate", "exit", "junction", "poi", "medical", "stage"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const NODE_STATES = ["open", "closed", "restricted"] as const;
export type NodeState = (typeof NODE_STATES)[number];

export const ZONE_TYPES = ["general", "chokepoint", "entry", "exit", "holding", "restricted"] as const;
export type ZoneType = (typeof ZONE_TYPES)[number];

export const EDGE_DIRECTIONS = ["bi", "oneway_forward", "oneway_reverse"] as const;
export type EdgeDirection = (typeof EDGE_DIRECTIONS)[number];

/**
 * What a citizen can report. Mirrors `REPORT_CATEGORIES` in the web citizen app
 * and the incident validator's enum. `sos` is separate: it is not something a
 * person picks from a list, it is the panic button.
 */
export const REPORT_CATEGORIES = ["medical", "hazard", "blocked", "lost", "other"] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const INCIDENT_CATEGORIES = ["sos", ...REPORT_CATEGORIES] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

/** Where a citizen stands relative to the monitored area. `services/guidance.js`. */
export const USER_CLASSIFICATIONS = ["INSIDE", "APPROACHING", "TRANSIT", "OUTSIDE"] as const;
export type UserClassification = (typeof USER_CLASSIFICATIONS)[number];

/** Who issued an announcement. */
export const BROADCAST_SOURCES = ["authority", "agent"] as const;
export type BroadcastSource = (typeof BROADCAST_SOURCES)[number];

/**
 * Report category → the label shown on the tile, in each language.
 * Copied from the web client so the two apps offer identically-worded choices.
 */
export const REPORT_CATEGORY_LABELS: Readonly<
  Record<ReportCategory, { en: string; hi: string; or: string }>
> = {
  medical: { en: "Medical", hi: "चिकित्सा", or: "ଚିକିତ୍ସା" },
  hazard: { en: "Hazard", hi: "खतरा", or: "ବିପଦ" },
  blocked: { en: "Blocked", hi: "रास्ता बंद", or: "ଅବରୋଧ" },
  lost: { en: "Lost", hi: "खो गया", or: "ହଜିଗଲି" },
  other: { en: "Other", hi: "अन्य", or: "ଅନ୍ୟ" },
};

/** Events a citizen may join — the picker filters to these. */
export const JOINABLE_STATUSES: readonly EventStatus[] = ["ongoing", "upcoming"];

/** A node a citizen may be routed to. Closed ones are deliberately excluded. */
export const isRoutableNode = (type: NodeType, state: NodeState): boolean =>
  state !== "closed" && (type === "gate" || type === "exit" || type === "poi" || type === "medical" || type === "stage");
