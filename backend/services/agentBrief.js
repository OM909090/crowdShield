/**
 * agentBrief — compress the live situation into a compact, decision-ready brief
 * the Tier 2 model can read in one glance and act on.
 *
 * Two reasons this exists as its own layer:
 *   1. Token economy — feeding the raw snapshot (every cell, every factor) into
 *      the prompt is wasteful and noisy. The brief keeps only what changes a
 *      decision: the worst zones, the asset denominators, and a short list of
 *      *pre-computed feasible* moves.
 *   2. Grounding — by pre-computing the candidate interventions here (from the
 *      real graph + snapshot) the model chooses from options we already know
 *      are physically possible, instead of hallucinating gates that don't exist.
 *
 * Pure functions only: everything is derived from { event, venue, snapshot }.
 * Numbers are quantised (risk 2dp, eta whole seconds) and ids stay symbolic.
 */
import { buildGraph, nearestNode, kSafestRoutes } from "./router.js";
import { centroid, haversineMeters } from "../utils/geo.js";
import { getTopRisks, getVenueSummary } from "./agentTools.js";
import { sampleRoadCongestion } from "./roadCrowd.js";
import { resolvePlace, safestRoadRoute } from "./roadRouter.js";

const round2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;

/** Left-pad/truncate to a fixed width for tidy monospace columns in `text`. */
const pad = (s, n) => String(s ?? "").padEnd(n).slice(0, n);

/** Risk at/above which a zone is worth surfacing as "needs relief". */
const RELIEF_RISK = 0.5;
const ELEVATED_LEVELS = new Set(["ELEVATED", "HIGH", "CRITICAL"]);

/* ------------------------------------------------------------------ *
 * Candidate interventions
 * ------------------------------------------------------------------ */

/**
 * A concrete "draw a safe route out of the worst zone" suggestion, but only if
 * that zone is actually risky and the route is real. Returns null otherwise.
 */
function worstZoneRouteCandidate(venue, snapshot) {
  const zones = snapshot?.zones || [];
  if (!zones.length) return null;

  const worst = zones.reduce((a, b) => ((b.risk ?? 0) > (a.risk ?? 0) ? b : a), zones[0]);
  if ((worst.risk ?? 0) < RELIEF_RISK) return null;

  const graph = buildGraph(venue);
  if (!graph.nodePos.size) return null;

  // Anchor the route at a node near the worst zone's centroid.
  const vZone = (venue?.zones || []).find((z) => z.id === worst.id);
  const anchor = vZone?.polygon ? centroid(vZone.polygon) : null;
  const fromId = anchor ? nearestNode(graph, anchor) : null;
  if (!fromId) return null;

  // Route toward the nearest usable exit / declared destination.
  const dests = (venue?.nodes || []).filter(
    (n) => (n.type === "exit" || n.isDestination) && n.state !== "closed" && graph.nodePos.has(n.id)
  );
  if (!dests.length) return null;

  let dest = null;
  let bestD = Infinity;
  for (const d of dests) {
    const dist = haversineMeters(anchor, d.at);
    if (dist < bestD) {
      bestD = dist;
      dest = d;
    }
  }
  if (!dest || dest.id === fromId) return null;

  const zoneRiskById = new Map(zones.map((z) => [z.id, { risk: z.risk ?? 0 }]));
  const routes = kSafestRoutes(venue, fromId, dest.id, zoneRiskById, { k: 1, alpha: 3 });
  if (!routes.length) return null;

  return {
    label: `Draw safe route ${fromId} \u2192 ${dest.name || dest.id} (~${Math.round(routes[0].etaSec)}s)`,
    action: { type: "draw_route", fromNodeId: fromId, toNodeId: dest.id },
  };
}

/**
 * A concrete "move these people onto that street" option, computed rather than
 * hoped for.
 *
 * This is the candidate that closes the loop the whole road import exists for.
 * Telling the model "Grand Road has 1,092/min spare" is information; handing it
 * a validated `direct_crowd ZC1 -> Grand Road` with a real distance and real
 * turn-by-turn directions is a decision it can simply take. Without this the
 * model tends to reach for the one lever it has always had — open a gate — even
 * when the useful move is to redirect the flow.
 *
 * Only offered when the route is genuinely walkable right now and the target
 * street actually has room, so accepting it can never send a crowd into a jam.
 */
