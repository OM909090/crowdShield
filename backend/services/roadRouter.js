/**
 * roadRouter — shortest *safest* path over the real street network.
 *
 * The venue router (services/router.js) moves people along corridors an authority
 * drew. This one moves them along streets that actually exist, imported from
 * OpenStreetMap (services/osmNetwork.js). The difference matters the moment an
 * instruction has to leave the venue or be spoken out loud: "head north on
 * Kutcheri Road, then left onto Grand Road" is followable, "traverse edge E7" is
 * not.
 *
 * Same cost philosophy as the venue router, deliberately: walking time inflated
 * by how crowded the road is, and impassable where a crush is already forming.
 * A route that is 200 m shorter through a critical street is not shorter, it is a
 * decision to push people into a wall.
 *
 * What this does NOT do is invent knowledge. A road with no readings near it is
 * routable but flagged as unmeasured, and every route reports how much of itself
 * we could actually see (§17). An operator sending 5,000 people down a street
 * deserves to know whether we are measuring it or guessing.
 *
 * Pure functions over a RoadNetwork document + a congestion lookup, so the agent,
 * the citizen endpoint and tests all share one implementation.
 *
 * Coordinates are [lat, lng] throughout.
 */
import { haversineMeters, bearingDeg, PEDESTRIAN } from "../utils/geo.js";

/**
 * How hard congestion penalises a road. At alpha = 3, a street at the dangerous
 * density band costs four times its free-flow walking time, so the router will
 * happily take a detour of up to ~3× the distance to avoid it. Matches the
 * `alpha` the venue router and guidance layer use.
 */
const DEFAULT_ALPHA = 3;

/** Density at which we refuse to route through at all. */
const IMPASSABLE_DENSITY = PEDESTRIAN.DENSITY.DANGEROUS; // 5 p/m²

/** Cost discount applied to a road that has a name people can be told. */
const NAMED_ROAD_PREFERENCE = 0.9;

/** Guard against a pathological graph; a venue-scale network is far smaller. */
const MAX_SETTLED = 20_000;

const round = (n, dp = 2) => {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/** A name a person could act on, falling back to something honest. */
export const roadLabel = (segment) =>
  segment?.name || `unnamed ${segment?.highway || "road"} (${segment?.id})`;

/* ------------------------------------------------------------------ *
 * Graph
 * ------------------------------------------------------------------ */

/**
 * Adjacency over junctions.
 *
 * Both directions are added even for `oneway` segments. OSM's `oneway` is a
 * *vehicle* restriction; pedestrians may legally walk either way unless
 * `oneway:foot=yes`, which is vanishingly rare. Treating it as a walking
 * restriction would refuse perfectly good evacuation routes — the exact failure
 * this router exists to avoid. The flag is still carried on the segment so an
 * authority contra-flowing traffic can see it.
 *
 * @param {Object} network a RoadNetwork doc (or plain object)
 */
export function buildRoadGraph(network) {
  const segments = network?.segments || [];
  const junctions = network?.junctions || [];

  const junctionPos = new Map();
  for (const j of junctions) junctionPos.set(j.id, j.at);

  const adjacency = new Map();
  const segmentById = new Map();

  const link = (from, to, segment, reversed) => {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from).push({ to, segmentId: segment.id, reversed });
  };

  for (const s of segments) {
    segmentById.set(s.id, s);
    if (!s.fromJunction || !s.toJunction) continue;
    if (!junctionPos.has(s.fromJunction) || !junctionPos.has(s.toJunction)) continue;
    if (s.fromJunction === s.toJunction) continue; // a loop adds no connectivity
    link(s.fromJunction, s.toJunction, s, false);
    link(s.toJunction, s.fromJunction, s, true);
  }

  return { adjacency, segmentById, junctionPos };
}

/** The junction closest to a point, or null on an empty graph. */
export function nearestJunction(graph, point) {
  if (!point || !graph?.junctionPos?.size) return null;
  let bestId = null;
  let bestD = Infinity;
  for (const [id, at] of graph.junctionPos) {
    const d = haversineMeters(point, at);
    if (d < bestD) {
      bestD = d;
      bestId = id;
    }
  }
  return bestId;
}

/**
 * Turn whatever a human (or a model) called a place into a junction on the graph.
 *
 * Accepts a junction id, a street name, a gate/zone id or name, or a [lat,lng].
 * Nobody should have to know our internal identifier scheme to ask "route them
 * from the chokepoint to Grand Road" — and crucially, an unrecognised name comes
 * back as an ERROR rather than a nearest guess, so a hallucinated street cannot
 * quietly become a real route.
 *
 * @returns {{ id:string, via?:string } | { error:string }}
 */
