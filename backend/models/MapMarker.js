import mongoose from "mongoose";

const { Schema } = mongoose;

const MARKER_TYPES = [
  "Barricade",
  "Blocked Path",
  "Safe Zone",
  "Medical Tent",
  "Entry Gate",
  "Exit Gate",
  "Security Post",
  "Other",
];

const mapMarkerSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    type: { type: String, enum: MARKER_TYPES, required: true },
    label: { type: String, trim: true, maxlength: 100 },
    note: { type: String, trim: true, maxlength: 500 },

    // Plain lat/lng (not GeoJSON) — these are placed directly on a Leaflet
    // map by an authority and read back the same way, so there's no need
    // for $near-style geo queries here the way there is on Event.location.
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

export const MAP_MARKER_TYPES = MARKER_TYPES;
export default mongoose.model("MapMarker", mapMarkerSchema);
