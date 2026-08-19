/**
 * guidance — the citizen-facing "what should *I* do right now" layer.
 *
 * Pure functions (no DB, no I/O): given the venue graph, the current situation
 * snapshot (per-zone risk), and one person's GPS + destination, it decides
 *   - where the person is relative to the guarded area, and
 *   - the single instruction (and optional route) to hand them.
 *
 * Two ideas drive it:
 *   • Risk-awareness — routes are chosen on the risk-weighted graph, so people
 *     are bent away from dense/at-risk zones rather than straight through them.
 *   • Anti-herding — when several good routes exist we pick *probabilistically*,
 *     weighted toward safer ones, so the crowd spreads across alternatives
 *     instead of every phone shouting "use Gate 3".
 *
 * Coordinates are [lat, lng] (Leaflet order) throughout.
 */
import {
  pointInPolygon,
  distanceToPathMeters,
  bearingDeg,
  centroid,
  haversineMeters,
  PEDESTRIAN,
} from "../utils/geo.js";
import { buildGraph, nearestNode, kSafestRoutes } from "./router.js";

const { FREE_WALK_SPEED_MPS } = PEDESTRIAN;

/** Beyond this heading offset from "toward the AoR" we read someone as passing by. */
const TRANSIT_BEARING_DEG = 110;

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

/** Smallest absolute angle (0..180) between two bearings in degrees. */
function bearingDelta(a, b) {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/** Whole minutes, never less than 1 (a "0 min" instruction reads as broken). */
const minutes = (sec) => Math.max(1, Math.round((sec || 0) / 60));

/** Map a 0..1 route risk score to the shared level vocabulary. */
function riskLevelFromScore(score = 0) {
  if (score >= 0.68) return "HIGH";
  if (score >= 0.5) return "ELEVATED";
  if (score >= 0.3) return "WATCH";
  return "NORMAL";
}

/** Zone (from the snapshot) carrying the highest risk, or null. */
function worstZone(snapshotZones = []) {
  let worst = null;
  for (const z of snapshotZones) {
    if (!worst || (z.risk ?? 0) > (worst.risk ?? 0)) worst = z;
  }
  return worst;
}

/** True if any zone is at HIGH/CRITICAL — the "hold the gates" signal. */
function aorLooksHighRisk(snapshotZones = []) {
  return snapshotZones.some(
    (z) => z.riskLevel === "HIGH" || z.riskLevel === "CRITICAL" || (z.risk ?? 0) >= 0.68
  );
}

/** zoneId -> { risk } map the router understands, tolerant of missing risk. */
function zoneRiskMap(snapshotZones = []) {
  const m = new Map();
  for (const z of snapshotZones) m.set(z.id, { risk: z.risk ?? 0 });
  return m;
}

/**
 * Anti-herding pick: weight each route by 1/(1+riskScore) and draw one at
 * random. Safer routes are likelier, but the crowd still fans out across the
 * alternatives instead of stampeding the single best one.
 */
function antiHerdPick(routes) {
  if (routes.length <= 1) return routes[0];
  const weights = routes.map((r) => 1 / (1 + (r.riskScore || 0)));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < routes.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return routes[i];
  }
  return routes[0];
}

const nodeName = (node) => node?.name || node?.id || "your destination";

/* ------------------------------------------------------------------ *
 * Classification
 * ------------------------------------------------------------------ */

/**
 * Where is the user relative to the guarded area?
 *   INSIDE      — inside the AoR polygon.
 *   APPROACHING — within bufferMeters of the AoR and heading toward it.
 *   TRANSIT     — within the buffer but clearly walking past, not in.
 *   OUTSIDE     — beyond the buffer (or no AoR defined).
 *
 * @param {Object} venue
 * @param {{lat:number,lng:number,heading?:number}} user
 * @returns {'INSIDE'|'APPROACHING'|'TRANSIT'|'OUTSIDE'}
 */
export function classifyUser(venue, { lat, lng, heading } = {}) {
  const ring = venue?.aor?.polygon;
  if (!Array.isArray(ring) || ring.length < 3) return "OUTSIDE";
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "OUTSIDE";

  const point = [lat, lng];
  if (pointInPolygon(point, ring)) return "INSIDE";

  const closedRing = [...ring, ring[0]];
  const dist = distanceToPathMeters(point, closedRing);
  const buffer = Number.isFinite(venue?.bufferMeters) ? venue.bufferMeters : 1500;
  if (dist > buffer) return "OUTSIDE";

  // Inside the approach ring. If we know their heading and it points well away
  // from the area's centre, they're passing through rather than coming in.
  if (Number.isFinite(heading)) {
    const toCentre = bearingDeg(point, centroid(ring));
    if (bearingDelta(heading, toCentre) > TRANSIT_BEARING_DEG) return "TRANSIT";
  }
  return "APPROACHING";
}

/* ------------------------------------------------------------------ *
 * Guidance
 * ------------------------------------------------------------------ */

