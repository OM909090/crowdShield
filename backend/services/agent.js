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
import { chatStream, getActiveConfig, NoProviderError } from "./llmProvider.js";
import { alertBus } from "../realtime/alertBus.js";
import { getIO, roomName } from "../realtime/socket.js";

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
  return { event, venue, snapshot, roadNetwork };
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
export function withGeometry(action, venue, snapshot, roadNetwork = null) {
  if (!action || !venue) return action;

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

    const res = safestRoadRoute(roadNetwork, congestion, start.id, end.id);
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

  if ((action.type === "highlight_zone" || action.type === "set_camera") && action.zoneId) {
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
 * One reasoning pass for an event. Builds the brief, reasons (with tools),
 * validates the proposed actions against the venue graph, persists the
 * proposal (advisory actions marked applied, consequential ones pending), and
 * pushes it live to the event room.
 *
 * @returns {{ proposal, invalid: Array }}
 * @throws {NoProviderError} when no LLM provider is configured.
 */
export async function runAgentCycle({ event, venue, snapshot, roadNetwork = null, trigger = "manual" }) {
  const cfg = await getActiveConfig();
  if (!cfg) throw new NoProviderError("No LLM provider configured");

  const brief = buildBrief({ event, venue, snapshot, roadNetwork, trigger });
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

  // Push live to the command dashboard; advisory actions also announce
  // themselves so the map can react immediately.
  const io = getIO();
  if (io) {
    const payload = serializeProposal(proposal);
    io.to(roomName(event._id)).emit("agent:proposal", payload);
    for (const a of payload.actions.filter((x) => x.klass === "advisory")) {
      io.to(roomName(event._id)).emit("agent:action", {
        proposalId: payload._id,
        action: withGeometry(a, venue, snapshot, roadNetwork),
      });
    }
  }

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
      if (!evt || evt.kind !== "risk_escalation") return;

      const cfg = await getActiveConfig();
      if (!cfg) return; // no provider -> stay silent, Tier 0/1 keep working

      const eventId = evt.eventId;
      const zoneId = evt.alert?.zoneId || "unknown";
      const key = `${eventId}:${zoneId}`;
      const now = Date.now();
      const last = lastWake.get(key) || 0;
      if (now - last < WAKE_COOLDOWN_MS && evt.alert?.severity !== "critical") return;
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
    } catch (err) {
      // A provider hiccup or bad tick must never crash the process.
      if (err?.code !== "NO_PROVIDER") {
        console.error("[agent] autonomous wake failed:", err.message);
      }
    }
  });
  console.log("[agent] subscribed to alertBus (autonomous wake armed)");
}
