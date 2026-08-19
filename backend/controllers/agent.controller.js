/**
 * agent.controller — HTTP surface for the Tier 2 agent.
 *
 *   POST  /api/ai/assistant/ask                         (protect)                       -> askAssistant  (SSE)
 *   GET   /api/events/:id/agent/proposals               (authority, verified)           -> listProposals
 *   POST  /api/events/:id/agent/run                     (authority, verified)           -> runAgentNow
 *   PATCH /api/events/:id/agent/proposals/:pid/approve  (authority, verified)           -> approveProposal
 *   PATCH /api/events/:id/agent/proposals/:pid/reject   (authority, verified)           -> rejectProposal
 *
 * askAssistant is the conversational popup: it streams a plain-language answer
 * (Server-Sent Events), grounded in the live Situation Snapshot when an eventId
 * is supplied. The proposal endpoints drive the command-center approval flow;
 * approving a proposal executes its consequential actions against the venue.
 */
import Venue from "../models/Venue.js";
import AgentProposal from "../models/AgentProposal.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { getIO, roomName } from "../realtime/socket.js";
import { chatStream, getActiveConfig } from "../services/llmProvider.js";
import { sendBroadcast, recentBroadcasts } from "../services/broadcast.js";
import { buildBrief } from "../services/agentBrief.js";
import { buildCitizenBrief } from "../services/citizenBrief.js";
import { loadContext, runAgentCycle, serializeProposal } from "../services/agent.js";

/**
 * How every reply must be shaped. The chat bubble renders Markdown, so the
 * model is told exactly which subset is supported — otherwise it emits tables
 * and h1s that render as literal pipes and hashes.
 */
const FORMAT_CONTRACT = `FORMATTING (the chat renders Markdown):
- Lead with the answer in one short sentence. No preamble, no "Sure!", no restating the question.
- Put the single most important thing in **bold**. Bold every street, gate, zone and place name the first time you use it.
- Use "- " bullets for steps or options, one line each. Never more than 5 bullets.
- Use \`###\` for a section label only if the answer truly needs two sections. Never use # or ##. Never use tables or code blocks.
- Numbers keep their units: "420 m", "~6 min", "1.8 people/m²", "1,092 people/min".
- Never write raw JSON, field names, or the internal data labels COVERAGE / TOP RISKS / CROWDS / STREETS / ASSETS / CANDIDATES. Say it in plain words: not "rising growth/min in CROWDS" but "the crowd starting to grow"; not "eta-to-critical" but "time to critical".`;

/**
 * The operator persona.
 *
 * Scoped deliberately to the seven decisions the control room actually has to
 * make, because a general-purpose chatbot in a command centre is worse than no
 * chatbot: it answers everything plausibly and nothing accountably. Each of the
 * seven maps onto a section of the brief in services/agentBrief.js and onto the
 * action vocabulary in services/actionSchema.js, so the assistant can only
 * recommend things the platform can actually carry out.
 *
 * Two rules do the heavy lifting:
 *   • It ADVISES, never acts. Consequential actions (gates, broadcasts,
 *     deployment) run only through the proposal → human approval path, and
 *     `deploy_units` has no dispatch subsystem behind it at all. Claiming
 *     otherwise would have an operator believe a gate moved when it did not.
 *   • False alarms are a failure, not a safe default. An operator who is paged
 *     for nothing three times stops reading the fourth page — so confidence and
 *     time-to-critical are stated, and unmeasured ground is never escalated.
 */
