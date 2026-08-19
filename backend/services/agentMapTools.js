/**
 * agentMapTools — the agent's geographic "hands", kept separate from the pure
 * agentTools so the brief builder stays network-free. These tools DO reach the
 * network (road routing over OpenStreetMap by default, Google if the operator
 * configured it) and then fuse the result with live crowd risk via routeFusion.
 *
 * Every tool degrades gracefully: if the engine is unreachable (or place search
 * has no key), it returns `{ error, fallback: true, ... }` so the model falls
 * back to the in-venue router tool (find_safest_route) instead of failing.
 * Outside-the-venue geography is an enhancement, never a hard dependency.
 */
import { searchPlaces, NoMapsError } from "./googleMaps.js";
import { computeWalkingRoutes, computeWalkingMatrix } from "./routing/index.js";
import { rankRoutesByRisk } from "./routeFusion.js";
import { findSafeExitRoute } from "./exitRoute.js";

/** Normalize a model-supplied point ({lat,lng} | {latitude,longitude} | [lat,lng]) to [lat,lng]. */
function toLatLng(p) {
  if (!p) return null;
  if (Array.isArray(p) && p.length >= 2) return [Number(p[0]), Number(p[1])];
  if (typeof p === "object") {
    const lat = p.lat ?? p.latitude;
    const lng = p.lng ?? p.lon ?? p.longitude; // tolerate a few spellings
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [Number(lat), Number(lng)];
  }
  return null;
}

/** Turn any provider throw into a uniform, model-readable fallback signal. */
function toFallback(err) {
  if (err instanceof NoMapsError || err?.code === "MAPS_DISABLED") {
    return {
      error: "Place search needs a Google Maps key, which isn't configured.",
      fallback: true,
      hint: "Use find_safest_route (the in-venue graph router) instead.",
    };
  }
  return {
    error: err?.message || "The routing/places request failed.",
    kind: err?.kind || "unreachable",
    fallback: true,
    hint: "Use find_safest_route (the in-venue graph router) instead.",
  };
}

export const MAP_TOOL_SPECS = [
  {
    type: "function",
    function: {
      name: "road_route",
      description:
        "Get walking route options between two points on the public road/path network OUTSIDE the venue (OpenStreetMap routing, or Google if configured). Returns distance, pedestrian duration and geometry, already re-ranked by live crowd risk. Use for approach/egress on public roads, never for movement inside the venue (use find_safest_route for that).",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "object", properties: { lat: { type: "number" }, lng: { type: "number" } }, required: ["lat", "lng"] },
          destination: { type: "object", properties: { lat: { type: "number" }, lng: { type: "number" } }, required: ["lat", "lng"] },
        },
        required: ["origin", "destination"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "road_route_matrix",
      description:
        "Many-to-many walking distance/time matrix between origins and destinations on the public network OUTSIDE the venue. Use to compare several origins against several exits at once.",
      parameters: {
        type: "object",
        properties: {
          origins: { type: "array", items: { type: "object", properties: { lat: { type: "number" }, lng: { type: "number" } } } },
          destinations: { type: "array", items: { type: "object", properties: { lat: { type: "number" }, lng: { type: "number" } } } },
        },
        required: ["origins", "destinations"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "places_search",
      description:
        "Search for nearby places (transit stations, parking, hospitals, landmarks) by text query. Requires an optional Google Maps key; if unavailable the tool says so. Use for approach/logistics context only.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "e.g. 'parking near Puri railway station'" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_safe_exit_route",
      description:
        "Given a person's location, find the SAFEST walking route to an open perimeter gate: Google supplies road routes to each open gate, then CrowdShield re-ranks them by live crowd risk (rejecting routes through high-risk zones or to closed gates). Prefer this for evacuating/guiding someone out.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "object", properties: { lat: { type: "number" }, lng: { type: "number" } }, required: ["lat", "lng"] },
        },
        required: ["from"],
      },
    },
  },
];

const MAP_TOOL_NAMES = new Set(MAP_TOOL_SPECS.map((t) => t.function.name));
export const isMapTool = (name) => MAP_TOOL_NAMES.has(name);

/**
 * Dispatch a Google-Maps-backed tool call. ctx = { venue, snapshot }.
 * Always resolves (never throws): failures come back as a fallback object.
 */
export async function runMapTool(name, args = {}, ctx = {}) {
  const { venue, snapshot } = ctx;
  try {
    switch (name) {
      case "road_route": {
        const origin = toLatLng(args.origin);
        const destination = toLatLng(args.destination);
        if (!origin || !destination) return { error: "origin and destination {lat,lng} are required." };
        const routes = await computeWalkingRoutes({ origin, destination });
        const ranked = rankRoutesByRisk(routes, snapshot, venue);
        return {
          routes: ranked.map((r) => ({
            durationSec: r.durationSec,
            distanceMeters: r.distanceMeters,
            maxRisk: r.maxRisk,
            unsafe: r.unsafe,
            reason: r.reason,
          })),
        };
      }
      case "road_route_matrix": {
        const origins = (args.origins || []).map(toLatLng).filter(Boolean);
        const destinations = (args.destinations || []).map(toLatLng).filter(Boolean);
        if (!origins.length || !destinations.length) return { error: "origins and destinations are required." };
        const matrix = await computeWalkingMatrix({ origins, destinations });
        return { matrix };
      }
      case "places_search": {
        if (!args.query) return { error: "query is required." };
        const places = await searchPlaces({ textQuery: args.query });
        return { places };
      }
      case "get_safe_exit_route": {
        const from = toLatLng(args.from);
        if (!from) return { error: "from {lat,lng} is required." };

        // Same implementation the citizen app calls, so the agent and the person
        // holding the phone can never be told contradictory things.
        const res = await findSafeExitRoute({ venue, snapshot, from });
        if (!res.ok) return { error: res.message, fallback: true };

        const { waypoints, gateAt, ...summary } = res.exit;
        return {
          ...summary,
          // The model reasons about ids and numbers; geometry would just burn
          // tokens. The map gets waypoints through the citizen/authority paths.
          waypointCount: waypoints?.length ?? 0,
          note: "Road routing covers the approach to the gate (outside the venue); inside the venue the authored graph router is authoritative.",
        };
      }
      default:
        return { error: `Unknown map tool '${name}'.` };
    }
  } catch (err) {
    return toFallback(err);
  }
}

export default { MAP_TOOL_SPECS, runMapTool, isMapTool };