function roadReliefCandidate(venue, snapshot, roadNetwork) {
  if (!roadNetwork?.segments?.length) return null;

  const zones = snapshot?.zones || [];
  if (!zones.length) return null;
  const worst = zones.reduce((a, b) => ((b.risk ?? 0) > (a.risk ?? 0) ? b : a), zones[0]);
  if ((worst.risk ?? 0) < RELIEF_RISK) return null;

  const rows = sampleRoadCongestion(roadNetwork, snapshot);
  const congestion = new Map(rows.map((r) => [r.id, r]));

  // Named streets with real capacity that are not themselves busy. Named matters:
  // this becomes an instruction a marshal repeats out loud.
  const byName = new Map();
  for (const r of rows) {
    if (!r.name) continue;
    if (r.measured && (r.density ?? 0) >= 1) continue; // already filling up
    const e = byName.get(r.name);
    if (!e || (r.capacityPerMin || 0) > (e.capacityPerMin || 0)) byName.set(r.name, r);
  }
  if (!byName.size) return null;

  const targets = [...byName.values()].sort((a, b) => (b.capacityPerMin || 0) - (a.capacityPerMin || 0));

  const start = resolvePlace(roadNetwork, venue, worst.name || worst.id);
  if (start.error) return null;

  // Try the roomiest streets in order; the first one we can actually walk to wins.
  for (const target of targets.slice(0, 3)) {
    const end = resolvePlace(roadNetwork, venue, target.name);
    if (end.error || end.id === start.id) continue;
    const res = safestRoadRoute(roadNetwork, congestion, start.id, end.id);
    if (!res.ok) continue;
    return {
      label:
        `Direct ${worst.name || worst.id} onto ${target.name} ` +
        `(${res.route.lengthM} m, ~${Math.round(res.route.etaSec / 60)} min walk, ${target.capacityPerMin}/min capacity)`,
      action: { type: "direct_crowd", from: worst.name || worst.id, to: target.name },
    };
  }
  return null;
}

/**
 * Pre-compute the feasible moves the model may pick from — closed gates it
 * could open, zones that need relief, and one grounded safe-route suggestion.
 * Each item is `{ label, action }` where `action` is a valid action envelope.
 *
 * @returns {Array<{ label:string, action:Object }>}
 */
export function buildCandidates(venue, snapshot, roadNetwork = null) {
  const candidates = [];
  const zones = snapshot?.zones || [];

  // (a) Closed gates that could be opened to add egress capacity.
  for (const n of venue?.nodes || []) {
    if (n.type === "gate" && n.state === "closed") {
      candidates.push({
        label: `Open ${n.name || n.id} (+${n.throughputPerMin ?? 0}/min capacity)`,
        action: { type: "open_gate", gateId: n.id },
      });
    }
  }

  // (b) Zones needing relief — ELEVATED or above.
  for (const z of zones) {
    if ((z.risk ?? 0) >= RELIEF_RISK || ELEVATED_LEVELS.has(z.riskLevel)) {
      candidates.push({
        label: `Relieve ${z.name} (risk ${round2(z.risk ?? 0)} ${z.riskLevel || ""})`.trim(),
        action: { type: "highlight_zone", zoneId: z.id },
      });
    }
  }

  // (c) The street-level relief move, when the real network makes one possible.
  // Listed before the corridor route because a named street is an instruction a
  // crowd can actually follow.
  const roadCandidate = roadReliefCandidate(venue, snapshot, roadNetwork);
  if (roadCandidate) candidates.push(roadCandidate);

  // (d) One grounded, routable safe-route suggestion over the authority's own
  // corridors — the inside-the-fence answer.
  const routeCandidate = worstZoneRouteCandidate(venue, snapshot);
  if (routeCandidate) candidates.push(routeCandidate);

  // (e) Flag a danger area around the worst live crowd that no authored zone
  // covers. This is the move that lets the agent mark risk on an event with no
  // zones drawn — it outlines the ground the crowd is actually on.
  const crowds = (snapshot?.clusters || []).filter((k) => k.isCrowd || k.isSignificant);
  if (crowds.length) {
    const worstCrowd = crowds.reduce((a, b) => ((b.density ?? 0) > (a.density ?? 0) ? b : a), crowds[0]);
    if (worstCrowd && (worstCrowd.isCrowd || (worstCrowd.personsEst ?? 0) >= 500)) {
      candidates.push({
        label:
          `Flag danger area around ${worstCrowd.id} ` +
          `(~${worstCrowd.personsEst} people${worstCrowd.density != null ? `, ${worstCrowd.density} p/m²` : ""})`,
        action: { type: "flag_area", clusterId: worstCrowd.id },
      });
    }
  }

  return candidates;
}

