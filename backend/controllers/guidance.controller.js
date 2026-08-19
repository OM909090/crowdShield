/**
 * guidance.controller — personal, risk-aware routing for one citizen.
 *
 * Intended route (NOT wired here — the routes file is owned elsewhere and must
 * not be edited by this feature):
 *
 *   POST /api/events/:id/guidance      protect → any authenticated user
 *   body: { lat:Number, lng:Number, heading?:Number, destinationId?:String }
 *   200 : { guidance: { classification, instruction, route?, alternatives?,
 *                       assignedGateId?, hold? } }
 *
 * The heavy lifting lives in services/guidance.js (pure) and services/router.js;
 * this controller only loads the event + venue, takes a live situation snapshot,
 * and delegates.
 */
import Event from "../models/Event.js";
import Venue from "../models/Venue.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { buildSnapshot } from "../services/snapshot.js";
import { guideUser } from "../services/guidance.js";
import { findSafeExitRoute } from "../services/exitRoute.js";
import RoadNetwork from "../models/RoadNetwork.js";
import {
  safestRoadExits,
  safestRoadRoute,
  buildRoadGraph,
  nearestJunction,
} from "../services/roadRouter.js";
import { sampleRoadCongestion } from "../services/roadCrowd.js";

export const getGuidance = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) throw new ApiError(404, "Event not found");

  const { lat, lng, heading, destinationId } = req.body;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new ApiError(422, "Body must include finite numeric 'lat' and 'lng'");
  }

  const venue = await Venue.findOne({ event: req.params.id });
  if (!venue) {
    // No graph drawn yet — answer gracefully instead of 404 so the citizen app
    // can still render a sensible message.
    return res.status(200).json({
      guidance: { classification: "OUTSIDE", instruction: "Venue map not set up yet." },
    });
  }

  // Pass the already-loaded venue through so the snapshot doesn't re-query it.
  const snap = await buildSnapshot(event, venue);
  const guidance = guideUser(venue, snap.zones, { lat, lng, heading, destinationId });

  // The venue router can only use corridors the authority drew, so an event with
  // gates but no drawn corridors leaves a citizen with "no clear route" while the
  // real streets under their feet go unused. Fall back to the imported network —
  // the same one the exit route and the agent use, so nobody gets a different
  // answer depending on which button they pressed.
  if (!guidance.route && destinationId) {
    const roadRoute = await routeOverStreets(req.params.id, venue, snap, {
      from: [lat, lng],
      destinationId,
    });
    if (roadRoute) {
      const dest = (venue.nodes || []).find((n) => n.id === destinationId);
      return res.status(200).json({
        guidance: {
          ...guidance,
          instruction:
            `Head to ${dest?.name || destinationId} — ${roadRoute.directions} ` +
            `(~${Math.max(1, Math.round(roadRoute.etaSec / 60))} min).`,
          route: {
            waypoints: roadRoute.waypoints,
            lengthM: roadRoute.lengthM,
            etaSec: roadRoute.etaSec,
            // Streets we have no readings for stay unknown rather than "safe".
            riskLevel: roadRoute.worstDensity == null ? null : undefined,
            worstDensity: roadRoute.worstDensity,
            measuredFraction: roadRoute.measuredFraction,
            roads: roadRoute.namedRoads,
            directions: roadRoute.directions,
          },
          via: "street network",
        },
      });
    }
  }

  res.status(200).json({ guidance });
});

/**
 * Route a citizen to a venue destination over the imported streets.
 * Returns null when there is no network, no such destination, or no walkable path.
 */
async function routeOverStreets(eventId, venue, snapshot, { from, destinationId }) {
  const network = await RoadNetwork.findOne({ event: eventId });
  if (!network?.segments?.length) return null;

  const dest = (venue.nodes || []).find((n) => n.id === destinationId);
  if (!dest?.at) return null;

  const graph = buildRoadGraph(network);
  const startJ = nearestJunction(graph, from);
  const endJ = nearestJunction(graph, dest.at);
  if (!startJ || !endJ || startJ === endJ) return null;

  const congestion = new Map();
  for (const row of sampleRoadCongestion(network, snapshot)) congestion.set(row.id, row);

  const res = safestRoadRoute(network, congestion, startJ, endJ);
  return res.ok ? res.route : null;
}

