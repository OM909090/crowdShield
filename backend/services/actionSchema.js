/**
 * actionSchema — the structured "verbs" the Tier 2 agent is allowed to emit,
 * and the validator that keeps them honest.
 *
 * The agent never acts directly. It proposes a small JSON envelope of actions;
 * the orchestrator validates them against the real Venue graph (this file),
 * then routes each one by class:
 *   • advisory      — visualisation / recommendation only (highlight a zone,
 *                     draw a route, point a camera). Safe to apply immediately.
 *   • consequential — changes the physical operating picture (open a gate,
 *                     move units, broadcast to the crowd). Requires human
 *                     sign-off before it takes effect.
 *
 * Splitting the vocabulary this way is what lets the system be helpful without
 * ever being unsafe: an hallucinated "open Gate 9" is rejected here because
 * Gate 9 isn't in the graph, and even a valid gate-open waits for a human.
 */
import { resolvePlace } from "./roadRouter.js";

/**
 * The action vocabulary. For each type:
 *   klass    — "advisory" | "consequential"
 *   required — fields that MUST be present (also the ids we range-check).
 */
export const ACTION_TYPES = {
  // ---- Advisory: safe, reversible, visual ----
  highlight_zone: { klass: "advisory", required: ["zoneId"] },
  draw_route: { klass: "advisory", required: ["fromNodeId", "toNodeId"] },
  set_camera: { klass: "advisory", required: ["zoneId"] },
  set_routing_policy: { klass: "advisory", required: ["edgeId", "direction"] },
  /**
   * Move a crowd along the REAL streets.
   *
   * `draw_route` can only speak in venue node ids, which is fine for a corridor
   * an authority drew and useless for telling several thousand people where to
   * walk. This verb takes places by the names people use — a zone, a gate, or an
   * actual street — and the server resolves it into named turn-by-turn
   * directions over the imported OSM network, avoiding roads that are currently
   * crowded. Advisory because it recommends a path; it moves no barrier and
   * changes no gate.
   */
  direct_crowd: { klass: "advisory", required: ["from", "to"] },
  /**
   * Draw a danger area on the map around a LIVE tracked crowd (K1, K2 … from the
   * brief's CROWDS list) when it is dense/dangerous and no authored zone covers
   * it. This is how the agent marks risk on an event where the operator never
   * drew zones — it flags the ground the crowd is actually standing on. Advisory:
   * it only outlines an area, it moves nobody and changes no gate.
   */
  flag_area: { klass: "advisory", required: ["clusterId"] },
  /**
   * Recommend the authority physically place a barricade to hold back or split a
   * flow, at a corridor (edgeId) or a point (nodeId) from the venue graph. It
   * points at the spot and gives the reason; a human puts the barrier there — so
   * it is advisory (a suggestion on the map), not a consequential state change.
   */
  suggest_barricade: { klass: "advisory", required: ["reason"] },

  // ---- Consequential: changes reality, needs human sign-off ----
  open_gate: { klass: "consequential", required: ["gateId"] },
  close_gate: { klass: "consequential", required: ["gateId"] },
  deploy_units: { klass: "consequential", required: ["from", "count", "to"] },
  broadcast_alert: { klass: "consequential", required: ["message"] },
};

/** Legal directions for a routing-policy change (mirrors the Venue edge enum). */
const EDGE_DIRECTIONS = new Set(["bi", "oneway_forward", "oneway_reverse"]);

/**
 * Classify an action by its type.
 * @returns {"advisory"|"consequential"|"unknown"}
 */
export function classifyAction(action) {
  return ACTION_TYPES[action?.type]?.klass || "unknown";
}

/** Return a human-readable reason the action is invalid, or null if it's fine. */
function invalidReason(action, refs) {
  if (!action || typeof action !== "object") return "action is not an object";

  const spec = ACTION_TYPES[action.type];
  if (!spec) return `unknown action type '${action?.type}'`;

  // 1) Required fields must be present and non-empty.
  for (const field of spec.required) {
    const v = action[field];
    if (v === undefined || v === null || v === "") return `missing required field '${field}'`;
  }

  // 2) Any referenced id must exist in the venue graph (no inventing gates).
  const { zoneIds, nodeIds, gateIds, edgeIds } = refs;
  switch (action.type) {
    case "highlight_zone":
    case "set_camera":
      if (!zoneIds.has(action.zoneId)) return `unknown zoneId '${action.zoneId}'`;
      break;

    case "draw_route":
      if (!nodeIds.has(action.fromNodeId)) return `unknown fromNodeId '${action.fromNodeId}'`;
      if (!nodeIds.has(action.toNodeId)) return `unknown toNodeId '${action.toNodeId}'`;
      break;

    case "direct_crowd": {
      // Both ends must resolve against the real network or the venue. An
      // invented street name is rejected here rather than turning into a route
      // that leads a crowd somewhere that does not exist.
      if (!refs.roadNetwork) {
        return "no street network has been imported for this event, so a street route cannot be validated";
      }
      const start = resolvePlace(refs.roadNetwork, refs.venue, action.from);
      if (start.error) return `from: ${start.error}`;
      const end = resolvePlace(refs.roadNetwork, refs.venue, action.to);
      if (end.error) return `to: ${end.error}`;
      if (start.id === end.id) return "from and to resolve to the same place";
      break;
    }

    case "set_routing_policy":
      if (!edgeIds.has(action.edgeId)) return `unknown edgeId '${action.edgeId}'`;
      if (!EDGE_DIRECTIONS.has(action.direction)) return `invalid direction '${action.direction}'`;
      break;

    case "flag_area":
      // Must name a crowd the tracker is actually holding, so the drawn area
      // sits on real people rather than a hallucinated id.
      if (!refs.clusterIds.has(action.clusterId)) {
        return `unknown clusterId '${action.clusterId}' (must be a live crowd from the CROWDS list, e.g. K1)`;
      }
      break;

    case "suggest_barricade": {
      // A barricade goes on a corridor or a point; at least one must be given and
      // must exist in the graph.
      const hasEdge = action.edgeId !== undefined && action.edgeId !== null && action.edgeId !== "";
      const hasNode = action.nodeId !== undefined && action.nodeId !== null && action.nodeId !== "";
      if (!hasEdge && !hasNode) {
        return "must reference an edgeId (corridor) or nodeId (point) where the barricade goes";
      }
      if (hasEdge && !edgeIds.has(action.edgeId)) return `unknown edgeId '${action.edgeId}'`;
      if (hasNode && !nodeIds.has(action.nodeId)) return `unknown nodeId '${action.nodeId}'`;
      break;
    }

    case "open_gate":
    case "close_gate":
      if (!gateIds.has(action.gateId)) {
        return `unknown gateId '${action.gateId}' (must be a node of type 'gate')`;
      }
      break;

    case "deploy_units":
      if (!Number.isInteger(action.count) || action.count <= 0) {
        return "count must be a positive integer";
      }
      break;

    case "broadcast_alert":
      if (typeof action.message !== "string" || !action.message.trim()) {
        return "message must be a non-empty string";
      }
      break;

    default:
      break;
  }

  return null;
}

