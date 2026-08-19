import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * An Alert is raised by the Tier 1 predictor when a zone's risk state escalates.
 * It's the durable record behind the live `alert:new` push, the audit trail for
 * the generative incident summary (E5), and the trigger source for the LLM
 * agent (E4). Only the predictor creates these — never the LLM.
 */
const alertSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    zoneId: { type: String, required: true },
    zoneName: { type: String },

    type: { type: String, enum: ["risk_escalation"], default: "risk_escalation" },
    severity: { type: String, enum: ["watch", "elevated", "high", "critical"], required: true },

    risk: { type: Number, min: 0, max: 1 },
    etaCriticalSec: { type: Number, default: null }, // forecast time-to-critical at raise
    factors: { type: Schema.Types.Mixed }, // the explainable risk breakdown

    status: { type: String, enum: ["active", "acknowledged", "resolved"], default: "active", index: true },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: "User" },
    acknowledgedAt: { type: Date },
    resolvedAt: { type: Date },

    /**
     * Last tick on which this zone was still in an elevated state.
     *
     * Without this an alert lives forever: transitions only fire on *change*, so
     * a zone that stays hot never re-notifies, and if the live loop stops (the
     * last viewer left, the event ended) no calm-down transition is ever
     * recorded either. The result was an "active" CRITICAL alert sitting on the
     * dashboard hours after the crowd went home — and worse, being fed to the AI
     * agent as current truth. Refreshed every tick while elevated; alerts that
     * go unrefreshed are swept to `resolved`.
     */
    lastSeenAt: { type: Date, default: Date.now },
    resolvedReason: { type: String },
  },
  { timestamps: true }
);

alertSchema.index({ event: 1, status: 1, createdAt: -1 });

export default mongoose.model("Alert", alertSchema);
