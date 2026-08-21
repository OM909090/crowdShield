/**
 * exitRoute — "get me out of here safely", shared by the AI agent and citizens.
 *
 * One implementation, two consumers: the agent calls it as a tool when deciding
 * what to tell a crowd, and the citizen app calls it through an endpoint for the
 * person holding the phone. Keeping it in one place means an authority and a
 * citizen can never be given contradictory advice.
 *
 * How a route is chosen:
 *   1. take the open perimeter gates nearest the person (capped — see below),
 *   2. ask the routing engine (free OSM/OSRM by default) for real paths to each,
 *   3. re-rank every candidate by LIVE crowd risk (services/routeFusion.js),
 *      hard-rejecting anything that threads a critical zone or ends at a closed
 *      gate,
 *   4. return the best survivor with drawable geometry.
 *
 * Note the cap: we route to a handful of gates, never per-person-per-gate across
 * a whole crowd. Individual guidance stays cheap and the routing engine sees
 * O(gates) traffic, not O(people).
 */
import { computeWalkingRoutes } from "./routing/index.js";
import { rankRoutesByRisk, decodePolyline } from "./routeFusion.js";
import { haversineMeters } from "../utils/geo.js";
import { computeGateLoads } from "./gateLoad.js";

const MAX_EXIT_GATES = 3;

/** Open perimeter gates with coordinates, nearest first. */
function nearestOpenGates(from, snapshot, venue, limit = MAX_EXIT_GATES) {
  // Prefer the snapshot's node view (it carries live gate state); fall back to
  // the authored venue graph when no live loop is running for the event.
  const source = (snapshot?.nodes || []).length ? snapshot.nodes : venue?.nodes || [];
  return source
    .filter((n) => n.type === "gate" && n.state !== "closed" && Array.isArray(n.at))
    .map((n) => ({ node: n, distM: haversineMeters(from, n.at) }))
    .sort((a, b) => a.distM - b.distM)
    .slice(0, limit);
}

/**
 * Find the safest walking route out of the venue from a position.
 *
 * @param {Object} args
 * @param {Object} args.venue
 * @param {Object} args.snapshot
 * @param {[number,number]} args.from  [lat, lng]
 * @returns {Promise<{ok:boolean, message?:string, exit?:Object}>}
 */
export async function findSafeExitRoute({ venue, snapshot, from }) {
  if (!Array.isArray(from) || from.length < 2) {
    return { ok: false, message: "A location is required to find an exit route." };
  }

  let gates = nearestOpenGates(from, snapshot, venue);
  // Don't send people to a gate that's already jammed — drop overloaded ones,
  // unless that would leave nowhere to go.
  const overloaded = new Set(
    computeGateLoads(snapshot?.cells || [], venue)
      .filter((g) => g.level === "overload")
      .map((g) => g.id)
  );
  if (overloaded.size) {
    const usable = gates.filter((g) => !overloaded.has(g.node.id));
    if (usable.length) gates = usable;
  }
  if (!gates.length) {
    return { ok: false, message: "No open exit gate is available right now — follow marshal directions." };
  }

  const candidates = [];
  let lastError = null;
  for (const g of gates) {
    try {
      const routes = await computeWalkingRoutes({ origin: from, destination: g.node.at });
      for (const rt of routes) candidates.push({ ...rt, _gate: g.node });
    } catch (err) {
      // One unreachable gate must not sink the whole answer — try the others,
      // but keep the reason so a total failure can be diagnosed rather than
      // reported as a shrug.
      lastError = err;
    }
  }

  if (!candidates.length) {
    if (lastError) {
      console.error("[exitRoute] routing failed for every gate:", lastError.message);
    }
    return {
      ok: false,
      message: "Could not compute a route right now — follow marshal directions to the nearest exit.",
      reason: lastError?.message,
    };
  }

  const ranked = rankRoutesByRisk(candidates, snapshot, venue);
  const safe = ranked.filter((r) => !r.unsafe);
  const best = safe[0] || ranked[0];
  const gate = best.route._gate;

  return {
    ok: true,
    exit: {
      recommendedGateId: gate.id,
      gateName: gate.name || gate.id,
      gateAt: gate.at,
      distanceMeters: best.distanceMeters,
      durationSec: best.durationSec,
      maxRisk: best.maxRisk,
      unsafe: best.unsafe,
      reason: best.reason,
      // Drawable geometry so a phone (and the command map) can show the path.
      waypoints: decodePolyline(best.route.encodedPolyline),
      consideredGates: gates.map((g) => g.node.id),
      allRoutesRisky: safe.length === 0,
    },
  };
}

export default { findSafeExitRoute };
