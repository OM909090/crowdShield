/**
 * googleMaps — a thin client for Google Maps Platform Routes + Places APIs.
 *
 * Scope on purpose: this is GEOGRAPHIC intelligence for OUTSIDE the venue —
 * road/approach walking routes, many-to-many distance/time matrices, and place
 * lookups. It knows nothing about crowd risk; fusing Google's geometry with
 * CrowdShield's live risk is done deterministically in routeFusion.js, never by
 * the model. Inside the Area of Responsibility the venue graph is authoritative
 * (Google has no paths there).
 *
 * Design mirrors llmProvider.js:
 *   - config is a singleton the operator sets (bring-your-own key, encrypted);
 *   - the base URLs are configurable so tests can point at a mock;
 *   - every call uses a field mask (only fetch what we need), a ~10s timeout,
 *     and returns typed errors (auth | unreachable | bad_response);
 *   - if Maps is unconfigured/disabled we throw NoMapsError so callers can fall
 *     back to the in-venue router — Maps is never a hard dependency.
 *
 * Coordinates are [lat, lng] (Leaflet order) at our boundary; we convert to/from
 * Google's {latitude, longitude} internally.
 */
import MapsConfig, { getMapsSingleton } from "../models/MapsConfig.js";
import { decryptSecret } from "../utils/cryptoBox.js";

const TIMEOUT_MS = 10_000;

/** Thrown when Maps is not configured/enabled — signals "fall back to venue router". */
export class NoMapsError extends Error {
  constructor(message = "Google Maps is not configured") {
    super(message);
    this.name = "NoMapsError";
    this.code = "MAPS_DISABLED";
  }
}

/** A typed transport error so callers/UI can react by kind. */
function mapsError(kind, message) {
  const err = new Error(message);
  err.kind = kind; // "auth" | "unreachable" | "bad_response"
  return err;
}

/**
 * Load the active Maps config with the decrypted key.
 * @returns {Promise<{apiKey,routesBaseUrl,placesBaseUrl}|null>} null when
 *   unconfigured, disabled, or the key can't be decrypted.
 */
export async function getMapsConfig() {
  const cfg = await MapsConfig.findOne({ key: "active" }).select("+apiKeyEnc");
  if (!cfg || !cfg.enabled || !cfg.apiKeyEnc) return null;
  let apiKey;
  try {
    apiKey = decryptSecret(cfg.apiKeyEnc);
  } catch {
    return null; // rotated/managled secret -> treat as unconfigured
  }
  if (!apiKey) return null;
  return {
    apiKey,
    routesBaseUrl: cfg.routesBaseUrl || "https://routes.googleapis.com",
    placesBaseUrl: cfg.placesBaseUrl || "https://places.googleapis.com",
  };
}

const latLng = (pt) => ({ latitude: pt[0], longitude: pt[1] });
const wp = (pt) => ({ location: { latLng: latLng(pt) } });
/** Google Routes durations arrive as strings like "123s". */
const durationToSec = (d) => (typeof d === "string" ? parseInt(d, 10) || 0 : Number(d) || 0);

/**
 * POST helper with API key + field mask, timeout, and typed error mapping.
 * Resolves the active config unless an explicit one is passed (used by "test").
 */
async function post(url, body, fieldMask, cfg, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": cfg.apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw mapsError("unreachable", "Google Maps request timed out.");
    throw mapsError("unreachable", `Could not reach Google Maps: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw mapsError("auth", "Google Maps rejected the API key (auth failed).");
  }
  let json;
  try {
    json = await res.json();
  } catch {
    throw mapsError("bad_response", "Google Maps returned an unparseable response.");
  }
  if (!res.ok) {
    const msg = json?.error?.message || `Google Maps error (HTTP ${res.status}).`;
    throw mapsError(res.status >= 500 ? "unreachable" : "bad_response", msg);
  }
  return json;
}

/**
 * Compute one or more walking routes between two [lat,lng] points.
 * @returns {Promise<Array<{distanceMeters,durationSec,encodedPolyline}>>}
 */
export async function computeRoutes(
  { origin, destination, intermediates = [], travelMode = "WALK", alternatives = true },
  cfgOverride,
  signal
) {
  const cfg = cfgOverride || (await getMapsConfig());
  if (!cfg) throw new NoMapsError();

  const body = {
    origin: wp(origin),
    destination: wp(destination),
    travelMode,
    computeAlternativeRoutes: !!alternatives,
    ...(intermediates.length ? { intermediates: intermediates.map(wp) } : {}),
  };
  const fieldMask = "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline";
  const json = await post(
    `${cfg.routesBaseUrl}/directions/v2:computeRoutes`,
    body,
    fieldMask,
    cfg,
    signal
  );
  const routes = Array.isArray(json.routes) ? json.routes : [];
  return routes.map((r) => ({
    distanceMeters: r.distanceMeters ?? null,
    durationSec: durationToSec(r.duration),
    encodedPolyline: r.polyline?.encodedPolyline || "",
  }));
}

/**
 * Many-to-many distance/time matrix between origin and destination [lat,lng] lists.
 * @returns {Promise<Array<{originIndex,destinationIndex,distanceMeters,durationSec,condition}>>}
 */
export async function computeRouteMatrix(
  { origins, destinations, travelMode = "WALK" },
  cfgOverride,
  signal
) {
  const cfg = cfgOverride || (await getMapsConfig());
  if (!cfg) throw new NoMapsError();

  const body = {
    origins: origins.map((o) => ({ waypoint: wp(o) })),
    destinations: destinations.map((d) => ({ waypoint: wp(d) })),
    travelMode,
  };
  const fieldMask = "originIndex,destinationIndex,distanceMeters,duration,condition";
  const json = await post(
    `${cfg.routesBaseUrl}/distanceMatrix/v2:computeRouteMatrix`,
    body,
    fieldMask,
    cfg,
    signal
  );
  const rows = Array.isArray(json) ? json : Array.isArray(json.elements) ? json.elements : [];
  return rows.map((e) => ({
    originIndex: e.originIndex ?? 0,
    destinationIndex: e.destinationIndex ?? 0,
    distanceMeters: e.distanceMeters ?? null,
    durationSec: durationToSec(e.duration),
    condition: e.condition || "ROUTE_EXISTS",
  }));
}

/**
 * Text search for places (nearby amenities, transit, parking, landmarks).
 * @returns {Promise<Array<{name,address,location:[lat,lng]}>>}
 */
export async function searchPlaces({ textQuery, maxResults = 5 }, cfgOverride, signal) {
  const cfg = cfgOverride || (await getMapsConfig());
  if (!cfg) throw new NoMapsError();

  const fieldMask = "places.displayName,places.formattedAddress,places.location";
  const json = await post(
    `${cfg.placesBaseUrl}/v1/places:searchText`,
    { textQuery, maxResultCount: maxResults },
    fieldMask,
    cfg,
    signal
  );
  const places = Array.isArray(json.places) ? json.places : [];
  return places.slice(0, maxResults).map((p) => ({
    name: p.displayName?.text || p.displayName || "",
    address: p.formattedAddress || "",
    location: p.location ? [p.location.latitude, p.location.longitude] : null,
  }));
}

/** Lightweight health check used by the "test connection" endpoint. */
export async function testMapsConfig(cfg, signal) {
  // A trivial 1-hop walking route; success => key + endpoint are good.
  await computeRoutes(
    { origin: [19.803, 85.831], destination: [19.8044, 85.831], alternatives: false },
    cfg,
    signal
  );
  return true;
}

export default { getMapsConfig, computeRoutes, computeRouteMatrix, searchPlaces, testMapsConfig, NoMapsError };
