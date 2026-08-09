/**
 * TEMPORARY MOCK DATA SOURCE — shared by crowd, command, and analytics
 * controllers so they don't each roll independent random numbers for the
 * same event. Cached briefly per event so near-simultaneous requests agree.
 *
 * Replace `buildState()` with a real read from your AI/sensor pipeline once
 * it exists — every controller downstream already expects this exact shape,
 * so nothing else should need to change.
 */

const ZONE_TEMPLATE = ["Main Entrance", "Food Court", "Exit Zone", "Stage / Central Area", "Parking"];
const GATES = ["Gate A", "Gate B", "Gate C", "Gate D", "Gate E", "Gate F"];
const DIRECTIONS = ["North", "North-East", "East", "South-East", "South", "South-West", "West", "North-West"];

const STATE_TTL_MS = 3000; // regenerate at most every 3s
const stateCache = new Map(); // eventId -> { state, expiresAt }

const randomBetween = (min, max) => Math.random() * (max - min) + min;

const buildState = (event) => {
  const baseline = event.expectedAttendance || 5000;
  const occupancyRatio = randomBetween(0.3, 0.95);
  const currentCrowd = Math.round(baseline * occupancyRatio);
  const riskProbability = Math.round(Math.min(95, occupancyRatio * randomBetween(25, 60)));
  const riskLevel = riskProbability >= 60 ? "High" : riskProbability >= 35 ? "Moderate" : "Low";
  const openGatesCount = Math.max(1, GATES.length - Math.floor(riskProbability / 20));

  const zones = ZONE_TEMPLATE.map((name) => {
    const density = Math.round(randomBetween(15, 96));
    const status = density >= 80 ? "Critical" : density >= 50 ? "Moderate" : "Safe";
    return { name, density, status };
  }).sort((a, b) => b.density - a.density);

  const gates = GATES.map((name, i) => ({ name, status: i < openGatesCount ? "open" : "closed" }));

  return {
    currentCrowd,
    riskProbability,
    riskLevel,
    avgSpeed: `${randomBetween(0.6, 1.6).toFixed(1)} m/s`,
    flowDirection: DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)],
    zones,
    hotspotCount: zones.filter((z) => z.status === "Critical").length,
    gates,
    openGates: openGatesCount,
    totalGates: GATES.length,
    generatedAt: new Date().toISOString(),
  };
};

export const getSimulatedState = (event) => {
  const key = event._id.toString();
  const cached = stateCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.state;

  const state = buildState(event);
  stateCache.set(key, { state, expiresAt: Date.now() + STATE_TTL_MS });
  return state;
};

// Rolling trend history, shared across command center + analytics.
// In-memory: fine for a single-instance hackathon deployment, move to
// Redis or a time-series store before running multiple server processes.
const trendHistory = new Map();
const MAX_TREND_POINTS = 12;

export const recordTrendPoint = (eventId, point) => {
  const key = eventId.toString();
  const history = trendHistory.get(key) || [];
  history.push(point);
  if (history.length > MAX_TREND_POINTS) history.shift();
  trendHistory.set(key, history);
  return history;
};

export const getTrendHistory = (eventId) => trendHistory.get(eventId.toString()) || [];