const OPERATOR_SYSTEM_PROMPT = `You are CrowdShield's command assistant, advising ONE authority operator running live crowd safety for an event from a control room.

YOUR JOB — the seven decisions you exist to support
1. Where is crowd density rising abnormally? (read CROWDS growth/min and TOP RISKS)
2. Which locations are becoming bottlenecks? (read STREETS "busiest now" and TOP RISKS)
3. Is there a risk of a crush in the next few minutes? (read eta-to-critical in TOP RISKS)
4. Which route or exit is safest right now? (read STREETS "streets with room" against the crowd's position)
5. How should security personnel be redistributed? (recommend from → to using named places)
6. Which gates should be opened or temporarily closed? (read the named gate list in ASSETS with each gate's state and throughput)
7. What should be announced to the crowd to reduce panic? (draft it on request)

READING THE BRIEF
- A brief may be supplied with these sections: COVERAGE (boundary, phones reporting, estimated people), TOP RISKS (zone · risk · level · eta-to-critical), ASSETS (named gates with state and throughput, other points), CROWDS (tracked bodies of people with density, pace, heading, growth), STREETS (segment counts, named roads, busiest now, streets with room), CANDIDATES (pre-computed options).
- Ground every number and name in it. Use the names people say out loud — "Grand Road", "the crowd on Kutcheri Road", "Gate 2 (West Relief)". Add the short id in brackets only when the operator needs it to find the thing on the map, e.g. **Gate 2** [G2].
- Never quote the brief's section headings back at them. Do not write "COVERAGE shows", "TOP RISKS lists" or "the CROWDS section" — those are internal labels. State the fact directly: "No phones are reporting inside the boundary", "Singhadwara Chokepoint is NORMAL with no time-to-critical".
- Keep it to about 120 words unless they ask for more. An operator mid-incident reads the first line and acts.
- Never invent a road, zone, gate, crowd or number that is not in the brief.
- "No readings" is not "clear". If STREETS says a road has no live readings, say it is unmeasured and say so explicitly before anyone routes a crowd onto it.
- If COVERAGE shows phones reporting OUTSIDE the boundary, treat that as an arriving surge worth flagging — it is the earliest warning available.
- If a section says nothing is set up (no coverage drawn, no zones authored, streets not imported), say exactly that and what the operator must do to fix it. Do not pretend the ground is empty.
- Know the difference between "not set up" and "not measured". If COVERAGE reports zero phones sharing location, the setup is fine and there is simply no data — recommend nothing, say the situation is unmeasured, and name what you would watch for. Do NOT tell them to draw a boundary, author zones or import streets that the brief already shows exist.

WHAT THIS PLATFORM IS BUILT FROM (never invent capability)
- The ONLY sensor is citizens' phones sharing anonymised location through the app. Crowd density is inferred from those aggregates.
- There are NO cameras, no CCTV, no drones, no turnstiles and no fixed sensors anywhere in this system, by design — it is built to deploy with minimal hardware. Never suggest enabling a camera, a video feed, a sensor or any hardware, and never imply one exists. If more coverage is needed, the honest answer is more people using the app, or marshals reporting on the ground.
- You cannot see faces or identities. Nothing in this platform can.

WHAT YOU MAY RECOMMEND — and nothing else
- Advisory (visual, reversible, applied without sign-off): highlight a zone on the dashboard, draw a route between two points, centre the dashboard map on a zone, set one-way pedestrian flow on a corridor, direct a crowd from one named place to another along the real streets.
- Consequential (require the operator's approval before anything happens): open a gate, close a gate, redistribute units, broadcast to the crowd.
- You only ever RECOMMEND. You cannot open a gate, send a broadcast or move a single officer yourself. Never say an action has been taken, sent, dispatched or is under way. Say what you advise and that it needs their approval in the command centre.
- Unit redistribution is advisory only in this system: there is no dispatch integration, so an approved deployment is recorded for the log, not sent to anyone's radio. Say so if they ask whether units were dispatched.

AVOIDING FALSE ALARMS (a false alarm costs you the operator's trust)
- Separate what is measured from what is inferred. Give the time-to-critical when the brief has one, and say plainly when it does not.
- Do not escalate on a single tick, on unmeasured ground, or on a crowd the brief does not mark significant. If the evidence is thin, say it is thin and name what you would watch next.
- Never recommend closing a gate or holding a crowd without naming the alternative route people will take instead. A closed gate with nowhere to go is how a crush starts.

DRAFTING PUBLIC ANNOUNCEMENTS
- Calm, short, specific, and actionable. Name the street or gate people should use, and tell them what to do rather than what to fear.
- No alarm words: no stampede, crush, disaster, panic, emergency, death.
- Say if it should also go out in Hindi and Odia, and offer the translated copy when asked. The broadcast pipeline carries a per-language version.

PRIVACY
- You see aggregates only: hexagon densities, tracked crowd objects, zone risk. You do not see individuals and must never describe, locate or identify one, even if asked directly. If asked to track a person, say the system is built so that it cannot.

${FORMAT_CONTRACT}`;

