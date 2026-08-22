/**
 * agent — the Tier 2 "Decision & Coordination Agent".
 *
 * This is the reasoning layer that sleeps until Tier 1 (the deterministic
 * predictor) says something meaningful changed, then wakes, looks at the live
 * situation through read-only tools, and PROPOSES a small set of actions. It
 * never touches individuals and never executes consequential actions itself —
 * advisory actions auto-apply, consequential ones wait for a human (see
 * actionSchema.js + agent.controller.js).
 *
 * Two entry points:
 *   • runAgentCycle(...)  — one reasoning pass (used by the manual "run now"
 *     endpoint and by the autonomous wake).
 *   • initAgent()         — subscribe to the alert bus so escalations wake the
 *     agent automatically (with cooldown/dedupe so it never storms).
 *
 * Safety-critical prediction (Tier 0/1) NEVER depends on this layer: if no LLM
 * provider is configured or it's unreachable, the agent quietly no-ops and the
 * rest of the system keeps working.
 */
import Event from "../models/Event.js";
import Venue from "../models/Venue.js";
import AgentProposal from "../models/AgentProposal.js";
import { buildSnapshot } from "./snapshot.js";
import { buildBrief } from "./agentBrief.js";
import { TOOL_SPECS, runTool, findSafestRoute } from "./agentTools.js";
import { MAP_TOOL_SPECS, runMapTool, isMapTool } from "./agentMapTools.js";
import { SPATIAL_TOOL_SPECS, runSpatialTool, isSpatialTool } from "./agentSpatialTools.js";
import { resolvePlace, safestRoadRoute } from "./roadRouter.js";
import { sampleRoadCongestion } from "./roadCrowd.js";
import RoadNetwork from "../models/RoadNetwork.js";
import { validateActions, ACTION_SCHEMA_PROMPT } from "./actionSchema.js";
import { tightPolygon } from "../utils/hull.js";
import { haversineMeters, centroid } from "../utils/geo.js";
import { dangerSegmentPenalties } from "./routeSafety.js";
import { chatStream, getActiveConfig, NoProviderError } from "./llmProvider.js";
import { alertBus } from "../realtime/alertBus.js";
import { getIO, roomName } from "../realtime/socket.js";
import { sendBroadcast } from "./broadcast.js";
import { detectDangerZones } from "./dangerZones.js";
import { broadcasterStatus } from "../realtime/broadcaster.js";

const MAX_TOOL_ITERS = 2; // tool rounds; the brief answers most questions already
const WAKE_COOLDOWN_MS = 90_000; // per-zone autonomous-wake suppression window
/**
 * Output cap for one decision.
 *
 * This was 500, which was too tight the moment a venue had more than one gate to
 * reason about: the model's JSON was cut mid-object, the envelope failed to
 * parse, and a decision to open a relief gate was silently lost. An envelope is
 * still small — this is headroom, not an invitation to write prose.
 */
const MAX_DECISION_TOKENS = 1200;

/**
 * Hard wall-clock budget for one reasoning pass.
 *
 * This is a safety system: a decision that arrives after the crush is worse than
 * no decision, and an operator clicking "run" must never watch a spinner for
 * minutes. When the budget expires we abort the upstream call and fall back to
 * whatever the model has already committed to (usually nothing), rather than
 * hanging the request.
 */
const REASONING_BUDGET_MS = 75_000;

/**
 * Choose the toolset for this pass.
 *
 * Every tool schema is re-sent on every round-trip, so the full set is not free:
 * measured at ~1,760 tokens of pure schema per call, which showed up directly as
 * latency once the spatial tools landed. A tool the agent cannot use in this
 * situation is pure cost.
 *
 * So: the venue tools are always there (the authority's graph is the inside-the-
 * fence truth). The spatial tools only exist once a street network has been
 * imported. And the external map tools are the FALLBACK for exactly that case —
 * geography we don't hold ourselves — so they drop out when we do hold it,
 * because `find_road_route` over our own imported graph is both faster and
 * risk-aware where a third-party router is neither.
 */
function toolsFor({ roadNetwork } = {}) {
  if (roadNetwork?.segments?.length) return [...TOOL_SPECS, ...SPATIAL_TOOL_SPECS];
  return [...TOOL_SPECS, ...MAP_TOOL_SPECS];
}

// `${eventId}:${zoneId}` -> last autonomous wake timestamp (dedupe/cooldown).
const lastWake = new Map();

// eventId -> timestamp a reasoning cycle last STARTED. There are now two wake
// sources (a hand-drawn zone escalating, and the broadcaster's crowd-condition
// trigger); they often describe the same moment, so this stops them from firing
// two inferences at once. A worsening situation (critical) bypasses it.
const lastCycleAt = new Map();
const MIN_CYCLE_GAP_MS = 15_000;

// `${eventId}:${sortedZoneIds}` -> last autonomous broadcast timestamp. A crush
// warning is sent to the at-risk zones the instant the agent decides it, with no
// human sign-off — but the same zones must not be re-blasted every cycle while
// the situation stays hot, so a targeted alert to a given set of zones is
// suppressed for this window after it fires.
const lastAutoBroadcast = new Map();
const AUTO_BROADCAST_COOLDOWN_MS = 60_000;

