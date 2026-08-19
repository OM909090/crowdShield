import Venue from "../models/Venue.js";
import Event from "../models/Event.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  polygonAreaM2,
  pathLengthMeters,
  zoneCapacity,
  corridorCapacityPerMin,
  gateThroughputPerMin,
} from "../utils/geo.js";
import { importRoadNetwork } from "../services/osmNetwork.js";
import { getIO, roomName } from "../realtime/socket.js";

/** Short-id prefixes so ids read meaningfully in logs and LLM briefs. */
const NODE_PREFIX = {
  gate: "G",
  junction: "J",
  poi: "P",
  medical: "M",
  exit: "X",
  parking: "K",
  holding: "H",
};

/**
 * Give every item a stable, unique short id. Ids supplied by the client are
 * preserved (the editor round-trips them); missing ones are generated.
 */
function assignIds(items, prefixFor) {
  const used = new Set(items.map((i) => i.id).filter(Boolean));
  const counters = {};

  return items.map((item) => {
    if (item.id) return item;
    const prefix = prefixFor(item);
    counters[prefix] = counters[prefix] || 0;
    let candidate;
    do {
      counters[prefix] += 1;
      candidate = `${prefix}${counters[prefix]}`;
    } while (used.has(candidate));
    used.add(candidate);
    return { ...item, id: candidate };
  });
}

function assertUniqueIds(items, label) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) throw new ApiError(422, `Duplicate ${label} id: ${item.id}`);
    seen.add(item.id);
  }
}

/**
 * Normalise a client-submitted graph: assign ids, derive every measurement
 * server-side, and enforce referential integrity. The client never gets to
 * decide areas, lengths or capacities — those are computed from geometry.
 */
function normalizeGraph(body) {
  const aorPolygon = Array.isArray(body?.aor?.polygon) ? body.aor.polygon : [];

  const zones = assignIds(Array.isArray(body?.zones) ? body.zones : [], () => "Z").map((z) => {
    const areaM2 = polygonAreaM2(z.polygon || []);
    return { ...z, areaM2: Math.round(areaM2), capacity: zoneCapacity(areaM2) };
  });

  const nodes = assignIds(Array.isArray(body?.nodes) ? body.nodes : [], (n) => NODE_PREFIX[n.type] || "N").map(
    (n) => ({
      ...n,
      // Honour an explicit throughput override, otherwise derive from width.
      throughputPerMin:
        n.throughputPerMin > 0 ? Math.round(n.throughputPerMin) : gateThroughputPerMin(n.widthM || 0),
    })
  );

  const edges = assignIds(Array.isArray(body?.edges) ? body.edges : [], () => "E").map((e) => {
    const lengthM = pathLengthMeters(e.path || []);
    return {
      ...e,
      lengthM: Math.round(lengthM),
      capacityPerMin: corridorCapacityPerMin(e.widthM || 0),
    };
  });

  assertUniqueIds(zones, "zone");
  assertUniqueIds(nodes, "node");
  assertUniqueIds(edges, "edge");

  // Edges must connect real nodes, or routing would dead-end at runtime.
  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const e of edges) {
    if (!nodeIds.has(e.from)) throw new ApiError(422, `Edge ${e.id} references unknown node "${e.from}"`);
    if (!nodeIds.has(e.to)) throw new ApiError(422, `Edge ${e.id} references unknown node "${e.to}"`);
    if (e.from === e.to) throw new ApiError(422, `Edge ${e.id} starts and ends at the same node`);
  }

  return {
    aor: { polygon: aorPolygon, areaM2: Math.round(polygonAreaM2(aorPolygon)) },
    zones,
    nodes,
    edges,
  };
}

/** Summary counters returned with the graph so the editor can show status. */
function graphStats(venue) {
  return {
    zones: venue.zones.length,
    nodes: venue.nodes.length,
    edges: venue.edges.length,
    gates: venue.nodes.filter((n) => n.type === "gate").length,
    openGates: venue.nodes.filter((n) => n.type === "gate" && n.state === "open").length,
    blockedEdges: venue.edges.filter((e) => e.state === "blocked").length,
    destinations: venue.nodes.filter((n) => n.isDestination).length,
    aorAreaM2: venue.aor?.areaM2 || 0,
    totalZoneCapacity: venue.zones.reduce((sum, z) => sum + (z.capacity || 0), 0),
  };
}