export function resolvePlace(network, venue, ref) {
  if (ref == null || ref === "") return { error: "A place reference is required." };
  const graph = buildRoadGraph(network);

  if (Array.isArray(ref) && ref.length === 2) {
    const j = nearestJunction(graph, ref);
    return j ? { id: j, via: "coordinate" } : { error: "No junction near that coordinate." };
  }

  const key = String(ref).trim();
  if (graph.junctionPos.has(key)) return { id: key };

  const onRoad = junctionOnRoad(network, key);
  if (onRoad) return { id: onRoad, via: `road '${key}'` };

  const lower = key.toLowerCase();
  const node = (venue?.nodes || []).find(
    (n) => n.id === key || (n.name || "").toLowerCase() === lower
  );
  if (node?.at) {
    const j = nearestJunction(graph, node.at);
    if (j) return { id: j, via: node.name || node.id };
  }

  const zone = (venue?.zones || []).find(
    (z) => z.id === key || (z.name || "").toLowerCase() === lower
  );
  if (zone?.polygon?.length) {
    const j = nearestJunction(graph, zoneCentre(zone.polygon));
    if (j) return { id: j, via: `zone ${zone.name || zone.id}` };
  }

  return { error: `'${key}' is not a known junction, street, gate or zone.` };
}

/** Arithmetic centre of a ring — enough to anchor a route on a zone. */
function zoneCentre(ring = []) {
  const sum = ring.reduce((acc, [lat, lng]) => [acc[0] + lat, acc[1] + lng], [0, 0]);
  return [sum[0] / ring.length, sum[1] / ring.length];
}

/**
 * The junction nearest a named road — the anchor for "route them onto Grand Road".
 * Picks the end of the road's longest segment so the anchor is a real endpoint
 * rather than a point in the middle of a block.
 */
export function junctionOnRoad(network, roadName) {
  const wanted = String(roadName || "").trim().toLowerCase();
  if (!wanted) return null;
  const matches = (network?.segments || []).filter(
    (s) => s.name && s.name.toLowerCase() === wanted
  );
  if (!matches.length) return null;
  const longest = matches.reduce((a, b) => (b.lengthM > a.lengthM ? b : a), matches[0]);
  return longest.fromJunction || longest.toJunction || null;
}

/* ------------------------------------------------------------------ *
 * Cost
 * ------------------------------------------------------------------ */

/**
 * Walking seconds for a segment, inflated by how crowded it is.
 *
 * Returns Infinity for a street we will not send anyone down. Unmeasured roads
 * cost their free-flow time — the honest neutral, since we have no evidence
 * either way — but the caller is told how much of the chosen route was like that.
 */
function segmentCost(segment, congestion, alpha) {
  const lengthM = segment.lengthM || 0;
  let base = lengthM / PEDESTRIAN.FREE_WALK_SPEED_MPS;

  // A small, deliberate bias toward named roads. Not because they are safer in
  // themselves, but because a route made of named streets can be *communicated* —
  // and an instruction nobody can follow moves nobody. In OSM a name also
  // correlates with an arterial rather than a back lane. Kept small (10%) so it
  // can nudge between comparable options and never outweigh a congestion signal.
  if (!segment.name) base *= 1 / NAMED_ROAD_PREFERENCE;

  if (!congestion || !congestion.measured || congestion.density == null) return base;
  if (congestion.density >= IMPASSABLE_DENSITY) return Infinity;

  const load = congestion.density / IMPASSABLE_DENSITY;
  return base * (1 + alpha * load);
}

/* ------------------------------------------------------------------ *
 * Route
 * ------------------------------------------------------------------ */

/** 8-point compass word — how a marshal or an announcement would say it. */
function compass(bearing) {
  if (!Number.isFinite(bearing)) return null;
  const words = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return words[Math.round(bearing / 45) % 8];
}

/**
 * Collapse a segment list into the steps a person would actually be given.
 *
 * Two merges happen here, both because OSM's data model is not a set of
 * instructions:
 *
 *  1. Consecutive segments with the SAME name are one step. OSM splits a road at
 *     every crossing, so an unmerged route reads "Grand Road, Grand Road, Grand
 *     Road…".
 *
 *  2. Consecutive UNNAMED segments are also one step, described by direction
 *     rather than by id. Only ~19% of segments here carry a name, and
 *     "unnamed living_street (R79) for 158 m" is not something anybody can be
 *     told over a loudspeaker. "Continue north-east for 250 m" is. The segment
 *     ids stay on the step for the map and the audit trail.
 */