/**
 * Validate a batch of proposed actions against a venue. Valid actions come back
 * with their `klass` attached (so the orchestrator can route them without a
 * second lookup); invalid ones come back with a reason for the audit log.
 *
 * @param {Array<Object>} actions
 * @param {Object} venue  the Venue graph (zones/nodes/edges)
 * @returns {{ valid: Array<Object>, invalid: Array<{action:Object, reason:string}> }}
 */
export function validateActions(actions = [], venue = {}, { roadNetwork = null, clusters = [] } = {}) {
  const refs = {
    zoneIds: new Set((venue.zones || []).map((z) => z.id)),
    nodeIds: new Set((venue.nodes || []).map((n) => n.id)),
    gateIds: new Set((venue.nodes || []).filter((n) => n.type === "gate").map((n) => n.id)),
    edgeIds: new Set((venue.edges || []).map((e) => e.id)),
    // Live tracked crowds (K1, K2 …) so flag_area can be validated against a real
    // body of people rather than an invented id.
    clusterIds: new Set((clusters || []).map((k) => k.id)),
    venue,
    roadNetwork,
  };

  const valid = [];
  const invalid = [];

  for (const action of Array.isArray(actions) ? actions : []) {
    const reason = invalidReason(action, refs);
    if (reason) invalid.push({ action, reason });
    else valid.push({ ...action, klass: ACTION_TYPES[action.type].klass });
  }

  return { valid, invalid };
}

/**
 * The exact JSON envelope the model must emit. Injected into the system prompt
 * by the orchestrator so the contract lives in one place.
 */
export const ACTION_SCHEMA_PROMPT = `You must reply with a single JSON object and nothing else:

{
  "severity": "low" | "medium" | "high" | "critical",
  "reasoning": "one or two sentences explaining the decision",
  "actions": [ { "type": "<action_type>", ...fields } ]
}

Allowed action types and their fields:

ADVISORY (applied immediately, no human sign-off):
  - highlight_zone     { "zoneId": string }
  - draw_route         { "fromNodeId": string, "toNodeId": string }
  - set_camera         { "zoneId": string }
  - set_routing_policy { "edgeId": string, "direction": "bi" | "oneway_forward" | "oneway_reverse" }
  - direct_crowd       { "from": string, "to": string }
        Send a crowd along REAL streets. "from"/"to" may be a zone name/id, a
        gate name/id, or an actual street name from the brief's STREETS list.
        The server turns it into named turn-by-turn directions over the real road
        network, avoiding streets that are currently crowded. This is how you tell
        thousands of people which way to walk — prefer it over draw_route when a
        street network is available.
  - flag_area          { "clusterId": string, "severity"?: "low"|"medium"|"high"|"critical", "reason"?: string }
        Draw a danger area on the map around a LIVE crowd (a K-id from the CROWDS
        list) when it is dense or dangerous and no authored zone covers it. This
        is how you mark risk on an event with no zones drawn — flag the crowd that
        is actually there.
  - suggest_barricade  { "edgeId"?: string, "nodeId"?: string, "reason": string }
        Recommend the authority place a physical barricade at a corridor (edgeId)
        or point (nodeId) from ASSETS, to hold back or split a flow. Use it to
        pin the exact spot a barrier would relieve pressure.

CONSEQUENTIAL (queued for human sign-off before taking effect):
  - open_gate          { "gateId": string }
  - close_gate         { "gateId": string }
  - deploy_units       { "from": string, "count": integer > 0, "to": string }
  - broadcast_alert    { "message": string, "cohorts"?: string[], "languages"?: string[] }

Rules:
  - Only reference zone/node/gate/edge ids that appear in the provided brief.
  - Prefer the pre-computed CANDIDATES; do not invent ids.
  - Emit an empty "actions" array if no action is warranted.`;
