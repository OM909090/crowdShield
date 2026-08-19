import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * RoadNetwork — the REAL streets inside an event's coverage area.
 *
 * The Venue Graph is what the authority *drew*: named zones, gates, corridors.
 * This is what actually exists on the ground, imported from OpenStreetMap: the
 * roads, lanes and footpaths people are physically standing on, with the names
 * they call them by. Without it the agent can only say "Zone Z3 is critical";
 * with it, it can say "Grand Road between J4 and J7 is critical".
 *
 * One document per event. It is a cache of somebody else's data, so it records
 * where it came from (`source`, `attribution`) and when (`fetchedAt`), plus a
 * `coverageHash` of the polygon it was imported for — a network is only valid
 * for the area it was fetched from, and an operator who redraws the coverage
 * must not keep being served roads for the old one.
 *
 * Coordinates are [lat, lng] (Leaflet order) throughout, never GeoJSON.
 */

// Same convention as models/Venue.js: no per-item _id (our short string ids are
// the identity), and `id: false` so our real `id` path isn't shadowed by
// Mongoose's `id` virtual.
const SUB = { _id: false, id: false };

/** How a segment's usable width was arrived at — makes the estimate auditable. */
export const WIDTH_SOURCES = ["tag", "lanes", "default"];

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

const segmentSchema = new Schema(
  {
    /** Short readable id (R1, R2, ...) — appears in logs and in the agent brief. */
    id: { type: String, required: true, trim: true },

    /** The OSM way this came from. Way ids are well inside Number's safe range. */
    osmWayId: { type: Number },

    /**
     * The street name as OSM has it, or null.
     *
     * Many roads — service lanes, footpaths, alleys — genuinely have no name in
     * OSM. `null` is the truthful answer there. Inventing "Unnamed Road 4" would
     * put a name in an operator's mouth that no map or local would recognise.
     */
    name: { type: String, default: null, trim: true, maxlength: 200 },

    /** OSM highway class (residential, footway, secondary, ...). */
    highway: { type: String, required: true, trim: true },

    oneway: { type: Boolean, default: false },

    /** Usable width in metres, and how we got it. */
    widthM: { type: Number, min: 0 },
    widthSource: { type: String, enum: WIDTH_SOURCES },

    /** Polyline geometry between the two junctions. */
    path: { type: [latLng], required: true },

    // Derived server-side from `path` and the pedestrian constants in geo.js.
    lengthM: { type: Number, default: 0 },
    capacityPerMin: { type: Number, default: 0 },

    /** Junction ids at either end — this is what makes the set routable. */
    fromJunction: { type: String, trim: true },
    toJunction: { type: String, trim: true },
  },
  SUB
);

const junctionSchema = new Schema(
  {
    /** Short readable id (J1, J2, ...). */
    id: { type: String, required: true, trim: true },
    osmNodeId: { type: Number },
    at: { ...latLng, required: true },

    /** Segments meeting here. */
    segmentIds: { type: [String], default: [] },
    /** How many distinct segments meet here — a 4-way crossing has degree 4. */
    degree: { type: Number, default: 0 },
  },
  SUB
);

const roadNetworkSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: "Event", required: true, unique: true, index: true },

    /**
     * Hash of the coverage polygon this import was made from. Compared against
     * the venue's current AoR on every read so a network for the wrong area is
     * flagged stale instead of quietly trusted.
     */
    coverageHash: { type: String, required: true, index: true },

    segments: { type: [segmentSchema], default: [] },
    junctions: { type: [junctionSchema], default: [] },

    stats: {
      segmentCount: { type: Number, default: 0 },
      junctionCount: { type: Number, default: 0 },
      totalLengthM: { type: Number, default: 0 },
      /** Segments carrying a name — not the number of distinct roads. */
      namedRoadCount: { type: Number, default: 0 },
      /** The distinct street names found, so an operator can sanity-check the area. */
      roadNames: { type: [String], default: [] },
    },

    fetchedAt: { type: Date },

    /** ODbL requires the attribution to travel with the data. */
    attribution: { type: String, default: "" },
    source: { type: String, default: "overpass" },
  },
  { timestamps: true }
);

export default mongoose.model("RoadNetwork", roadNetworkSchema);