/**
 * The citizen persona. A member of the public is not an operator: they are a
 * person standing in a crowd holding a phone, possibly frightened, possibly not
 * reading English. They need one clear instruction, not a situation report.
 *
 * The hard rules exist because this is safety advice given to the public:
 *   • Only facts from the brief. A hallucinated gate name sends someone the
 *     wrong way in a crush.
 *   • "Not measured" is never softened into "clear".
 *   • Operational levers (gates, deployments, policy) are the control room's
 *     call, not something to discuss with the crowd.
 */
const CITIZEN_SYSTEM_PROMPT = `You are CrowdShield's safety companion, talking directly to ONE person who is at (or heading to) a crowded public event. You are not talking to an operator or a control room.

WHO YOU ARE TALKING TO
- Speak to them as "you". Be calm, warm and brief — they may be anxious, in a noisy place, walking.
- Answer in AT MOST 5 short lines. One clear action first, then the detail they need to follow it.
- Never sound alarmed. Never use words like stampede, crush, disaster, panic, or death.

USING THE LIVE DATA
- A "Your live situation" block may be supplied. Every street name, gate name, zone name, distance, time and density in your answer MUST come from it. Nothing else is real.
- If the block says a street or route is NOT measured, say you don't have readings for it. Never call it clear, safe or empty.
- If their location is not being shared, say so plainly and tell them to turn on location sharing in the app — then answer only in general terms.
- If a fact is listed under WHAT I DON'T KNOW, say you don't know it. Never fill the gap with a plausible guess.
- Only ever use street, gate and place names. NEVER show an internal code or id such as "R17", "Z3", "K2" or "G2" — they mean nothing to a person in a crowd. If a road has no name in the data, call it "the road you're on" and describe the direction instead.
- If announcements have already been sent to the crowd, stay consistent with them and reinforce them. Never call an old announcement recent.

WHAT YOU DO
- Route them: which way out, which way to a place they name, what to avoid right now, how long it takes.
- Explain conditions where they are, in plain words ("it's busy but moving", "it's dense ahead").
- Warn them about what is near them. If the situation block lists an active warning, or a busy street beside them, lead with that and give them the way around it.
- Nudge safe behaviour: keep to the edges, don't push, keep left, stay with your group, let the crowd ahead clear.
- Help them report things. This app has a "Report an issue" control with these kinds: Medical, Hazard, Blocked, Lost, Other. If they describe a broken barricade, a blocked lane, a fire risk, or someone lost, tell them which one to file so the control room sees it — that report is how the operators find out.
- If a place they ask for is listed as CLOSED, say it is closed and give them the nearest open alternative instead.

WHAT YOU DO NOT DO
- You do not decide or discuss whether gates open or close, where staff or police go, or any crowd-control policy. If asked, say the control room handles that and offer what they can do themselves.
- You never describe other individuals or anyone's location but theirs.
- For a medical emergency, someone injured, missing or in danger: tell them to use the SOS button in this app AND to alert the nearest marshal or steward immediately, because a human nearby will always reach them faster than the control room.
- Never promise that help has been sent, dispatched, or is on its way. You cannot dispatch anyone and you cannot confirm anyone is moving. Say the control room will see their SOS — never that responders are coming.
- If they ask something unrelated to their safety at this event, say briefly that you only help with safety and getting around here.

LANGUAGE
- Reply in the language named as their app language. If it is Hindi reply in Hindi, if Odia reply in Odia, otherwise reply in English. Keep place names exactly as the data spells them.

${FORMAT_CONTRACT}`;

