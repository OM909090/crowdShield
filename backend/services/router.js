/**
 * router — the venue-graph pathfinder.
 *
 * The authority's Venue Graph is the only surface a citizen may be routed
 * across: the router can physically only send someone along an `open` edge and
 * into a non-`closed` node, so the guidance layer cannot suggest walking
 * through a barricade or into a sealed gate.
 *
 * On top of plain shortest-path it adds two things that matter for a crowd:
 *   1. Risk-aware cost — an edge that runs through a dense/at-risk zone costs
 *      more time-equivalent, so Dijkstra naturally bends around trouble.
 *   2. Diversity — up to k genuinely different routes via an iterative
 *      edge-penalty, which is what lets the guidance layer spread people
 *      across alternatives instead of funnelling everyone down one corridor.
 *
 * Coordinates are [lat, lng] (Leaflet order) throughout, matching geo.js and
 * the Venue model.
 */
import { haversineMeters, pathLengthMeters, pointInPolygon, PEDESTRIAN } from "../utils/geo.js";

const { FREE_WALK_SPEED_MPS } = PEDESTRIAN;

/** Cost multiplier applied to an already-used edge to tease out alternatives. */
const DIVERSITY_PENALTY = 3;

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/* ------------------------------------------------------------------ *
 * Graph construction
 * ------------------------------------------------------------------ */

/** Point halfway along a polyline (by length) — used to place an edge in a zone. */
function midpointOf(path = []) {
  if (!path.length) return null;
  if (path.length === 1) return path[0];
  const total = pathLengthMeters(path);
  if (total === 0) return path[0];
  const half = total / 2;
  let acc = 0;
  for (let i = 1; i < path.length; i += 1) {
    const seg = haversineMeters(path[i - 1], path[i]);
    if (acc + seg >= half) {
      const t = seg === 0 ? 0 : (half - acc) / seg;
      const [la1, lo1] = path[i - 1];
      const [la2, lo2] = path[i];
      return [la1 + (la2 - la1) * t, lo1 + (lo2 - lo1) * t];
    }
    acc += seg;
  }
  return path[path.length - 1];
}

/** Zone id whose polygon contains `point`, or null (first match wins). */
function zoneIdAt(point, zones = []) {
  if (!point) return null;
  for (const z of zones) {
    if (z.polygon && pointInPolygon(point, z.polygon)) return z.id;
  }
  return null;
}

/**
 * Build a directed adjacency graph from a venue.
 *
 * - `bi` edges become two directed entries, `oneway_*` a single one.
 * - `blocked` edges are dropped entirely.
 * - a traversal *into* a `closed` node is dropped (you can leave one, never
 *   arrive at one — matching the "sealed gate" semantics).
 * - each edge's zoneId is resolved from its midpoint.
 *
 * @param {Object} venue Venue doc / plain object.
 * @returns {{ adjacency: Map<string, Array>, nodePos: Map<string, [number,number]> }}
 *   adjacency values are arrays of
 *   `{ to, edgeId, path:[[lat,lng]] oriented source->to, lengthM, capacityPerMin, zoneId|null }`.
 */
