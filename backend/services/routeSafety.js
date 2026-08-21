/**
 * routeSafety — turn the live danger zones and gate loads into inputs the
 * pathfinder understands, so every route (citizen "safest way out", citizen
 * destination guidance, and the agent's diversions) bends AROUND the dense
 * pockets and stops sending people to gates that are already jammed.
 *
 * Two products, both derived from the same live cells the map draws:
 *   - dangerSegmentPenalties: extra seconds on any street segment that runs
 *     through a danger zone, scaled by severity. A soft penalty (not a hard
 *     block) so a route is still returned when danger is genuinely unavoidable —
 *     it just costs enough that the router takes any reasonable detour first.
 *   - openExitsByLoad: the exit list with overloaded gates removed, so people
 *     are routed to a gate that can actually take them. Never returns empty — if
 *     every gate is overloaded it hands them all back rather than stranding anyone.
 */
import { pointInPolygon } from "../utils/geo.js";
import { detectDangerZones } from "./dangerZones.js";
import { computeGateLoads } from "./gateLoad.js";

/** Seconds added to a segment that lies inside a danger zone, by severity. */
const SEVERITY_PENALTY_SEC = { elevated: 300, high: 900, critical: 1800 };

/**
 * @param {Object} network  RoadNetwork doc (segments with .path [[lat,lng]])
 * @param {Object} snapshot Situation snapshot (needs .cells)
 * @returns {Map<string, number>} segmentId -> extra seconds
 */
export function dangerSegmentPenalties(network, snapshot) {
  const penalties = new Map();
  const segments = network?.segments || [];
  if (!segments.length) return penalties;

  const zones = detectDangerZones(snapshot?.cells || []);
  if (!zones.length) return penalties;

  for (const seg of segments) {
    const path = seg.path || [];
    if (path.length < 1) continue;
    let worst = 0;
    for (const zone of zones) {
      const pen = SEVERITY_PENALTY_SEC[zone.severity] || 0;
      if (pen <= worst) continue; // can't beat what we already have
      if (path.some((p) => Array.isArray(p) && pointInPolygon([p[0], p[1]], zone.polygon))) {
        worst = pen;
        if (worst >= SEVERITY_PENALTY_SEC.critical) break;
      }
    }
    if (worst > 0) penalties.set(seg.id, worst);
  }
  return penalties;
}

/**
 * Drop overloaded gates from an exit list so a crowd is routed to one that can
 * take it. If every gate is overloaded, return the original list — better an
 * overloaded gate than no way out.
 *
 * @param {Array<{id:string}>} exits
 * @param {Object} snapshot
 * @param {Object} venue
 */
export function openExitsByLoad(exits = [], snapshot, venue) {
  const loads = computeGateLoads(snapshot?.cells || [], venue);
  const overloaded = new Set(loads.filter((g) => g.level === "overload").map((g) => g.id));
  if (!overloaded.size) return exits;
  const kept = exits.filter((e) => !overloaded.has(e.id));
  return kept.length ? kept : exits;
}