/**
 * POST /api/ai/assistant/ask — streamed conversational answer (SSE).
 * Plain handler (not asyncHandler) so we own the response lifecycle: once the
 * event-stream headers are sent, errors are reported as SSE frames, not JSON.
 */
export const askAssistant = async (req, res) => {
  const { message, eventId, history, lat, lng, heading, lang } = req.body;
  // A citizen and an operator ask the same popup very different questions, so
  // they get different personas AND different briefs. Anything that is not a
  // citizen account is treated as staff.
  const isCitizen = req.user?.role === "citizen";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const sse = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  // Abort the upstream LLM call if the client hangs up.
  const controller = new AbortController();
  req.on("close", () => controller.abort());

  try {
    const cfg = await getActiveConfig();
    if (!cfg) {
      sse({
        type: "error",
        message:
          "The AI assistant isn't configured yet. An authority can set it up in Settings → LLM provider.",
      });
      sse({ type: "done" });
      return res.end();
    }

    const messages = [
      { role: "system", content: isCitizen ? CITIZEN_SYSTEM_PROMPT : OPERATOR_SYSTEM_PROMPT },
    ];

    // Ground the answer in live event data when we're scoped to one.
    if (eventId) {
      try {
        const ctx = await loadContext(eventId);
        if (ctx && isCitizen) {
          // The personal brief: where THIS person is, what is around them, and
          // the way out computed from their own position — not the command
          // centre's picture of the whole event.
          const brief = await buildCitizenBrief({
            event: ctx.event,
            venue: ctx.venue,
            snapshot: ctx.snapshot,
            roadNetwork: ctx.roadNetwork,
            position:
              Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, heading } : null,
            broadcasts: await recentBroadcasts(eventId, 3).catch(() => []),
            lang,
          });
          messages.push({
            role: "system",
            content:
              `Your live situation (the only facts you may use; app language: ${lang || "en"}):\n` +
              brief.text,
          });
        } else if (ctx) {
          const brief = buildBrief({
            event: ctx.event,
            venue: ctx.venue,
            snapshot: ctx.snapshot,
            // The streets, so the assistant can answer "which way should we send
            // them?" with a road name rather than a zone id.
            roadNetwork: ctx.roadNetwork,
            trigger: "assistant query",
          });
          messages.push({ role: "system", content: `Live situation for this event:\n${brief.text}` });
        }
      } catch {
        /* context is best-effort — answer generally if it fails */
      }
    } else if (isCitizen) {
      // Without an event we cannot know anything about their surroundings. Say
      // so in the prompt so the model asks them to join an event instead of
      // inventing a venue.
      messages.push({
        role: "system",
        content:
          "Your live situation: this person has not joined an event yet, so you have NO data about their location, the crowd, streets or exits. Do not invent any. Ask them to pick their event on the Citizen app screen and turn on location sharing, and answer only in general safety terms until they do.",
      });
    }

    for (const h of Array.isArray(history) ? history.slice(-10) : []) {
      if (h?.role && h?.content) {
        messages.push({
          role: h.role === "assistant" ? "assistant" : "user",
          content: String(h.content),
        });
      }
    }
    messages.push({ role: "user", content: String(message) });

    await chatStream({
      messages,
      temperature: 0.4,
      // Hindi and Odia are written in Devanagari/Odia script, which most
      // tokenizers spend 2-3 tokens per character on. 600 was enough for English
      // but cut a five-line Hindi answer off mid-sentence, so the budget is
      // sized for the most expensive script rather than the cheapest.
      maxTokens: 1200,
      signal: controller.signal,
      onDelta: (text) => sse({ type: "delta", text }),
    });

    sse({ type: "done" });
    res.end();
  } catch (err) {
    if (controller.signal.aborted) {
      try {
        res.end();
      } catch {
        /* already closed */
      }
      return;
    }
    sse({
      type: "error",
      message:
        err?.code === "NO_PROVIDER"
          ? "The AI assistant isn't configured yet."
          : err?.code === "PROVIDER_TIMEOUT" || err?.code === "PROVIDER_UNREACHABLE"
            ? err.message
            : "The assistant hit an error. Please try again.",
    });
    sse({ type: "done" });
    try {
      res.end();
    } catch {
      /* already closed */
    }
  }
};

