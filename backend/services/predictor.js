/**
 * predictor — Tier 1. Turns the aggregator's per-zone crowd metrics into a
 * risk score, a short-horizon forecast, and a debounced state-machine level.
 *
 * This is the always-on "radar". It is pure math (no LLM), deterministic, and
 * explainable: every risk score carries the factors that produced it, and the
 * state machine only escalates on *sustained* multi-signal evidence — which is
 * what keeps false alarms down (a scored constraint).
 *
 * The broadcaster calls advance() once per tick (single source of truth for the
 * forecaster); the snapshot reads getLatest() so it never double-advances.
 */
import { Holt } from "./forecaster.js";
import { PEDESTRIAN } from "../utils/geo.js";

const CRIT_DENSITY = PEDESTRIAN.DENSITY.CRITICAL; // 4.0 p/m²
const DANGER_DENSITY = PEDESTRIAN.DENSITY.DANGEROUS; // 5.0 p/m²
const HORIZON_S = 600; // forecast horizon (10 min)

export const LEVELS = ["NORMAL", "WATCH", "ELEVATED", "HIGH", "CRITICAL"];
const PROMOTE = [0, 0.3, 0.5, 0.68, 0.82]; // risk needed to sit at level i
const HYST = 0.08; // must fall this far below to demote (anti-flapping)
/**
 * How long a breach must persist before promoting a level (anti-spike).
 *
 * Measured in SECONDS, not ticks. It used to count ticks and assume they arrived
 * once a second; under a large crowd a pass can take many seconds, so "3 ticks"
 * silently became half a minute of sustained danger before anything escalated —
 * the venue was packed and the alert feed still said "all zones nominal". Time is
 * what the safety property is actually about, so time is what we count.
 */
const SUSTAIN_S = 3;
const CONF_MIN = 0.5; // below this confidence, cap at WATCH
const CONF_SAMPLES = 8; // sampled devices for full confidence
const PRESSURE_REF = 2.0; // normaliser for density × speed-variance
// Confidence retained when a zone is measured by headcount alone (no motion
// data): density is still real, but 3 of the 5 risk factors are blind.
const MOTION_CONF_FLOOR = 0.6;

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const round = (n, dp = 2) => {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};

class ZoneTracker {
  constructor() {
    this.holt = new Holt({ alpha: 0.5, beta: 0.3 });
    this.level = 0;
    this.pending = null;
    this.pendingSeconds = 0;
    this.stateSince = Date.now();
  }
}

// eventId -> { zones: Map<zoneId, ZoneTracker>, latest: Map<zoneId, decorated>, latestAt: number }
const events = new Map();

const eventState = (eventId) => {
  const key = String(eventId);
  let s = events.get(key);
  if (!s) {
    s = { zones: new Map(), latest: new Map(), latestAt: 0 };
    events.set(key, s);
  }
  return s;
};

/**
 * Compute the 0..1 risk + its explainable factors for one zone snapshot.
 *
 * Missing motion data is treated as *absence of evidence*, never as a benign
 * reading: an unknown speed contributes nothing to `crush` (rather than looking
 * like a stalled crowd) and unknown headings contribute nothing to `turbulence`
 * (rather than looking like perfect order). The cost of that blindness is paid
 * in `confidence`, which the state machine uses to cap escalation — so a zone we
 * can only measure by headcount cannot quietly claim a crush signature.
 */
function scoreZone(z, eta) {
  const dens = clamp01(z.density / DANGER_DENSITY);
  const slow = Number.isFinite(z.meanSpeed) ? clamp01(1 - z.meanSpeed / PEDESTRIAN.FREE_WALK_SPEED_MPS) : 0;
  const crush = clamp01(dens * slow * 1.6); // dense AND slow — the crush signature
  const pressure = Number.isFinite(z.speedVar) ? clamp01((z.density * z.speedVar) / PRESSURE_REF) : 0;
  const turbulence = Number.isFinite(z.dirCoherence) ? clamp01(1 - z.dirCoherence) : 0;
  const forecast = Number.isFinite(eta) ? clamp01(1 - eta / HORIZON_S) : 0;

  const risk = clamp01(0.35 * dens + 0.25 * crush + 0.15 * pressure + 0.1 * turbulence + 0.15 * forecast);

  // How much of this zone's crowd actually reported motion. 1.0 when every
  // sampled device has speed (the simulator, and phones after their first fix);
  // lower when we're flying on headcount alone.
  const motionCoverage = z.sampleCount > 0 ? clamp01((z.speedSamples ?? 0) / z.sampleCount) : 0;
  const sampleConf = clamp01((z.sampleCount || 0) / CONF_SAMPLES);
  const confidence = clamp01(sampleConf * (MOTION_CONF_FLOOR + (1 - MOTION_CONF_FLOOR) * motionCoverage));

  return {
    risk,
    confidence,
    factors: {
      density: round(dens),
      crush: round(crush),
      pressure: round(pressure),
      turbulence: round(turbulence),
      forecast: round(forecast),
      confidence: round(confidence),
      motionCoverage: round(motionCoverage),
    },
  };
}

