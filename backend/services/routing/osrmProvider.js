/**
 * osrmProvider — free, self-hostable road/path routing over OpenStreetMap data.
 *
 * This is CrowdShield's DEFAULT outside-the-venue routing engine: OSRM needs no
 * API key and can be self-hosted from an OSM extract, so the platform depends on
 * no proprietary map infrastructure. Google (services/googleMaps.js) remains an
 * optional alternative behind the same routing interface.
 *
 * Scope, as always: OSRM knows public roads and paths OUTSIDE the venue. Inside
 * the Area of Responsibility the authored venue graph is authoritative, and the
 * live crowd-risk overlay (services/routeFusion.js) re-ranks whatever geometry
 * comes back from here.
 *
 * ── Pedestrian ETA, honestly ────────────────────────────────────────────────
 * The public demo server (router.project-osrm.org) only has the CAR profile
 * loaded and ignores the profile in the URL: a 387 m path comes back as 53 s
 * (~26 km/h), which is nonsense for a crowd on foot. So by default we keep
 * OSRM's geometry and distance (both real) and recompute duration from our own
 * pedestrian walking speed. Operators who self-host a genuine foot profile can
 * set OSRM_TRUST_DURATION=true to use the server's own timings.
 *
 * Coordinates are [lat, lng] at our boundary; OSRM speaks lng,lat.
 */
import { PEDESTRIAN } from "../../utils/geo.js";

const DEFAULT_BASE_URL = "https://router.project-osrm.org";
const TIMEOUT_MS = 12_000;
/*
 * The shared public demo server (router.project-osrm.org) rate-limits hard: in
 * testing it returned ETIMEDOUT on roughly two of every three requests, then
 * served a perfect route on the next attempt. Since a citizen asking "how do I
 * get out?" must not be told "no route" because of someone else's traffic, we
 * retry with exponential backoff. Self-hosting OSRM (see the header) removes the
 * problem entirely and is what production should do.
 */
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 400;

/** Where OSRM lives. Point OSRM_BASE_URL at your own container in production. */
export const osrmBaseUrl = () =>
  (process.env.OSRM_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");

/** Profile to request (only meaningful on a server that actually has it). */
const osrmProfile = () => process.env.OSRM_PROFILE || "foot";

/** Whether the server's durations are trustworthy pedestrian timings. */
const trustProviderDuration = () => String(process.env.OSRM_TRUST_DURATION) === "true";

/** A typed transport error, mirroring the Google client's shape. */
function osrmError(kind, message) {
  const err = new Error(message);
  err.kind = kind; // "unreachable" | "bad_response"
  err.code = "ROUTING_FAILED";
  return err;
}

/** Walking seconds for a distance, from the shared pedestrian constant. */
const walkSeconds = (meters) => Math.round((meters || 0) / PEDESTRIAN.FREE_WALK_SPEED_MPS);

/** "lng,lat" as OSRM expects, from our [lat,lng]. */
const coord = (pt) => `${Number(pt[1])},${Number(pt[0])}`;

async function getJson(url, signal, attempt = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

  let res;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    // The shared public demo server rate-limits and occasionally drops
    // connections. One short backoff retry turns a spurious failure into a
    // success; a self-hosted OSRM makes this practically moot.
    const cancelled = signal?.aborted;
    if (!cancelled && attempt < MAX_RETRIES) {
      // Exponential backoff: 400ms, 800ms, 1600ms.
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * 2 ** attempt));
      return getJson(url, signal, attempt + 1);
    }
    if (err?.name === "AbortError") throw osrmError("unreachable", "The routing engine timed out.");
    throw osrmError("unreachable", `Could not reach the routing engine: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw osrmError("bad_response", "The routing engine returned an unparseable response.");
  }
  if (!res.ok || (json?.code && json.code !== "Ok")) {
    throw osrmError("bad_response", json?.message || `Routing engine error (HTTP ${res.status}).`);
  }
  return json;
}

/**
 * Walking route options between two points on the real road/path network.
 *
 * @param {{origin:[number,number], destination:[number,number], alternatives?:boolean}} args
 * @returns {Promise<Array<{distanceMeters:number, durationSec:number, encodedPolyline:string, source:string}>>}
 */
export async function computeRoutes({ origin, destination, alternatives = true }, signal) {
  if (!origin || !destination) throw osrmError("bad_response", "origin and destination are required.");

  const url =
    `${osrmBaseUrl()}/route/v1/${osrmProfile()}/${coord(origin)};${coord(destination)}` +
    `?overview=full&geometries=polyline&alternatives=${alternatives ? "true" : "false"}`;

  const json = await getJson(url, signal);
  const routes = Array.isArray(json.routes) ? json.routes : [];

  return routes.map((r) => {
    const distanceMeters = Math.round(r.distance ?? 0);
    return {
      distanceMeters,
      // Real distance, pedestrian-honest duration (see the header note).
      durationSec: trustProviderDuration()
        ? Math.round(r.duration ?? 0)
        : walkSeconds(distanceMeters),
      encodedPolyline: r.geometry || "",
      source: "osrm",
    };
  });
}

/**
 * Many-to-many walking distance/duration matrix.
 *
 * @param {{origins:Array<[number,number]>, destinations:Array<[number,number]>}} args
 * @returns {Promise<Array<{originIndex:number,destinationIndex:number,distanceMeters:number,durationSec:number}>>}
 */
export async function computeMatrix({ origins = [], destinations = [] }, signal) {
  if (!origins.length || !destinations.length) {
    throw osrmError("bad_response", "origins and destinations are required.");
  }

  // OSRM takes one coordinate list plus index-based sources/destinations.
  const all = [...origins, ...destinations];
  const sourceIdx = origins.map((_, i) => i).join(";");
  const destIdx = destinations.map((_, i) => origins.length + i).join(";");

  const url =
    `${osrmBaseUrl()}/table/v1/${osrmProfile()}/${all.map(coord).join(";")}` +
    `?sources=${sourceIdx}&destinations=${destIdx}&annotations=duration,distance`;

  const json = await getJson(url, signal);
  const distances = json.distances || [];
  const durations = json.durations || [];

  const out = [];
  for (let o = 0; o < origins.length; o += 1) {
    for (let d = 0; d < destinations.length; d += 1) {
      const distanceMeters = Math.round(distances?.[o]?.[d] ?? 0);
      out.push({
        originIndex: o,
        destinationIndex: d,
        distanceMeters,
        durationSec: trustProviderDuration()
          ? Math.round(durations?.[o]?.[d] ?? 0)
          : walkSeconds(distanceMeters),
      });
    }
  }
  return out;
}

/** Health probe for diagnostics. */
export async function testOsrm(signal) {
  const routes = await computeRoutes(
    { origin: [19.803, 85.831], destination: [19.8044, 85.831], alternatives: false },
    signal
  );
  return routes.length > 0;
}

export default { computeRoutes, computeMatrix, testOsrm, osrmBaseUrl };
