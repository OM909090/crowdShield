/**
 * agentTools — the Tier 2 LLM agent's "hands and eyes".
 *
 * These are the PURE, deterministic building blocks the orchestrator lets the
 * model call. Every tool reads only from data passed in — a live Venue graph
 * and a Situation Snapshot — and never touches the DB, the network or the LLM.
 * That keeps them cheap to unit-test and impossible to misuse for side effects:
 * a tool call can *look*, and can *estimate*, but it can never *act*. Acting is
 * the orchestrator's job, gated behind the action schema + human sign-off.
 *
 * Two surfaces are exported:
 *   • individual pure functions (get_top_risks, find_safest_route, …) — usable
 *     directly by the brief builder and tests, and
 *   • TOOL_SPECS + runTool() — the OpenAI-compatible tool schema and a single
 *     dispatcher the orchestrator wires to the chat loop.
 *
 * Coordinates are [lat, lng] (Leaflet order) throughout, matching the venue.
 */
import { buildGraph, kSafestRoutes } from "./router.js";
import { pointInPolygon } from "../utils/geo.js";

/** Honest disclaimer stamped on every what-if — these are not simulations. */
const HEURISTIC_CAVEAT = "heuristic estimate, not a full simulation";

/** k / alpha for tool-driven routing — same tuning the guidance layer uses. */
const ROUTE_OPTS = { k: 3, alpha: 3 };

const round2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;

/**
 * Map a 0..1 route risk score to the shared level vocabulary. Mirrors the
 * thresholds in guidance.js so a "HIGH" route means the same thing everywhere.
 */
function routeRiskLevel(score = 0) {
  if (score >= 0.68) return "HIGH";
  if (score >= 0.5) return "ELEVATED";
  if (score >= 0.3) return "WATCH";
  return "NORMAL";
}

/** zoneId -> { risk } the router understands, tolerant of un-decorated zones. */
function zoneRiskMap(snapshot) {
  const m = new Map();
  for (const z of snapshot?.zones || []) m.set(z.id, { risk: z.risk ?? 0 });
  return m;
}

/** The snapshot zone carrying the highest risk, or null. */
function worstZone(snapshot) {
  let worst = null;
  for (const z of snapshot?.zones || []) {
    if (!worst || (z.risk ?? 0) > (worst.risk ?? 0)) worst = z;
  }
  return worst;
}

