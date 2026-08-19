/**
 * osmNetwork — imports the REAL road/footpath network inside an event's
 * coverage polygon from OpenStreetMap, and turns it into a routable graph.
 *
 * Why this exists: until now the system only knew the abstract graph an
 * authority drew (Z3, G2, E7). That is enough to measure a crowd but not to
 * talk to one. People do not stand in "Zone 3", they stand on Grand Road, and
 * an instruction that cannot name a street cannot be followed. This module is
 * where the system stops being blind to the actual ground.
 *
 * Source is Overpass (https://overpass-api.de) — free, no API key, no vendor
 * account, consistent with routing/osrmProvider.js being the default engine.
 * The data is ODbL-licensed, so OSM_ATTRIBUTION is stored with every import and
 * must be surfaced wherever the geometry is shown.
 *
 * Nothing here is invented. A road with no name in OSM gets `name: null`; a
 * width we could only guess from the highway class says so in `widthSource`.
 * Lengths and capacities come from utils/geo.js, the same maths the venue graph
 * and the predictor use, so "critical" means one thing across the system.
 *
 * Coordinates are [lat, lng] at our boundary. Overpass speaks lat/lon too, so
 * the only translation is its {lat, lon} objects into our pairs.
 */
import { createHash } from "node:crypto";
import RoadNetwork from "../models/RoadNetwork.js";
import {
  haversineMeters,
  pathLengthMeters,
  pointInPolygon,
  corridorCapacityPerMin,
} from "../utils/geo.js";

/** ODbL attribution. Legally required to travel with the data. */
export const OSM_ATTRIBUTION =
  "© OpenStreetMap contributors — ODbL 1.0 (https://www.openstreetmap.org/copyright)";

/**
 * Overpass endpoints, tried in order.
 *
 * These are free, community-run instances, and the busiest one answers a busy
 * moment with a 504 — measured: the primary returned 504 while osm.ch answered
 * the same query in 1.6s. A single hardcoded endpoint therefore means the feature
 * works or not depending on someone else's load, which is not a property a
 * crowd-safety tool should have.
 *
 * `OVERPASS_URL` overrides the whole list: an explicit choice (especially a
 * self-hosted instance, which is what production should do) is never second-
 * guessed by falling back to a public server.
 */
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

/**
 * A regional Overpass instance was tried here and removed, and the reason is
 * worth keeping: `overpass.osm.ch` serves Switzerland only, and for anywhere else
 * it answers **HTTP 200 with an empty element list**. Measured: 0 ways for a Puri
 * box that the planet instances return 22 ways for, 10 ways for the same size box
 * in Zurich.
 *
 * That is the most dangerous possible failure for this feature — not an error we
 * would surface, but a confident "there are no roads here" that gets persisted and
 * leaves the agent blind while believing it has checked. Any endpoint added to the
 * list above MUST be a full-planet instance, and `zeroIsSuspicious` below exists
 * because a wrong-but-cheerful answer has to be caught even so.
 */
/**
 * Our own deadline. Overpass gets a 60 s server-side budget in the query (it
 * needs room to run), but an operator clicking "Import roads" will not sit
 * through that, so we cut the wait and tell them to retry.
 */
const REQUEST_TIMEOUT_MS = 25_000;
/** Overpass asks every client to identify itself; anonymous traffic gets blocked. */
const USER_AGENT = "CrowdShield/1.0 (crowd-safety platform; OSM road-network import)";

