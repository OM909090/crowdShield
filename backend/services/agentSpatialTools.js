/**
 * agentSpatialTools — the agent's eyes on the actual ground.
 *
 * Until now the Tier 2 agent could see an abstraction: zones the authority drew,
 * gates with ids, a risk number per polygon. It could not see a road, could not
 * name a street, and could not answer the only question a crowd manager really
 * asks — "which way do I send them?" It was reasoning about a map it had never
 * been shown.
 *
 * These tools close that gap, over three new sources:
 *
 *   • the coverage area   — the boundary the authority drew with the pen, which
 *                           defines what the agent is responsible for
 *   • the road network    — real OSM streets inside it, with real names,
 *                           junctions, widths and capacities
 *   • crowd clusters      — tracked bodies of people (K1, K2 …) rather than tens
 *                           of thousands of anonymous points
 *
 * Every tool is a pure read over a context object, exactly like agentTools.js:
 * it can look and it can estimate, it can never act. And every one of them keeps
 * the no-fabrication contract (§17) — a street with no readings is reported as
 * unmeasured, never as clear, because "we can't see it" and "it's empty" lead to
 * opposite decisions.
 */
import { sampleRoadCongestion, getCongestedRoads } from "./roadCrowd.js";
import { dangerSegmentPenalties, openExitsByLoad } from "./routeSafety.js";
import {
  buildRoadGraph,
  nearestJunction,
  junctionOnRoad,
  safestRoadRoute,
  safestRoadExits,
  roadLabel,
} from "./roadRouter.js";
import { polygonAreaM2, centroid } from "../utils/geo.js";

