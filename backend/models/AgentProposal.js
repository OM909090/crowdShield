import mongoose from "mongoose";

const { Schema } = mongoose;

export const PROPOSAL_STATUSES = ["proposed", "approved", "rejected", "executed"];
export const ACTION_STATUSES = ["pending", "applied", "executed", "rejected", "failed"];

/**
 * One proposed action inside a proposal. `params` holds the type-specific
 * fields (gateId, zoneId, edgeId/direction, from/count/to, message/…) as a
 * Mixed bag so the vocabulary can grow without a schema migration. `klass`
 * decides the execution path: advisory auto-applies, consequential waits for a
 * human. `status` tracks that per action.
 */
const actionSchema = new Schema(
  {
    type: { type: String, required: true },
    klass: { type: String, enum: ["advisory", "consequential"], required: true },
    params: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ACTION_STATUSES, default: "pending" },
    result: { type: String },
  },
  { _id: false }
);

/**
 * A single reasoning turn of the Tier 2 agent: what triggered it, its severity
 * read, the human-readable reasoning, and the structured actions it proposed.
 * Persisted for the audit trail + the command dashboard, and the source for the
 * generative incident summary later (E5).
 */
const agentProposalSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    trigger: { type: String, default: "manual" },
    severity: { type: String, enum: ["low", "medium", "high", "critical"], default: "low" },
    reasoning: { type: String, default: "" },
    actions: { type: [actionSchema], default: [] },
    status: { type: String, enum: PROPOSAL_STATUSES, default: "proposed", index: true },
    model: { type: String }, // which LLM produced it (audit)
    /**
     * The model replied, but not with a readable decision envelope (truncated
     * output, prose instead of JSON, …). Kept explicit so neither the dashboard
     * nor an incident summary can mistake a failed pass for an "all clear":
     * `severity` and an empty `actions` list are meaningless when this is true.
     */
    parseFailed: { type: Boolean, default: false },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    decidedAt: { type: Date },
  },
  { timestamps: true }
);

// Dashboard reads a single event's proposals newest-first.
agentProposalSchema.index({ event: 1, createdAt: -1 });

export default mongoose.model("AgentProposal", agentProposalSchema);
