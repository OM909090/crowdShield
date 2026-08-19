import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * A single sampled point of an event's live crowd state.
 *
 * The dashboards need a trend line ("is this crowd growing?"), which means we
 * have to remember what the pipeline said a minute ago. Previously that history
 * lived in a process-local array of fabricated numbers, so it was both invented
 * and lost on restart. These are real samples of the real snapshot, persisted.
 *
 * Only written while an event actually has live readings, so the chart can never
 * imply a crowd that wasn't there. Samples expire automatically — this is
 * operational telemetry, not something to keep forever.
 */
const readingSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    people: { type: Number, required: true }, // estimated persons in the AoR
    risk: { type: Number, required: true }, // worst-zone risk, 0..100
    at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

readingSchema.index({ event: 1, at: -1 });
// Keep ~24h of telemetry; long-term analytics would use a rollup, not raw samples.
readingSchema.index({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export default mongoose.model("Reading", readingSchema);