/** The venue zone whose polygon contains `point` (first match), or null. */
function zoneContaining(venue, point) {
  if (!point) return null;
  for (const z of venue?.zones || []) {
    if (z.polygon && pointInPolygon(point, z.polygon)) return z;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Tools — pure reads over { venue, snapshot }
 * ------------------------------------------------------------------ */

/**
 * The worst `n` zones, worst-first, plus a one-line rollup of the remainder so
 * the model sees "and everything else is fine" without paying for every zone.
 * @returns {{ top: Array<{id,name,risk,riskLevel,etaCriticalSec,factors}>, rollup: string }}
 */
export function getTopRisks(snapshot, n = 5) {
  const zones = snapshot?.zones || [];
  // The snapshot is already worst-first, but sort defensively so this tool is
  // correct even if handed a raw zone list.
  const sorted = [...zones].sort(
    (a, b) => (b.risk ?? -1) - (a.risk ?? -1) || (b.density ?? 0) - (a.density ?? 0)
  );

  const top = sorted.slice(0, n).map((z) => ({
    id: z.id,
    name: z.name,
    risk: round2(z.risk ?? 0),
    riskLevel: z.riskLevel || "NORMAL",
    etaCriticalSec: z.forecast?.etaCriticalSec ?? null,
    factors: z.riskFactors || null,
  }));

  const remaining = sorted.slice(n);
  const lowCount = remaining.filter((z) => (z.risk ?? 0) < 0.4).length;
  let rollup = "";
  if (remaining.length) {
    rollup =
      lowCount === remaining.length
        ? `${remaining.length} more zones below 0.4`
        : `${remaining.length} more zones (${lowCount} below 0.4)`;
  }

  return { top, rollup };
}

/** The full decorated zone object for `zoneId`, or null. */
export function getZone(snapshot, zoneId) {
  return (snapshot?.zones || []).find((z) => z.id === zoneId) || null;
}

/** Operational state of every gate node. */
export function getGateStatus(venue) {
  return (venue?.nodes || [])
    .filter((n) => n.type === "gate")
    .map((n) => ({
      id: n.id,
      name: n.name || n.id,
      state: n.state || "open",
      throughputPerMin: n.throughputPerMin ?? 0,
    }));
}

/**
 * A compact roll-up of the venue's fixed assets — the denominators the model
 * needs to reason about capacity ("1 of 3 gates open").
 * `openGates` counts anything not `closed`, since an exit_only / entry_only
 * gate is still physically moving people.
 */
export function getVenueSummary(venue) {
  const nodes = venue?.nodes || [];
  const edges = venue?.edges || [];
  const gates = nodes.filter((n) => n.type === "gate");
  return {
    aorAreaM2: venue?.aor?.areaM2 || 0,
    zones: (venue?.zones || []).length,
    nodes: nodes.length,
    gates: gates.length,
    openGates: gates.filter((g) => (g.state || "open") !== "closed").length,
    blockedEdges: edges.filter((e) => e.state === "blocked").length,
    destinations: nodes
      .filter((n) => n.isDestination && n.state !== "closed")
      .map((n) => ({ id: n.id, name: n.name || n.id, type: n.type })),
  };
}

/** Active (unresolved) alerts travelling with the snapshot. */
export function getActiveAlerts(snapshot) {
  return snapshot?.activeAlerts || [];
}

/**
 * The safest risk-aware route between two named nodes, plus how many genuinely
 * different alternatives exist. Returns `{ ok:false, message }` when the graph
 * can't honour the request — the model must never invent a path.
 *
 * @returns {{ ok:boolean, route?:{waypoints,lengthM,etaSec,riskLevel}, alternatives?:number, message?:string }}
 */
export function findSafestRoute(venue, snapshot, { fromNodeId, toNodeId } = {}) {
  if (!fromNodeId || !toNodeId) {
    return { ok: false, message: "fromNodeId and toNodeId are both required." };
  }
  const graph = buildGraph(venue);
  if (!graph.nodePos.size) {
    return { ok: false, message: "This venue has no routable graph." };
  }
  if (!graph.nodePos.has(fromNodeId)) {
    return { ok: false, message: `Unknown start node '${fromNodeId}'.` };
  }
  if (!graph.nodePos.has(toNodeId)) {
    return { ok: false, message: `Unknown destination node '${toNodeId}'.` };
  }

  const routes = kSafestRoutes(venue, fromNodeId, toNodeId, zoneRiskMap(snapshot), ROUTE_OPTS);
  if (!routes.length) {
    return { ok: false, message: `No open route from ${fromNodeId} to ${toNodeId}.` };
  }

  const [best, ...rest] = routes;
  return {
    ok: true,
    route: {
      waypoints: best.waypoints,
      lengthM: best.lengthM,
      etaSec: best.etaSec,
      riskLevel: routeRiskLevel(best.riskScore),
    },
    alternatives: rest.length,
  };
}

/* ------------------------------------------------------------------ *
 * What-if — honest, clearly-bounded heuristics (never claims precision)
 * ------------------------------------------------------------------ */

function simulateOpenGate(venue, snapshot, action) {
  const gate = (venue?.nodes || []).find((n) => n.id === action?.gateId && n.type === "gate");
  if (!gate) {
    return { estimate: `No gate '${action?.gateId}' in this venue.`, caveat: HEURISTIC_CAVEAT };
  }
  const added = gate.throughputPerMin ?? 0;

  // The zone the gate physically sits in is the one it relieves first; fall
  // back to the worst zone overall so the answer is still useful.
  const vZone = zoneContaining(venue, gate.at);
  const sZone = vZone ? getZone(snapshot, vZone.id) : worstZone(snapshot);
  const relief = sZone
    ? `likely relieves ${sZone.name} (risk ${round2(sZone.risk ?? 0)} ${sZone.riskLevel || "NORMAL"})`
    : "no clearly adjacent at-risk zone to relieve";

  return {
    estimate: `Opening ${gate.name || gate.id} adds ~${added} persons/min of throughput; ${relief}.`,
    deltaThroughputPerMin: added,
    caveat: HEURISTIC_CAVEAT,
  };
}

function simulateMakeOneway(venue, action) {
  const edge = (venue?.edges || []).find((e) => e.id === action?.edgeId);
  if (!edge) {
    return { estimate: `No edge '${action?.edgeId}' in this venue.`, caveat: HEURISTIC_CAVEAT };
  }
  // Removing counter-flow on a corridor recovers roughly a third of effective
  // outflow — a rule-of-thumb, hence the caveat.
  const base = edge.capacityPerMin ?? 0;
  const delta = Math.round(base * 0.3);
  return {
    estimate: `Making ${edge.id} one-way removes counter-flow for ~+30% effective outflow (about +${delta} persons/min over a base of ${base}).`,
    deltaThroughputPerMin: delta,
    caveat: HEURISTIC_CAVEAT,
  };
}

/**
 * A back-of-envelope "what would this buy us?" for a proposed intervention.
 * Supports open_gate and make_oneway; anything else returns an honest "no
 * heuristic" rather than a fabricated number.
 * @returns {{ estimate:string, deltaThroughputPerMin?:number, caveat:string }}
 */
export function simulateIntervention(venue, snapshot, action = {}) {
  switch (action?.type) {
    case "open_gate":
      return simulateOpenGate(venue, snapshot, action);
    case "make_oneway":
      return simulateMakeOneway(venue, action);
    default:
      return {
        estimate: `No what-if heuristic for intervention '${action?.type}'.`,
        caveat: HEURISTIC_CAVEAT,
      };
  }
}

/* ------------------------------------------------------------------ *
 * OpenAI-compatible tool schemas + dispatcher
 * ------------------------------------------------------------------ */

/**
 * Function/tool schemas the orchestrator passes to the model. Names are the
 * stable contract — runTool() dispatches on exactly these strings.
 */
export const TOOL_SPECS = [
  {
    type: "function",
    function: {
      name: "get_top_risks",
      description:
        "List the highest-risk zones right now (worst first) with risk score, level and time-to-critical, plus a rollup of the rest.",
      parameters: {
        type: "object",
        properties: {
          n: { type: "integer", description: "How many top zones to return (default 5).", minimum: 1 },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_zone",
      description: "Get the full live state of one zone by id (density, risk, level, forecast, factors).",
      parameters: {
        type: "object",
        properties: { zoneId: { type: "string", description: "The zone id, e.g. 'Z1'." } },
        required: ["zoneId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_gate_status",
      description: "List every gate with its open/closed state and throughput (persons/min).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_venue_summary",
      description:
        "Roll-up of fixed assets: AoR area, zone/node/gate counts, open gates, blocked edges and available destinations.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_active_alerts",
      description: "List the currently active (unresolved) Tier-1 alerts.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "find_safest_route",
      description:
        "Compute the safest risk-aware walking route between two venue nodes, with an alternatives count. Returns ok:false if unroutable.",
      parameters: {
        type: "object",
        properties: {
          fromNodeId: { type: "string", description: "Start node id." },
          toNodeId: { type: "string", description: "Destination node id." },
        },
        required: ["fromNodeId", "toNodeId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "simulate_intervention",
      description:
        "Rough what-if for a proposed intervention (open_gate or make_oneway). Returns an estimate and a caveat; NOT a precise simulation.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["open_gate", "make_oneway"], description: "Intervention kind." },
          gateId: { type: "string", description: "Gate id (for open_gate)." },
          edgeId: { type: "string", description: "Edge id (for make_oneway)." },
        },
        required: ["type"],
      },
    },
  },
];

/**
 * Dispatch a single tool call by name against `ctx = { venue, snapshot }`.
 * Async so a future tool can await I/O without changing this contract.
 * Returns a compact, JSON-serialisable object; on unknown tool or bad args it
 * returns `{ error }` rather than throwing, so the model can recover.
 *
 * @param {string} name  one of the TOOL_SPECS names
 * @param {Object} args  the model-supplied arguments
 * @param {{ venue:Object, snapshot:Object }} ctx
 */
export async function runTool(name, args = {}, ctx = {}) {
  const { venue, snapshot } = ctx;
  try {
    switch (name) {
      case "get_top_risks":
        return getTopRisks(snapshot, args?.n ?? 5);
      case "get_zone": {
        const zone = getZone(snapshot, args?.zoneId);
        return zone || { error: `Zone '${args?.zoneId}' not found.` };
      }
      case "get_gate_status":
        return getGateStatus(venue);
      case "get_venue_summary":
        return getVenueSummary(venue);
      case "get_active_alerts":
        return getActiveAlerts(snapshot);
      case "find_safest_route":
        return findSafestRoute(venue, snapshot, {
          fromNodeId: args?.fromNodeId,
          toNodeId: args?.toNodeId,
        });
      case "simulate_intervention":
        // Accept either a nested { action } or the flat tool args as the action.
        return simulateIntervention(venue, snapshot, args?.action ? args.action : args);
      default:
        return { error: `Unknown tool '${name}'.` };
    }
  } catch (err) {
    return { error: String(err?.message || err) };
  }
}