/**
 * The guardian's pulse, per event.
 *
 * An autonomous safety agent that works silently is indistinguishable from one
 * that has crashed — the operator's only evidence used to be whether a proposal
 * happened to appear. This is the heartbeat: what it is doing right now, when it
 * last reasoned, what it decided, and which areas it warned.
 */
const agentStatus = new Map();

export function getAgentStatus(eventId) {
  const key = String(eventId);
  return (
    agentStatus.get(key) || {
      phase: "watching",
      lastRunAt: null,
      severity: null,
      trigger: null,
      actions: 0,
      alertedAreas: [],
      dangerAreas: 0,
      model: null,
    }
  );
}

function publishStatus(eventId, patch) {
  const key = String(eventId);
  const next = { ...getAgentStatus(key), ...patch, at: Date.now() };
  agentStatus.set(key, next);
  const io = getIO();
  if (io) io.to(roomName(eventId)).emit("agent:status", { eventId: key, ...next });
  return next;
}

/**
 * Patrol cadence: how long the agent may go without looking, while an event is
 * live and phones are reporting.
 *
 * The threshold triggers only fire when something is already elevated, so on a
 * calm-but-filling venue the agent would simply sleep — and an operator watching
 * a rising crowd would see nothing from it for an hour. A patrol means it never
 * stops watching during the event: it re-reads the ground on this cadence even
 * when nothing has crossed a line yet, which is also how it catches a SECOND
 * pocket forming while the first is the one everybody is staring at.
 */
const PATROL_MS = 180_000;
const patrolTimers = new Map();

function claimCycle(eventId, bypass = false) {
  const key = String(eventId);
  const now = Date.now();
  const last = lastCycleAt.get(key) || 0;
  if (!bypass && now - last < MIN_CYCLE_GAP_MS) return false;
  lastCycleAt.set(key, now);
  return true;
}

const SYSTEM_PROMPT = `You are CrowdShield's crowd-safety command agent for a live mass-gathering event.
You are the reasoning layer: deterministic services SENSE and PREDICT; you DIAGNOSE and PROPOSE; a human authority AUTHORIZES consequential moves.
Operating principles:
- Absolute priority is preventing a crush/stampede. Turbulence + rising density is more dangerous than density alone.
- You may only reference zones, gates, nodes and edges that appear in the brief. Never invent ids.
- Never route people through a closed gate or a blocked/at-capacity corridor.
- Prefer spreading crowds across multiple routes over concentrating them; opening egress and holding inflow are high-leverage.
- Be decisive but conservative: propose the smallest set of actions that addresses the risk. If nothing is warranted, return an empty actions array.
- Trust the brief over any assumption: it is generated fresh from live sensors. If the brief says a zone is empty, it is empty, whatever an older alert claims.
- You can see the real ground, not just the authority's drawing. The brief's COVERAGE section is the boundary you are responsible for, CROWDS lists tracked bodies of people (K1, K2 …) with their size, pace, direction and growth, and STREETS lists actual road names with pedestrian capacity per minute and current load.
- Speak in the names people use. Say "move them onto Grand Road" or "the crowd on Kutcheri Road is stalling", not "zone Z1" — an instruction nobody can follow on the ground is not an instruction. Use \`find_road_route\` to get named turn-by-turn directions before you propose sending anyone anywhere, and \`find_road_exits\` to split a crowd across several ways out instead of funnelling everyone down one.
- "No readings" is not "clear". If a street or zone has no live data, say so and do not route a crowd down it as though you had checked.
- The brief ALREADY contains the top risks, time-to-critical, gate/asset status, the crowds, the streets and a list of pre-computed feasible actions. Answer directly from it. Only call a tool for something genuinely missing (a specific zone's detail, a route between two places, or a what-if estimate) — every tool call costs seconds a crowd may not have.

Who you protect, and in what order:
- Every risk has TWO audiences: the people standing in it, and the control room. Protect the people FIRST — a phone in a pocket can move its owner in seconds, while the room takes minutes to act.
- So for a crowd that is dense, converging, or forecast to cross a threshold, your FIRST actions are citizen-facing: a \`broadcast_alert\` that names the danger and the way out in short, calm, directive words, and a \`direct_crowd\` that pulls the people IN and APPROACHING that crowd toward the calmest open exit or a less-crowded street. Put these citizen actions before any command-side action.
- A \`broadcast_alert\` you set to "critical" AND scope with "zoneIds" (the zones the endangered people are standing in — take the ids from TOP RISKS / WHERE) is sent to those citizens IMMEDIATELY, with NO human approval, because a crush warning that waits is worthless. This is a real power: use it the moment a crush-class threat is present or imminent, target it tightly to the zones actually at risk, and word it for a frightened person. An alert with NO zoneIds is venue-wide and still waits for the authority, so never rely on that for an urgent, localised danger — target it.
- Flag EVERY dangerous crowd, not just the worst. If the CANDIDATES list offers several \`flag_area\` moves, and several crowds are genuinely dense or dangerous, propose a \`flag_area\` for each so the whole picture is marked on the map — a real danger left unflagged is a danger nobody was warned about.
- SWEEP THE WHOLE COVERAGE, every pass. The brief's DANGER AREAS section lists every pocket of dangerously packed ground that exists right now, and WHERE tells you where each one sits. Work through ALL of them, not just the biggest: send one targeted \`broadcast_alert\` per dangerous area, and say in your reasoning which areas you warned and which you judged safe. The second pocket — the one nobody is looking at — is the one that kills people.
- When no zones have been drawn, target your alerts at the DANGER AREAS ids (dz-…) or the CROWDS ids (K1, K2 …). Those people are reachable and they are the ones in danger; refusing to alert because the operator never authored a zone means nobody gets warned at all.
- Ask for physical help where it is needed, with \`suggest_placement\`: marshals to hold and split a packed flow, a medical tent where people are collapsing or raising SOS, a water point in a stalled queue, exit signage where people cannot see the way out. Anchor each one to a crowd, danger area, gate, corridor or zone — the map turns it into a pin the operator can act on immediately. Do this whenever a crowd is dense enough that words alone will not fix it.
- THEN propose the command-side moves for the authority to authorize — \`open_gate\` to add egress, \`close_gate\`/\`suggest_barricade\` to hold or split inflow, \`deploy_units\` for medical or marshals. Consequential moves wait for a human; the citizen alert and diversion should not wait.
- Act on prediction, not just the present. If a crowd's growth or two groups converging will make a place dangerous soon, alert and divert BEFORE it crosses the line — and say the time-to-critical when the brief gives it. Catching it early is the whole job.
- Name the specific crowd (its K-id) and the real place (a street or gate) in every alert, so a person on the ground can act on it. "Move away from Singhadwara Chokepoint toward Gate 1" — never "leave zone Z1".
- When a gate is at or near capacity, do not send more people to it: alert the crowd nearest that gate and divert them to the least-loaded open gate instead.
${ACTION_SCHEMA_PROMPT}`;

