/**
 * simulator — a controllable synthetic crowd.
 *
 * We can't summon 45,000 real phones for a demo or a test, so this generates
 * agents that walk the venue's corridors from gates toward destinations,
 * writing GPS-like heartbeats into liveStore exactly as a real phone would.
 * Funnelling many agents through narrow corridors naturally produces the
 * density + directional-flow patterns the predictor (E2) will watch for.
 *
 * It also supports a gradual ramp (0 → N over rampSeconds), which is the basis
 * of the later test harness: grow the crowd monotonically and observe exactly
 * when each threshold fires — never an instant random scatter.
 */
import Venue from "../models/Venue.js";
import { haversineMeters, bearingDeg } from "../utils/geo.js";
import { upsertDevice, clearEvent } from "./liveStore.js";
import { clearEvent as clearPredictor } from "./predictor.js";

const SIM_MS = 1000;
const DEFAULT_CENTER = [20.2961, 85.8245];
const EARTH_R = 6371008.8;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

const sims = new Map(); // eventId -> sim state

/* ------------------------- geometry helpers ------------------------- */
function moveByMeters([lat, lng], bearing, meters) {
  const θ = bearing * D2R;
  const δ = meters / EARTH_R;
  const φ1 = lat * D2R;
  const λ1 = lng * D2R;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [φ2 * R2D, λ2 * R2D];
}

function cumulative(path) {
  const cum = [0];
  for (let i = 1; i < path.length; i += 1) cum[i] = cum[i - 1] + haversineMeters(path[i - 1], path[i]);
  return cum;
}

function interpolate(path, cum, dist) {
  const total = cum[cum.length - 1];
  const d = Math.max(0, Math.min(dist, total));
  let i = 1;
  while (i < cum.length && cum[i] < d) i += 1;
  const a = path[i - 1];
  const b = path[i] || path[i - 1];
  const segLen = (cum[i] || cum[i - 1]) - cum[i - 1] || 1;
  const frac = (d - cum[i - 1]) / segLen;
  return {
    lat: a[0] + (b[0] - a[0]) * frac,
    lng: a[1] + (b[1] - a[1]) * frac,
    heading: bearingDeg(a, b),
  };
}

/* ------------------------- graph from venue ------------------------- */
function buildGraph(venue) {
  const nodePos = new Map();
  (venue?.nodes || []).forEach((n) => nodePos.set(n.id, n.at));

  const adjacency = new Map();
  const add = (from, to, path) => {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from).push({ to, path });
  };

  (venue?.edges || []).forEach((e) => {
    if (e.state === "blocked" || !e.path || e.path.length < 2) return;
    const fwd = e.direction !== "oneway_reverse";
    const rev = e.direction !== "oneway_forward";
    if (fwd) add(e.from, e.to, e.path);
    if (rev) add(e.to, e.from, [...e.path].reverse());
  });

  const gates = (venue?.nodes || []).filter((n) => n.type === "gate" && n.state !== "closed");
  const spawnNodes = (gates.length ? gates : venue?.nodes || []).map((n) => n.id).filter((id) => adjacency.has(id));

  const destish = (venue?.nodes || []).filter((n) => n.isDestination);
  const destNodes = (destish.length ? destish : (venue?.nodes || []).filter((n) => ["poi", "exit", "medical"].includes(n.type))).map((n) => n.id);

  return { nodePos, adjacency, spawnNodes, destNodes };
}

/** Greedy nearest-to-destination walk; returns concatenated waypoints. */
function routeGreedy(startId, destId, { adjacency, nodePos }) {
  const dest = nodePos.get(destId);
  if (!dest) return null;
  const waypoints = [];
  let current = startId;
  let prev = null;
  let steps = 0;
  while (current !== destId && steps < 40) {
    const options = (adjacency.get(current) || []).filter((o) => o.to !== prev);
    const pool = options.length ? options : adjacency.get(current) || [];
    if (!pool.length) break;
    // greedy: neighbour closest to the destination
    let best = pool[0];
    let bestD = Infinity;
    for (const o of pool) {
      const p = nodePos.get(o.to);
      const dd = p ? haversineMeters(p, dest) : Infinity;
      if (dd < bestD) {
        bestD = dd;
        best = o;
      }
    }
    const seg = waypoints.length ? best.path.slice(1) : best.path;
    waypoints.push(...seg);
    prev = current;
    current = best.to;
    steps += 1;
  }
  return waypoints.length >= 2 ? waypoints : null;
}

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* ------------------------- agents ------------------------- */
function spawnAgent(id, sim) {
  const { graph, speedBase, center } = sim;
  const jitterLat = rand(-4, 4) / 111320;
  const jitterLng = rand(-4, 4) / (111320 * Math.cos((center[0] || 20) * D2R));
  const speed = speedBase * rand(0.8, 1.2);

  if (graph.spawnNodes.length && graph.destNodes.length) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const start = pick(graph.spawnNodes);
      const dest = pick(graph.destNodes);
      if (start === dest) continue;
      const path = routeGreedy(start, dest, graph);
      if (path) {
        const cum = cumulative(path);
        return { id, mode: "route", path, cum, dist: rand(0, cum[cum.length - 1] * 0.15), speed, jitterLat, jitterLng };
      }
    }
  }
  // Fallback: wander near the centre.
  return {
    id,
    mode: "walk",
    pos: moveByMeters(center, rand(0, 360), rand(0, 120)),
    heading: rand(0, 360),
    speed,
    jitterLat,
    jitterLng,
  };
}