const findEventOr404 = async (id) => {
  const event = await Event.findById(id);
  if (!event) throw new ApiError(404, "Event not found");
  return event;
};

/**
 * Read the venue graph. Open to any signed-in user: citizens need the
 * destination list and the corridor network for personal routing.
 */
export const getVenue = asyncHandler(async (req, res) => {
  await findEventOr404(req.params.id);
  const venue = await Venue.findOne({ event: req.params.id });

  if (!venue) {
    // Return an empty scaffold rather than 404 so the editor can start drawing
    // on a fresh event without a special-case "create first" step.
    return res.status(200).json({
      venue: null,
      stats: { zones: 0, nodes: 0, edges: 0, gates: 0, openGates: 0, blockedEdges: 0, destinations: 0 },
    });
  }

  res.status(200).json({ venue, stats: graphStats(venue) });
});

/** Destinations a citizen may pick as a goal (used by the guidance service). */
export const getDestinations = asyncHandler(async (req, res) => {
  await findEventOr404(req.params.id);
  const venue = await Venue.findOne({ event: req.params.id });
  res.status(200).json({ destinations: venue ? venue.destinations() : [] });
});

/**
 * Replace the venue graph for an event (authority-only).
 * The editor sends the whole graph; we derive all measurements and validate.
 */
export const upsertVenue = asyncHandler(async (req, res) => {
  await findEventOr404(req.params.id);

  const graph = normalizeGraph(req.body);

  const update = {
    ...graph,
    event: req.params.id,
    updatedBy: req.user._id,
  };
  if (req.body.bufferMeters != null) update.bufferMeters = req.body.bufferMeters;
  if (req.body.h3) update.h3 = req.body.h3;
  if (req.body.calibration) update.calibration = req.body.calibration;

  const venue = await Venue.findOneAndUpdate({ event: req.params.id }, update, {
    new: true,
    upsert: true,
    runValidators: true,
    setDefaultsOnInsert: true,
  });

  // Drawing the coverage area IS the request to know what is inside it. Making
  // the operator find a separate "import streets" action afterwards means the
  // agent silently stays blind to every road — which is exactly how it ended up
  // telling an authority it had no data about an area they had just drawn.
  //
  // Fire-and-forget: Overpass takes ~10s and the save must stay instant. Bounded
  // by the coverage hash, so re-saving markers or gates on an unchanged boundary
  // costs nothing and cannot hammer a free shared service.
  const roadImport = maybeImportRoads(req.params.id, venue.aor?.polygon || []);

  res.status(200).json({
    message: "Venue graph saved",
    venue,
    stats: graphStats(venue),
    // So the editor can tell the operator the streets are being fetched.
    roadImport,
  });
});

/**
 * Import the street network for a coverage area if it is new or has changed.
 *
 * Returns a status the caller can show immediately; the work continues in the
 * background. A failure here is logged and never surfaces as a failed save — the
 * venue is the operator's own data and must persist whether or not a third-party
 * map service is reachable.
 *
 * @returns {{ started:boolean, reason:string }}
 */
function maybeImportRoads(eventId, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) {
    return { started: false, reason: "no coverage area drawn yet" };
  }

  runBackgroundImport(eventId, polygon);
  return { started: true, reason: "importing the real streets inside the coverage area" };
}

/**
 * Spaced retries for the background import.
 *
 * Overpass is a free shared service and answers a busy moment with a 504. Nobody
 * is waiting on this request, so retrying is the right thing to do — unlike the
 * MANUAL import endpoint, which deliberately has no hidden retry because there an
 * operator is watching and deserves the honest "wait a minute" immediately rather
 * than a spinner that hides three attempts.
 *
 * Waits are long on purpose: Overpass asks for a minute, and hammering it is what
 * gets an instance blocked.
 */
