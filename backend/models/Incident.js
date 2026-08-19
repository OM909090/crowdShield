import mongoose from "mongoose";

const { Schema } = mongoose;

// What kind of situation is being reported. "sos" is the highest-urgency,
// citizen-triggered panic signal; the rest describe on-ground conditions.
const INCIDENT_CATEGORIES = ["sos", "medical", "hazard", "blocked", "lost", "other"];

// Who raised it: citizens self-report, marshals (authority role) file from the
// field, and "system" is reserved for automated/derived reports.
const REPORTER_TYPES = ["citizen", "marshal", "system"];

// open -> acknowledged (authority saw it) -> resolved (handled/closed out).
const INCIDENT_STATUSES = ["open", "acknowledged", "resolved"];

// Where the incident was reported from. Optional — a citizen may report a
// hazard without sharing precise coordinates. Stored as plain lat/lng (not
// GeoJSON) because these are rendered directly on the Leaflet map, matching
// how MapMarker stores its position.
const geoSchema = new Schema(
  {
    lat: { type: Number },
    lng: { type: Number },
  },
  { _id: false }
);

const incidentSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },

    reporterType: { type: String, enum: REPORTER_TYPES, default: "citizen" },

    category: { type: String, enum: INCIDENT_CATEGORIES, required: true },
    note: { type: String, trim: true, maxlength: 500 },

    geo: { type: geoSchema },

    status: { type: String, enum: INCIDENT_STATUSES, default: "open", index: true },

    createdBy: { type: Schema.Types.ObjectId, ref: "User" },

    acknowledgedBy: { type: Schema.Types.ObjectId, ref: "User" },
    acknowledgedAt: { type: Date },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

// Primary access pattern: the command dashboard lists a single event's active
// incidents, newest first.
incidentSchema.index({ event: 1, status: 1, createdAt: -1 });

export const INCIDENT_CATEGORY_VALUES = INCIDENT_CATEGORIES;
export const INCIDENT_REPORTER_TYPES = REPORTER_TYPES;
export const INCIDENT_STATUS_VALUES = INCIDENT_STATUSES;
export default mongoose.model("Incident", incidentSchema);
