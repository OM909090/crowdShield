/**
 * agentTrigger — decide, every live tick, whether the crowd situation warrants
 * waking the Tier 2 agent.
 *
 * The original design only woke the agent when a *hand-drawn zone* crossed a
 * risk threshold. That made the agent blind on any event where the operator had
 * not authored zones yet — the crowd could pack the coverage area solid and
 * nothing would ever escalate. This closes that gap: it reads the same live
 * signals the map already computes — H3 density hotspots, tracked crowd objects,
 * and the crush-precursor events (two crowds converging, a merge, a body of
 * people swelling fast) — and wakes the agent on ANY of them, zones or not.
 *
 * It is also continuous, not one-shot. While the area stays dangerous it re-wakes
 * the agent at a steady cadence so it keeps reassessing as the situation moves,
 * and it bypasses the cadence the moment things get worse. When the area calms it
 * resets, so the next build-up earns a fresh, immediate look. The cadence + the
 * "only when it worsens" bypass are what keep it from storming the LLM while
 * still behaving like an operator who never takes their eyes off the floor.
 *
 * Tier 0/1 (sensing + prediction) never depend on this — if no provider is
 * configured the agent simply no-ops downstream.
 */
import { alertBus } from "../realtime/alertBus.js";

/** Fruin density-level string (per cell/cluster) → 0..4 threat band. */
const LEVEL_BAND = { open: 0, free: 0, comfortable: 0, constrained: 1, dense: 2, critical: 3, dangerous: 4 };
/** Authored-zone risk level → 0..4 threat band. */
const RISK_BAND = { NORMAL: 0, WATCH: 1, ELEVATED: 2, HIGH: 3, CRITICAL: 4 };
/** Agent severity label per band. */
const BAND_SEVERITY = ["low", "low", "medium", "high", "critical"];

/** ELEVATED and up is worth the agent's attention. */
const WAKE_BAND = 2;
/** Re-look cadence while the area stays dangerous. */
const COOLDOWN_MS = 60_000;
/** A significant crowd gaining people this fast is an early warning on its own. */
const FAST_GROWTH_PER_MIN = 1500;

const levelBand = (level) => LEVEL_BAND[level] ?? 0;
const round = (n, dp = 2) => (Number.isFinite(n) ? Math.round(n * 10 ** dp) / 10 ** dp : n);

// eventId -> { wokeAt, wokeBand }
const state = new Map();

/**
 * Read a live frame into a threat band + the human reasons behind it.
 *
 * @param {Object} frame { cells, clusters, clusterEvents, zones, totals }
 * @returns {{ band:number, severity:string, reasons:string[], focus:Object|null }}
 */