export function buildGraph(venue) {
  const adjacency = new Map();
  const nodePos = new Map();
  const nodeState = new Map();

  const nodes = venue?.nodes || [];
  const edges = venue?.edges || [];
  const zones = venue?.zones || [];

  for (const n of nodes) {
    if (!n?.id || !Array.isArray(n.at)) continue;
    nodePos.set(n.id, n.at);
    nodeState.set(n.id, n.state || "open");
    if (!adjacency.has(n.id)) adjacency.set(n.id, []);
  }

  const isClosed = (id) => nodeState.get(id) === "closed";

  for (const e of edges) {
    if (!e || e.state === "blocked") continue;
    if (!nodePos.has(e.from) || !nodePos.has(e.to)) continue; // dangling reference

    const fromPos = nodePos.get(e.from);
    const toPos = nodePos.get(e.to);

    // Normalise the stored geometry so path[0]≈from and path[last]≈to. The
    // editor may have drawn a corridor in either direction; we want the
    // waypoints to flow the way the pedestrian actually walks.
    let fwdPath = Array.isArray(e.path) && e.path.length ? e.path : [fromPos, toPos];
    if (
      fwdPath.length >= 2 &&
      haversineMeters(fwdPath[0], fromPos) > haversineMeters(fwdPath[0], toPos)
    ) {
      fwdPath = [...fwdPath].reverse();
    }

    const lengthM =
      Number.isFinite(e.lengthM) && e.lengthM > 0 ? e.lengthM : pathLengthMeters(fwdPath);
    const capacityPerMin = Number.isFinite(e.capacityPerMin) ? e.capacityPerMin : 0;
    const zoneId = zoneIdAt(midpointOf(fwdPath), zones);

    const dir = e.direction || "bi";
    const allowForward = dir === "bi" || dir === "oneway_forward";
    const allowReverse = dir === "bi" || dir === "oneway_reverse";

    if (allowForward && !isClosed(e.to)) {
      adjacency.get(e.from).push({
        to: e.to,
        edgeId: e.id,
        path: fwdPath,
        lengthM,
        capacityPerMin,
        zoneId,
      });
    }
    if (allowReverse && !isClosed(e.from)) {
      adjacency.get(e.to).push({
        to: e.from,
        edgeId: e.id,
        path: [...fwdPath].reverse(),
        lengthM,
        capacityPerMin,
        zoneId,
      });
    }
  }

  return { adjacency, nodePos };
}

/** Id of the graph node closest to `point` by great-circle distance, or null. */
export function nearestNode(graph, point) {
  if (!graph?.nodePos || !point) return null;
  let bestId = null;
  let bestD = Infinity;
  for (const [id, pos] of graph.nodePos) {
    const d = haversineMeters(point, pos);
    if (d < bestD) {
      bestD = d;
      bestId = id;
    }
  }
  return bestId;
}

/* ------------------------------------------------------------------ *
 * Dijkstra + k-diverse search
 * ------------------------------------------------------------------ */

/** Minimal binary min-heap keyed by number — plenty for venue-scale graphs. */
class MinHeap {
  constructor() {
    this.a = [];
  }

  get size() {
    return this.a.length;
  }

  push(key, val) {
    const a = this.a;
    a.push({ key, val });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].key <= a[i].key) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }

  pop() {
    const a = this.a;
    if (!a.length) return null;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      const n = a.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let s = i;
        if (l < n && a[l].key < a[s].key) s = l;
        if (r < n && a[r].key < a[s].key) s = r;
        if (s === i) break;
        [a[s], a[i]] = [a[i], a[s]];
        i = s;
      }
    }
    return top;
  }
}

/**
 * Single-source shortest path over the directed graph for a given edge-cost fn.
 * @returns {{ nodeIds: string[], entries: Array } | null}
 */
function dijkstra(adjacency, startId, destId, costOf) {
  if (startId === destId) return { nodeIds: [startId], entries: [] };

  const dist = new Map([[startId, 0]]);
  const prev = new Map(); // nodeId -> { from, entry }
  const visited = new Set();
  const heap = new MinHeap();
  heap.push(0, startId);

  while (heap.size) {
    const { val: u } = heap.pop();
    if (visited.has(u)) continue;
    visited.add(u);
    if (u === destId) break;

    for (const entry of adjacency.get(u) || []) {
      if (visited.has(entry.to)) continue;
      const nd = dist.get(u) + costOf(entry);
      if (nd < (dist.get(entry.to) ?? Infinity)) {
        dist.set(entry.to, nd);
        prev.set(entry.to, { from: u, entry });
        heap.push(nd, entry.to);
      }
    }
  }

  if (!prev.has(destId)) return null;

  const nodeIds = [destId];
  const entries = [];
  let cur = destId;
  while (cur !== startId) {
    const step = prev.get(cur);
    if (!step) return null;
    entries.unshift(step.entry);
    nodeIds.unshift(step.from);
    cur = step.from;
  }
  return { nodeIds, entries };
}

