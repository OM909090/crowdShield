/**
 * roads.controller — HTTP surface for the OSM road network.
 *
 *   POST /api/events/:id/roads/import   (authority, verified)  -> importRoads
 *   GET  /api/events/:id/roads          (any signed-in user)   -> getRoads
 *
 * The import is an authority action because it costs a query against a free
 * shared service and rewrites the network the agent reasons over. Reading is
 * open to any signed-in user for the same reason GET /venue is: citizens need
 * the real streets to be routed along them.
 */
import Event from "../models/Event.js";
import Venue from "../models/Venue.js";
import RoadNetwork from "../models/RoadNetwork.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { importRoadNetwork, coveragePolygonHash, OSM_ATTRIBUTION } from "../services/osmNetwork.js";
import { buildSnapshot } from "../services/snapshot.js";
import { sampleRoadCongestion } from "../services/roadCrowd.js";

/** Overpass failures that are an upstream/operator problem, not a server fault. */
const UPSTREAM_CODES = new Set([
  "OVERPASS_TIMEOUT",
  "OVERPASS_UNREACHABLE",
  "OVERPASS_BAD_RESPONSE",
]);

const findEventOr404 = async (id) => {
  const event = await Event.findById(id);
  if (!event) throw new ApiError(404, "Event not found");
  return event;
};

/** The coverage ring for an event, or [] when the authority hasn't drawn one. */
const coverageOf = (venue) => (Array.isArray(venue?.aor?.polygon) ? venue.aor.polygon : []);

/** Summary view — no geometry, so the import reply stays small. */
const summarize = (network) => ({
  eventId: String(network.event),
  coverageHash: network.coverageHash,
  stats: network.stats,
  fetchedAt: network.fetchedAt,
  source: network.source,
  attribution: network.attribution || OSM_ATTRIBUTION,
});

/**
 * POST /api/events/:id/roads/import
 *
 * Imports the real road/footpath network inside the event's Area of
 * Responsibility. Body may carry { force: true } to re-fetch an unchanged area.
 */
export const importRoads = asyncHandler(async (req, res) => {
  await findEventOr404(req.params.id);

  const venue = await Venue.findOne({ event: req.params.id });
  const polygon = coverageOf(venue);

  // Without a boundary there is nothing to import *inside*, and guessing one
  // from the event's marker coordinate would fetch a radius nobody agreed to.
  if (polygon.length < 3) {
    throw new ApiError(
      422,
      "Draw the coverage area for this event first. The road import needs the Area of Responsibility to know which streets belong to you."
    );
  }

  try {
    const { network, imported, skipped } = await importRoadNetwork(req.params.id, polygon, {
      force: !!req.body?.force,
    });

    res.status(200).json({
      imported,
      skipped,
      message: skipped
        ? "Coverage area is unchanged — kept the road network already on file."
        : `Imported ${network.stats.segmentCount} road segments (${network.stats.namedRoadCount} named) across ${(
            network.stats.totalLengthM / 1000
          ).toFixed(2)} km.`,
      network: summarize(network),
    });
  } catch (err) {
    // A busy or unreachable map service is not a bug in CrowdShield. Report what
    // happened and what to do about it, the way the agent reports a slow model,
    // rather than an opaque 500 with a stack trace behind it.
    if (UPSTREAM_CODES.has(err?.code)) {
      return res.status(502).json({
        imported: false,
        skipped: false,
        network: null,
        code: err.code,
        message: err.message,
      });
    }
    throw err;
  }
});

/**
 * GET /api/events/:id/roads
 *
 * The stored network with its geometry. `stale: true` means the coverage polygon
 * has changed since the import, so these are the roads of a different area — the
 * caller is told rather than quietly served the wrong streets.
 */
export const getRoads = asyncHandler(async (req, res) => {
  await findEventOr404(req.params.id);

  const network = await RoadNetwork.findOne({ event: req.params.id });
  if (!network) {
    return res.status(200).json({
      network: null,
      segments: [],
      junctions: [],
      stale: false,
      message: "No road network imported for this event yet.",
    });
  }

  const venue = await Venue.findOne({ event: req.params.id }).select("aor");
  const polygon = coverageOf(venue);
  // No polygon at all also counts as stale: we cannot confirm the stored network
  // still describes the area the authority is responsible for.
  const currentHash = polygon.length >= 3 ? coveragePolygonHash(polygon) : null;
  const stale = currentHash !== network.coverageHash;

  res.status(200).json({
    network: summarize(network),
    segments: network.segments,
    junctions: network.junctions,
    stale,
    ...(stale
      ? {
          message:
            "The coverage area has changed since this network was imported. Re-import to match the current area.",
        }
      : {}),
  });
});

/**
 * GET /api/events/:id/roads/congestion
 *
 * The live crowd projected onto the real streets: for every imported segment,
 * how many people are on it and how fast they are moving right now.
 *
 * This is the join that lets the system speak in place names. The predictor works
 * in hexagons because that is the right shape for density; nobody standing on
 * Grand Road knows which hexagon they are in. Both the authority overlay and the
 * agent read this, so an operator and the AI are never describing the same street
 * differently.
 *
 * Segments with no readings nearby come back with nulls and `measured: false`
 * (§17): a road we cannot see is not a road that is clear.
 */
export const getRoadCongestion = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id);

  const network = await RoadNetwork.findOne({ event: req.params.id });
  if (!network) {
    return res.status(200).json({
      roads: [],
      hasNetwork: false,
      message: "No road network imported for this event yet — import it to see street-level crowding.",
    });
  }

  const venue = await Venue.findOne({ event: event._id });
  const snapshot = await buildSnapshot(event, venue);
  const rows = sampleRoadCongestion(network, snapshot);

  const measured = rows.filter((r) => r.measured);
  // Worst first, and only the roads we can actually see — an operator scanning
  // this list is looking for where to intervene.
  measured.sort((a, b) => (b.density ?? 0) - (a.density ?? 0));

  res.status(200).json({
    hasNetwork: true,
    generatedAt: snapshot.generatedAt,
    counts: { segments: rows.length, measured: measured.length, dark: rows.length - measured.length },
    roads: rows,
    worst: measured.slice(0, 10).map((r) => ({
      id: r.id,
      label: r.name || `unnamed ${r.highway} (${r.id})`,
      name: r.name,
      density: r.density,
      personsEst: r.personsEst,
      meanSpeed: r.meanSpeed,
      state: r.state,
      capacityPerMin: r.capacityPerMin,
    })),
    attribution: network.attribution || OSM_ATTRIBUTION,
  });
});
