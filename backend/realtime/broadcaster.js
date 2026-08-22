/**
 * broadcaster — one aggregation+emit loop per actively-watched event.
 *
 * Lifecycle is viewer-driven: the first `subscribe` starts the loop, the last
 * `unsubscribe`/disconnect stops it. Each tick prunes stale devices, aggregates
 * the live positions (via the same code the snapshot uses), and emits a compact
 * `crowd:tick` frame to the event room.
 */
import { getIO, roomName } from "./socket.js";
import Venue from "../models/Venue.js";
import { getDevices, prune } from "../services/liveStore.js";
import { aggregate, filterToCoverage } from "../services/aggregator.js";
import { advance as predictorAdvance } from "../services/predictor.js";
import { handleTransitions, syncActiveAlerts } from "../services/alerts.js";
import { advanceClusters } from "../services/clusterTracker.js";
import { maybeWakeAgent } from "../services/agentTrigger.js";
import { detectDangerZones } from "../services/dangerZones.js";
import { computeGateLoads } from "../services/gateLoad.js";
import { cellAreaM2 } from "../utils/h3.js";

const TICK_MS = 1000;
const VENUE_REFRESH_MS = 10000; // re-read venue occasionally (gate/zone edits)
const MAX_DOTS = 4000; // payload guard; viewport-scoping/WebGL handles bigger later

// eventId -> { viewers, timer, venue, venueAt }
const state = new Map();

const ev = (eventId) => {
  const key = String(eventId);
  let s = state.get(key);
  if (!s) {
    s = { viewers: 0, timer: null, venue: undefined, venueAt: 0, ticking: false, slowSince: 0, lastTickAt: 0 };
    state.set(key, s);
  }
  return s;
};

/**
 * A tick slower than this is logged once, because it is the early warning that
 * the loop is falling behind the crowd it is supposed to be watching.
 */
const SLOW_TICK_MS = 900;
const SLOW_LOG_EVERY_MS = 10_000;

export function addViewer(eventId) {
  const s = ev(eventId);
  s.viewers += 1;
  if (!s.timer) s.timer = setInterval(() => tick(eventId), TICK_MS);
}

export function removeViewer(eventId) {
  const s = state.get(String(eventId));
  if (!s) return;
  s.viewers = Math.max(0, s.viewers - 1);
  if (s.viewers === 0 && s.timer) {
    clearInterval(s.timer);
    s.timer = null;
  }
}

async function loadVenue(s, eventId) {
  if (s.venue === undefined || Date.now() - s.venueAt > VENUE_REFRESH_MS) {
    s.venue = await Venue.findOne({ event: eventId });
    s.venueAt = Date.now();
  }
}