/** Extract the action envelope JSON from a model reply (tolerates prose/fences). */
function parseEnvelope(content) {
  if (!content || typeof content !== "string") return null;
  let s = content.trim();
  // Strip a leading ```json / ``` fence and a trailing ```.
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a === -1 || b === -1 || b < a) return null;
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch {
    return null;
  }
}

/**
 * Last-ditch read of a reply that was cut off mid-JSON, used ONLY to preserve
 * the model's wording in the audit trail.
 *
 * Deliberately never used to recover actions. Closing a truncated
 * `"gateId": "G` would yield the perfectly parseable but wrong gate "G", and a
 * `"count": 12` cut from `1200` cannot be detected at all. Guessing an
 * instruction that moves a crowd is not a trade this system makes — if the
 * envelope didn't arrive intact, the actions are gone and we say so.
 */
function salvageReasoning(content) {
  if (!content || typeof content !== "string") return "";
  const m = content.match(/"reasoning"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (!m) return "";
  try {
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return m[1];
  }
}

/**
 * Load the reasoning context for an event: the Event, its Venue graph, and a
 * fresh Situation Snapshot (which already carries Tier 1 risk when a live loop
 * is running for the event).
 */
export async function loadContext(eventId) {
  const event = await Event.findById(eventId);
  if (!event) return null;
  const venue = await Venue.findOne({ event: eventId });
  // The real streets inside the coverage area. Loaded once per pass and handed
  // to every tool, so the agent reasons about roads by name instead of guessing
  // at geometry it cannot see. Absent until an authority imports it — the tools
  // say so plainly rather than pretending the ground is empty.
  const [snapshot, roadNetwork] = await Promise.all([
    buildSnapshot(event, venue),
    RoadNetwork.findOne({ event: eventId }),
  ]);
  /**
   * The live danger pockets — every patch of ground where people are packed
   * dangerously, computed deterministically from this tick's cells.
   *
   * The map has drawn these all along, but the agent could never see them, which
   * is exactly why it kept reasoning about "the one big crowd" and missed a second
   * pocket building on the other side of the coverage. Now the same areas the
   * operator is looking at are in the agent's brief, with ids it can alert on.
   */
  const dangerZones = detectDangerZones(snapshot?.cells || []);
  return { event, venue, snapshot, roadNetwork, dangerZones };
}

/**
 * The tool-calling loop: hand the model the brief + tools, run any tool calls
 * against the live { venue, snapshot }, and feed results back until it returns
 * a final answer (or we hit the iteration cap).
 */
async function reason({ brief, venue, snapshot, roadNetwork }) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `${brief.text}\n\nDecide now. Reply with the JSON envelope only.` },
  ];
  let envelope = null;

  // One controller for the whole pass, so the budget covers every round-trip
  // (tool loops included) rather than resetting per call.
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), REASONING_BUDGET_MS);

  // Streamed on purpose, even though we only want the final answer: with a
  // non-streaming request the provider sends no response headers until
  // generation finishes, so a slow model (a local one, or a large hosted model
  // under load) trips Node's 300s headers timeout and the whole reasoning pass
  // fails with "fetch failed". Streaming delivers headers immediately, so the
  // agent works against fast and slow providers alike.
  const tools = toolsFor({ roadNetwork });
  const ask = () =>
    chatStream({
      messages,
      tools,
      temperature: 0.2,
      maxTokens: MAX_DECISION_TOKENS,
      signal: controller.signal,
      onDelta: () => {},
    });

  try {
    let result = await ask();

    let iters = 0;
    while (result.toolCalls?.length && iters < MAX_TOOL_ITERS) {
      // Echo the assistant's tool-call turn, then answer each call.
      messages.push({ role: "assistant", content: result.content || "", tool_calls: result.toolCalls });

      // Tools are independent reads, so run a batch concurrently instead of
      // serially — a model asking for three zones shouldn't cost 3× the latency.
      const outputs = await Promise.all(
        result.toolCalls.map(async (tc) => {
          const name = tc.function?.name;
          let args = {};
          try {
            args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
          } catch {
            args = {};
          }
          const ctx = { venue, snapshot, roadNetwork };
          const out = isSpatialTool(name)
            ? await runSpatialTool(name, args, ctx)
            : isMapTool(name)
              ? await runMapTool(name, args, ctx)
              : await runTool(name, args, ctx);
          return { tool_call_id: tc.id, name, content: JSON.stringify(out) };
        })
      );
      for (const o of outputs) messages.push({ role: "tool", ...o });

      iters += 1;
      result = await ask();
    }

    envelope = parseEnvelope(result.content);

    // One corrective round-trip if the envelope didn't come back intact (cut off
    // mid-object, wrapped in prose, fenced oddly). Cheap next to losing the
    // decision, and it keeps the failure path for genuinely broken replies.
    if (!envelope) {
      messages.push({ role: "assistant", content: result.content || "" });
      messages.push({
        role: "user",
        content:
          "That reply was not valid JSON (it may have been cut off). Resend ONLY the envelope, " +
          "as one compact JSON object with keys severity, reasoning, actions. Keep reasoning under " +
          "40 words. No markdown, no code fence, no commentary.",
      });
      result = await ask();
      envelope = parseEnvelope(result.content);
    }

    return { ...result, envelope };
  } catch (err) {
    // Budget blown: report it as an operator-actionable timeout rather than a
    // generic failure, and never leave the caller hanging.
    if (controller.signal.aborted) {
      const e = new Error(
        `The model did not reach a decision within ${Math.round(REASONING_BUDGET_MS / 1000)}s. ` +
          "Try a faster model — a crowd-safety decision has to arrive in seconds."
      );
      e.code = "PROVIDER_TIMEOUT";
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(deadline);
  }
}