/** Debounced state machine: hysteresis + sustained-breach + confidence + multi-signal CRITICAL. */
function stepState(tr, risk, confidence, factors, stepSeconds = 1) {
  let desired = 0;
  for (let i = 1; i < PROMOTE.length; i += 1) if (risk >= PROMOTE[i]) desired = i;

  // CRITICAL needs corroboration, not just a high blended score.
  if (desired === 4 && !(factors.density >= 0.6 && (factors.crush >= 0.4 || factors.pressure >= 0.4))) desired = 3;
  // Too few samples → can't exceed WATCH.
  if (confidence < CONF_MIN) desired = Math.min(desired, 1);

  const from = tr.level;
  const step = Number.isFinite(stepSeconds) && stepSeconds > 0 ? stepSeconds : 1;
  if (desired > tr.level) {
    if (tr.pending === desired) tr.pendingSeconds += step;
    else {
      tr.pending = desired;
      tr.pendingSeconds = step;
    }
    if (tr.pendingSeconds >= SUSTAIN_S) {
      tr.level = desired;
      tr.pending = null;
      tr.pendingSeconds = 0;
    }
  } else if (desired < tr.level && risk < PROMOTE[tr.level] - HYST) {
    tr.level = Math.max(desired, tr.level - 1); // ease down one level at a time
    tr.pending = null;
    tr.pendingSeconds = 0;
  } else {
    tr.pending = null;
    tr.pendingSeconds = 0;
  }

  if (tr.level !== from) tr.stateSince = Date.now();
  return from;
}

/**
 * Advance the predictor one tick.
 * @param {string} eventId
 * @param {Array} zones     aggregator zone output (density, meanSpeed, speedVar, dirCoherence, sampleCount…)
 * @param {number} stepSeconds
 * @returns {{ zones: Array, transitions: Array }}
 */
export function advance(eventId, zones = [], { stepSeconds = 1 } = {}) {
  const state = eventState(eventId);
  const transitions = [];
  state.latest = new Map();
  state.latestAt = Date.now();

  const decorated = zones.map((z) => {
    let tr = state.zones.get(z.id);
    if (!tr) {
      tr = new ZoneTracker();
      state.zones.set(z.id, tr);
    }

    tr.holt.update(z.density);
    const eta = tr.holt.ready ? tr.holt.secondsToThreshold(CRIT_DENSITY, stepSeconds) : Infinity;
    const projectedDensity = tr.holt.forecast(Math.round(HORIZON_S / stepSeconds));

    const { risk, confidence, factors } = scoreZone(z, eta);
    const from = stepState(tr, risk, confidence, factors, stepSeconds);

    const decoratedZone = {
      ...z,
      risk: round(risk),
      riskLevel: LEVELS[tr.level],
      riskFactors: factors,
      forecast: {
        etaCriticalSec: Number.isFinite(eta) ? Math.round(eta) : null,
        projectedDensity: projectedDensity != null ? round(projectedDensity) : null,
        trend: round(tr.holt.trend, 3),
      },
      stateSince: tr.stateSince,
    };
    state.latest.set(z.id, decoratedZone);

    if (tr.level !== from) {
      transitions.push({
        zoneId: z.id,
        zoneName: z.name,
        from: LEVELS[from],
        to: LEVELS[tr.level],
        direction: tr.level > from ? "up" : "down",
        risk: round(risk),
        factors,
        etaCriticalSec: Number.isFinite(eta) ? Math.round(eta) : null,
      });
    }
    return decoratedZone;
  });

  return { zones: decorated, transitions };
}

/** Latest decorated zones (Map by id) for the on-demand snapshot to merge. */
export function getLatest(eventId) {
  return events.get(String(eventId))?.latest || null;
}

/**
 * When advance() last ran for this event (epoch ms), or 0 if never.
 *
 * The broadcaster's loop is viewer-driven, so it stops when the last dashboard
 * closes. Read paths use this to tell "current risk" from "risk frozen at the
 * last tick" — serving the latter as if it were live is the same lie as a stale
 * alert.
 */
export function getLatestAt(eventId) {
  return events.get(String(eventId))?.latestAt || 0;
}

export function clearEvent(eventId) {
  events.delete(String(eventId));
}
