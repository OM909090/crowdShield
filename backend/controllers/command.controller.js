/**
 * command.controller — the authority control-room summary.
 *
 * Every figure here is derived from the live pipeline (GPS heartbeats → H3 →
 * density/flow → Tier 1 risk) via services/snapshot.js. Nothing is invented: if
 * no one is reporting, the numbers are zero and `hasLiveData` is false so the UI
 * can say "no readings yet" instead of implying a quiet venue.
 *
 * Recommendations deliberately do NOT live here. They come from the AI agent
 * (`GET /events/:id/agent/proposals`), which reasons over this same snapshot and
 * whose output is auditable and human-approved. Hardcoded if/else advice dressed
 * up as "AI recommendations" would be a lie.
 */
import Event from "../models/Event.js";
import Venue from "../models/Venue.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { buildSnapshot } from "../services/snapshot.js";
import { recordReading, getTrend } from "../services/readings.js";
import { PEDESTRIAN } from "../utils/geo.js";

/** Coarse label for the dashboard's headline, from the worst zone's risk. */
const RISK_ORDER = { NORMAL: 0, WATCH: 1, ELEVATED: 2, HIGH: 3, CRITICAL: 4 };

function headlineRisk(zones = []) {
  let worst = null;
  for (const z of zones) {
    if (!worst || (RISK_ORDER[z.riskLevel] ?? -1) > (RISK_ORDER[worst.riskLevel] ?? -1)) worst = z;
  }
  if (!worst) return { level: "Low", probability: 0, worstZone: null };

  // `risk` is the predictor's 0..1 composite; express it as a percentage for the
  // dashboard, and map the state-machine level onto the three-band label the UI
  // uses. No invented smoothing — this is the predictor's own number.
  const probability = Math.round((worst.risk ?? 0) * 100);
  const level =
    RISK_ORDER[worst.riskLevel] >= RISK_ORDER.HIGH
      ? "High"
      : RISK_ORDER[worst.riskLevel] >= RISK_ORDER.WATCH
        ? "Moderate"
        : "Low";
  return { level, probability, worstZone: worst };
}

export const getCommandSnapshot = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) throw new ApiError(404, "Event not found");

  const venue = await Venue.findOne({ event: event._id });
  const snap = await buildSnapshot(event, venue);

  const gates = (snap.nodes || []).filter((n) => n.type === "gate");
  const openGates = gates.filter((g) => g.state !== "closed");
  const { level, probability, worstZone } = headlineRisk(snap.zones);

  // Average pace across the live cells, weighted by how many people each holds —
  // the honest way to state "how fast is this crowd moving".
  const cells = snap.cells || [];
  let peopleWithSpeed = 0;
  let speedSum = 0;
  for (const c of cells) {
    const n = c.personsEst ?? 0;
    if (Number.isFinite(c.meanSpeed) && n > 0) {
      speedSum += c.meanSpeed * n;
      peopleWithSpeed += n;
    }
  }
  const avgSpeedMps = peopleWithSpeed > 0 ? speedSum / peopleWithSpeed : null;

  const currentCrowd = snap.totals?.personsEst ?? 0;
  const hasLiveData = (snap.totals?.sampledDevices ?? 0) > 0;

  const snapshot = {
    hasLiveData,
    currentCrowd,
    // How that headcount was arrived at. `currentCrowd` is an *estimate*:
    // sampledDevices ÷ participationRate. Surfacing both keeps the operator
    // from reading a scaled figure as a census.
    sampledDevices: snap.totals?.sampledDevices ?? 0,
    participationRate: snap.totals?.participationRate ?? null,
    riskProbability: probability,
    riskLevel: level,
    // Null (not a fabricated default) when nobody is moving yet; the UI shows a dash.
    avgSpeed: avgSpeedMps == null ? null : `${avgSpeedMps.toFixed(1)} m/s`,
    freeFlowSpeed: `${PEDESTRIAN.FREE_WALK_SPEED_MPS} m/s`,
    openGates: openGates.length,
    totalGates: gates.length,
    gates: gates.map((g) => ({ name: g.name || g.id, status: g.state === "closed" ? "closed" : "open" })),
    worstZone: worstZone
      ? {
          id: worstZone.id,
          name: worstZone.name,
          riskLevel: worstZone.riskLevel,
          density: worstZone.density,
          etaCriticalSec: worstZone.forecast?.etaCriticalSec ?? null,
        }
      : null,
    activeAlerts: (snap.activeAlerts || []).length,
    hotspots: (snap.hotspots || []).length,
    generatedAt: snap.generatedAt,
  };

  // Persisted so the trend survives a restart and reflects real readings only.
  const trend = await recordReading(event._id, {
    people: currentCrowd,
    risk: probability,
    hasLiveData,
  });

  res.status(200).json({ snapshot, trend });
});