/**
 * Enrich an outgoing action with the geometry a map needs to DRAW it.
 *
 * The action schema deliberately carries only symbolic ids (`draw_route` says
 * "N1 -> N2"), because ids are what we can validate against the venue graph.
 * But a client can't render an id — and drawing a straight line between two
 * nodes would be a lie, since the real path follows corridors. So we resolve the
 * route here, server-side, with the same risk-aware router the citizens get, and
 * attach real `waypoints`. Zone highlights get their polygon for the same reason.
 */
/** A closed [lat,lng] ring approximating a circle of `radiusM` around a centre. */
function circlePolygon(center, radiusM, points = 18) {
  const lat = center?.[0];
  const lng = center?.[1];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const R = 6378137; // earth radius, metres
  const d = Math.max(Number(radiusM) || 0, 20) / R;
  const latR = (lat * Math.PI) / 180;
  const ring = [];
  for (let i = 0; i < points; i += 1) {
    const brng = (2 * Math.PI * i) / points;
    const lat2 = Math.asin(Math.sin(latR) * Math.cos(d) + Math.cos(latR) * Math.sin(d) * Math.cos(brng));
    const lng2 =
      (lng * Math.PI) / 180 +
      Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(latR), Math.cos(d) - Math.sin(latR) * Math.sin(lat2));
    ring.push([(lat2 * 180) / Math.PI, (lng2 * 180) / Math.PI]);
  }
  if (ring.length) ring.push(ring[0]);
  return ring;
}

/**
 * Resolve an alert/placement target id to the ground it means.
 *
 * One id space, three sources: an authored zone, a live danger pocket, or a
 * tracked crowd. Returning the polygon (and a name a human recognises) is what
 * lets the operator's map show exactly WHICH areas the agent warned, instead of
 * an alert that exists only as text in a list.
 */
function resolveArea(id, venue, snapshot, dangerZones = []) {
  const zone = (venue?.zones || []).find((z) => z.id === id);
  if (zone?.polygon?.length >= 3) {
    return { id, name: zone.name || id, kind: "zone", polygon: zone.polygon, center: centroid(zone.polygon) };
  }
  const dz = (dangerZones || []).find((d) => d.id === id);
  if (dz?.polygon?.length >= 3) {
    return {
      id,
      name: `danger area (${dz.severity}, ~${dz.personsEst} people)`,
      kind: "danger",
      polygon: dz.polygon,
      center: dz.centroid || centroid(dz.polygon),
      personsEst: dz.personsEst,
      severity: dz.severity,
    };
  }
  const cluster = (snapshot?.clusters || []).find((k) => k.id === id);
  if (cluster?.centroid) {
    return {
      id,
      name: `crowd ${id} (~${cluster.personsEst} people)`,
      kind: "crowd",
      polygon: circlePolygon(cluster.centroid, Math.min(cluster.radiusM || 60, 120)),
      center: cluster.centroid,
      personsEst: cluster.personsEst,
    };
  }
  return null;
}

