/**
 * routeFusion — overlay CrowdShield's LIVE crowd risk onto Google's geometry.
 *
 * This is the deliberate seam the whole "Google as a tool" design hinges on:
 * Google returns candidate walking routes (distance/time/polyline); we, in
 * DETERMINISTIC code (never the model), sample each route against live zone
 * risk and gate state, then re-rank. So Google's "fastest" route never wins if
 * it threads a 5 p/m² corridor or dumps people at a closed gate.
 *
 * Pure module: no network, no DB. Inputs are a route (with an encoded polyline),
 * the Situation Snapshot (zone risk + gate state), and the Venue graph (zone
 * polygons). Coordinates are [lat, lng] throughout.
 *
 * Honest scope: risk is only known INSIDE monitored zones. Where a route runs
 * outside the Area of Responsibility (most of a Google approach route) there is
 * no CrowdShield risk and the route is scored on time alone — which is correct:
 * Google owns outside-the-fence, the venue graph owns inside.
 */
import { pointInPolygon, haversineMeters } from "../utils/geo.js";

// A route sampled at max risk R adds ~ R * this many seconds of "avoid me" cost.
const RISK_PENALTY_SEC_AT_1 = 900;
// At/above this sampled risk the route is considered unsafe (hard-rejected).
const HARD_RISK = 0.85;
// A route endpoint within this many metres of a gate is treated as "arriving at" it.
const GATE_SNAP_M = 60;

/**
 * Decode a Google-encoded polyline into [lat, lng] points.
 * Standard algorithm (1e5 precision). Returns [] on empty/invalid input.
 */
export function decodePolyline(encoded) {
  if (typeof encoded !== "string" || !encoded) return [];
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const len = encoded.length;

  while (index < len) {
    let result = 0;
    let shift = 0;
    let b;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < len);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < len);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/** zoneId -> risk (0..1) from the snapshot, tolerant of undecorated zones. */
function zoneRiskById(snapshot) {
  const m = new Map();
  for (const z of snapshot?.zones || []) m.set(z.id, z.risk ?? 0);
  return m;
}

/** Risk at a single [lat,lng] point: the risk of the venue zone containing it (0 if none). */
function riskAtPoint(point, venue, riskById) {
  for (const z of venue?.zones || []) {
    if (z.polygon && pointInPolygon(point, z.polygon)) {
      return { risk: riskById.get(z.id) ?? 0, zoneId: z.id };
    }
  }
  return { risk: 0, zoneId: null };
}

/**
 * Sample a route's points against live zone risk.
 * @returns {{maxRisk,meanRisk,worstZoneId,insideSamples,totalSamples}}
 */
export function sampleRiskAlongRoute(points = [], snapshot, venue) {
  const riskById = zoneRiskById(snapshot);
  let maxRisk = 0;
  let sum = 0;
  let inside = 0;
  let worstZoneId = null;

  for (const p of points) {
    const { risk, zoneId } = riskAtPoint(p, venue, riskById);
    if (zoneId) {
      inside += 1;
      sum += risk;
      if (risk > maxRisk) {
        maxRisk = risk;
        worstZoneId = zoneId;
      }
    }
  }
  return {
    maxRisk,
    meanRisk: inside ? sum / inside : 0,
    worstZoneId,
    insideSamples: inside,
    totalSamples: points.length,
  };
}

/** Nearest gate node (from the snapshot) to a point, with distance in metres. */
function nearestGate(point, snapshot) {
  let best = null;
  for (const n of snapshot?.nodes || []) {
    if (n.type !== "gate" || !n.at) continue;
    const d = haversineMeters(point, n.at);
    if (!best || d < best.distM) best = { node: n, distM: d };
  }
  return best;
}

/**
 * Score one candidate route by fusing time with live risk.
 * @param {{distanceMeters,durationSec,encodedPolyline}} route
 * @returns {{index,durationSec,distanceMeters,maxRisk,meanRisk,worstZoneId,endpointGate,unsafe,reason,score}}
 */
export function scoreRoute(route, snapshot, venue, index = 0) {
  const points = decodePolyline(route.encodedPolyline);
  const risk = sampleRiskAlongRoute(points, snapshot, venue);
  const durationSec = route.durationSec ?? 0;

  let unsafe = false;
  let reason = null;

  // Hard reject: the route threads a zone that's at/above critical risk.
  if (risk.maxRisk >= HARD_RISK) {
    unsafe = true;
    reason = `passes through high-risk zone ${risk.worstZoneId} (risk ${risk.maxRisk.toFixed(2)})`;
  }

  // Hard reject: the route arrives at a CLOSED gate.
  let endpointGate = null;
  if (points.length) {
    const near = nearestGate(points[points.length - 1], snapshot);
    if (near && near.distM <= GATE_SNAP_M) {
      endpointGate = { id: near.node.id, state: near.node.state, distM: Math.round(near.distM) };
      if (near.node.state === "closed") {
        unsafe = true;
        reason = reason || `arrives at closed gate ${near.node.id}`;
      }
    }
  }

  // Time + a risk surcharge proportional to how hot the route runs.
  const score = durationSec + risk.maxRisk * RISK_PENALTY_SEC_AT_1;

  return {
    index,
    durationSec,
    distanceMeters: route.distanceMeters ?? null,
    maxRisk: Number(risk.maxRisk.toFixed(3)),
    meanRisk: Number(risk.meanRisk.toFixed(3)),
    worstZoneId: risk.worstZoneId,
    endpointGate,
    unsafe,
    reason,
    score: Math.round(score),
  };
}

/**
 * Rank candidate routes: safe routes first (lowest fused score wins), unsafe
 * ones demoted to the back with their reason attached. Each entry keeps the
 * original route so the caller can hand back geometry/eta.
 * @returns {Array<{route, ...score}>}
 */
export function rankRoutesByRisk(routes = [], snapshot, venue) {
  const scored = routes.map((route, i) => ({ route, ...scoreRoute(route, snapshot, venue, i) }));
  scored.sort((a, b) => {
    if (a.unsafe !== b.unsafe) return a.unsafe ? 1 : -1; // safe first
    return a.score - b.score; // then cheapest fused cost
  });
  return scored;
}