function stepAgent(agent, eventId, dtSec) {
  if (agent.mode === "route") {
    agent.dist += agent.speed * dtSec;
    if (agent.dist >= agent.cum[agent.cum.length - 1]) return true; // reached dest -> respawn
    const p = interpolate(agent.path, agent.cum, agent.dist);
    upsertDevice(eventId, {
      deviceHash: agent.id,
      lat: p.lat + agent.jitterLat,
      lng: p.lng + agent.jitterLng,
      heading: p.heading,
      speed: agent.speed,
    });
    return false;
  }
  // walk mode: slowly turning random walk
  agent.heading = (agent.heading + rand(-25, 25) + 360) % 360;
  agent.pos = moveByMeters(agent.pos, agent.heading, agent.speed * dtSec);
  upsertDevice(eventId, {
    deviceHash: agent.id,
    lat: agent.pos[0] + agent.jitterLat,
    lng: agent.pos[1] + agent.jitterLng,
    heading: agent.heading,
    speed: agent.speed,
  });
  return false;
}

/* ------------------------- control ------------------------- */
export async function startSim(eventId, { count = 800, rampSeconds = 0, speed = 1.2, center } = {}) {
  const venue = await Venue.findOne({ event: eventId });
  const graph = buildGraph(venue);

  stopSim(eventId, { clear: false });
  clearPredictor(eventId); // fresh forecaster history for a new run

  const sim = {
    target: Math.max(1, Math.min(50000, Math.round(count))),
    rampSeconds: Math.max(0, rampSeconds),
    speedBase: speed,
    center: center || DEFAULT_CENTER,
    graph,
    agents: [],
    active: 0,
    startedAt: Date.now(),
    timer: null,
    seq: 0,
  };

  sim.timer = setInterval(() => tickSim(eventId, sim), SIM_MS);
  sims.set(String(eventId), sim);
  return statusSim(eventId);
}

function tickSim(eventId, sim) {
  const dtSec = SIM_MS / 1000;
  const elapsed = (Date.now() - sim.startedAt) / 1000;

  // Ramp the active population up to target.
  const desired = sim.rampSeconds > 0 ? Math.min(sim.target, Math.floor((elapsed / sim.rampSeconds) * sim.target)) : sim.target;
  while (sim.agents.length < desired) {
    sim.seq += 1;
    sim.agents.push(spawnAgent(`sim-${sim.seq}`, sim));
  }
  sim.active = Math.min(desired, sim.agents.length);

  for (let i = 0; i < sim.active; i += 1) {
    const done = stepAgent(sim.agents[i], eventId, dtSec);
    if (done) sim.agents[i] = spawnAgent(sim.agents[i].id, sim);
  }
}

export function stopSim(eventId, { clear = true } = {}) {
  const sim = sims.get(String(eventId));
  if (sim?.timer) clearInterval(sim.timer);
  sims.delete(String(eventId));
  if (clear) {
    clearEvent(eventId);
    clearPredictor(eventId);
  }
  return { running: false };
}

export function statusSim(eventId) {
  const sim = sims.get(String(eventId));
  if (!sim) return { running: false, target: 0, active: 0 };
  return {
    running: !!sim.timer,
    target: sim.target,
    active: sim.active,
    rampSeconds: sim.rampSeconds,
    routable: sim.graph.spawnNodes.length > 0 && sim.graph.destNodes.length > 0,
    spawnNodes: sim.graph.spawnNodes.length,
    destNodes: sim.graph.destNodes.length,
  };
}