export function withGeometry(action, venue, snapshot, roadNetwork = null, dangerZones = []) {
  if (!action || !venue) return action;

  // A placement suggestion becomes a pin the operator can act on: resolve the
  // anchor the agent named into an actual coordinate. Coordinates are never taken
  // from the model, so a suggestion cannot land on ground that does not exist.
  if (action.type === "suggest_placement") {
    let at = null;
    let targetName = null;
    if (action.clusterId) {
      const k = (snapshot?.clusters || []).find((c) => c.id === action.clusterId);
      if (k?.centroid) {
        at = k.centroid;
        targetName = `crowd ${k.id} (~${k.personsEst} people)`;
      }
    }
    if (!at && action.areaId) {
      const d = (dangerZones || []).find((x) => x.id === action.areaId);
      if (d?.centroid) {
        at = d.centroid;
        targetName = `danger area (~${d.personsEst} people)`;
      }
    }
    if (!at && action.nodeId) {
      const n = (venue.nodes || []).find((x) => x.id === action.nodeId);
      if (n?.at) {
        at = n.at;
        targetName = n.name || n.id;
      }
    }
    if (!at && action.edgeId) {
      const e = (venue.edges || []).find((x) => x.id === action.edgeId);
      const path = e?.path || [];
      if (path.length) {
        at = path[Math.floor(path.length / 2)];
        targetName = e.name || e.id;
      }
    }
    if (!at && action.zoneId) {
      const z = (venue.zones || []).find((x) => x.id === action.zoneId);
      if (z?.polygon?.length >= 3) {
        at = centroid(z.polygon);
        targetName = z.name || z.id;
      }
    }
    return at ? { ...action, at, targetName } : action;
  }

  // A targeted alert carries the polygons it was sent to, so the command map can
  // flag the exact areas the agent warned and the operator can SEE it working.
  if (action.type === "broadcast_alert" && Array.isArray(action.zoneIds) && action.zoneIds.length) {
    const areas = action.zoneIds
      .map((id) => resolveArea(id, venue, snapshot, dangerZones))
      .filter(Boolean);
    if (areas.length) return { ...action, areas };
    return action;
  }

  // A flagged danger area is drawn around the live crowd it names: resolve the
  // K-id to that crowd's footprint (centroid + radius) so the map has a polygon.
  if (action.type === "flag_area" && action.clusterId) {
    const cluster = (snapshot?.clusters || []).find((k) => k.id === action.clusterId);
    if (cluster?.centroid) {
      // Draw a TIGHT hull around the crowd's dense cells — the packed pocket, not
      // a radius circle that would sweep in empty ground (the old "whole map" bug).
      const reach = (cluster.radiusM || 60) + 30;
      const denseNear = (snapshot?.cells || []).filter(
        (c) =>
          Array.isArray(c.center) &&
          ["dense", "critical", "dangerous"].includes(c.level) &&
          haversineMeters(cluster.centroid, c.center) <= reach
      );
      let polygon = denseNear.length ? tightPolygon(denseNear.map((c) => c.center), 22) : null;
      // Fallback: a SMALL capped circle, never the crowd's full radius.
      if (!polygon || polygon.length < 3) {
        polygon = circlePolygon(cluster.centroid, Math.min(cluster.radiusM || 40, 60));
      }
      if (polygon) {
        return {
          ...action,
          polygon,
          center: cluster.centroid,
          personsEst: cluster.personsEst ?? null,
          density: cluster.density ?? null,
          level: cluster.level ?? null,
        };
      }
    }
    return action;
  }

  // A barricade suggestion resolves to a single point the map pins: the midpoint
  // of the named corridor, or the coordinate of the named node.
  if (action.type === "suggest_barricade") {
    if (action.edgeId) {
      const edge = (venue.edges || []).find((e) => e.id === action.edgeId);
      const path = edge?.path || [];
      if (path.length) {
        return { ...action, at: path[Math.floor(path.length / 2)], targetName: edge.name || edge.id };
      }
    }
    if (action.nodeId) {
      const node = (venue.nodes || []).find((n) => n.id === action.nodeId);
      if (node?.at) return { ...action, at: node.at, targetName: node.name || node.id };
    }
    return action;
  }

  // A street directive is symbolic until it is resolved: "ZC1 -> Grand Road" has
  // to become an actual path along real roads, avoiding the ones that are
  // crowded right now, before either a map or a loudspeaker can use it. Resolved
  // server-side with the same router the citizens get, so the authority and the
  // crowd are never given different streets.
  if (action.type === "direct_crowd" && roadNetwork) {
    const start = resolvePlace(roadNetwork, venue, action.from);
    const end = resolvePlace(roadNetwork, venue, action.to);
    if (start.error || end.error) return action;

    const congestion = new Map();
    for (const row of sampleRoadCongestion(roadNetwork, snapshot)) congestion.set(row.id, row);

    // Route the crowd AROUND live danger zones, not just off crowded streets.
    const extraCostBySegmentId = dangerSegmentPenalties(roadNetwork, snapshot);
    const res = safestRoadRoute(roadNetwork, congestion, start.id, end.id, { extraCostBySegmentId });
    if (!res.ok) return { ...action, unroutable: res.message };
    return {
      ...action,
      waypoints: res.route.waypoints,
      lengthM: res.route.lengthM,
      etaSec: res.route.etaSec,
      roads: res.route.namedRoads,
      directions: res.route.directions,
      worstDensity: res.route.worstDensity,
      measuredFraction: res.route.measuredFraction,
    };
  }

  if (action.type === "draw_route" && action.fromNodeId && action.toNodeId) {
    const res = findSafestRoute(venue, snapshot, {
      fromNodeId: action.fromNodeId,
      toNodeId: action.toNodeId,
    });
    if (res?.ok && res.route?.waypoints?.length) {
      return {
        ...action,
        waypoints: res.route.waypoints,
        lengthM: res.route.lengthM,
        etaSec: res.route.etaSec,
        riskLevel: res.route.riskLevel,
      };
    }
    return action;
  }

  if (action.type === "highlight_zone" && action.zoneId) {
    const zone = (venue.zones || []).find((z) => z.id === action.zoneId);
    if (zone) {
      return { ...action, zoneName: zone.name, polygon: zone.polygon };
    }
  }

  return action;
}