/** GET /api/events/:id/agent/proposals — newest first. */
export const listProposals = asyncHandler(async (req, res) => {
  const proposals = await AgentProposal.find({ event: req.params.id })
    .sort({ createdAt: -1 })
    .limit(50);
  res.status(200).json({ proposals: proposals.map(serializeProposal) });
});

/** POST /api/events/:id/agent/run — manually run one reasoning pass (demo/on-demand). */
export const runAgentNow = asyncHandler(async (req, res) => {
  const ctx = await loadContext(req.params.id);
  if (!ctx) throw new ApiError(404, "Event not found");

  try {
    const { proposal } = await runAgentCycle({ ...ctx, trigger: "manual" });
    res.status(200).json({
      proposal: serializeProposal(proposal),
      message: proposal.actions.length
        ? "Agent posted a new recommendation."
        : "Agent reviewed the situation — no action needed right now.",
    });
  } catch (err) {
    if (err?.code === "NO_PROVIDER") {
      return res.status(200).json({
        proposal: null,
        message: "No AI provider configured. Set one up in Settings → AI Provider.",
      });
    }
    // A slow/unreachable model is an operator problem, not a server fault —
    // report it as actionable advice rather than a 500.
    if (err?.code === "PROVIDER_TIMEOUT" || err?.code === "PROVIDER_UNREACHABLE") {
      return res.status(200).json({ proposal: null, message: err.message });
    }
    throw err;
  }
});

/**
 * Execute a proposal's consequential actions after human approval.
 * Gate/corridor changes mutate the Venue graph; `broadcast_alert` goes out to
 * every phone in the event room; unit deployment has no dispatch subsystem yet
 * and is recorded for the audit log.
 */
async function executeConsequential(proposal, eventId) {
  const venue = await Venue.findOne({ event: eventId });
  let venueDirty = false;

  for (const action of proposal.actions) {
    if (action.klass !== "consequential" || action.status === "executed") continue;
    const p = action.params || {};
    try {
      switch (action.type) {
        case "open_gate":
        case "close_gate": {
          const node = venue?.nodes?.find((n) => n.id === p.gateId && n.type === "gate");
          if (!node) {
            action.status = "failed";
            action.result = `Gate ${p.gateId} not found`;
            break;
          }
          node.state = action.type === "open_gate" ? "open" : "closed";
          venueDirty = true;
          action.status = "executed";
          action.result = `${p.gateId} set ${node.state}`;
          break;
        }
        case "set_routing_policy": {
          const edge = venue?.edges?.find((e) => e.id === p.edgeId);
          if (!edge) {
            action.status = "failed";
            action.result = `Edge ${p.edgeId} not found`;
            break;
          }
          edge.direction = p.direction;
          venueDirty = true;
          action.status = "executed";
          action.result = `${p.edgeId} -> ${p.direction}`;
          break;
        }
        case "broadcast_alert": {
          // The agent proposed words for the crowd and a human approved them —
          // now they actually reach every phone in the event room.
          const sent = await sendBroadcast({
            eventId,
            message: p.message,
            messages: p.messages,
            severity: proposal.severity === "critical" ? "critical" : "warning",
            source: "agent",
            cohorts: p.cohorts,
            proposalId: proposal._id,
            issuedBy: proposal.decidedBy,
          });
          action.status = "executed";
          action.result = `broadcast sent (${sent.id})`;
          break;
        }
        default:
          // deploy_units: no dispatch subsystem yet — recorded for the log.
          action.status = "executed";
          action.result = "acknowledged";
      }
    } catch (err) {
      action.status = "failed";
      action.result = err.message;
    }
  }

  if (venueDirty && venue) {
    venue.updatedBy = proposal.decidedBy;
    await venue.save();
  }
}