/**
 * Highway classes a crowd can be routed along on foot.
 *
 * This is an allow-list, not a block-list, and that is deliberate: OSM has
 * hundreds of highway values and new ones appear. Anything unrecognised is
 * dropped rather than assumed walkable.
 *
 * What is missing matters as much as what is here. `motorway`, `motorway_link`
 * and `raceway` are excluded because a motorway is not somewhere you send people
 * on foot — it is a place where a routing suggestion gets someone killed. Same
 * for `construction`/`proposed`: a road that is not open yet is not an
 * evacuation option.
 *
 * `trunk` IS included, against the instinct to treat it like a motorway. In
 * Indian urban tagging `trunk` is routinely a wide arterial with footpaths on
 * both sides — Marine Drive Road beside this very venue is tagged that way, and
 * it is one of the roads a Puri crowd actually walks along. Excluding it left the
 * agent blind to a major adjacent egress corridor, which is a worse failure than
 * including a road the operator can see and reject.
 */
export const WALKABLE_HIGHWAYS = new Set([
  // Vehicle roads that pedestrians share in practice, and that crowds spill onto.
  "residential",
  "living_street",
  "service",
  "unclassified",
  "tertiary",
  "secondary",
  "primary",
  "trunk",
  "trunk_link",
  // Genuinely pedestrian infrastructure.
  "pedestrian",
  "footway",
  "path",
  "steps",
  "track",
  "cycleway",
]);

/**
 * Fallback usable width in metres per highway class, used only when OSM has
 * neither a `width` nor a `lanes` tag. These are typical carriageway/path widths,
 * not measurements of this particular street — which is exactly why every
 * segment records `widthSource: "default"` when one of these was used.
 */
const DEFAULT_WIDTH_M = {
  path: 1.5,
  steps: 1.5,
  footway: 2,
  cycleway: 2,
  track: 2.5,
  service: 4,
  residential: 5,
  living_street: 5,
  unclassified: 5,
  pedestrian: 6,
  tertiary: 6,
  secondary: 7,
  primary: 9,
  // An arterial's full carriageway is not walkable space, but a crowd spilling
  // onto one uses far more than a footpath. Kept below `primary` deliberately:
  // guessing generously here would inflate the capacity the agent reasons with.
  trunk: 9,
  trunk_link: 6,
};
/** Used if an allowed class somehow has no entry above. Conservative on purpose. */
const FALLBACK_WIDTH_M = 4;
/** Standard traffic-lane width, for deriving width from a `lanes` count. */
const LANE_WIDTH_M = 3.0;

/* ------------------------------------------------------------------ *
 * Coverage hashing
 * ------------------------------------------------------------------ */

/**
 * Stable hash of a coverage polygon.
 *
 * Rounded to 5 decimal places (~1 m) before hashing: a polygon that has
 * round-tripped through JSON and Mongoose can come back with float noise in the
 * last bits, and re-downloading the whole network because of a 10 nm difference
 * would be absurd. A real edit by an operator moves a vertex much further than
 * a metre.
 *
 * Vertex order is part of the hash — reordering a ring changes the shape.
 */
