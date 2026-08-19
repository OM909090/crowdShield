/**
 * broadcast — the one path by which anything reaches the crowd's phones.
 *
 * Whether the words came from an authority typing them or from an AI proposal an
 * authority approved, they travel through here: persist (audit trail + late
 * joiners), then push to the event room over Socket.IO. Citizens are already in
 * that room via the live crowd feed, so no extra plumbing is needed.
 *
 * The agent can never call this directly — `broadcast_alert` is a CONSEQUENTIAL
 * action, so it only lands here after human sign-off.
 */
import Broadcast, { serializeBroadcast } from "../models/Broadcast.js";
import { getIO, roomName } from "../realtime/socket.js";

/**
 * Create and push an announcement.
 *
 * @param {Object} args
 * @param {string} args.eventId
 * @param {string} args.message               default/fallback text
 * @param {Object} [args.messages]            { en, hi, or… } per-language copies
 * @param {"info"|"warning"|"critical"} [args.severity]
 * @param {"authority"|"agent"} [args.source]
 * @param {string[]} [args.cohorts]
 * @param {string[]} [args.zoneIds]
 * @param {string} [args.proposalId]
 * @param {string} [args.issuedBy]
 * @returns {Promise<Object>} the serialized broadcast
 */
export async function sendBroadcast({
  eventId,
  message,
  messages,
  severity = "info",
  source = "authority",
  cohorts,
  zoneIds,
  proposalId,
  issuedBy,
}) {
  const text = String(message || "").trim();
  if (!text) throw new Error("A broadcast needs a message");

  const doc = await Broadcast.create({
    event: eventId,
    message: text,
    // Only store a language map when it actually has entries.
    messages: messages && Object.keys(messages).length ? messages : undefined,
    severity,
    source,
    cohorts: cohorts?.length ? cohorts : undefined,
    zoneIds: zoneIds?.length ? zoneIds : undefined,
    proposal: proposalId,
    issuedBy,
  });

  const payload = serializeBroadcast(doc);

  // Best-effort fan-out: a socket hiccup must never fail the announcement,
  // because it is already durably recorded and clients re-fetch on reconnect.
  const io = getIO();
  if (io) io.to(roomName(eventId)).emit("agent:broadcast", payload);

  return payload;
}

/** The most recent announcements for an event (newest first). */
export async function recentBroadcasts(eventId, limit = 10) {
  const docs = await Broadcast.find({ event: eventId }).sort({ createdAt: -1 }).limit(limit);
  return docs.map(serializeBroadcast);
}