/** Resolve the destination node id for an INSIDE user. */
function resolveDestination(venue, graph, destinationId, user) {
  if (destinationId && graph.nodePos.has(destinationId)) return destinationId;

  // Fall back to the nearest usable exit / declared destination.
  const candidates = (venue.nodes || []).filter(
    (n) => (n.type === "exit" || n.isDestination) && n.state !== "closed" && graph.nodePos.has(n.id)
  );
  if (!candidates.length) return null;

  let best = null;
  let bestD = Infinity;
  for (const n of candidates) {
    const d = haversineMeters([user.lat, user.lng], n.at);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best?.id ?? null;
}

/** Build the citizen-facing route payload from a chosen internal route. */
function toRoutePayload(route) {
  return {
    waypoints: route.waypoints,
    lengthM: route.lengthM,
    etaSec: route.etaSec,
    riskLevel: riskLevelFromScore(route.riskScore),
  };
}

function guideInside(venue, snapshotZones, user, destinationId, graph, zoneRiskById) {
  const start = nearestNode(graph, [user.lat, user.lng]);
  const destId = resolveDestination(venue, graph, destinationId, user);

  if (!start || !destId) {
    return {
      classification: "INSIDE",
      instruction: "You're inside the event area. Follow marshal directions to the nearest exit.",
    };
  }

  const routes = kSafestRoutes(venue, start, destId, zoneRiskById, { k: 3, alpha: 3 });
  if (!routes.length) {
    return {
      classification: "INSIDE",
      instruction:
        "No clear route to that destination right now — please follow marshal directions.",
    };
  }

  const chosen = antiHerdPick(routes);
  const destNode = (venue.nodes || []).find((n) => n.id === destId);
  const worst = worstZone(snapshotZones);
  const avoid = worst && (worst.risk ?? 0) >= 0.3 ? ` Avoid ${worst.name} if possible.` : "";

  return {
    classification: "INSIDE",
    instruction: `Head to ${nodeName(destNode)} via the highlighted route (~${minutes(
      chosen.etaSec
    )} min).${avoid}`,
    route: toRoutePayload(chosen),
    alternatives: routes.length - 1,
  };
}

function guideApproaching(venue, snapshotZones, user, graph, zoneRiskById) {
  // Usable entry gates: gates that are open or entry-only (never closed / exit-only).
  const gates = (venue.nodes || []).filter(
    (n) => n.type === "gate" && n.state !== "closed" && n.state !== "exit_only"
  );

  if (!gates.length) {
    return {
      classification: "APPROACHING",
      instruction: "No open entry gate nearby right now — please wait for directions.",
      hold: true,
    };
  }

  // Rank gates by their plaza-zone risk (lowest first), then by walking distance.
  const ranked = gates
    .map((gate) => {
      const zone = (venue.zones || []).find((z) => z.polygon && pointInPolygon(gate.at, z.polygon));
      const risk = zone ? zoneRiskById.get(zone.id)?.risk ?? 0 : 0;
      return { gate, risk, dist: haversineMeters([user.lat, user.lng], gate.at) };
    })
    .sort((a, b) => a.risk - b.risk || a.dist - b.dist);

  const { gate } = ranked[0];

  // Prefer a real routed walk time; fall back to straight-line if unrouteable.
  let route;
  let alternatives;
  let etaSec;
  if (graph.nodePos.size) {
    const start = nearestNode(graph, [user.lat, user.lng]);
    const routes = start ? kSafestRoutes(venue, start, gate.id, zoneRiskById, { k: 3, alpha: 3 }) : [];
    if (routes.length) {
      const chosen = antiHerdPick(routes);
      route = toRoutePayload(chosen);
      alternatives = routes.length - 1;
      etaSec = chosen.etaSec;
    }
  }
  if (etaSec == null) etaSec = haversineMeters([user.lat, user.lng], gate.at) / FREE_WALK_SPEED_MPS;

  // If the whole area is running hot, tell them to wait rather than pour in.
  if (aorLooksHighRisk(snapshotZones)) {
    return {
      classification: "APPROACHING",
      instruction: "Please hold — the event area is near capacity. Wait for the all-clear.",
      assignedGateId: gate.id,
      hold: true,
    };
  }

  return {
    classification: "APPROACHING",
    instruction: `Enter via ${nodeName(gate)} (~${minutes(etaSec)} min walk).`,
    assignedGateId: gate.id,
    ...(route ? { route, alternatives } : {}),
  };
}

/**
 * Turn a position + destination into one actionable instruction.
 *
 * @param {Object} venue                 the Venue doc/object.
 * @param {Array}  snapshotZones         snapshot.zones (risk/riskLevel may be absent).
 * @param {{lat:number,lng:number,heading?:number,destinationId?:string}} user
 * @returns {{
 *   classification: string,
 *   instruction: string,
 *   route?: { waypoints, lengthM, etaSec, riskLevel },
 *   alternatives?: number,
 *   assignedGateId?: string,
 *   hold?: boolean
 * }}
 */
export function guideUser(venue, snapshotZones = [], user = {}) {
  const classification = classifyUser(venue, user);
  const zoneRiskById = zoneRiskMap(snapshotZones);
  const graph = buildGraph(venue);
  const hasGraph = graph.nodePos.size > 0;

  switch (classification) {
    case "INSIDE":
      if (!hasGraph) {
        return {
          classification,
          instruction:
            "You're inside the event area. Follow marshal directions to the nearest exit.",
        };
      }
      return guideInside(venue, snapshotZones, user, user.destinationId, graph, zoneRiskById);

    case "APPROACHING":
      return guideApproaching(venue, snapshotZones, user, graph, zoneRiskById);

    case "TRANSIT":
      return {
        classification,
        instruction:
          "Avoid the event area — bypass around the perimeter to reach your destination.",
      };

    default:
      return { classification: "OUTSIDE", instruction: "You're outside the monitored area." };
  }
}
