/**
 * Domain enums that both clients render and the backend validates.
 *
 * Every list here has a counterpart in a Mongoose schema or an express-validator
 * chain. A client that offers an option the server rejects produces a 422 the
 * user cannot act on — sending `"barricade"` where the enum wants `"Barricade"`
 * is exactly that class of bug, and it happened during testing.
 */
/** Roles on a session. `backend/models/User.js`. */
export declare const USER_ROLES: readonly ["citizen", "authority", "admin"];
export type UserRole = (typeof USER_ROLES)[number];
/** Event lifecycle. `backend/models/Event.js`. */
export declare const EVENT_STATUSES: readonly ["upcoming", "ongoing", "completed", "cancelled"];
export type EventStatus = (typeof EVENT_STATUSES)[number];
/** Venue graph node kinds. `backend/models/Venue.js`. */
export declare const NODE_TYPES: readonly ["gate", "exit", "junction", "poi", "medical", "stage"];
export type NodeType = (typeof NODE_TYPES)[number];
export declare const NODE_STATES: readonly ["open", "closed", "restricted"];
export type NodeState = (typeof NODE_STATES)[number];
export declare const ZONE_TYPES: readonly ["general", "chokepoint", "entry", "exit", "holding", "restricted"];
export type ZoneType = (typeof ZONE_TYPES)[number];
export declare const EDGE_DIRECTIONS: readonly ["bi", "oneway_forward", "oneway_reverse"];
export type EdgeDirection = (typeof EDGE_DIRECTIONS)[number];
/**
 * What a citizen can report. Mirrors `REPORT_CATEGORIES` in the web citizen app
 * and the incident validator's enum. `sos` is separate: it is not something a
 * person picks from a list, it is the panic button.
 */
export declare const REPORT_CATEGORIES: readonly ["medical", "hazard", "blocked", "lost", "other"];
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];
export declare const INCIDENT_CATEGORIES: readonly ["sos", "medical", "hazard", "blocked", "lost", "other"];
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];
/** Where a citizen stands relative to the monitored area. `services/guidance.js`. */
export declare const USER_CLASSIFICATIONS: readonly ["INSIDE", "APPROACHING", "TRANSIT", "OUTSIDE"];
export type UserClassification = (typeof USER_CLASSIFICATIONS)[number];
/** Who issued an announcement. */
export declare const BROADCAST_SOURCES: readonly ["authority", "agent"];
export type BroadcastSource = (typeof BROADCAST_SOURCES)[number];
/**
 * Report category → the label shown on the tile, in each language.
 * Copied from the web client so the two apps offer identically-worded choices.
 */
export declare const REPORT_CATEGORY_LABELS: Readonly<Record<ReportCategory, {
    en: string;
    hi: string;
    or: string;
}>>;
/** Events a citizen may join — the picker filters to these. */
export declare const JOINABLE_STATUSES: readonly EventStatus[];
/** A node a citizen may be routed to. Closed ones are deliberately excluded. */
export declare const isRoutableNode: (type: NodeType, state: NodeState) => boolean;
