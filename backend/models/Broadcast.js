import mongoose from "mongoose";

const { Schema } = mongoose;

export const BROADCAST_SOURCES = ["authority", "agent"];
export const BROADCAST_SEVERITIES = ["info", "warning", "critical"];

/**
 * A public announcement pushed to everyone inside an event.
 *
 * Two things can create one: an authority typing it, or the AI agent proposing a
 * `broadcast_alert` that an authority approved (never the agent alone — telling
 * 40,000 people to move is the most consequential action in the system).
 *
 * Persisted rather than fire-and-forget so that (a) a phone that joins late or
 * reconnects can still fetch what it missed, and (b) there is an audit trail of
 * exactly what the crowd was told, and by whom.
 *
 * `messages` holds per-language copies (en/hi/or…) keyed by language code, so a
 * citizen reads the announcement in the language they picked. `message` is the
 * default/fallback text.
 */
const broadcastSchema = new Schema(
  {
    event: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },

    message: { type: String, required: true, trim: true, maxlength: 500 },
    messages: { type: Map, of: String, default: undefined },

    severity: { type: String, enum: BROADCAST_SEVERITIES, default: "info" },
    source: { type: String, enum: BROADCAST_SOURCES, default: "authority" },

    // Optional targeting hints (the action schema already allows these).
    cohorts: { type: [String], default: undefined },
    zoneIds: { type: [String], default: undefined },

    // Provenance: which agent proposal produced it, and who signed it off.
    proposal: { type: Schema.Types.ObjectId, ref: "AgentProposal" },
    issuedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Citizens and dashboards both read "the newest few for this event".
broadcastSchema.index({ event: 1, createdAt: -1 });

/** Client-safe shape shared by the socket push and the REST fetch. */
export function serializeBroadcast(b) {
  return {
    id: String(b._id),
    eventId: String(b.event),
    message: b.message,
    messages: b.messages ? Object.fromEntries(b.messages) : undefined,
    severity: b.severity,
    source: b.source,
    cohorts: b.cohorts,
    zoneIds: b.zoneIds,
    createdAt: b.createdAt,
  };
}

export default mongoose.model("Broadcast", broadcastSchema);