/** Plain, client-safe view of a proposal (fields spread onto each action). */
export function serializeProposal(p) {
  return {
    _id: String(p._id),
    eventId: String(p.event),
    trigger: p.trigger,
    severity: p.severity,
    reasoning: p.reasoning,
    status: p.status,
    model: p.model,
    // True when the model's reply wasn't a readable decision. The UI must not
    // present such a proposal as an assessment.
    parseFailed: !!p.parseFailed,
    createdAt: p.createdAt,
    decidedAt: p.decidedAt || null,
    actions: (p.actions || []).map((a) => ({
      type: a.type,
      klass: a.klass,
      status: a.status,
      ...(a.params || {}),
    })),
  };
}

/**
 * Autonomously send the citizen-facing warnings that must not wait for a human:
 * a `broadcast_alert` that is CRITICAL *and* zone-targeted. Mutates the matching
 * actions' status to "executed" in place (the caller persists) and returns
 * whether anything was sent.
 *
 * The two guards are deliberate. "critical" is the model's own severity read, so
 * the agent only auto-fires when it judged the situation a crush-class threat.
 * Zone-targeting means the blast is scoped to the people actually at risk, never
 * the whole venue — a wrong venue-wide alert is its own emergency, so those still
 * need a human. A per-(event, zones) cooldown stops the same zones being
 * re-warned every cycle while a hotspot persists.
 */
/**
 * Severities that earn an immediate, un-approved citizen warning.
 *
 * "critical" alone was too strict, and a live test proved it: a chokepoint at
 * 7.99 p/m² with 39 SECONDS to critical produced a correctly-targeted alert that
 * the model labelled "high" — so it queued for a human and the people standing in
 * it were never told anything. A crush does not wait for the adjective to be
 * upgraded. Targeting is what makes this safe (the warning only reaches the
 * people in that specific area, and it only ever tells them to move), so the bar
 * for sending is the danger being real and localised, not the wording being
 * maximal. Venue-wide alerts still need a human.
 */
const AUTO_SEND_SEVERITIES = new Set(["high", "critical"]);

async function autoSendCriticalBroadcasts({ event, proposal, severity, venue, snapshot, dangerZones }) {
  if (!AUTO_SEND_SEVERITIES.has(severity)) return false;

  let sent = false;
  for (const action of proposal.actions) {
    if (action.type !== "broadcast_alert" || action.status === "executed") continue;

    const params = action.params || {};
    const zoneIds = Array.isArray(params.zoneIds) ? params.zoneIds.filter(Boolean) : [];
    if (!zoneIds.length) continue; // untargeted → still needs human sign-off

    const key = `${event._id}:${[...zoneIds].sort().join(",")}`;
    const now = Date.now();
    if (now - (lastAutoBroadcast.get(key) || 0) < AUTO_BROADCAST_COOLDOWN_MS) continue;
    lastAutoBroadcast.set(key, now);

    try {
      await sendBroadcast({
        eventId: event._id,
        // A "high" assessment is still a warning people must act on; the Broadcast
        // model speaks info|warning|critical, so map honestly rather than inflating.
        message: params.message,
        severity: severity === "critical" ? "critical" : "warning",
        source: "agent",
        cohorts: params.cohorts,
        zoneIds,
        proposalId: proposal._id,
      });
      action.status = "executed";
      action.result = `auto-sent to ${zoneIds.length} area(s): ${zoneIds.join(", ")}`;
      sent = true;

      // Tell the command map WHICH ground was just warned, with the polygons, so
      // the authority can see the agent working instead of taking it on trust.
      const io = getIO();
      if (io) {
        const areas = zoneIds
          .map((zid) => resolveArea(zid, venue, snapshot, dangerZones))
          .filter(Boolean);
        io.to(roomName(event._id)).emit("agent:alerted", {
          proposalId: String(proposal._id),
          message: params.message,
          severity,
          at: Date.now(),
          areas,
        });
      }
    } catch (err) {
      action.status = "failed";
      action.result = `autonomous send failed: ${err.message}`;
      console.error(`[agent] autonomous broadcast failed for event ${event._id}:`, err.message);
    }
  }
  return sent;
}

