import Event from "../models/Event.js";
import MapMarker from "../models/MapMarker.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { getSimulatedState, getTrendHistory } from "../utils/mockCrowdEngine.js";

// Rolling incident log per event, derived from state transitions (a new
// zone going Critical logs an entry). In-memory like the rest of the mock
// engine — swap for a persisted Incident collection once real anomaly
// detection exists upstream.
const incidentLog = new Map();
const MAX_INCIDENTS = 6;

const maybeLogIncident = (eventId, state) => {
  const key = eventId.toString();
  const log = incidentLog.get(key) || [];
  const criticalZone = state.zones.find((z) => z.status === "Critical");

  if (criticalZone && log[0]?.zone !== criticalZone.name) {
    log.unshift({
      time: new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }),
      title: `${criticalZone.name} congestion spike`,
      desc: `Density reached ${criticalZone.density}% — above the safe threshold.`,
      zone: criticalZone.name,
    });
  }

  if (log.length > MAX_INCIDENTS) log.length = MAX_INCIDENTS;
  incidentLog.set(key, log);
  return log;
};

export const getAnalyticsSnapshot = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) throw new ApiError(404, "Event not found");

  const state = getSimulatedState(event);
  const trend = getTrendHistory(req.params.id);
  const incidents = maybeLogIncident(req.params.id, state);
  const markersPlaced = await MapMarker.countDocuments({ event: event._id });

  const riskSplit = [
    { name: "Critical", value: state.zones.filter((z) => z.status === "Critical").length, color: "#f87171" },
    { name: "Moderate", value: state.zones.filter((z) => z.status === "Moderate").length, color: "#fbbf24" },
    { name: "Safe", value: state.zones.filter((z) => z.status === "Safe").length, color: "#34d399" },
  ];

  res.status(200).json({
    kpis: {
      totalCrowd: state.currentCrowd,
      riskLevel: state.riskLevel,
      riskProbability: state.riskProbability,
      avgSpeed: state.avgSpeed,
      activeHotspots: state.hotspotCount,
      markersPlaced,
    },
    trend,
    zoneLoad: state.zones.map((z) => ({ name: z.name, value: z.density })),
    riskSplit,
    incidents,
  });
});
