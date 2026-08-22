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
import { centroid, haversineMeters, bearingDeg, pointInPolygon, polygonAreaM2 } from "../utils/geo.js";
import { getTopRisks, getVenueSummary } from "./agentTools.js";
import { sampleRoadCongestion } from "./roadCrowd.js";
import { resolvePlace, safestRoadRoute } from "./roadRouter.js";

const round2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;

/** Left-pad/truncate to a fixed width for tidy monospace columns in `text`. */
const pad = (s, n) => String(s ?? "").padEnd(n).slice(0, n);

/** Risk at/above which a zone is worth surfacing as "needs relief". */
const RELIEF_RISK = 0.5;
const ELEVATED_LEVELS = new Set(["ELEVATED", "HIGH", "CRITICAL"]);

/** Crowd density bands (from geo.densityLevel) that make a crowd worth flagging. */
const DANGEROUS_CLUSTER_LEVELS = new Set(["dense", "critical", "dangerous"]);

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
export function buildCandidates(venue, snapshot, roadNetwork = null, dangerZones = []) {
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

  // (e) Flag danger areas around the live crowds that no authored zone covers —
  // ONE PER DISTINCT DANGEROUS CROWD, not just the densest. A busy event can
  // have several dangerous pockets at once (a chokepoint AND a converging
  // approach AND an over-full holding area); offering only the single worst one
  // is what made the agent look like it could see just one. We surface every
  // crowd that is a genuine crowd, at a dense/critical/dangerous level, or large
  // enough to matter — densest first — and let the model flag as many as apply.
  const dangerousCrowds = (snapshot?.clusters || [])
    .filter(
      (k) =>
        k.isCrowd ||
        DANGEROUS_CLUSTER_LEVELS.has(k.level) ||
        (k.personsEst ?? 0) >= 500
    )
    .sort((a, b) => (b.density ?? 0) - (a.density ?? 0))
    .slice(0, 6);
  for (const k of dangerousCrowds) {
    candidates.push({
      label:
        `Flag danger area around ${k.id} ` +
        `(~${k.personsEst} people${k.density != null ? `, ${k.density} p/m²` : ""}${k.level ? `, ${k.level}` : ""})`,
      action: { type: "flag_area", clusterId: k.id },
    });
  }

  // (f) Warn the people standing in each live danger pocket. This is the move
  // that actually reaches a phone: a targeted alert at "critical" is delivered
  // immediately, with no human sign-off. One candidate per pocket, so several
  // areas can be warned in the same pass — and an alert aimed at a dz-/K- id
  // works even on an event where nobody ever drew a zone, which is precisely the
  // case where citizens were previously never warned at all.
  const alertTargets = [
    ...dangerZones.slice(0, 6).map((d) => ({
      id: d.id,
      label: `the ${d.severity} danger area (~${d.personsEst} people, peak ${d.maxDensity} p/m²)`,
    })),
    ...dangerousCrowds.slice(0, 4).map((k) => ({
      id: k.id,
      label: `crowd ${k.id} (~${k.personsEst} people${k.level ? `, ${k.level}` : ""})`,
    })),
  ];
  for (const t of alertTargets) {
    candidates.push({
      label: `Warn the people in ${t.label} — targeted, delivered immediately at critical severity`,
      action: {
        type: "broadcast_alert",
        message: "Crowding is building where you are standing. Move calmly toward the nearest open exit now.",
        zoneIds: [t.id],
      },
    });
  }

  // (g) Physical help the authority can place. Anchored to a real crowd id so the
  // server resolves the coordinate — the agent never invents map positions.
  for (const k of dangerousCrowds.slice(0, 2)) {
    candidates.push({
      label: `Ask the authority to place marshals at ${k.id} (~${k.personsEst} people) to hold and split the flow`,
      action: {
        type: "suggest_placement",
        kind: "marshals",
        clusterId: k.id,
        reason: `~${k.personsEst} people packed here${k.density != null ? ` at ${k.density} p/m²` : ""}`,
      },
    });
  }
  const sosCount = (snapshot?.incidents || []).length;
  if (sosCount > 0 && dangerousCrowds.length) {
    candidates.push({
      label: `Ask the authority to place a medical tent near ${dangerousCrowds[0].id} (${sosCount} SOS reported)`,
      action: {
        type: "suggest_placement",
        kind: "medical_tent",
        clusterId: dangerousCrowds[0].id,
        reason: `${sosCount} people have raised SOS in or near this crowd`,
      },
    });
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

/**
 * The live danger pockets, every one of them.
 *
 * This section exists because the agent used to be shown a single "worst crowd"
 * and nothing else, so it reasoned as if the venue had one problem. The
 * deterministic layer already finds every packed pocket across the whole
 * coverage each tick; listing them all — with the ids an alert can be aimed at —
 * is what lets the agent warn several areas at once instead of fixating on the
 * biggest one.
 */
function dangerAreaLines(dangerZones = []) {
  if (!dangerZones.length) {
    return [
      "",
      "DANGER AREAS  none right now \u2014 no pocket of ground is packed to a dangerous density. " +
        "This is measured, not assumed: it is recomputed every second from the reporting phones.",
    ];
  }
  const out = [
    "",
    `DANGER AREAS  ${dangerZones.length} live pocket(s) across the coverage \u2014 these are ALREADY drawn on the operator's map.`,
    "  (id \u00b7 severity \u00b7 people \u00b7 peak density \u00b7 cells)   \u2190 alert these ids directly via broadcast_alert.zoneIds",
  ];
  for (const d of dangerZones.slice(0, 8)) {
    out.push(
      `  ${pad(d.id, 22)} ${pad(String(d.severity || "").toUpperCase(), 9)} ${String(d.personsEst).padStart(6)}p ` +
        `${pad(num(d.maxDensity, " p/m\u00b2"), 11)} ${d.cellCount} cells`
    );
  }
  out.push(
    "  Every one of these is a place people can be crushed. Warn EACH area that is dangerous or about to be,",
    "  not only the largest \u2014 a pocket you leave unwarned is a pocket nobody told to move."
  );
  return out;
}

/**
 * People who have asked for help, by hand.
 *
 * Every other line in this brief is an aggregate. These are individuals pressing
 * a button because something is wrong where they are standing — the one signal
 * that justifies sending a medical tent or marshals to a specific spot rather
 * than describing a density. Grouped by category so a run of SOS presses in one
 * place reads as what it is.
 */
function incidentLines(snapshot) {
  const incidents = snapshot?.incidents || [];
  if (!incidents.length) return [];

  const byCategory = new Map();
  for (const i of incidents) {
    byCategory.set(i.category, (byCategory.get(i.category) || 0) + 1);
  }
  const open = incidents.filter((i) => i.status === "open").length;
  const located = incidents.filter((i) => Array.isArray(i.at)).length;

  const out = [
    "",
    `HELP REQUESTS  ${incidents.length} unresolved (${open} not yet acknowledged by the control room) \u00b7 ${located} with coordinates`,
    `  by type: ${[...byCategory.entries()].map(([c, n]) => `${c} \u00d7${n}`).join(", ")}`,
  ];
  for (const i of incidents.slice(0, 6)) {
    out.push(
      `  ${pad(String(i.category || "other").toUpperCase(), 8)} ${pad(i.status, 13)} ` +
        `${i.at ? `${i.at[0].toFixed(5)},${i.at[1].toFixed(5)}` : "no location"}` +
        `${i.note ? ` \u2014 "${String(i.note).slice(0, 60)}"` : ""}`
    );
  }
  out.push(
    "  These are real people asking for help. Where several cluster in one place, propose",
    "  suggest_placement (medical_tent / marshals) anchored to the crowd or danger area they sit in."
  );
  return out;
}

/* ------------------------------------------------------------------ *
 * Spatial layout — WHERE things are and how the crowds relate to them
 * ------------------------------------------------------------------ */

const COMPASS8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** 8-point compass label for a bearing in degrees (0 = north), or an em dash. */
function compass8(deg) {
  if (deg == null || !Number.isFinite(deg)) return "\u2014";
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return COMPASS8[idx];
}

/** Nearest of a list of { name, at:[lat,lng], … } places to a point, with metres. */
function nearestPlace(point, places) {
  let best = null;
  let bestD = Infinity;
  for (const p of places) {
    if (!Array.isArray(p.at)) continue;
    const d = haversineMeters(point, p.at);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best ? { ...best, distM: Math.round(bestD) } : null;
}

/**
 * Of the given places, the one a body heading on `headingDeg` is walking
 * toward: the place whose bearing from the point is closest to the heading,
 * within a ~55° cone. This is what turns a bare compass heading ("moving SW")
 * into a decision-ready fact ("moving SW toward Gate 1"). Returns null when the
 * crowd is static or nothing meaningful lies ahead.
 */
function placeAhead(point, headingDeg, places) {
  if (headingDeg == null || !Number.isFinite(headingDeg)) return null;
  let best = null;
  let bestDiff = 56; // cone half-angle; outside it, the place is not "ahead"
  for (const p of places) {
    if (!Array.isArray(p.at)) continue;
    const dist = haversineMeters(point, p.at);
    if (dist < 12) continue; // already on top of it
    let diff = Math.abs(bearingDeg(point, p.at) - headingDeg) % 360;
    if (diff > 180) diff = 360 - diff;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = { ...p, distM: Math.round(dist) };
    }
  }
  return best;
}

/**
 * The spatial picture the older brief never gave the model: where the coverage
 * sits, where each zone is relative to its centre and its nearest gate, and —
 * the part that turns a headcount into a decision — which zone each live crowd
 * is standing in, the gate nearest it, and the named place it is walking toward.
 *
 * Before this, the agent knew a crowd's size and a bare compass heading but had
 * no idea what lay in that direction, so it could not say "already inside the
 * Chokepoint" or "moving toward Gate 1 (140 m)" — the exact spatial facts an
 * alert has to name and a citizen has to act on. Everything here is derived from
 * the real venue geometry + the tracked crowds, so the model never guesses.
 */
function spatialLines(venue, snapshot) {
  const aor = venue?.aor?.polygon || [];
  if (aor.length < 3) return [];

  const centre = centroid(aor);
  const zones = (venue?.zones || []).filter(
    (z) => Array.isArray(z.polygon) && z.polygon.length >= 3
  );
  const gates = (venue?.nodes || [])
    .filter((n) => n.type === "gate" && Array.isArray(n.at))
    .map((n) => ({ id: n.id, name: n.name || n.id, at: n.at, state: n.state || "open" }));
  const exits = (venue?.nodes || [])
    .filter((n) => (n.type === "exit" || n.isDestination) && Array.isArray(n.at))
    .map((n) => ({ id: n.id, name: n.name || n.id, at: n.at }));

  // Named landmarks a crowd can be told to walk toward: gates, exits, zone
  // centres. The label carries the id so the model can reference it in actions.
  const landmarks = [
    ...gates.map((g) => ({ name: `${g.name} [${g.id}]`, at: g.at })),
    ...exits.map((e) => ({ name: `${e.name} [${e.id}]`, at: e.at })),
    ...zones.map((z) => ({ name: `${z.name || z.id} [${z.id}]`, at: centroid(z.polygon) })),
  ];

  const out = [
    "",
    "WHERE  (spatial layout \u2014 positions are relative to the coverage centre; then where each crowd actually is)",
    `  coverage centre \u2248 ${centre[0].toFixed(5)},${centre[1].toFixed(5)}`,
  ];

  if (zones.length) {
    out.push("  zones (position from centre \u00b7 nearest gate):");
    for (const z of zones) {
      const c = centroid(z.polygon);
      const distM = Math.round(haversineMeters(centre, c));
      const ng = nearestPlace(c, gates);
      const gate = ng
        ? `nearest gate ${ng.name} (${ng.distM} m ${compass8(bearingDeg(c, ng.at))}, ${ng.state})`
        : "no gate nearby";
      out.push(
        `    ${pad(`${z.name || z.id} [${z.id}]`, 30)} ${pad(`${distM} m ${compass8(bearingDeg(centre, c))} of centre`, 20)} \u00b7 ${gate}`
      );
    }
  }

  const crowds = (snapshot?.clusters || []).filter(
    (k) => (k.isSignificant || k.isCrowd) && Array.isArray(k.centroid)
  );
  if (crowds.length) {
    out.push("  crowds on the ground (which zone \u00b7 nearest gate \u00b7 heading toward):");
    for (const k of crowds.slice(0, 8)) {
      // Innermost containing zone wins: a nested chokepoint is more useful to
      // name than the big parent zone it sits inside, so sort by area ascending.
      const containing = zones
        .filter((z) => pointInPolygon(k.centroid, z.polygon))
        .sort((a, b) => polygonAreaM2(a.polygon) - polygonAreaM2(b.polygon));
      const inZone = containing.length
        ? `in ${containing[0].name || containing[0].id} [${containing[0].id}]`
        : "outside any drawn zone";
      const ng = nearestPlace(k.centroid, gates);
      const gate = ng
        ? `nearest gate ${ng.name} ${ng.distM} m ${compass8(bearingDeg(k.centroid, ng.at))}`
        : "no gate mapped";
      const ahead = placeAhead(k.centroid, k.heading, landmarks);
      const moving =
        (k.meanSpeed ?? 0) > 0.15 && k.headingCompass
          ? `moving ${k.headingCompass}${ahead ? ` toward ${ahead.name} (${ahead.distM} m)` : ""}`
          : "roughly stationary";
      out.push(
        `    ${pad(k.id, 4)} ~${String(k.personsEst).padStart(6)}p ${pad(num(k.density, " p/m\u00b2"), 10)} ${inZone}; ${gate}; ${moving}`
      );
    }
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
export function buildBrief({ event, venue, snapshot, roadNetwork, dangerZones = [], trigger } = {}) {
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
  const candidates = buildCandidates(venue, snapshot, roadNetwork, dangerZones);

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
  // Every dangerous pocket on the ground, so the whole coverage is in view and
  // not just the one biggest crowd.
  lines.push(...dangerAreaLines(dangerZones));
  // Individuals asking for help — the only non-aggregate signal in the brief.
  lines.push(...incidentLines(snapshot));
  // WHERE everything is: coverage centre, each zone's position + nearest gate,
  // and — critically — which zone each crowd is in and what it is walking toward.
  lines.push(...spatialLines(venue, snapshot));
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