/**
 * POST /api/events/:id/exit-route — "get me out safely".
 *
 * The urgent counterpart to /guidance: instead of routing to a destination the
 * citizen picked, it finds the safest way OUT — real road geometry to the nearest
 * OPEN gates, re-ranked by live crowd risk, with drawable waypoints so the phone
 * can show the path. It calls the same service the AI agent uses, so a citizen
 * and the command centre can never be given contradictory advice.
 *
 *   body: { lat:Number, lng:Number }
 *   200 : { exit: { recommendedGateId, gateName, gateAt, distanceMeters,
 *                   durationSec, maxRisk, unsafe, reason, waypoints,
 *                   consideredGates, allRoutesRisky } }
 *   200 : { exit: null, message } when there is no venue/open gate/route
 */
export const getExitRoute = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) throw new ApiError(404, "Event not found");

  const { lat, lng } = req.body;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new ApiError(422, "Body must include finite numeric 'lat' and 'lng'");
  }

  const venue = await Venue.findOne({ event: req.params.id });
  if (!venue) {
    return res.status(200).json({ exit: null, message: "Venue map not set up yet." });
  }

  const snap = await buildSnapshot(event, venue);

  // Prefer the street network the authority imported for this coverage area.
  //
  // Three reasons it beats calling an external router here. It is measured: every
  // segment carries this event's own live density, so a road filling up is priced
  // into the route rather than ignored. It is local: no third-party request to
  // time out at the moment someone is trying to get out. And it is the SAME graph
  // the agent names streets from, so a citizen's phone and the command centre can
  // never send people down different roads.
  //
  // Without an imported network we fall back to the external routing engine.
  const roadNetwork = await RoadNetwork.findOne({ event: req.params.id });
  if (roadNetwork?.segments?.length) {
    const exits = (venue.nodes || [])
      .filter((n) => (n.type === "gate" || n.type === "exit") && n.state !== "closed")
      .map((n) => ({ id: n.id, name: n.name || n.id, at: n.at }));

    if (exits.length) {
      const congestion = new Map();
      for (const row of sampleRoadCongestion(roadNetwork, snap)) congestion.set(row.id, row);

      const res2 = safestRoadExits(roadNetwork, congestion, [lat, lng], exits);
      if (res2.ok) {
        const best = res2.best;
        const gate = (venue.nodes || []).find((n) => n.id === best.exitId);
        return res.status(200).json({
          exit: {
            recommendedGateId: best.exitId,
            gateName: best.exitName,
            gateAt: gate?.at ?? null,
            distanceMeters: best.lengthM,
            durationSec: best.etaSec,
            // null when no segment on the route has readings — the phone shows
            // "not measured" rather than implying we checked and it was clear.
            maxRisk: best.worstDensity,
            unsafe: false,
            reason: null,
            waypoints: best.waypoints,
            // What to actually tell the person holding the phone.
            directions: best.directions,
            roads: best.namedRoads,
            measuredFraction: best.measuredFraction,
            consideredGates: res2.options.length,
            // Alternatives so the app can spread people instead of funnelling
            // every phone to the same gate (ARCHITECTURE §7 anti-herding).
            alternatives: res2.options.slice(1).map((o) => ({
              gateId: o.exitId,
              gateName: o.exitName,
              distanceMeters: o.lengthM,
              maxRisk: o.worstDensity,
              roads: o.namedRoads,
            })),
            allRoutesRisky: false,
            source: "imported street network",
          },
        });
      }
    }
  }

  const result = await findSafeExitRoute({ venue, snapshot: snap, from: [lat, lng] });

  if (!result.ok) return res.status(200).json({ exit: null, message: result.message });
  res.status(200).json({ exit: { ...result.exit, source: "external routing engine" } });
});