export function coveragePolygonHash(polygon = []) {
  const ring = (Array.isArray(polygon) ? polygon : [])
    .filter((p) => Array.isArray(p) && p.length >= 2)
    .map((p) => [Number(p[0]), Number(p[1])])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng))
    .map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`);

  return createHash("sha1").update(ring.join(";")).digest("hex");
}

/* ------------------------------------------------------------------ *
 * Overpass transport
 * ------------------------------------------------------------------ */

/** The endpoints to try. A configured OVERPASS_URL is used alone. */
export const overpassUrls = () => {
  const configured = (process.env.OVERPASS_URL || "").trim();
  return configured ? [configured] : OVERPASS_ENDPOINTS;
};

/** The primary endpoint (kept for logging / status reporting). */
export const overpassUrl = () => overpassUrls()[0];

/**
 * Tag + throw an import error with a machine-readable `code` and a message an
 * operator can act on. Same contract as services/llmProvider.js: the HTTP layer
 * reports these as honest advice, never as an opaque 500.
 */
function overpassError(code, message, cause) {
  const err = new Error(message);
  err.code = code; // OVERPASS_UNREACHABLE | OVERPASS_TIMEOUT | OVERPASS_BAD_RESPONSE
  if (cause) err.cause = cause;
  return err;
}

/** Build the Overpass QL query for one coverage ring. */
function buildQuery(polygon) {
  // Overpass wants a flat "lat lon lat lon ..." string; the ring is implicitly
  // closed, so the first vertex is not repeated.
  const poly = polygon.map(([lat, lng]) => `${Number(lat)} ${Number(lng)}`).join(" ");
  return `[out:json][timeout:60];way["highway"](poly:"${poly}");out geom;`;
}

/**
 * Fetch the raw OSM ways whose geometry intersects the coverage polygon.
 *
 * `out geom` is the important part: it returns both the ordered `nodes` array of
 * OSM node ids AND the matching `geometry` points, index for index. Those shared
 * node ids are how buildRoadGraph finds junctions — geometry alone would only
 * give us a bag of overlapping polylines.
 *
 * @param {Array<[number,number]>} polygon coverage ring, [lat,lng]
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<Array>} raw Overpass way elements
 */
export async function fetchOsmRoads(polygon = [], { signal } = {}) {
  if (!Array.isArray(polygon) || polygon.length < 3) {
    throw overpassError(
      "OVERPASS_BAD_RESPONSE",
      "A coverage area of at least three points is needed before roads can be imported."
    );
  }

  const urls = overpassUrls();
  let lastError;

  for (let i = 0; i < urls.length; i += 1) {
    const url = urls[i];
    try {
      const ways = await fetchFromEndpoint(url, polygon, { signal });

      // An empty answer is not automatically the truth. A misconfigured or
      // region-limited instance reports "no roads here" with a 200, so when
      // another endpoint is available we check rather than believe. If every
      // endpoint agrees the area is empty, it is empty.
      if (ways.length === 0 && i < urls.length - 1) {
        console.warn(
          `[osmNetwork] ${url} returned no roads for this area — verifying against the next endpoint ` +
            "before accepting that as true"
        );
        continue;
      }
      return ways;
    } catch (err) {
      // A caller cancellation, or a genuinely malformed request, is not something
      // another mirror will answer differently — stop.
      if (signal?.aborted || err.code === "OVERPASS_BAD_RESPONSE") throw err;
      lastError = err;
      if (urls.length > 1) console.warn(`[osmNetwork] ${url} failed (${err.code}), trying the next endpoint`);
    }
  }

  if (lastError) throw lastError;
  return []; // every endpoint agreed: nothing mapped inside this boundary
}

/** One attempt against one Overpass endpoint. */
async function fetchFromEndpoint(url, polygon, { signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      body: new URLSearchParams({ data: buildQuery(polygon) }).toString(),
      signal: controller.signal,
    });
  } catch (err) {
    // A caller cancellation is not a failure of the import — propagate as-is
    // so the controller doesn't report an outage that never happened.
    if (signal?.aborted) throw err;
    if (err?.name === "AbortError") {
      throw overpassError(
        "OVERPASS_TIMEOUT",
        `The OpenStreetMap service did not respond within ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s. ` +
          "It is a free shared service and is sometimes busy — try again in a minute, or " +
          "set OVERPASS_URL to your own instance.",
        err
      );
    }
    throw overpassError(
      "OVERPASS_UNREACHABLE",
      `Could not reach the OpenStreetMap service at ${url}: ${err.message}`,
      err
    );
  } finally {
    clearTimeout(timer);
  }

  // 429/503/504 are Overpass's "too many queries / I'm overloaded" replies. They
  // say nothing about our request, so they get advice to retry rather than a
  // "bad response" that implies the coverage area is wrong.
  if (response.status === 429 || response.status === 503 || response.status === 504) {
    throw overpassError(
      "OVERPASS_UNREACHABLE",
      "The free OpenStreetMap service is rate-limiting or overloaded right now " +
        `(HTTP ${response.status}). Wait a minute and import again.`
    );
  }
  if (!response.ok) {
    throw overpassError(
      "OVERPASS_BAD_RESPONSE",
      `The OpenStreetMap service returned HTTP ${response.status} for this coverage area.`
    );
  }

  let body;
  try {
    body = await response.json();
  } catch (err) {
    throw overpassError(
      "OVERPASS_BAD_RESPONSE",
      "The OpenStreetMap service returned a response that could not be read as JSON.",
      err
    );
  }
  if (!body || !Array.isArray(body.elements)) {
    throw overpassError(
      "OVERPASS_BAD_RESPONSE",
      "The OpenStreetMap service did not return a list of map elements."
    );
  }

  return body.elements.filter((el) => el?.type === "way");
}

/* ------------------------------------------------------------------ *
 * Graph construction
 * ------------------------------------------------------------------ */

/** Parse an OSM `width` tag into metres, or null when it isn't plainly metric. */
function parseWidthTag(raw) {
  if (raw == null) return null;
  const match = String(raw).trim().match(/^(\d+(?:\.\d+)?)\s*(m|metre|metres|meter|meters)?$/i);
  if (!match) return null; // e.g. "10'" or "3;4" — better to fall through than mis-scale
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Usable width for a way, preferring measured tags over assumptions, and saying
 * which it was. An operator looking at a capacity number is entitled to know
 * whether it came from a surveyed width or from us guessing by road class.
 */
function resolveWidth(tags = {}, highway) {
  const tagged = parseWidthTag(tags.width);
  if (tagged != null) return { widthM: tagged, widthSource: "tag" };

  const lanes = Number.parseFloat(tags.lanes);
  if (Number.isFinite(lanes) && lanes > 0) {
    return { widthM: lanes * LANE_WIDTH_M, widthSource: "lanes" };
  }

  return { widthM: DEFAULT_WIDTH_M[highway] ?? FALLBACK_WIDTH_M, widthSource: "default" };
}

/**
 * Is this way one-way?
 *
 * A `-1` value means the permitted direction runs against the way's node order.
 * We record `oneway: true` and deliberately DO NOT reverse the geometry or swap
 * fromJunction/toJunction, so a consumer must not read fromJunction→toJunction
 * as "the legal direction of travel".
 *
 * That is acceptable here because `oneway` in OSM is a *vehicle* restriction:
 * pedestrians may walk either way unless `oneway:foot=yes`, which is rare. The
 * flag is carried for context (a one-way street is usually narrower in practice
 * and matters if the authority wants to contra-flow it), not as a walking rule.
 */
function parseOneway(tags = {}) {
  const raw = String(tags.oneway ?? "").trim().toLowerCase();
  return raw === "yes" || raw === "true" || raw === "1" || raw === "-1";
}

/**
 * The point half-way along a polyline by distance (not the middle vertex, which
 * on a two-point segment would be an endpoint sitting on the coverage boundary).
 * Used only to decide whether a segment is really inside the coverage area.
 */
function pathMidpoint(path = []) {
  if (!path.length) return null;
  if (path.length === 1) return path[0];

  const half = pathLengthMeters(path) / 2;
  let walked = 0;
  for (let i = 1; i < path.length; i += 1) {
    const step = haversineMeters(path[i - 1], path[i]);
    if (walked + step >= half) {
      const t = step === 0 ? 0 : (half - walked) / step;
      return [
        path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t,
        path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t,
      ];
    }
    walked += step;
  }
  return path[path.length - 1];
}

/**
 * Turn raw Overpass ways into a routable graph of segments and junctions.
 *
 * The core move is splitting each way at every node it shares with another way.
 * An OSM way is an editing convenience — it can run for a kilometre through six
 * crossings — so unsplit ways are a bag of overlapping polylines, not a graph.
 * After splitting, every segment runs from one junction to exactly one other,
 * which is what makes shortest-path and "which road is blocked" possible.
 *
 * Ids are short and readable (R1.., J1..) for the same reason the venue graph
 * uses G1/Z1: they end up in logs, in operator screens and in the LLM brief,
 * where a 12-digit OSM id is noise.
 *
 * @param {Array} ways    raw Overpass way elements
 * @param {Array<[number,number]>} polygon coverage ring, [lat,lng]
 * @returns {{ segments: Array, junctions: Array, stats: Object, dropped: Object }}
 */
export function buildRoadGraph(ways = [], polygon = []) {
  const dropped = { notWalkable: 0, unusableGeometry: 0, outsideCoverage: 0 };

  // Keep only walkable classes with geometry we can trust. `out geom` is meant
  // to give matching `nodes` and `geometry` arrays; if they disagree we cannot
  // map a node id to a coordinate, and guessing the correspondence would put
  // junctions in the wrong place.
  const kept = [];
  for (const way of ways) {
    const highway = way?.tags?.highway;
    if (!WALKABLE_HIGHWAYS.has(highway)) {
      dropped.notWalkable += 1;
      continue;
    }
    const nodes = Array.isArray(way.nodes) ? way.nodes : [];
    const geometry = Array.isArray(way.geometry) ? way.geometry : [];
    if (nodes.length < 2 || nodes.length !== geometry.length) {
      dropped.unusableGeometry += 1;
      continue;
    }
    kept.push({ ...way, nodes, geometry, highway });
  }

  // How many times each OSM node id is used across the kept ways. Two or more
  // uses means two roads meet there. Counting occurrences rather than distinct
  // ways is intentional: a way that touches its own node twice is a genuine
  // self-crossing loop, and that is a junction too.
  const nodeUse = new Map();
  for (const way of kept) {
    for (const nodeId of way.nodes) nodeUse.set(nodeId, (nodeUse.get(nodeId) || 0) + 1);
  }

  const junctionsByOsmId = new Map();
  let junctionSeq = 0;
  const junctionFor = (osmNodeId, point) => {
    let junction = junctionsByOsmId.get(osmNodeId);
    if (!junction) {
      junctionSeq += 1;
      junction = {
        id: `J${junctionSeq}`,
        osmNodeId,
        at: point,
        segmentIds: [],
        degree: 0,
      };
      junctionsByOsmId.set(osmNodeId, junction);
    }
    return junction;
  };

  const segments = [];
  let segmentSeq = 0;

  for (const way of kept) {
    const { nodes, geometry, highway } = way;
    const tags = way.tags || {};

    // Cut points: both endpoints (they terminate the way) plus every shared node.
    const cuts = [];
    for (let i = 0; i < nodes.length; i += 1) {
      if (i === 0 || i === nodes.length - 1 || (nodeUse.get(nodes[i]) || 0) >= 2) cuts.push(i);
    }

    const { widthM, widthSource } = resolveWidth(tags, highway);
    const oneway = parseOneway(tags);
    // Trim to nothing rather than keeping "" — an empty string would render as a
    // nameless name; null says plainly that OSM has no name for this road.
    const name = typeof tags.name === "string" && tags.name.trim() ? tags.name.trim() : null;

    for (let c = 0; c < cuts.length - 1; c += 1) {
      const startIdx = cuts[c];
      const endIdx = cuts[c + 1];
      const path = geometry.slice(startIdx, endIdx + 1).map((pt) => [pt.lat, pt.lon]);
      if (path.length < 2) continue;

      // Overpass's poly filter returns any way that touches the area, including
      // ones that only clip a corner. Judge membership by the segment's midpoint:
      // an endpoint test would keep roads that merely graze the boundary.
      const mid = pathMidpoint(path);
      if (mid && !pointInPolygon(mid, polygon)) {
        dropped.outsideCoverage += 1;
        continue;
      }

      const lengthM = pathLengthMeters(path);
      const from = junctionFor(nodes[startIdx], path[0]);
      const to = junctionFor(nodes[endIdx], path[path.length - 1]);

      segmentSeq += 1;
      const segment = {
        id: `R${segmentSeq}`,
        osmWayId: way.id,
        name,
        highway,
        oneway,
        widthM: Math.round(widthM * 10) / 10,
        widthSource,
        path,
        lengthM: Math.round(lengthM),
        fromJunction: from.id,
        toJunction: to.id,
        // Same capacity model as the venue graph's corridors — one formula for
        // the whole system, so a road and an authored corridor are comparable.
        capacityPerMin: corridorCapacityPerMin(widthM),
      };
      segments.push(segment);

      for (const junction of from === to ? [from] : [from, to]) {
        junction.segmentIds.push(segment.id);
      }
    }
  }

  // A junction is only created once a surviving segment ends there, so every
  // entry here has at least one incident segment. Degree is the count of
  // distinct segments meeting at the point — a 4-way crossing reads as 4.
  const junctions = [...junctionsByOsmId.values()].map((j) => ({
    ...j,
    degree: j.segmentIds.length,
  }));

  const roadNames = [...new Set(segments.map((s) => s.name).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );

  return {
    segments,
    junctions,
    stats: {
      segmentCount: segments.length,
      junctionCount: junctions.length,
      totalLengthM: Math.round(segments.reduce((sum, s) => sum + s.lengthM, 0)),
      namedRoadCount: segments.filter((s) => s.name).length,
      roadNames,
    },
    dropped,
  };
}

/* ------------------------------------------------------------------ *
 * Import
 * ------------------------------------------------------------------ */

/**
 * Import (or reuse) the road network for an event's coverage polygon.
 *
 * Overpass is a free shared service and a full import is a heavy query, so the
 * coverage hash is checked first: re-importing an unchanged area would burn
 * somebody else's quota to produce a byte-identical result. `force` exists for
 * the case where the area is the same but OSM has moved on.
 *
 * @param {string} eventId
 * @param {Array<[number,number]>} polygon coverage ring, [lat,lng]
 * @param {{ force?: boolean, signal?: AbortSignal }} [opts]
 * @returns {Promise<{ network: Object, imported: boolean, skipped: boolean }>}
 */
export async function importRoadNetwork(eventId, polygon = [], { force = false, signal } = {}) {
  const coverageHash = coveragePolygonHash(polygon);

  const existing = await RoadNetwork.findOne({ event: eventId });
  // An empty stored network is never a reason to skip. It may be genuinely empty
  // ground, but it may equally be the residue of a bad upstream answer, and
  // "we already know there are no roads" is not a claim worth caching.
  const usable = existing?.segments?.length > 0;
  if (existing && usable && existing.coverageHash === coverageHash && !force) {
    return { network: existing, imported: false, skipped: true };
  }

  const ways = await fetchOsmRoads(polygon, { signal });
  const { segments, junctions, stats, dropped } = buildRoadGraph(ways, polygon);

  console.log(
    `[osmNetwork] event ${eventId}: ${ways.length} OSM ways -> ${stats.segmentCount} segments, ` +
      `${stats.junctionCount} junctions, ${(stats.totalLengthM / 1000).toFixed(2)} km ` +
      `(dropped ${dropped.notWalkable} non-walkable, ${dropped.unusableGeometry} unusable, ` +
      `${dropped.outsideCoverage} outside coverage)`
  );

  const network = await RoadNetwork.findOneAndUpdate(
    { event: eventId },
    {
      event: eventId,
      coverageHash,
      segments,
      junctions,
      stats,
      fetchedAt: new Date(),
      attribution: OSM_ATTRIBUTION,
      source: "overpass",
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  return { network, imported: true, skipped: false };
}

export default {
  OSM_ATTRIBUTION,
  WALKABLE_HIGHWAYS,
  coveragePolygonHash,
  fetchOsmRoads,
  buildRoadGraph,
  importRoadNetwork,
  overpassUrl,
};