/* ------------------------------------------------------------------ *
 * The ground: coverage, crowds, streets
 * ------------------------------------------------------------------ */

/** Render a number, or an em dash when we genuinely do not know it. */
const num = (v, suffix = "") => (v == null || !Number.isFinite(v) ? "\u2014" : `${v}${suffix}`);

/**
 * The boundary the authority drew and what is inside it — including how many
 * people are reporting just *outside* the line, which is how an arriving surge
 * announces itself before it becomes this event's problem.
 */
function coverageLines(venue, snapshot) {
  const polygon = venue?.aor?.polygon || [];
  if (polygon.length < 3) {
    return ["", "COVERAGE  none drawn \u2014 no monitored boundary, no street network"];
  }
  const t = snapshot?.totals || {};
  const km2 = ((venue.aor.areaM2 || 0) / 1e6).toFixed(2);
  const out = [
    "",
    `COVERAGE  ${km2} km\u00b2 \u00b7 ${t.sampledDevices ?? 0} phones reporting inside \u2192 ~${t.personsEst ?? 0} people (at ${
      t.participationRate != null ? `${Math.round(t.participationRate * 100)}%` : "?"
    } app usage)`,
  ];
  if ((t.outsideCoverage ?? 0) > 0) {
    out.push(
      `          ${t.outsideCoverage} phones reporting OUTSIDE the boundary (~${t.outsideEst ?? 0} people) \u2014 not counted above`
    );
  }
  // Say why there is nothing to measure, or the reader invents a reason. Asked
  // to redistribute personnel with zero phones reporting, the assistant advised
  // drawing the coverage area and "enabling the camera feeds" — coverage was
  // already drawn, zones were authored, streets were imported, and this platform
  // has no cameras at all. The gap in the data got filled with plausible fiction.
  if (!(t.sampledDevices > 0)) {
    out.push(
      "          nobody inside the boundary is sharing location right now, so density, crowds and street",
      "          readings are all UNMEASURED. The only sensor is citizens' phones in the app \u2014 there are no",
      "          cameras, drones or fixed sensors to switch on. This is NOT incomplete setup and NOT an empty",
      "          venue: it means no data, so recommend nothing and say what you would watch for instead."
    );
  }
  return out;
}

/**
 * Tracked bodies of people. Twenty named objects the model can reason about,
 * instead of tens of thousands of points it cannot.
 */
function clusterLines(snapshot) {
  const clusters = (snapshot?.clusters || []).filter((k) => k.isSignificant || k.isCrowd);
  if (!clusters.length) return [];

  const out = ["", "CROWDS  (id \u00b7 people \u00b7 density \u00b7 pace \u00b7 heading \u00b7 growth/min)"];
  for (const k of clusters.slice(0, 6)) {
    out.push(
      `  ${pad(k.id, 4)} ${String(k.personsEst).padStart(6)}  ${pad(num(k.density, " p/m\u00b2"), 11)} ` +
        `${pad(num(k.meanSpeed, " m/s"), 9)} ${pad(k.headingCompass || "\u2014", 3)} ${num(k.growthPerMin)}`
    );
  }
  return out;
}

/**
 * Real streets, by name, with the capacity figure that makes a diversion
 * decidable: "Grand Road can take 1,092 people/min and is empty" is an answer.
 *
 * Both halves matter. The congested list says where the problem is; the spare
 * list says where to send people. A model given only the first will propose
 * relief onto a road it has no reason to believe exists.
 */