function toSteps(legs) {
  const steps = [];

  for (const leg of legs) {
    const name = leg.segment.name || null;
    const last = steps[steps.length - 1];
    // Merge into the previous step when it is the same named road, or when both
    // this segment and the previous step are nameless stretches.
    const continues = last && (name ? last.name === name : last.name === null);

    if (continues) {
      last.lengthM += leg.segment.lengthM || 0;
      last.to = leg.to;
      last.end = leg.path[leg.path.length - 1];
      last.segmentIds.push(leg.segment.id);
      if (leg.congestion?.measured && leg.congestion.density != null) {
        if (leg.congestion.density > (last.worstDensity ?? -1)) {
          last.worstDensity = leg.congestion.density;
          last.state = leg.congestion.state;
        }
      }
      continue;
    }

    steps.push({
      name,
      highway: leg.segment.highway,
      from: leg.from,
      to: leg.to,
      start: leg.path[0],
      end: leg.path[leg.path.length - 1],
      segmentIds: [leg.segment.id],
      lengthM: leg.segment.lengthM || 0,
      capacityPerMin: leg.segment.capacityPerMin ?? null,
      worstDensity: leg.congestion?.measured ? leg.congestion.density : null,
      state: leg.congestion?.state ?? null,
    });
  }

  return steps.map((s) => {
    const lengthM = Math.round(s.lengthM);
    const heading = s.start && s.end ? Math.round(bearingDeg(s.start, s.end)) : null;
    const word = compass(heading);
    return {
      ...s,
      lengthM,
      heading,
      etaSec: Math.round(lengthM / PEDESTRIAN.FREE_WALK_SPEED_MPS),
      /** What to call it on screen. */
      road: s.name || (word ? `${word} on local streets` : "local streets"),
      /** What to say out loud. */
      instruction: s.name
        ? `${word ? `Head ${word} on ` : "Take "}${s.name} for ${lengthM} m`
        : `Continue ${word || "ahead"} for ${lengthM} m`,
    };
  });
}

/**
 * The safest walking route between two junctions over the real streets.
 *
 * @param {Object} network  RoadNetwork doc
 * @param {Map<string,Object>} congestionById  segmentId -> row from roadCrowd.sampleRoadCongestion
 * @param {string} fromJunctionId
 * @param {string} toJunctionId
 * @param {{ alpha?: number, avoidSegmentIds?: Set<string> }} [options]
 * @returns {{ ok:boolean, message?:string, route?:Object }}
 */
