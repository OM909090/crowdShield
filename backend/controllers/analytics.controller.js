/**
 * analytics.controller — the authority's operational analytics view.
 *
 * Everything is measured, not modelled-for-show:
 *   kpis      ← the live snapshot (H3 density → Tier 1 risk)
 *   trend     ← persisted Readings (real samples, survives restarts)
 *   zoneLoad  ← the authored Venue zones with their live density
 *   riskSplit ← how many zones sit in each risk band right now
 *   incidents ← the real Incident collection + Tier 1 Alert history
 *
 * When an event has no live readings we say so (`hasLiveData: false`) and return
 * zeros/empties rather than plausible-looking numbers, so the UI can render an
 * honest "waiting for readings" state.
 */
import Event from "../models/Event.js";
import Venue from "../models/Venue.js";
import MapMarker from "../models/MapMarker.js";
import Incident from "../models/Incident.js";
import Alert from "../models/Alert.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { buildSnapshot } from "../services/snapshot.js";
import { getTrend } from "../services/readings.js";

const RISK_ORDER = { NORMAL: 0, WATCH: 1, ELEVATED: 2, HIGH: 3, CRITICAL: 4 };

const timeLabel = (d) =>
  new Date(d).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });

/**
 * The operational log: what actually happened, newest first.
 * Two real sources — people reporting problems (Incident) and the predictor
 * escalating a zone (Alert) — merged into one timeline.
 */
async function buildIncidentLog(eventId, limit = 8) {
  const [incidents, alerts] = await Promise.all([
    Incident.find({ event: eventId }).sort({ createdAt: -1 }).limit(limit).lean(),
    Alert.find({ event: eventId }).sort({ createdAt: -1 }).limit(limit).lean(),
  ]);

  const fromIncidents = incidents.map((i) => ({
    // A stable identity per entry. Without it the client has to key a list on
    // time+title, which collides the moment two people report the same category
    // in the same minute — exactly when an operator most needs the list to be
    // right.
    id: `incident:${i._id}`,
    time: timeLabel(i.createdAt),
    title: `${i.category.toUpperCase()} reported`,
    desc: i.note?.trim()
      ? i.note.trim()
      : `Reported by a ${i.reporterType || "citizen"}${i.status ? ` · ${i.status}` : ""}`,
    kind: "incident",
    at: i.createdAt,
  }));

  const fromAlerts = alerts.map((a) => ({
    id: `alert:${a._id}`,
    time: timeLabel(a.createdAt),
    title: `${a.zoneName || a.zoneId} · ${a.severity} risk`,
    desc:
      a.etaCriticalSec != null
        ? `Predicted time-to-critical ${a.etaCriticalSec}s at risk ${(a.risk ?? 0).toFixed(2)}`
        : `Risk ${(a.risk ?? 0).toFixed(2)} — ${a.status}`,
    kind: "alert",
    at: a.createdAt,
  }));

  return [...fromIncidents, ...fromAlerts]
    .sort((x, y) => new Date(y.at) - new Date(x.at))
    .slice(0, limit)
    .map(({ at, ...rest }) => rest); // drop the raw sort key
}

export const getAnalyticsSnapshot = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) throw new ApiError(404, "Event not found");

  const venue = await Venue.findOne({ event: event._id });
  const snap = await buildSnapshot(event, venue);

  const [markersPlaced, trend, incidents, openIncidents] = await Promise.all([
    MapMarker.countDocuments({ event: event._id }),
    getTrend(event._id),
    buildIncidentLog(event._id),
    Incident.countDocuments({ event: event._id, status: { $ne: "resolved" } }),
  ]);

  const zones = snap.zones || [];
  let worst = null;
  for (const z of zones) {
    if (!worst || (RISK_ORDER[z.riskLevel] ?? -1) > (RISK_ORDER[worst.riskLevel] ?? -1)) worst = z;
  }

  const riskLevel =
    worst && RISK_ORDER[worst.riskLevel] >= RISK_ORDER.HIGH
      ? "High"
      : worst && RISK_ORDER[worst.riskLevel] >= RISK_ORDER.WATCH
        ? "Moderate"
        : "Low";

  // Pace, weighted by how many people are moving at it.
  let peopleWithSpeed = 0;
  let speedSum = 0;
  for (const c of snap.cells || []) {
    const n = c.personsEst ?? 0;
    if (Number.isFinite(c.meanSpeed) && n > 0) {
      speedSum += c.meanSpeed * n;
      peopleWithSpeed += n;
    }
  }
  const avgSpeedMps = peopleWithSpeed > 0 ? speedSum / peopleWithSpeed : null;

  const band = (name, test, color) => ({
    name,
    value: zones.filter((z) => test(RISK_ORDER[z.riskLevel] ?? 0)).length,
    color,
  });

  res.status(200).json({
    hasLiveData: (snap.totals?.sampledDevices ?? 0) > 0,
    kpis: {
      totalCrowd: snap.totals?.personsEst ?? 0,
      riskLevel,
      riskProbability: Math.round((worst?.risk ?? 0) * 100),
      avgSpeed: avgSpeedMps == null ? null : `${avgSpeedMps.toFixed(1)} m/s`,
      activeHotspots: (snap.hotspots || []).length,
      activeAlerts: (snap.activeAlerts || []).length,
      openIncidents,
      markersPlaced,
      zonesMonitored: zones.length,
    },
    trend,
    // Real authored zones with their measured density (p/m²).
    zoneLoad: zones.map((z) => ({
      name: z.name || z.id,
      value: Number((z.density ?? 0).toFixed(2)),
      riskLevel: z.riskLevel || "NORMAL",
    })),
    riskSplit: [
      band("Critical", (r) => r >= RISK_ORDER.HIGH, "#f87171"),
      band("Elevated", (r) => r === RISK_ORDER.ELEVATED, "#fbbf24"),
      band("Watch", (r) => r === RISK_ORDER.WATCH, "#38bdf8"),
      band("Normal", (r) => r === RISK_ORDER.NORMAL, "#34d399"),
    ].filter((b) => b.value > 0),
    incidents,
  });
});
