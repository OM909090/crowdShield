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
  /**
   * `set_camera` used to live here. It was removed because this platform has no
   * cameras — the brief tells the model exactly that ("there are no cameras,
   * drones or fixed sensors to switch on"), and yet the vocabulary invited it to
   * point one. A live test caught the agent spending two of its actions on
   * "focus camera on zone", which an operator can neither act on nor verify.
   * An action the system cannot perform is worse than a missing one: it looks
   * like something happened.
   */
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
  /**
   * Ask the authority to physically PLACE something — marshals, a medical tent, a
   * water point, a barricade, exit signage — at a spot that is anchored to a real
   * thing on the map (a live crowd, a gate, a corridor, a zone). The agent never
   * supplies coordinates; the server resolves the anchor to a point, so a
   * suggestion can never land on invented ground. Advisory: it drops a pin and a
   * reason on the map and asks a human to act.
   */
  suggest_placement: { klass: "advisory", required: ["kind", "reason"] },

  // ---- Consequential: changes reality, needs human sign-off ----
  open_gate: { klass: "consequential", required: ["gateId"] },
  close_gate: { klass: "consequential", required: ["gateId"] },
  deploy_units: { klass: "consequential", required: ["from", "count", "to"] },
  broadcast_alert: { klass: "consequential", required: ["message"] },
};

/** Legal directions for a routing-policy change (mirrors the Venue edge enum). */
const EDGE_DIRECTIONS = new Set(["bi", "oneway_forward", "oneway_reverse"]);

/** What the agent may ask an authority to physically place on the ground. */
export const PLACEMENT_KINDS = new Set([
  "marshals",
  "medical_tent",
  "barricade",
  "water_point",
  "exit_signage",
]);

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

    case "suggest_placement": {
      if (!PLACEMENT_KINDS.has(action.kind)) {
        return `unknown kind '${action.kind}' (one of: ${[...PLACEMENT_KINDS].join(", ")})`;
      }
      // Must be anchored to something real, so the server can resolve a point
      // rather than trusting a coordinate the model made up.
      const anchors = [
        action.clusterId && refs.clusterIds.has(action.clusterId),
        action.areaId && refs.dangerZoneIds.has(action.areaId),
        action.nodeId && refs.nodeIds.has(action.nodeId),
        action.edgeId && refs.edgeIds.has(action.edgeId),
        action.zoneId && refs.zoneIds.has(action.zoneId),
      ];
      const named = action.clusterId || action.areaId || action.nodeId || action.edgeId || action.zoneId;
      if (!named) {
        return "must anchor the placement to a clusterId (live crowd), areaId (danger area), nodeId, edgeId or zoneId";
      }
      if (!anchors.some(Boolean)) return `anchor '${named}' does not exist in the live picture`;
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
      // zoneIds is optional, but if given it must be an array — the individual
      // ids are sanitised (unknown ones dropped) in validateActions rather than
      // failing the whole alert, because a warning that names one stale id is
      // still worth sending to the zones that do exist.
      if (action.zoneIds !== undefined && !Array.isArray(action.zoneIds)) {
        return "zoneIds must be an array of zone ids when provided";
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
export function validateActions(
  actions = [],
  venue = {},
  { roadNetwork = null, clusters = [], dangerZones = [] } = {}
) {
  const refs = {
    zoneIds: new Set((venue.zones || []).map((z) => z.id)),
    // Live danger pockets (dz-…) are legitimate alert targets too. Without this,
    // an event whose operator never drew a zone had NOTHING an alert could be
    // aimed at, so every warning stayed unsent and no citizen was ever told.
    dangerZoneIds: new Set((dangerZones || []).map((d) => d.id)),
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
    if (reason) {
      invalid.push({ action, reason });
      continue;
    }
    const clean = { ...action, klass: ACTION_TYPES[action.type].klass };
    // Keep only zone ids that really exist, so a targeted broadcast can never
    // aim at an invented zone (and an all-invalid list collapses to untargeted,
    // which then correctly falls back to needing human sign-off).
    if (clean.type === "broadcast_alert" && Array.isArray(clean.zoneIds)) {
      // An alert may target an authored zone, a live danger pocket, or a tracked
      // crowd — anything that resolves to real ground with real people on it.
      clean.zoneIds = clean.zoneIds.filter(
        (id) => refs.zoneIds.has(id) || refs.dangerZoneIds.has(id) || refs.clusterIds.has(id)
      );
    }
    valid.push(clean);
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
  - suggest_placement  { "kind": "marshals"|"medical_tent"|"barricade"|"water_point"|"exit_signage",
                         "reason": string,
                         "clusterId"?: string, "areaId"?: string, "nodeId"?: string, "edgeId"?: string, "zoneId"?: string }
        Ask the authority to PLACE something on the ground where it is needed:
        marshals to hold and split a packed flow, a medical tent where people are
        collapsing or raising SOS, a water point, exit signage. Anchor it to a real
        id (a crowd K-id, a danger area dz-id, a gate/node, a corridor, a zone) —
        the server resolves the map position, so never give coordinates. This
        appears as a pin on the operator's map asking them to act.

CONSEQUENTIAL (queued for human sign-off before taking effect):
  - open_gate          { "gateId": string }
  - close_gate         { "gateId": string }
  - deploy_units       { "from": string, "count": integer > 0, "to": string }
  - broadcast_alert    { "message": string, "zoneIds"?: string[], "cohorts"?: string[], "languages"?: string[] }
        Warn the people in danger, in short, calm, directive words that name the
        threat and the way out. "zoneIds" TARGETS the alert at specific ground and
        accepts ANY of these ids:
          • an authored zone id from TOP RISKS / WHERE   (e.g. "ZC1")
          • a live danger area id from DANGER AREAS      (e.g. "dz-8b61a072…")
          • a tracked crowd id from CROWDS               (e.g. "K1")
        A TARGETED alert reaches those citizens IMMEDIATELY, with no human
        sign-off, whenever your severity is "high" or "critical" — a crush warning
        cannot wait for an approval click.
        Use the DANGER AREAS / CROWDS ids when no zones have been drawn — that is
        the only way those people get warned at all. Send ONE targeted alert PER
        dangerous area rather than a single vague one. An untargeted, venue-wide
        alert (no zoneIds) still waits for authority approval.

Rules:
  - Only reference zone/node/gate/edge ids that appear in the provided brief.
  - Prefer the pre-computed CANDIDATES; do not invent ids.
  - Emit an empty "actions" array if no action is warranted.`;