const IMPORT_RETRY_DELAYS_MS = [20_000, 60_000];

async function runBackgroundImport(eventId, polygon, attempt = 0) {
  try {
    const { imported, skipped, network } = await importRoadNetwork(eventId, polygon);
    if (skipped) return; // unchanged boundary — nothing to say
    const io = getIO();
    if (io && imported) {
      // Tell the open editor the ground truth just changed, so the operator sees
      // the streets arrive instead of wondering whether anything happened.
      io.to(roomName(eventId)).emit("roads:imported", {
        eventId: String(eventId),
        segments: network.stats?.segmentCount ?? 0,
        junctions: network.stats?.junctionCount ?? 0,
        totalLengthM: network.stats?.totalLengthM ?? 0,
        roadNames: network.stats?.roadNames ?? [],
      });
    }
    console.log(
      `[venue] streets imported for ${eventId}: ${network.stats?.segmentCount ?? 0} segments` +
        (attempt ? ` (attempt ${attempt + 1})` : "")
    );
  } catch (err) {
    const delay = IMPORT_RETRY_DELAYS_MS[attempt];
    if (delay) {
      console.warn(
        `[venue] street import for ${eventId} failed (${err.code || "error"}), retrying in ${delay / 1000}s`
      );
      setTimeout(() => runBackgroundImport(eventId, polygon, attempt + 1), delay).unref?.();
      return;
    }

    console.error(`[venue] street import failed for ${eventId}: ${err.code || ""} ${err.message}`);
    // Say so out loud. A silent failure here is the worst outcome: the operator
    // drew a boundary, believes the system knows the streets inside it, and the
    // agent quietly has no idea. They can retry from POST /roads/import.
    const io = getIO();
    if (io) {
      io.to(roomName(eventId)).emit("roads:import_failed", {
        eventId: String(eventId),
        code: err.code || "IMPORT_FAILED",
        message: err.message,
      });
    }
  }
}

/**
 * Toggle a single node's state — the "open/close Gate 3" action.
 * Kept as a narrow endpoint because it is called constantly during an event
 * (by an authority tap, or by an approved agent proposal) and must not
 * require re-submitting the entire graph.
 */
export const patchNode = asyncHandler(async (req, res) => {
  const venue = await Venue.findOne({ event: req.params.id });
  if (!venue) throw new ApiError(404, "Venue graph not set up for this event");

  const node = venue.nodes.find((n) => n.id === req.params.nodeId);
  if (!node) throw new ApiError(404, `Node "${req.params.nodeId}" not found`);

  if (req.body.state != null) node.state = req.body.state;
  if (req.body.widthM != null) {
    node.widthM = req.body.widthM;
    node.throughputPerMin = gateThroughputPerMin(req.body.widthM);
  }
  if (req.body.throughputPerMin != null) node.throughputPerMin = req.body.throughputPerMin;
  if (req.body.isDestination != null) node.isDestination = req.body.isDestination;

  venue.updatedBy = req.user._id;
  await venue.save();

  res.status(200).json({ message: `Node ${node.id} updated`, node });
});

/**
 * Update a single edge — the "block this path" / "make it one-way" action
 * that the recommendation engine proposes.
 */
export const patchEdge = asyncHandler(async (req, res) => {
  const venue = await Venue.findOne({ event: req.params.id });
  if (!venue) throw new ApiError(404, "Venue graph not set up for this event");

  const edge = venue.edges.find((e) => e.id === req.params.edgeId);
  if (!edge) throw new ApiError(404, `Edge "${req.params.edgeId}" not found`);

  if (req.body.state != null) edge.state = req.body.state;
  if (req.body.direction != null) edge.direction = req.body.direction;
  if (req.body.widthM != null) {
    edge.widthM = req.body.widthM;
    edge.capacityPerMin = corridorCapacityPerMin(req.body.widthM);
  }

  venue.updatedBy = req.user._id;
  await venue.save();

  res.status(200).json({ message: `Edge ${edge.id} updated`, edge });
});
