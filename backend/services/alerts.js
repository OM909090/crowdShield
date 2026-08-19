/**
 * alerts — bridges predictor state transitions to durable Alert records +
 * the alert bus. Keeps at most one active alert per zone (its severity tracks
 * the current level), and resolves it when the zone calms down.
 */
import Alert from "../models/Alert.js";
import { alertBus } from "../realtime/alertBus.js";

const SEVERITY = { WATCH: "watch", ELEVATED: "elevated", HIGH: "high", CRITICAL: "critical" };
const ELEVATED_SET = new Set(["ELEVATED", "HIGH", "CRITICAL"]);

/**
 * Apply a batch of predictor transitions.
 * @returns {Promise<Array>} newly created Alert docs (for socket fan-out)
 */
export async function handleTransitions(eventId, transitions = []) {
  const created = [];

  for (const t of transitions) {
    // Any transition that lands in (or moves within) the elevated band supersedes
    // the prior active alert with one carrying the current severity.
    if (ELEVATED_SET.has(t.to)) {
      await Alert.updateMany(
        { event: eventId, zoneId: t.zoneId, status: { $ne: "resolved" } },
        { status: "resolved", resolvedAt: new Date() }
      );
      const alert = await Alert.create({
        event: eventId,
        zoneId: t.zoneId,
        zoneName: t.zoneName,
        type: "risk_escalation",
        severity: SEVERITY[t.to],
        risk: t.risk,
        etaCriticalSec: t.etaCriticalSec ?? null,
        factors: t.factors,
        status: "active",
      });
      created.push(alert);
      alertBus.emit("alert", { kind: "risk_escalation", eventId: String(eventId), alert: alert.toObject() });
    } else {
      // dropped back to NORMAL/WATCH -> resolve any active alert for the zone
      const r = await Alert.updateMany(
        { event: eventId, zoneId: t.zoneId, status: { $ne: "resolved" } },
        { status: "resolved", resolvedAt: new Date() }
      );
      if (r.modifiedCount) alertBus.emit("alert", { kind: "resolved", eventId: String(eventId), zoneId: t.zoneId });
    }
  }

  return created;
}

/**
 * Keep active alerts honest against the live picture, every tick.
 *
 * Transitions alone are not enough: they fire on change, so a zone that simply
 * *stays* elevated never refreshes, and a zone that quietly empties out (or an
 * event whose live loop stopped) never produces a calm-down transition. So each
 * tick we touch the alerts whose zones are still elevated, and resolve the ones
 * whose zones are not.
 *
 * @param {string} eventId
 * @param {Array} zones  the risk-decorated zones from this tick
 */
export async function syncActiveAlerts(eventId, zones = []) {
  const elevated = new Set(
    zones.filter((z) => ELEVATED_SET.has(z.riskLevel)).map((z) => z.zoneId || z.id)
  );

  const open = await Alert.find({ event: eventId, status: { $ne: "resolved" } }).select(
    "zoneId status"
  );
  if (!open.length) return;

  const stillHot = open.filter((a) => elevated.has(a.zoneId)).map((a) => a._id);
  const calmed = open.filter((a) => !elevated.has(a.zoneId)).map((a) => a._id);

  if (stillHot.length) {
    await Alert.updateMany({ _id: { $in: stillHot } }, { lastSeenAt: new Date() });
  }
  if (calmed.length) {
    await Alert.updateMany(
      { _id: { $in: calmed } },
      { status: "resolved", resolvedAt: new Date(), resolvedReason: "conditions cleared" }
    );
  }
}

/** An alert not refreshed for this long is assumed over (the loop may have stopped). */
const STALE_ALERT_MS = 3 * 60 * 1000;

/**
 * Active alerts for an event, self-healing on read.
 *
 * Any read path (dashboard, snapshot, the AI agent's context) sweeps alerts that
 * haven't been refreshed recently. That way a stopped event can't keep serving a
 * frightening stale alert to operators — or to the agent, which would otherwise
 * reason about a crush that ended hours ago.
 */
export async function getActiveAlerts(eventId) {
  const cutoff = new Date(Date.now() - STALE_ALERT_MS);
  await Alert.updateMany(
    {
      event: eventId,
      status: { $ne: "resolved" },
      // `$lt` alone would skip documents that predate `lastSeenAt` entirely
      // (Mongo doesn't match a missing field against a range), which is exactly
      // the old alerts most in need of sweeping — so fall back to createdAt.
      $or: [{ lastSeenAt: { $lt: cutoff } }, { lastSeenAt: { $exists: false }, createdAt: { $lt: cutoff } }],
    },
    { status: "resolved", resolvedAt: new Date(), resolvedReason: "no longer reported" }
  );

  return Alert.find({ event: eventId, status: { $ne: "resolved" } })
    .sort({ createdAt: -1 })
    .limit(50);
}

export async function acknowledgeAlert(eventId, alertId, userId) {
  const alert = await Alert.findOne({ _id: alertId, event: eventId });
  if (!alert) return null;
  if (alert.status === "active") {
    alert.status = "acknowledged";
    alert.acknowledgedBy = userId;
    alert.acknowledgedAt = new Date();
    await alert.save();
  }
  return alert;
}