/**
 * One reasoning pass for an event. Builds the brief, reasons (with tools),
 * validates the proposed actions against the venue graph, persists the
 * proposal (advisory actions marked applied, consequential ones pending), and
 * pushes it live to the event room.
 *
 * @returns {{ proposal, invalid: Array }}
 * @throws {NoProviderError} when no LLM provider is configured.
 */
export async function runAgentCycle({
  event,
  venue,
  snapshot,
  roadNetwork = null,
  dangerZones = [],
  trigger = "manual",
}) {
  const cfg = await getActiveConfig();
  if (!cfg) throw new NoProviderError("No LLM provider configured");

  // Visible thinking. The operator sees the guardian pick up the situation the
  // moment it does, not several seconds later when a proposal lands.
  publishStatus(event._id, {
    phase: "thinking",
    trigger: typeof trigger === "string" ? trigger : trigger?.type || "alert",
    dangerAreas: (dangerZones || []).length,
    model: cfg.model,
  });

  const brief = buildBrief({ event, venue, snapshot, roadNetwork, dangerZones, trigger });
  const result = await reason({ brief, venue, snapshot, roadNetwork });

  // A reply we couldn't read is a FAILED pass, not a calm one. The old code
  // fell back to `{severity:"low", actions:[]}`, which rendered as a confident
  // "nothing to do here" — the most dangerous possible way to lose a decision.
  // Now it is recorded as unreadable so the operator knows to look themselves.
  const parseFailed = !result.envelope;
  const envelope = result.envelope || {
    severity: "low",
    reasoning: "",
    actions: [],
  };

  if (parseFailed) {
    const salvaged = salvageReasoning(result.content);
    envelope.reasoning =
      "The model's reply could not be read as a decision envelope, so no actions were taken from it. " +
      "Assess this alert manually." +
      (salvaged ? `\n\nPartial text recovered from the reply: “${salvaged.slice(0, 400)}”` : "");
    console.error(
      `[agent] unreadable envelope for event ${event._id} (${(result.content || "").length} chars)`
    );
  }

  const { valid } = validateActions(Array.isArray(envelope.actions) ? envelope.actions : [], venue || {}, {
    roadNetwork,
    clusters: snapshot?.clusters || [],
    dangerZones,
  });

  const actions = valid.map((a) => {
    const { type, klass, ...params } = a;
    return { type, klass, params, status: klass === "advisory" ? "applied" : "pending" };
  });

  const severity = ["low", "medium", "high", "critical"].includes(envelope.severity)
    ? envelope.severity
    : "low";

  const proposal = await AgentProposal.create({
    event: event._id,
    trigger: typeof trigger === "string" ? trigger : trigger?.type || "alert",
    severity,
    reasoning: typeof envelope.reasoning === "string" ? envelope.reasoning : "",
    actions,
    status: "proposed",
    model: cfg.model,
    parseFailed,
  });

  // Protect the people first. A CRITICAL, ZONE-TARGETED broadcast is the one
  // consequential move that cannot wait for a human: a crush warning that queues
  // for sign-off is useless to the person already in the crush. So we send those
  // — and only those — autonomously, straight to the citizens in the named
  // zones, and mark the action executed. Everything else (venue-wide alerts,
  // gates, unit moves) still queues for authority approval. The proposal remains
  // the audit trail / proof of exactly what was auto-sent, to which zones, why.
  const autoSent = await autoSendCriticalBroadcasts({
    event,
    proposal,
    severity,
    venue,
    snapshot,
    dangerZones,
  });
  if (autoSent) {
    proposal.markModified("actions");
    await proposal.save();
  }

  // Push live to the command dashboard; advisory actions also announce
  // themselves so the map can react immediately.
  const io = getIO();
  if (io) {
    const payload = serializeProposal(proposal);
    io.to(roomName(event._id)).emit("agent:proposal", payload);
    for (const a of payload.actions.filter((x) => x.klass === "advisory")) {
      io.to(roomName(event._id)).emit("agent:action", {
        proposalId: payload._id,
        action: withGeometry(a, venue, snapshot, roadNetwork, dangerZones),
      });
    }
  }

  // Close the loop on "is the agent even working?" — the operator now sees the
  // guardian's pulse: when it last thought, what it concluded, how many areas it
  // warned, and that it is still watching.
  publishStatus(event._id, {
    phase: "idle",
    lastRunAt: Date.now(),
    severity,
    trigger: typeof trigger === "string" ? trigger : trigger?.type || "alert",
    actions: actions.length,
    alertedAreas: actions
      .filter((a) => a.type === "broadcast_alert" && a.status === "executed")
      .flatMap((a) => a.params?.zoneIds || []),
    dangerAreas: dangerZones.length,
    model: cfg.model,
  });

  return { proposal };
}