async function tick(eventId) {
  const io = getIO();
  if (!io) return;
  const s = ev(eventId);

  /**
   * Overrun guard.
   *
   * `tick` is async (it awaits the venue read), so setInterval will happily start
   * the next one while this is mid-flight. Under a large crowd each pass costs
   * real CPU — aggregate, cluster, danger zones, gate loads — and once a pass
   * takes longer than the interval the overlapping passes pile up, starve the
   * event loop and the whole API stops accepting connections. Measured in
   * exactly that state: 100% of a core, HTTP timing out, 30 connections queued
   * unaccepted. Dropping a frame is always better than wedging the server:
   * the next tick recomputes from live positions anyway, so nothing is lost.
   */
  if (s.ticking) return;
  s.ticking = true;
  const startedAt = Date.now();

  try {
    await loadVenue(s, eventId);
    prune(eventId);
    const devices = getDevices(eventId);
    const { cells, zones, totals } = aggregate(devices, s.venue);

    // The map draws only what the metrics count. Anyone outside the drawn
    // coverage area is another event's crowd, and showing them would make the
    // dots disagree with every number beside them.
    //
    // Only pay for the point-in-polygon sweep when there are more devices than we
    // will draw anyway — below the dot cap every covered device is drawn, and the
    // aggregate above has already told us how many that is. This was running a
    // second full coverage test over the entire crowd on every single tick.
    const needsFilter = (totals.coverageDefined && devices.length > MAX_DOTS) || totals.outsideCoverage > 0;
    const covered = needsFilter ? filterToCoverage(devices, s.venue).covered : devices;

    // Crowd objects, not points: the client uses these to merge dots into one
    // labelled blob as people pack together, and the agent reasons about them by
    // name (K3) instead of by hexagon id.
    const { clusters, events: clusterEvents } = advanceClusters(eventId, cells, (c) => cellAreaM2(c.h3));

    // Tier 1: decorate zones with risk/forecast/state and detect escalations.
    //
    // The REAL elapsed time matters, not the nominal tick. Under a heavy crowd a
    // pass can take many seconds and the overrun guard drops frames, so claiming
    // "1 second passed" made the forecaster's slope — and therefore every
    // time-to-critical — badly wrong, and stretched the state machine's sustained
    // -breach window from 3 seconds to half a minute. That is why a venue could be
    // visibly packed while the alert feed still read "all zones nominal".
    const elapsedS = s.lastTickAt ? Math.min(30, Math.max(0.2, (startedAt - s.lastTickAt) / 1000)) : TICK_MS / 1000;
    s.lastTickAt = startedAt;
    const { zones: riskZones, transitions } = predictorAdvance(eventId, zones, { stepSeconds: elapsedS });

    // Live danger pockets: tight polygons around genuinely dense cells, computed
    // every tick with no LLM in the loop. This is the always-on "danger zone"
    // layer the map draws — multiple, sized to the actual crowd, not one blob.
    const dangerZones = detectDangerZones(cells);

    // How hard each open gate is being pushed — for the map's overload pulse and
    // the agent's divert decision.
    const gateLoads = computeGateLoads(cells, s.venue);

    // Keep open alerts aligned with reality: refresh the ones whose zones are
    // still elevated, resolve the ones that have calmed. Fire-and-forget so a
    // slow write can't delay the frame.
    syncActiveAlerts(eventId, riskZones).catch((err) =>
      console.error("[alerts] sync failed:", err.message)
    );

    if (transitions.length) {
      handleTransitions(eventId, transitions)
        .then((created) => {
          for (const a of created) {
            io.to(roomName(eventId)).emit("alert:new", {
              id: String(a._id),
              zoneId: a.zoneId,
              zoneName: a.zoneName,
              severity: a.severity,
              risk: a.risk,
              etaCriticalSec: a.etaCriticalSec,
              createdAt: a.createdAt,
            });
          }
        })
        .catch((err) => console.error("[alerts] persist failed:", err.message));
    }

    // Wake the Tier 2 agent on ANY dangerous crowd condition — density hotspots,
    // a dense/converging/fast-growing tracked crowd, or an escalated zone — not
    // only on hand-drawn zone alerts. This is what lets the agent act on an event
    // that has no zones authored, and keep acting while the area stays dangerous.
    // Assessment is cheap; the trigger itself throttles how often it wakes.
    try {
      maybeWakeAgent(eventId, { cells, clusters, clusterEvents, zones: riskZones, totals, gateLoads });
    } catch (err) {
      console.error(`[agent-trigger] assess failed for ${eventId}:`, err.message);
    }

    // h/s stay null when the device hasn't reported motion — the client draws a
    // neutral dot rather than an arrow pointing north at 0 m/s.
    const dots = covered.slice(0, MAX_DOTS).map((d) => ({
      id: d.id,
      lat: round(d.lat, 6),
      lng: round(d.lng, 6),
      h: Number.isFinite(d.heading) ? Math.round(d.heading) : null,
      s: Number.isFinite(d.speed) ? round(d.speed, 1) : null,
    }));

    io.to(roomName(eventId)).emit("crowd:tick", {
      eventId: String(eventId),
      t: Date.now(),
      dots,
      truncated: covered.length > MAX_DOTS,
      cells: cells.map((c) => ({
        h3: c.h3,
        c: c.center,
        d: c.density,
        lvl: c.level,
        n: c.personsEst,
        b: c.flowBearing,
      })),
      // Tracked crowd objects. Geometry the client needs to draw a merged blob
      // (centroid, radius, head count) plus the movement that makes it readable.
      clusters: clusters.map((k) => ({
        id: k.id,
        c: k.centroid,
        r: k.radiusM,
        n: k.personsEst,
        d: k.density,
        lvl: k.level,
        s: k.meanSpeed,
        h: k.heading,
        hc: k.headingCompass,
        g: k.growthPerMin,
        crowd: k.isCrowd,
        sig: k.isSignificant,
        cells: k.cellCount,
        age: k.ageSec,
      })),
      clusterEvents,
      zones: riskZones,
      dangerZones,
      gateLoads,
      totals,
    });
  } catch (err) {
    // A bad tick should never kill the loop.
    console.error(`[broadcaster] tick failed for ${eventId}:`, err.message);
  } finally {
    s.ticking = false;
    // Say it out loud when the loop is falling behind, rather than letting the
    // server quietly degrade until the API stops answering.
    const took = Date.now() - startedAt;
    if (took > SLOW_TICK_MS && Date.now() - s.slowSince > SLOW_LOG_EVERY_MS) {
      s.slowSince = Date.now();
      console.warn(
        `[broadcaster] slow tick for ${eventId}: ${took}ms (>${SLOW_TICK_MS}ms) — ` +
          "frames will be dropped to keep the API responsive; reduce the simulated crowd size"
      );
    }
  }
}

export function broadcasterStatus() {
  return [...state.entries()].map(([eventId, s]) => ({ eventId, viewers: s.viewers, running: !!s.timer }));
}

function round(n, dp) {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}