const round = (n, dp = 2) => {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/** segmentId -> congestion row, computed once per tool call that needs it. */
function congestionIndex(network, snapshot) {
  const index = new Map();
  if (!network) return index;
  for (const row of sampleRoadCongestion(network, snapshot)) index.set(row.id, row);
  return index;
}

/* ------------------------------------------------------------------ *
 * Coverage
 * ------------------------------------------------------------------ */

/**
 * What the agent is responsible for: the drawn boundary, what is inside it, and
 * how much of it we can actually see right now.
 *
 * The last part is the one that changes decisions. An agent told "3 of 331 street
 * segments have readings" should reason very differently from one told the network
 * is fully instrumented, and it has no way to know unless we say so.
 */
export function getCoverageSummary({ venue, snapshot, roadNetwork } = {}) {
  const polygon = venue?.aor?.polygon || [];
  if (polygon.length < 3) {
    return {
      defined: false,
      message:
        "No coverage area has been drawn for this event yet, so there is no boundary to monitor and no road network to route over.",
    };
  }

  const areaM2 = venue?.aor?.areaM2 || Math.round(polygonAreaM2(polygon));
  const totals = snapshot?.totals || {};
  const rows = roadNetwork ? sampleRoadCongestion(roadNetwork, snapshot) : [];
  const measured = rows.filter((r) => r.measured).length;

  return {
    defined: true,
    areaM2,
    areaKm2: round(areaM2 / 1e6),
    centre: centroid(polygon),
    corners: polygon.length,
    crowd: {
      // Inside the boundary only — see aggregator.filterToCoverage.
      reportingPhones: totals.sampledDevices ?? 0,
      personsEst: totals.personsEst ?? 0,
      participationRate: totals.participationRate ?? null,
      /** People reporting just OUTSIDE the line. A surge arriving, not yours yet. */
      outsideBoundary: totals.outsideCoverage ?? 0,
      outsideEst: totals.outsideEst ?? 0,
    },
    zones: (venue?.zones || []).map((z) => ({ id: z.id, name: z.name, areaM2: z.areaM2 })),
    gates: (venue?.nodes || [])
      .filter((n) => n.type === "gate")
      .map((n) => ({ id: n.id, name: n.name || n.id, state: n.state, throughputPerMin: n.throughputPerMin })),
    roads: roadNetwork
      ? {
          imported: true,
          segments: roadNetwork.stats?.segmentCount ?? 0,
          junctions: roadNetwork.stats?.junctionCount ?? 0,
          totalLengthKm: round((roadNetwork.stats?.totalLengthM ?? 0) / 1000),
          namedRoads: roadNetwork.stats?.roadNames ?? [],
          segmentsWithLiveReadings: measured,
          note:
            measured === 0
              ? "No street currently has crowd readings near it — routing is geometric only."
              : `${measured} of ${rows.length} street segments have live crowd readings.`,
        }
      : {
          imported: false,
          note:
            "The real street network has not been imported for this coverage area, so routes can only use the authority's drawn corridors.",
        },
  };
}

/* ------------------------------------------------------------------ *
 * Roads
 * ------------------------------------------------------------------ */

/** Every named street in the coverage area with its width, capacity and load. */
export function listRoads({ roadNetwork, snapshot } = {}, { namedOnly = true } = {}) {
  if (!roadNetwork) {
    return { ok: false, message: "No road network imported for this coverage area." };
  }
  const rows = sampleRoadCongestion(roadNetwork, snapshot);

  // Group by street name: OSM splits a road at every crossing, so the raw
  // segment list reads as thirty rows called "Grand Road". An operator (and the
  // model) thinks in streets.
  const byName = new Map();
  for (const r of rows) {
    if (namedOnly && !r.name) continue;
    const key = r.name || `unnamed ${r.highway}`;
    const e = byName.get(key) || {
      road: key,
      named: !!r.name,
      highway: r.highway,
      segments: 0,
      lengthM: 0,
      widestM: 0,
      capacityPerMin: 0,
      measuredSegments: 0,
      worstDensity: null,
      personsEst: null,
    };
    e.segments += 1;
    e.lengthM += r.lengthM || 0;
    e.widestM = Math.max(e.widestM, r.widthM || 0);
    e.capacityPerMin = Math.max(e.capacityPerMin, r.capacityPerMin || 0);
    if (r.measured) {
      e.measuredSegments += 1;
      if (r.density != null) e.worstDensity = Math.max(e.worstDensity ?? 0, r.density);
      e.personsEst = (e.personsEst ?? 0) + (r.personsEst ?? 0);
    }
    byName.set(key, e);
  }

  return {
    ok: true,
    roads: [...byName.values()]
      .map((e) => ({ ...e, lengthM: Math.round(e.lengthM), worstDensity: round(e.worstDensity) }))
      .sort((a, b) => b.capacityPerMin - a.capacityPerMin || b.lengthM - a.lengthM),
    note: "capacityPerMin is the widest segment's pedestrian capacity. worstDensity/personsEst are null where no segment of that road has live readings.",
  };
}

/** The most crowded streets we can actually measure, worst first. */
export function getRoadCongestion({ roadNetwork, snapshot } = {}, { n = 6 } = {}) {
  if (!roadNetwork) {
    return { ok: false, message: "No road network imported for this coverage area." };
  }
  const worst = getCongestedRoads(roadNetwork, snapshot, n);
  const all = sampleRoadCongestion(roadNetwork, snapshot);
  const measured = all.filter((r) => r.measured).length;

  return {
    ok: true,
    measuredSegments: measured,
    totalSegments: all.length,
    worst: worst.map((r) => ({
      id: r.id,
      road: r.label,
      density: r.density,
      personsEst: r.personsEst,
      meanSpeed: r.meanSpeed,
      state: r.state,
      capacityPerMin: r.capacityPerMin,
      lengthM: r.lengthM,
    })),
    ...(measured === 0
      ? {
          warning:
            "No street has live readings right now. Do not describe any road as clear — we cannot see them.",
        }
      : {}),
  };
}

/* ------------------------------------------------------------------ *
 * Crowds
 * ------------------------------------------------------------------ */

/**
 * The tracked bodies of people, biggest first, with what each is doing.
 *
 * This is what makes a crush precursor sayable: two clusters closing on each
 * other, one of them growing, is the geometry that kills people, and it is
 * invisible in a per-zone density table.
 */
export function getCrowdClusters({ snapshot, roadNetwork } = {}, { n = 8 } = {}) {
  const clusters = snapshot?.clusters || [];
  if (!clusters.length) {
    return { ok: true, clusters: [], note: "No crowd clusters detected inside the coverage area." };
  }

  // Which street each crowd is standing on — the difference between "K3 is at
  // 19.8035, 85.8225" and "K3 is on Kutcheri Road".
  const graph = roadNetwork ? buildRoadGraph(roadNetwork) : null;
  const segById = new Map((roadNetwork?.segments || []).map((s) => [s.id, s]));

  return {
    ok: true,
    clusters: clusters.slice(0, n).map((k) => {
      let onRoad = null;
      if (graph) {
        const j = nearestJunction(graph, k.centroid);
        const seg = j
          ? (roadNetwork.segments || []).find((s) => s.fromJunction === j || s.toJunction === j)
          : null;
        if (seg) onRoad = roadLabel(segById.get(seg.id) || seg);
      }
      return {
        id: k.id,
        personsEst: k.personsEst,
        density: k.density,
        level: k.level,
        radiusM: k.radiusM,
        meanSpeed: k.meanSpeed,
        heading: k.headingCompass,
        growthPerMin: k.growthPerMin,
        packed: k.isCrowd,
        ageSec: k.ageSec,
        nearestRoad: onRoad,
        at: k.centroid,
      };
    }),
    note: "density/meanSpeed/growthPerMin are null when not measured — treat null as unknown, never as zero.",
  };
}

/* ------------------------------------------------------------------ *
 * Routing over real streets
 * ------------------------------------------------------------------ */

/**
 * Resolve whatever the model gave us into a junction id.
 * Accepts a junction id, a street name, a gate/node id, or a coordinate — the
 * model should not have to know our internal identifier scheme to ask a question.
 */
function resolveJunction(graph, network, venue, ref) {
  if (!ref) return { error: "A start and destination are both required." };

  if (typeof ref === "string") {
    if (graph.junctionPos.has(ref)) return { id: ref };

    const onRoad = junctionOnRoad(network, ref);
    if (onRoad) return { id: onRoad, via: `road '${ref}'` };

    const node = (venue?.nodes || []).find((n) => n.id === ref || n.name === ref);
    if (node?.at) {
      const j = nearestJunction(graph, node.at);
      if (j) return { id: j, via: `${node.name || node.id}` };
    }

    const zone = (venue?.zones || []).find((z) => z.id === ref || z.name === ref);
    if (zone?.polygon?.length) {
      const j = nearestJunction(graph, centroid(zone.polygon));
      if (j) return { id: j, via: `zone ${zone.name || zone.id}` };
    }
    return { error: `Could not find '${ref}' as a junction, street, gate or zone.` };
  }

  if (Array.isArray(ref) && ref.length === 2) {
    const j = nearestJunction(graph, ref);
    if (j) return { id: j, via: "coordinate" };
  }
  return { error: "Unrecognised location reference." };
}

/**
 * "Which way should these people go?" — answered on real streets, avoiding the
 * ones that are currently crowded, returned as named directions.
 */
export function findRoadRoute({ roadNetwork, snapshot, venue } = {}, { from, to } = {}) {
  if (!roadNetwork) {
    return {
      ok: false,
      message:
        "No road network imported for this coverage area — use find_safest_route to route over the authority's drawn corridors instead.",
    };
  }

  const graph = buildRoadGraph(roadNetwork);
  const start = resolveJunction(graph, roadNetwork, venue, from);
  if (start.error) return { ok: false, message: start.error };
  const end = resolveJunction(graph, roadNetwork, venue, to);
  if (end.error) return { ok: false, message: end.error };

  const congestion = congestionIndex(roadNetwork, snapshot);
  const extraCostBySegmentId = dangerSegmentPenalties(roadNetwork, snapshot);
  const res = safestRoadRoute(roadNetwork, congestion, start.id, end.id, { extraCostBySegmentId });
  if (!res.ok) return res;

  return {
    ok: true,
    from: start.via ? `${start.id} (${start.via})` : start.id,
    to: end.via ? `${end.id} (${end.via})` : end.id,
    lengthM: res.route.lengthM,
    etaSec: res.route.etaSec,
    worstDensity: res.route.worstDensity,
    measuredFraction: res.route.measuredFraction,
    roads: res.route.namedRoads,
    // Named roads and direction-only stretches, already merged into instructions
    // that can be spoken to a crowd.
    directions: res.route.steps.map((s) => ({
      say: s.instruction,
      road: s.name,
      lengthM: s.lengthM,
      density: s.worstDensity,
      state: s.state,
    })),
    spoken: res.route.directions,
    note:
      res.route.measuredFraction != null && res.route.measuredFraction < 0.2
        ? "Most of this route has no live crowd readings — it is the geometrically safest path, not a measured one."
        : undefined,
  };
}

/**
 * The safest way OUT, over real streets, to the open gates — ranked, so a crowd
 * can be split across exits rather than all sent one way (§7 anti-herding).
 */
export function findRoadExits({ roadNetwork, snapshot, venue } = {}, { from } = {}) {
  if (!roadNetwork) {
    return { ok: false, message: "No road network imported for this coverage area." };
  }
  if (!Array.isArray(from) || from.length !== 2) {
    return { ok: false, message: "A [lat, lng] starting point is required." };
  }

  const allExits = (venue?.nodes || [])
    .filter((n) => (n.type === "gate" || n.type === "exit") && n.state !== "closed")
    .map((n) => ({ id: n.id, name: n.name || n.id, at: n.at }));

  if (!allExits.length) {
    return { ok: false, message: "Every gate is closed — there is no open exit to route to." };
  }
  // Prefer gates that can still take people; avoid streets through danger zones.
  const exits = openExitsByLoad(allExits, snapshot, venue);

  const congestion = congestionIndex(roadNetwork, snapshot);
  const extraCostBySegmentId = dangerSegmentPenalties(roadNetwork, snapshot);
  const res = safestRoadExits(roadNetwork, congestion, from, exits, { extraCostBySegmentId });
  if (!res.ok) return res;

  return {
    ok: true,
    recommended: {
      exit: res.best.exitName,
      lengthM: res.best.lengthM,
      etaSec: res.best.etaSec,
      worstDensity: res.best.worstDensity,
      roads: res.best.namedRoads,
      directions: res.best.directions,
    },
    alternatives: res.options.slice(1).map((o) => ({
      exit: o.exitName,
      lengthM: o.lengthM,
      worstDensity: o.worstDensity,
      roads: o.namedRoads,
    })),
    note: "Split the crowd across these options rather than sending everyone down the best one.",
  };
}

/* ------------------------------------------------------------------ *
 * Tool schemas
 * ------------------------------------------------------------------ */

export const SPATIAL_TOOL_SPECS = [
  {
    type: "function",
    function: {
      name: "get_coverage_summary",
      description:
        "The area you are responsible for: its size, the crowd inside it, how many people are reporting just outside it, and whether the real street network has been imported. Call this first if you do not know the ground.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_roads",
      description:
        "Every real street inside the coverage area with its width, pedestrian capacity per minute and current load. Use it to find a road with spare capacity.",
      parameters: {
        type: "object",
        properties: {
          namedOnly: {
            type: "boolean",
            description: "Default true. Set false to include unnamed lanes and footpaths.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_road_congestion",
      description:
        "The most crowded real streets right now, worst first, with density, head count and pace. Only streets with live readings are ranked.",
      parameters: {
        type: "object",
        properties: { n: { type: "integer", description: "How many to return (default 6).", minimum: 1 } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_crowd_clusters",
      description:
        "The tracked bodies of people inside the coverage area (K1, K2 …) with head count, density, pace, direction, growth per minute and which street each is on. Two large clusters closing on each other is a crush precursor.",
      parameters: {
        type: "object",
        properties: { n: { type: "integer", description: "How many clusters (default 8).", minimum: 1 } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_road_route",
      description:
        "Route people between two places along REAL streets, avoiding roads that are currently crowded. Returns named turn-by-turn directions you can broadcast. `from`/`to` accept a junction id, a street name, a gate or zone id/name, or [lat, lng].",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start: junction id, street name, gate/zone id or name." },
          to: { type: "string", description: "Destination: junction id, street name, gate/zone id or name." },
        },
        required: ["from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_road_exits",
      description:
        "Safest ways out over real streets from a point to the open gates, ranked so the crowd can be split across several exits instead of all sent one way.",
      parameters: {
        type: "object",
        properties: {
          lat: { type: "number", description: "Latitude of the crowd to move." },
          lng: { type: "number", description: "Longitude of the crowd to move." },
        },
        required: ["lat", "lng"],
      },
    },
  },
];

const SPATIAL_TOOL_NAMES = new Set(SPATIAL_TOOL_SPECS.map((t) => t.function.name));
export const isSpatialTool = (name) => SPATIAL_TOOL_NAMES.has(name);

/**
 * Dispatch one spatial tool call.
 * @param {string} name
 * @param {Object} args   model-supplied arguments
 * @param {{ venue:Object, snapshot:Object, roadNetwork:Object }} ctx
 */
export async function runSpatialTool(name, args = {}, ctx = {}) {
  try {
    switch (name) {
      case "get_coverage_summary":
        return getCoverageSummary(ctx);
      case "list_roads":
        return listRoads(ctx, { namedOnly: args?.namedOnly !== false });
      case "get_road_congestion":
        return getRoadCongestion(ctx, { n: args?.n ?? 6 });
      case "get_crowd_clusters":
        return getCrowdClusters(ctx, { n: args?.n ?? 8 });
      case "find_road_route":
        return findRoadRoute(ctx, { from: args?.from, to: args?.to });
      case "find_road_exits":
        return findRoadExits(ctx, {
          from: [Number(args?.lat), Number(args?.lng)],
        });
      default:
        return { error: `Unknown spatial tool '${name}'.` };
    }
  } catch (err) {
    return { error: String(err?.message || err) };
  }
}