/**
 * Subscribe to the alert bus so risk escalations wake the agent automatically.
 * Cooldown/dedupe per (event, zone) prevents a zone that stays hot for minutes
 * from triggering a storm of inferences. Escalations to CRITICAL bypass the
 * cooldown (a worsening situation always earns a fresh look).
 */
export function initAgent() {
  alertBus.on("alert", async (evt) => {
    try {
      if (!evt) return;
      // Only two kinds wake the agent; "resolved" and anything else are ignored.
      if (evt.kind !== "risk_escalation" && evt.kind !== "crowd_condition") return;

      const cfg = await getActiveConfig();
      if (!cfg) return; // no provider -> stay silent, Tier 0/1 keep working

      const eventId = evt.eventId;

      // (a) A hand-drawn zone crossed a threshold — the original signal. Kept as
      // a per-zone cooldown so one persistently-hot zone can't storm.
      if (evt.kind === "risk_escalation") {
        const zoneId = evt.alert?.zoneId || "unknown";
        const critical = evt.alert?.severity === "critical";
        const key = `${eventId}:${zoneId}`;
        const now = Date.now();
        const last = lastWake.get(key) || 0;
        if (now - last < WAKE_COOLDOWN_MS && !critical) return;
        if (!claimCycle(eventId, critical)) return; // a crowd_condition just ran
        lastWake.set(key, now);

        const ctx = await loadContext(eventId);
        if (!ctx) return;
        await runAgentCycle({
          ...ctx,
          trigger: {
            type: "risk_escalation",
            severity: evt.alert?.severity,
            zoneId,
            zoneName: evt.alert?.zoneName,
          },
        });
        return;
      }

      // (b) The broadcaster's crowd-condition trigger fired (hotspot, dense/
      // converging/fast-growing crowd, or an escalated zone). Its own cadence +
      // escalation gate already decided this is worth a look; the cross-source
      // guard only stops it colliding with a zone alert in the same instant.
      const cond = evt.condition || {};
      const critical = cond.severity === "critical";
      if (!claimCycle(eventId, critical)) return;

      const ctx = await loadContext(eventId);
      if (!ctx) return;
      await runAgentCycle({
        ...ctx,
        trigger: {
          type: "crowd_condition",
          severity: cond.severity,
          zoneName: cond.focus?.label,
          reason: Array.isArray(cond.reasons) ? cond.reasons.join("; ") : undefined,
        },
      });
    } catch (err) {
      // A provider hiccup or bad tick must never crash the process.
      if (err?.code !== "NO_PROVIDER") {
        console.error("[agent] autonomous wake failed:", err.message);
      }
    }
  });
  console.log("[agent] subscribed to alertBus (autonomous wake armed: zones + crowd conditions)");
  startPatrol();
  console.log(`[agent] patrol armed: re-reads every live event every ${PATROL_MS / 1000}s (never sleeps mid-event)`);
}

/**
 * The never-sleeping half of the guardian.
 *
 * Threshold triggers answer "something just got bad". A patrol answers the
 * question an operator actually asks — "are you still watching?" — and catches
 * the slow build that never trips a threshold, plus the second and third pocket
 * forming away from the one everyone is looking at.
 *
 * Deliberately cheap and self-limiting: it only runs for events that are
 * genuinely live (a broadcaster loop running, phones reporting), it reuses the
 * same cycle guard as every other wake, and it skips entirely when no LLM
 * provider is configured.
 */
export function startPatrol() {
  if (patrolTimers.has("global")) return;
  const timer = setInterval(async () => {
    try {
      const cfg = await getActiveConfig();
      if (!cfg) return; // no provider → Tier 0/1 keep working, agent stays quiet

      // Only events somebody is actually watching have a live picture to read.
      for (const s of broadcasterStatus()) {
        if (!s.running) continue;
        const eventId = s.eventId;

        const last = lastCycleAt.get(String(eventId)) || 0;
        if (Date.now() - last < PATROL_MS) continue; // a trigger already looked recently

        const ctx = await loadContext(eventId);
        // Nothing measured = nothing to reason about; the brief would only invite
        // invention, so stay silent but keep the pulse visible.
        if (!ctx || !(ctx.snapshot?.totals?.sampledDevices > 0)) {
          if (ctx) publishStatus(eventId, { phase: "watching" });
          continue;
        }
        if (!claimCycle(eventId)) continue;

        await runAgentCycle({ ...ctx, trigger: { type: "patrol", reason: "scheduled sweep of the whole coverage" } });
      }
    } catch (err) {
      if (err?.code !== "NO_PROVIDER") console.error("[agent] patrol failed:", err.message);
    }
  }, PATROL_MS);
  if (timer.unref) timer.unref();
  patrolTimers.set("global", timer);
}

export function stopPatrol() {
  const t = patrolTimers.get("global");
  if (t) clearInterval(t);
  patrolTimers.delete("global");
}