export function safestRoadRoute(
  network,
  congestionById = new Map(),
  fromJunctionId,
  toJunctionId,
  { alpha = DEFAULT_ALPHA, avoidSegmentIds = new Set(), extraCostBySegmentId = new Map() } = {}
) {
  const graph = buildRoadGraph(network);
  if (!graph.junctionPos.size) {
    return { ok: false, message: "No road network has been imported for this event." };
  }
  if (!graph.junctionPos.has(fromJunctionId)) {
    return { ok: false, message: `Unknown start junction '${fromJunctionId}'.` };
  }
  if (!graph.junctionPos.has(toJunctionId)) {
    return { ok: false, message: `Unknown destination junction '${toJunctionId}'.` };
  }
  if (fromJunctionId === toJunctionId) {
    return { ok: false, message: "Start and destination are the same junction." };
  }

  // Dijkstra. A linear-scan frontier is fine at venue scale (a few hundred
  // junctions) and keeps this dependency-free; swap in a heap if a city-wide
  // network ever lands here.
  const dist = new Map([[fromJunctionId, 0]]);
  const prev = new Map();
  const settled = new Set();
  const frontier = new Set([fromJunctionId]);

  while (frontier.size && settled.size < MAX_SETTLED) {
    let current = null;
    let best = Infinity;
    for (const id of frontier) {
      const d = dist.get(id) ?? Infinity;
      if (d < best) {
        best = d;
        current = id;
      }
    }
    if (current == null) break;
    frontier.delete(current);
    settled.add(current);
    if (current === toJunctionId) break;

    for (const edge of graph.adjacency.get(current) || []) {
      if (settled.has(edge.to)) continue;
      if (avoidSegmentIds.has(edge.segmentId)) continue;

      const segment = graph.segmentById.get(edge.segmentId);
      if (!segment) continue;
      const cost = segmentCost(segment, congestionById.get(edge.segmentId), alpha);
      if (!Number.isFinite(cost)) continue; // impassable — never route through it

      // Extra seconds for a street that runs through a live danger zone. A soft
      // penalty, so the route detours around a dense pocket but is still returned
      // when there is genuinely no other way.
      const extra = extraCostBySegmentId.get(edge.segmentId) || 0;
      const next = best + cost + extra;
      if (next < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, next);
        prev.set(edge.to, { from: current, edge });
        frontier.add(edge.to);
      }
    }
  }

  if (!prev.has(toJunctionId) && fromJunctionId !== toJunctionId) {
    return {
      ok: false,
      message:
        "No walkable route between those points that avoids the streets currently at crush density.",
    };
  }

  // Walk the chain back, then forward.
  const chain = [];
  let cursor = toJunctionId;
  while (cursor !== fromJunctionId) {
    const step = prev.get(cursor);
    if (!step) return { ok: false, message: "Route reconstruction failed." };
    chain.push(step);
    cursor = step.from;
  }
  chain.reverse();

  const legs = [];
  const waypoints = [];
  let lengthM = 0;
  let measuredLengthM = 0;
  let worstDensity = null;

  for (const { from, edge } of chain) {
    const segment = graph.segmentById.get(edge.segmentId);
    // Segments store geometry in their own direction; walk it the way we travel.
    const path = edge.reversed ? [...segment.path].reverse() : segment.path;
    const congestion = congestionById.get(edge.segmentId) || null;

    legs.push({ from, to: edge.to, segment, path, congestion });
    lengthM += segment.lengthM || 0;

    if (congestion?.measured && congestion.density != null) {
      measuredLengthM += segment.lengthM || 0;
      worstDensity = Math.max(worstDensity ?? 0, congestion.density);
    }

    // Skip the repeated junction coordinate when concatenating.
    for (let i = waypoints.length ? 1 : 0; i < path.length; i += 1) waypoints.push(path[i]);
  }

  const steps = toSteps(legs);
  const namedRoads = [...new Set(steps.map((s) => s.name).filter(Boolean))];

  return {
    ok: true,
    route: {
      fromJunction: fromJunctionId,
      toJunction: toJunctionId,
      waypoints,
      lengthM: Math.round(lengthM),
      // Free-flow walking time. Deliberately NOT the congestion-inflated cost:
      // that is a routing preference, not a promise about how long it will take.
      etaSec: Math.round(lengthM / PEDESTRIAN.FREE_WALK_SPEED_MPS),
      segmentIds: legs.map((l) => l.segment.id),
      steps,
      namedRoads,
      worstDensity: round(worstDensity),
      /**
       * Share of the route we have live readings for. Low means the route is a
       * geometric answer, not an informed one — say so rather than implying
       * confidence we do not have.
       */
      measuredFraction: lengthM > 0 ? round(measuredLengthM / lengthM) : null,
      /** Human summary, ready to broadcast or read aloud. */
      directions: steps.map((s, i) => `${i + 1}. ${s.instruction}`).join(" "),
    },
  };
}

/**
 * "Get these people out of here" — the safest route from a point to whichever of
 * the given exit points is genuinely reachable fastest, over real streets.
 *
 * Returns the ranked options rather than just the winner, because an authority
 * splitting a crowd across two exits (the anti-herding rule, ARCHITECTURE §7)
 * needs to see the runners-up.
 *
 * @param {Object} network
 * @param {Map} congestionById
 * @param {[number,number]} from
 * @param {Array<{id:string,name?:string,at:[number,number]}>} exits
 */
export function safestRoadExits(network, congestionById, from, exits = [], options = {}) {
  const graph = buildRoadGraph(network);
  const startJunction = nearestJunction(graph, from);
  if (!startJunction) {
    return { ok: false, message: "No road network has been imported for this event." };
  }

  const ranked = [];
  for (const exit of exits) {
    const exitJunction = nearestJunction(graph, exit.at);
    if (!exitJunction || exitJunction === startJunction) continue;
    const res = safestRoadRoute(network, congestionById, startJunction, exitJunction, options);
    if (!res.ok) continue;
    ranked.push({
      exitId: exit.id,
      exitName: exit.name || exit.id,
      ...res.route,
    });
  }

  if (!ranked.length) {
    return { ok: false, message: "No walkable street route to any open exit right now." };
  }

  // Safest first, then shortest: a slightly longer walk on a clear street beats
  // a short one through a jam.
  ranked.sort(
    (a, b) => (a.worstDensity ?? 0) - (b.worstDensity ?? 0) || a.lengthM - b.lengthM
  );

  return { ok: true, best: ranked[0], options: ranked.slice(0, 3), startJunction };
}

export { DEFAULT_ALPHA, IMPASSABLE_DENSITY };