function roadLines(roadNetwork, snapshot) {
  if (!roadNetwork) {
    return [
      "",
      "STREETS  not imported for this coverage area \u2014 you can only route along the authority's drawn corridors",
    ];
  }
  // Imported but empty is a different fact, and conflating the two would have the
  // model tell an operator the streets are "not imported" when they were, or
  // imply roads exist to route onto when OpenStreetMap has none mapped here.
  if (!roadNetwork.segments?.length) {
    return [
      "",
      "STREETS  imported, but OpenStreetMap has no mapped roads or footpaths inside this coverage area. " +
        "Route only along the authority's drawn corridors, and do not name streets.",
    ];
  }

  const rows = sampleRoadCongestion(roadNetwork, snapshot);
  const measured = rows.filter((r) => r.measured && r.density != null);

  const out = [
    "",
    `STREETS  ${roadNetwork.stats?.segmentCount ?? rows.length} segments \u00b7 ${(
      (roadNetwork.stats?.totalLengthM ?? 0) / 1000
    ).toFixed(1)} km \u00b7 ${measured.length} with live readings`,
  ];
  if (roadNetwork.stats?.roadNames?.length) {
    out.push(`  named: ${roadNetwork.stats.roadNames.join(", ")}`);
  }

  if (measured.length) {
    const worst = [...measured].sort((a, b) => b.density - a.density).slice(0, 4);
    out.push("  busiest now:");
    for (const r of worst) {
      out.push(
        `    ${pad(r.name || `unnamed ${r.highway} (${r.id})`, 26)} ${pad(num(r.density, " p/m\u00b2"), 11)} ` +
          `${pad(num(r.personsEst, "p"), 8)} ${pad(num(r.meanSpeed, " m/s"), 9)} ${r.state}`
      );
    }
  } else {
    out.push("  no street has live crowd readings \u2014 do NOT describe any road as clear");
  }

  // Spare capacity, named-only: an unnamed service lane is a poor thing to send
  // a crowd down in an instruction someone has to follow.
  const spare = rows
    .filter((r) => r.name && (!r.measured || (r.density ?? 0) < 1))
    .sort((a, b) => (b.capacityPerMin || 0) - (a.capacityPerMin || 0));
  const seen = new Set();
  const spareLines = [];
  for (const r of spare) {
    if (seen.has(r.name)) continue;
    seen.add(r.name);
    spareLines.push(
      `    ${pad(r.name, 26)} up to ${String(r.capacityPerMin).padStart(5)}/min  ${
        r.measured ? `now ${num(r.density, " p/m\u00b2")}` : "no readings"
      }`
    );
    if (spareLines.length >= 4) break;
  }
  if (spareLines.length) {
    out.push("  streets with room:");
    out.push(...spareLines);
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Brief assembly
 * ------------------------------------------------------------------ */

function resolveEventId(event, snapshot) {
  if (snapshot?.eventId) return snapshot.eventId;
  if (event) return String(event._id || event.id || "unknown");
  return "unknown";
}

/** Human-readable one-liner for whatever kicked off this brief. */
function summarizeTrigger(trigger) {
  if (!trigger) return "manual query";
  if (typeof trigger === "string") return trigger;
  // Alert-like / transition-like object.
  const parts = [];
  if (trigger.type) parts.push(trigger.type);
  const sev = trigger.severity || trigger.to;
  if (sev) parts.push(String(sev).toUpperCase());
  const zone = trigger.zoneName || trigger.zoneId;
  if (zone) parts.push(`@ ${zone}`);
  let line = parts.join(" ") || "event trigger";
  // The crowd-condition trigger carries the specific reasons it woke on (a
  // hotspot, converging crowds, a fast-growing body of people) — pass them
  // through so the agent reasons about the thing that actually fired, not a bare
  // "crowd_condition".
  if (trigger.reason) line += ` — ${trigger.reason}`;
  return line;
}

/** Compact symbolic form of an action, e.g. "open_gate G2" or "draw_route N1 N2". */
function describeAction(action = {}) {
  const rest = Object.entries(action)
    .filter(([k]) => k !== "type")
    .map(([, v]) => (Array.isArray(v) ? v.join(",") : String(v)));
  return [action.type, ...rest].join(" ");
}

/** Assets summary that is safe to call even when there is no venue. */
function safeSummary(venue) {
  if (venue) return getVenueSummary(venue);
  return { aorAreaM2: 0, zones: 0, nodes: 0, gates: 0, openGates: 0, blockedEdges: 0, destinations: [] };
}

/**
 * Build the decision-ready brief.
 *
 * @param {Object} args
 * @param {Object} [args.event]    the Event doc (for id fallback)
 * @param {Object} [args.venue]    the Venue graph
 * @param {Object} [args.snapshot] the situation snapshot (buildSnapshot output)
 * @param {string|Object} [args.trigger] what prompted this (alert/transition/string)
 * @returns {{ text:string, data:{ topRisks:Array, assets:Object, candidates:Array } }}
 */
export function buildBrief({ event, venue, snapshot, roadNetwork, trigger } = {}) {
  const eventId = resolveEventId(event, snapshot);
  const triggerLine = summarizeTrigger(trigger);
  const zones = snapshot?.zones || [];
  const noVenue = !venue || snapshot?.hasVenue === false;

  // The only genuinely empty case: nothing has been set up at all.
  if (noVenue) {
    const text = [
      `CROWDSHIELD BRIEF \u00b7 event ${eventId}`,
      `trigger: ${triggerLine}`,
      "No venue set up for this event yet \u2014 no coverage area, no gates, no streets. " +
        "Nothing can be assessed or routed until an authority draws the coverage area.",
    ].join("\n");
    return { text, data: { topRisks: [], assets: safeSummary(venue), candidates: [] } };
  }

  const { top, rollup } = getTopRisks(snapshot, 5);
  const assets = getVenueSummary(venue);
  const candidates = buildCandidates(venue, snapshot, roadNetwork);

  const lines = [];
  lines.push(`CROWDSHIELD BRIEF \u00b7 event ${eventId}`);
  lines.push(`trigger: ${triggerLine}`);

  // Coverage leads, because it is the frame everything else sits in: what am I
  // responsible for, and how many people are in it. Buried further down it got
  // skimmed — asked "do you know the areas I'm covering?" the model opened with
  // "No" and then proceeded to list them.
  lines.push(...coverageLines(venue, snapshot));
  lines.push("");

  // No zones is NOT "nothing to assess". An authority may well have drawn the
  // coverage area and dropped their gates before authoring a single zone, and
  // that is already plenty to answer questions about — where the boundary is,
  // which gates exist, which streets are inside. Bailing out here used to throw
  // all of it away and make the assistant claim it had no data at all, which is
  // both wrong and exactly the sort of thing that destroys trust in it.
  if (!zones.length) {
    lines.push(
      "TOP RISKS  none \u2014 no zones have been authored yet, so there is no zone-level " +
        "risk or time-to-critical. Draw zones at chokepoint scale to get escalation alerts."
    );
  } else {
    // Name the zone, don't just number it. This table used to print the id
    // alone, so an assistant told to "use the names people say out loud" had no
    // name available and fell back to reading "ZC1" out to an operator — which
    // is not something anybody can act on or repeat over a radio. The id stays
    // in brackets because it is what labels the zone on the map.
    lines.push("TOP RISKS  (zone \u00b7 risk \u00b7 level \u00b7 eta-to-critical)");
    for (const z of top) {
      const eta = z.etaCriticalSec == null ? "\u2014" : `${z.etaCriticalSec}s`;
      const label = z.name ? `${z.name} [${z.id}]` : z.id;
      lines.push(`  ${pad(label, 34)} ${z.risk.toFixed(2)}  ${pad(z.riskLevel, 9)} ${eta}`);
    }
    if (rollup) lines.push(`  (${rollup})`);
  }
  lines.push("");
  lines.push(
    `ASSETS  gates ${assets.openGates}/${assets.gates} open \u00b7 blocked edges ${assets.blockedEdges} \u00b7 destinations ${assets.destinations.length}`
  );
  // Name them. "gates 1/3 open" tells the model a ratio; it cannot pass that on
  // to anybody. "Gate 2 (closed, 624/min)" is something it can propose opening.
  const gateList = (venue?.nodes || []).filter((n) => n.type === "gate");
  if (gateList.length) {
    lines.push(
      `  ${gateList
        .map((g) => `${g.name || g.id} [${g.id}] ${g.state || "open"}${g.throughputPerMin ? ` ${g.throughputPerMin}/min` : ""}`)
        .join(" \u00b7 ")}`
    );
  }
  const others = (venue?.nodes || []).filter((n) => n.type !== "gate");
  if (others.length) {
    lines.push(`  other points: ${others.map((n) => `${n.name || n.id} [${n.id}] ${n.type}`).join(" \u00b7 ")}`);
  }

  // The rest of the ground. Without these the model is reasoning about a map it
  // has never seen: it knows a polygon is at risk but not which street that is,
  // nor which street has room to take the overflow.
  lines.push(...clusterLines(snapshot));
  lines.push(...roadLines(roadNetwork, snapshot));
  lines.push("");
  if (candidates.length) {
    lines.push("CANDIDATES");
    candidates.forEach((c, i) => {
      lines.push(`  ${i + 1}. ${c.label}  [${describeAction(c.action)}]`);
    });
  } else {
    lines.push("CANDIDATES  none pre-computed");
  }

  return { text: lines.join("\n"), data: { topRisks: top, assets, candidates } };
}