export function assessThreat(frame = {}) {
  const cells = frame.cells || [];
  const clusters = frame.clusters || [];
  const clusterEvents = frame.clusterEvents || [];
  const zones = frame.zones || [];
  const gateLoads = frame.gateLoads || [];
  const totals = frame.totals || {};

  // No phones reporting = unmeasured, not calm. There is genuinely nothing to act
  // on, and waking the agent to reason about an empty data set only invites
  // hallucination (the brief itself refuses to recommend anything here).
  if (!(totals.sampledDevices > 0)) {
    return { band: 0, severity: "low", reasons: [], focus: null };
  }

  const signals = [];

  // 1) The worst H3 density hotspot. This is the signal that works with no zones
  //    drawn at all — raw packing on the ground.
  let worstCell = null;
  for (const c of cells) {
    if (!worstCell || levelBand(c.level) > levelBand(worstCell.level)) worstCell = c;
  }
  if (worstCell && levelBand(worstCell.level) >= 1) {
    signals.push({
      band: levelBand(worstCell.level),
      reason: `a hotspot is ${worstCell.level} at ${round(worstCell.density)} p/m² (~${worstCell.personsEst} people)`,
      focus: { label: "density hotspot", at: worstCell.center || null },
    });
  }

  // 2) The worst tracked crowd object.
  let worstCluster = null;
  for (const k of clusters) {
    if (!(k.isSignificant || k.isCrowd)) continue;
    if (!worstCluster || levelBand(k.level) > levelBand(worstCluster.level)) worstCluster = k;
  }
  if (worstCluster && levelBand(worstCluster.level) >= 1) {
    signals.push({
      band: levelBand(worstCluster.level),
      reason: `crowd ${worstCluster.id} is ${worstCluster.level} (~${worstCluster.personsEst} people${
        worstCluster.headingCompass ? `, heading ${worstCluster.headingCompass}` : ""
      })`,
      focus: { label: `crowd ${worstCluster.id}`, at: worstCluster.centroid || null, clusterId: worstCluster.id },
    });
  }

  // 3) A significant crowd swelling fast — surface it at least at ELEVATED even
  //    if it is not yet dense, because that is the whole point of predicting.
  for (const k of clusters) {
    if (k.isSignificant && (k.growthPerMin ?? 0) >= FAST_GROWTH_PER_MIN) {
      signals.push({
        band: WAKE_BAND,
        reason: `crowd ${k.id} is swelling fast (+${k.growthPerMin}/min, ~${k.personsEst} people)`,
        focus: { label: `crowd ${k.id} growing`, at: k.centroid || null, clusterId: k.id },
      });
    }
  }

  // 4) Convergence / merge — the classic crush geometry: two bodies of people
  //    arriving at the same point. Flagged before they actually merge.
  for (const e of clusterEvents) {
    if (e.kind === "converging") {
      signals.push({
        band: e.bothDense ? 4 : 3,
        reason: `crowds ${(e.clusterIds || []).join(" & ")} are converging (${e.gapM} m apart, ~${
          e.combinedPersonsEst
        } people${e.bothDense ? ", both dense" : ""})`,
        focus: { label: `converging ${(e.clusterIds || []).join("+")}`, at: e.at || null },
      });
    } else if (e.kind === "merge" && e.significant) {
      signals.push({
        band: 3,
        reason: `crowds are merging (~${e.personsEst} people)`,
        focus: { label: "merge", at: e.at || null },
      });
    }
  }

  // 5) Authored zones, if any — keep the original zone-risk signal in the mix.
  let worstZone = null;
  for (const z of zones) {
    if (!worstZone || (RISK_BAND[z.riskLevel] ?? 0) > (RISK_BAND[worstZone.riskLevel] ?? 0)) worstZone = z;
  }
  if (worstZone && (RISK_BAND[worstZone.riskLevel] ?? 0) >= 1) {
    signals.push({
      band: RISK_BAND[worstZone.riskLevel] ?? 0,
      reason: `zone ${worstZone.name || worstZone.id} is ${worstZone.riskLevel} (risk ${round(worstZone.risk)})`,
      focus: { label: worstZone.name || worstZone.id, zoneId: worstZone.id },
    });
  }

  // 6) A gate being pushed past what it can pass — a crush forms at the barrier.
  //    HIGH when overloaded, WATCH-plus when merely busy. The reason tells the
  //    agent to divert arrivals to a less-loaded open gate.
  let worstGate = null;
  for (const g of gateLoads) {
    if (g.level !== "overload" && g.level !== "busy") continue;
    if (!worstGate || g.nearPersons > worstGate.nearPersons) worstGate = g;
  }
  if (worstGate) {
    signals.push({
      band: worstGate.level === "overload" ? 3 : 2,
      reason: `${worstGate.name} is ${worstGate.level === "overload" ? "overloaded" : "very busy"} — ~${worstGate.nearPersons} waiting vs ${worstGate.capacityPerMin}/min (~${worstGate.clearMin} min to clear); divert arrivals to a less-loaded open gate`,
      focus: { label: worstGate.name, at: worstGate.at },
    });
  }

  if (!signals.length) return { band: 0, severity: "low", reasons: [], focus: null };

  const band = signals.reduce((m, s) => Math.max(m, s.band), 0);
  const top = signals
    .filter((s) => s.band >= WAKE_BAND)
    .sort((a, b) => b.band - a.band);
  const focus = (top[0] || signals.slice().sort((a, b) => b.band - a.band)[0])?.focus || null;

  return {
    band,
    severity: BAND_SEVERITY[band] || "low",
    reasons: top.map((s) => s.reason).slice(0, 4),
    focus,
  };
}

/**
 * Given the current threat, decide whether to wake the agent now.
 *
 * - Below ELEVATED: never; and reset so the next build-up wakes immediately.
 * - It just got worse than when we last looked: wake now (bypass the cadence).
 * - Still dangerous and the cadence has elapsed: wake again (stay on it).
 */
export function shouldWake(eventId, threat, now = Date.now()) {
  const key = String(eventId);
  const st = state.get(key) || { wokeAt: 0, wokeBand: 0 };

  if (threat.band < WAKE_BAND) {
    if (st.wokeBand !== 0) state.set(key, { wokeAt: st.wokeAt, wokeBand: 0 });
    return false;
  }

  const worsened = threat.band > st.wokeBand;
  const cadenceElapsed = now - st.wokeAt >= COOLDOWN_MS;
  if (worsened || cadenceElapsed) {
    state.set(key, { wokeAt: now, wokeBand: threat.band });
    return true;
  }
  return false;
}

/** Forget an event's wake state (event ended / no viewers). */
export function clearTrigger(eventId) {
  state.delete(String(eventId));
}

/**
 * Assess the frame and, if warranted, emit a `crowd_condition` wake on the alert
 * bus. Called from the broadcaster each tick. Safe to call constantly — it wakes
 * the agent at most about once a minute per event unless the situation worsens.
 */
export function maybeWakeAgent(eventId, frame) {
  const threat = assessThreat(frame);
  if (!shouldWake(eventId, threat)) return null;
  alertBus.emit("alert", { kind: "crowd_condition", eventId: String(eventId), condition: threat });
  return threat;
}

export { WAKE_BAND, COOLDOWN_MS };