/** Assemble the public route shape from a path's directed entries. */
function assembleRoute({ nodeIds, entries }, nodePos, zoneRiskById) {
  const waypoints = [];
  let lengthM = 0;
  let etaSec = 0;
  let riskScore = 0;

  entries.forEach((entry, i) => {
    const seg =
      entry.path && entry.path.length
        ? entry.path
        : [nodePos.get(nodeIds[i]), nodePos.get(nodeIds[i + 1])].filter(Boolean);
    // Drop the shared vertex between consecutive segments.
    if (i === 0) waypoints.push(...seg);
    else waypoints.push(...seg.slice(1));

    lengthM += entry.lengthM;
    etaSec += entry.lengthM / FREE_WALK_SPEED_MPS;
    const er = zoneRiskById.get(entry.zoneId)?.risk ?? 0;
    if (er > riskScore) riskScore = er;
  });

  if (!waypoints.length) {
    const p = nodePos.get(nodeIds[0]);
    if (p) waypoints.push(p);
  }

  return {
    nodeIds,
    waypoints,
    lengthM: Math.round(lengthM),
    etaSec: Math.round(etaSec),
    riskScore: round2(riskScore),
  };
}

/**
 * Up to `k` risk-aware, diverse routes from `startId` to `destId`, best first.
 *
 * Edge cost = travelTimeSec * (1 + alpha * edgeRisk), where
 *   travelTimeSec = lengthM / FREE_WALK_SPEED_MPS
 *   edgeRisk      = zoneRiskById.get(zoneId)?.risk ?? 0   (0..1)
 *
 * The primary route is a plain Dijkstra. Each subsequent route is found by
 * multiplying the cost of the previously-used edges by ~3× and re-running,
 * which pushes the search onto genuinely different corridors. Identical paths
 * are de-duplicated.
 *
 * @returns {Array<{ nodeIds, waypoints, lengthM, etaSec, riskScore }>} (len ≤ k)
 */
export function kSafestRoutes(venue, startId, destId, zoneRiskById = new Map(), options = {}) {
  const { k = 3, alpha = 3 } = options;
  const { adjacency, nodePos } = buildGraph(venue);

  if (!nodePos.has(startId) || !nodePos.has(destId)) return [];

  const penalty = new Map(); // edgeId -> multiplier
  const baseCost = (entry) => {
    const travelTimeSec = entry.lengthM / FREE_WALK_SPEED_MPS;
    const edgeRisk = zoneRiskById.get(entry.zoneId)?.risk ?? 0;
    return travelTimeSec * (1 + alpha * edgeRisk);
  };
  const costOf = (entry) => baseCost(entry) * (penalty.get(entry.edgeId) ?? 1);

  const routes = [];
  const seen = new Set();
  const maxAttempts = k * 4 + 2; // guard against penalty stalls when no alt exists

  for (let attempt = 0; attempt < maxAttempts && routes.length < k; attempt += 1) {
    const path = dijkstra(adjacency, startId, destId, costOf);
    if (!path) break;

    const key = path.nodeIds.join(">");
    if (!seen.has(key)) {
      seen.add(key);
      routes.push(assembleRoute(path, nodePos, zoneRiskById));
    }

    // Penalise this path's edges so the next run is nudged elsewhere.
    if (!path.entries.length) break; // start === dest: nothing to diversify
    for (const entry of path.entries) {
      penalty.set(entry.edgeId, (penalty.get(entry.edgeId) ?? 1) * DIVERSITY_PENALTY);
    }
  }

  return routes;
}