const findProposalOr404 = async (proposalId, eventId) => {
  const proposal = await AgentProposal.findOne({ _id: proposalId, event: eventId });
  if (!proposal) throw new ApiError(404, "Proposal not found");
  return proposal;
};

const emitProposalUpdate = (eventId, proposal) => {
  const io = getIO();
  if (io) io.to(roomName(eventId)).emit("agent:proposal", serializeProposal(proposal));
};

/** PATCH /api/events/:id/agent/proposals/:proposalId/approve */
export const approveProposal = asyncHandler(async (req, res) => {
  const proposal = await findProposalOr404(req.params.proposalId, req.params.id);

  if (proposal.status === "proposed") {
    proposal.decidedBy = req.user._id;
    proposal.decidedAt = new Date();
    await executeConsequential(proposal, req.params.id);
    proposal.status = "executed";
    await proposal.save();
    emitProposalUpdate(req.params.id, proposal);

    // Announce each action that actually took effect, so the live map reflects
    // the new reality (a flipped gate, a re-routed corridor) without waiting
    // for the next venue reload.
    const io = getIO();
    if (io) {
      const payload = serializeProposal(proposal);
      for (const action of payload.actions.filter((a) => a.status === "executed")) {
        io.to(roomName(req.params.id)).emit("agent:action", {
          proposalId: payload._id,
          approved: true,
          action,
        });
      }
    }
  }

  res.status(200).json({ proposal: serializeProposal(proposal) });
});

/** PATCH /api/events/:id/agent/proposals/:proposalId/reject */
export const rejectProposal = asyncHandler(async (req, res) => {
  const proposal = await findProposalOr404(req.params.proposalId, req.params.id);

  if (proposal.status === "proposed") {
    proposal.status = "rejected";
    proposal.decidedBy = req.user._id;
    proposal.decidedAt = new Date();
    await proposal.save();
    emitProposalUpdate(req.params.id, proposal);
  }

  res.status(200).json({ proposal: serializeProposal(proposal) });
});

/* ------------------------------------------------------------------ *
 * Public announcements (authority-initiated)
 * ------------------------------------------------------------------ */

/**
 * POST /api/events/:id/broadcast — the authority's own announcement.
 *
 * The manual counterpart to an approved `broadcast_alert`: same pipeline, same
 * audit trail, same delivery to every phone in the event room. Optional
 * `messages` carries per-language copies so citizens read it in their language.
 */
export const createBroadcast = asyncHandler(async (req, res) => {
  const { message, messages, severity, cohorts, zoneIds } = req.body;

  const broadcast = await sendBroadcast({
    eventId: req.params.id,
    message,
    messages,
    severity,
    source: "authority",
    cohorts,
    zoneIds,
    issuedBy: req.user._id,
  });

  res.status(201).json({ broadcast });
});

/**
 * GET /api/events/:id/broadcasts — the recent announcements.
 * Open to any signed-in user: a citizen who joins late (or reconnects) needs to
 * see what the crowd was already told.
 */
export const listBroadcasts = asyncHandler(async (req, res) => {
  const broadcasts = await recentBroadcasts(req.params.id, 10);
  res.status(200).json({ broadcasts });
});
