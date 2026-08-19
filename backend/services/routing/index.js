/**
 * routing — the provider-neutral interface for OUTSIDE-the-venue road routing.
 *
 * The agent's tools and the risk-fusion layer talk to this module, never to a
 * vendor SDK, so swapping engines never touches the AI or the fusion logic:
 *
 *     agent tool  ->  routing (this)  ->  osrm | google
 *                          |
 *                     routeFusion (live crowd risk re-ranking)
 *
 * Selection is deliberately zero-config: OSRM (free, OpenStreetMap, optionally
 * self-hosted) is the DEFAULT and needs no API key, so a fresh deployment has
 * working real routing out of the box. If an operator has configured and
 * enabled Google Maps, we use that instead. Setting ROUTING_PROVIDER forces one.
 *
 * Every function returns the same shape regardless of engine:
 *   { distanceMeters, durationSec, encodedPolyline, source }
 * which is exactly what services/routeFusion.js consumes.
 */
import * as osrm from "./osrmProvider.js";
import { getMapsConfig, computeRoutes as googleRoutes, computeRouteMatrix as googleMatrix } from "../googleMaps.js";

/**
 * Which engine to use right now.
 * @returns {Promise<"google"|"osrm">}
 */
export async function activeProvider() {
  const forced = (process.env.ROUTING_PROVIDER || "").trim().toLowerCase();
  if (forced === "osrm" || forced === "google") return forced;

  // Google only when the operator has actually set it up and enabled it.
  const maps = await getMapsConfig().catch(() => null);
  return maps ? "google" : "osrm";
}

/**
 * Walking route options between two [lat,lng] points on the public network.
 * @returns {Promise<Array<{distanceMeters,durationSec,encodedPolyline,source}>>}
 */
export async function computeWalkingRoutes({ origin, destination, alternatives = true }, signal) {
  const provider = await activeProvider();

  if (provider === "google") {
    const routes = await googleRoutes({ origin, destination, alternatives }, undefined, signal);
    return routes.map((r) => ({ ...r, source: "google" }));
  }
  return osrm.computeRoutes({ origin, destination, alternatives }, signal);
}

/**
 * Many-to-many walking distance/duration matrix.
 * @returns {Promise<Array<{originIndex,destinationIndex,distanceMeters,durationSec}>>}
 */
export async function computeWalkingMatrix({ origins, destinations }, signal) {
  const provider = await activeProvider();

  if (provider === "google") {
    const rows = await googleMatrix({ origins, destinations }, undefined, signal);
    return rows.map((r) => ({ ...r, source: "google" }));
  }
  return osrm.computeMatrix({ origins, destinations }, signal);
}

/** Diagnostics: which engine, at which endpoint. */
export async function routingInfo() {
  const provider = await activeProvider();
  return {
    provider,
    endpoint: provider === "osrm" ? osrm.osrmBaseUrl() : "google-routes-api",
    keyRequired: provider === "google",
  };
}

export default { activeProvider, computeWalkingRoutes, computeWalkingMatrix, routingInfo };
