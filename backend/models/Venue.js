import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * The Venue Graph — the authority's ground truth for one event.
 *
 * This is what turns decorative map pins into a machine-usable model:
 *  - `aor`    the Area of Responsibility (the guarded area)
 *  - `zones`  named polygons with derived area + safe capacity
 *  - `nodes`  gates / junctions / destinations, with throughput and state
 *  - `edges`  walkable corridors, with width, direction, state and capacity
 *
 * Everything downstream depends on it: the router may only send people along
 * these edges and through open gates, so the AI physically cannot suggest
 * walking through a barricade or into a closed gate.
 *
 * Coordinates are [lat, lng] (Leaflet order) throughout.
 */

// Subdocument options: no per-item _id (we use our own short string ids),
// and `id: false` disables Mongoose's `id` virtual so our real `id` path wins.
const SUB = { _id: false, id: false };

export const ZONE_TYPES = ["general", "corridor", "gate_plaza", "viewing", "holding", "restricted"];
export const NODE_TYPES = ["gate", "junction", "poi", "medical", "exit", "parking", "holding"];
export const NODE_STATES = ["open", "closed", "exit_only", "entry_only"];
export const EDGE_DIRECTIONS = ["bi", "oneway_forward", "oneway_reverse"];
export const EDGE_STATES = ["open", "blocked"];

/** A [lat, lng] pair. */
const latLng = {
  type: [Number],
  validate: {
    validator: (v) =>
      Array.isArray(v) &&
      v.length === 2 &&
      v[0] >= -90 &&
      v[0] <= 90 &&
      v[1] >= -180 &&
      v[1] <= 180,
    message: "Coordinate must be [lat, lng] within valid ranges",
  },
};

const zoneSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: ZONE_TYPES, default: "general" },
    /** Closed ring of [lat,lng]; first point is not repeated at the end. */
    polygon: { type: [latLng], required: true },

    // Derived server-side from `polygon` — never trusted from the client.
    areaM2: { type: Number, default: 0 },
    capacity: { type: Number, default: 0 },
  },
  SUB
);

const nodeSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    name: { type: String, trim: true, maxlength: 120 },
    type: { type: String, enum: NODE_TYPES, required: true },
    at: { ...latLng, required: true },

    /** Clear width in metres (gates). Drives throughputPerMin. */
    widthM: { type: Number, min: 0, default: 0 },
    /** Derived from widthM unless explicitly overridden by the authority. */
    throughputPerMin: { type: Number, min: 0, default: 0 },

    state: { type: String, enum: NODE_STATES, default: "open" },

    /** Can a citizen choose this as a destination in the app? */
    isDestination: { type: Boolean, default: false },
  },
  SUB
);

const edgeSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    from: { type: String, required: true, trim: true },
    to: { type: String, required: true, trim: true },
    /** Polyline geometry of the corridor. */
    path: { type: [latLng], required: true },

    widthM: { type: Number, min: 0, default: 3 },
    direction: { type: String, enum: EDGE_DIRECTIONS, default: "bi" },
    state: { type: String, enum: EDGE_STATES, default: "open" },

    // Derived server-side.
    lengthM: { type: Number, default: 0 },
    capacityPerMin: { type: Number, default: 0 },
  },
  SUB
);

const venueSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: "Event", required: true, unique: true, index: true },

    /** Area of Responsibility — the guarded perimeter. */
    aor: {
      polygon: { type: [latLng], default: [] },
      areaM2: { type: Number, default: 0 },
    },

    /** Approach ring outside the AoR where inflow guidance applies. */
    bufferMeters: { type: Number, default: 1500, min: 0, max: 20000 },

    zones: { type: [zoneSchema], default: [] },
    nodes: { type: [nodeSchema], default: [] },
    edges: { type: [edgeSchema], default: [] },

    /** H3 resolutions: fine cells for analysis, coarse for rollup/overview. */
    h3: {
      analysisRes: { type: Number, default: 11, min: 6, max: 14 },
      rollupRes: { type: Number, default: 9, min: 5, max: 13 },
    },

    /**
     * Fraction of actual attendees estimated to be running the app.
     * Used to scale sampled counts to a population estimate; calibrated
     * against a known count (gate scans / a marshal's manual count).
     */
    calibration: {
      participationRate: { type: Number, default: 0.1, min: 0.001, max: 1 },
    },

    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

/** Destinations a citizen may pick as a goal. */
venueSchema.methods.destinations = function destinations() {
  return this.nodes
    .filter((n) => n.isDestination && n.state !== "closed")
    .map((n) => ({ id: n.id, name: n.name || n.id, type: n.type, at: n.at }));
};

export default mongoose.model("Venue", venueSchema);
