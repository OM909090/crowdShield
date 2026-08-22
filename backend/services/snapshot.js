/**
 * snapshot — the "Situation Snapshot": one compact, derived read model of the
 * live crowd for an event. This is both the map's data source and (later) the
 * AI agent's eyes. It never contains raw coordinates of individuals — only
 * aggregates.
 *
 * In E1 this is pure crowd state (density/flow). Tier 1 (E2) will decorate each
 * zone/cell with risk, forecast (etaCriticalSec) and a state-machine level.
 */
import Venue from "../models/Venue.js";
import Incident from "../models/Incident.js";
import { getDevices } from "./liveStore.js";
import { aggregate } from "./aggregator.js";
import { getLatest, getLatestAt, advance } from "./predictor.js";
import { getActiveAlerts, handleTransitions } from "./alerts.js";
import { advanceClusters, getClusters } from "./clusterTracker.js";
import { cellAreaM2 } from "../utils/h3.js";

const HOTSPOT_COUNT = 5;
/**
 * How old the broadcaster's last risk pass may be before a read refuses to
 * reuse it. The loop ticks at 1 Hz, so anything beyond a few seconds means the
 * loop isn't running (no dashboard open) and the risk numbers are frozen.
 */
const RISK_FRESH_MS = 1500;

/**
 * How long a built snapshot may be reused.
 *
 * The live pipeline only produces new truth once a second, but the command
 * dashboard polls every 5s, the agent reads on every cycle, and the citizen page
 * seeds from it too — each call re-aggregating the entire crowd from scratch. With
 * a large crowd that cost measured at FIFTY SECONDS per call, and because the
 * dashboard kept polling regardless, the requests piled up and starved the event
 * loop that the 1 Hz safety loop runs on. Serving an at-most-one-second-old
 * snapshot to a second caller is not a fidelity loss — the data is 1 Hz — but it
 * is the difference between a responsive control room and a wedged one.
 */
const SNAPSHOT_CACHE_MS = 1000;
const snapshotCache = new Map(); // eventId -> { at, promise }

/**
 * Build the snapshot for an event.
 * @param {Object} event  the Event doc
 * @param {Object} [venue] optional pre-loaded Venue (broadcaster passes a cached one)
 */
export async function buildSnapshot(event, venue) {
  // Coalesce concurrent/rapid reads onto one build. Keyed per event; a caller that
  // passes its own pre-loaded venue still shares the cache, because the venue it
  // passes is the same document the cached build used within this window.
  const key = String(event?._id || event?.id || "unknown");
  const hit = snapshotCache.get(key);
  if (hit && Date.now() - hit.at < SNAPSHOT_CACHE_MS) return hit.promise;

  const promise = buildSnapshotUncached(event, venue).catch((err) => {
    // Never cache a failure: the next caller must be free to try again.
    snapshotCache.delete(key);
    throw err;
  });
  snapshotCache.set(key, { at: Date.now(), promise });
  return promise;
}

async function buildSnapshotUncached(event, venue) {
  const v = venue !== undefined ? venue : await Venue.findOne({ event: event._id });
  const devices = getDevices(event._id);
  const { cells, zones, totals } = aggregate(devices, v);

  // Tier 1 risk. While a dashboard is open the broadcaster advances the
  // predictor at 1 Hz and we simply reuse that pass — it must stay the single
  // source of truth so the forecaster isn't stepped twice for the same second.
  //
  // With no viewer the loop is stopped, and the previous behaviour was to serve
  // whatever it computed last — a density and risk from minutes ago, stamped
  // with `generatedAt: now`. So when that pass is stale we advance the predictor
  // here instead, against the readings we just aggregated, and pass the real
  // elapsed time so the forecaster's slope stays meaningful.
  const lastRiskAt = getLatestAt(event._id);
  const riskAgeMs = lastRiskAt ? Date.now() - lastRiskAt : Infinity;
  const riskFresh = riskAgeMs <= RISK_FRESH_MS;

  // Crowd objects follow the same freshness rule as risk: reuse the live loop's
  // pass while it is running, otherwise derive them here from the cells we just
  // aggregated. A read must never hand the agent a crowd that dispersed minutes
  // ago just because nobody had a dashboard open.
  const clusters = riskFresh
    ? getClusters(event._id)
    : advanceClusters(event._id, cells, (c) => cellAreaM2(c.h3)).clusters;

  let zoneOut;
  if (riskFresh) {
    const latest = getLatest(event._id);
    // Take only the risk decoration from that pass. The crowd measurements
    // (sampleCount, density, meanSpeed…) always come from the aggregation we
    // just did, so a response can never pair a current headcount with a
    // density from a second ago.
    zoneOut = zones.map((z) => {
      const prior = latest?.get(z.id);
      if (!prior) return z;
      return {
        ...z,
        risk: prior.risk,
        riskLevel: prior.riskLevel,
        riskFactors: prior.riskFactors,
        forecast: prior.forecast,
        stateSince: prior.stateSince,
      };
    });
  } else {
    const stepSeconds = Number.isFinite(riskAgeMs) ? Math.min(60, Math.max(1, riskAgeMs / 1000)) : 1;
    const { zones: advanced, transitions } = advance(event._id, zones, { stepSeconds });
    zoneOut = advanced;
    // A state change found here is real and must not be swallowed: advancing the
    // machine consumes the transition, so if we dropped it the escalation would
    // never reach the Alert collection or the agent's wake bus. This is also why
    // a venue with nobody watching the dashboard can still raise an alarm.
    if (transitions.length) {
      handleTransitions(event._id, transitions).catch((err) =>
        console.error("[snapshot] alert persist failed:", err.message)
      );
    }
  }
  const activeAlerts = await getActiveAlerts(event._id);

  /**
   * Unhandled calls for help.
   *
   * Density says where a crush may form; an SOS says where somebody already needs
   * reaching. The agent could not see these at all, so it could never say "people
   * are collapsing in that pocket — put a medical tent there", which is exactly
   * the kind of judgement a control room wants from it. Only the actionable ones
   * (open/acknowledged), newest first, capped.
   */
  const incidentDocs = await Incident.find({
    event: event._id,
    status: { $in: ["open", "acknowledged"] },
  })
    .sort({ createdAt: -1 })
    .limit(50);

  return {
    eventId: String(event._id),
    generatedAt: new Date().toISOString(),
    totals,
    // Worst-first: by risk when available, else by density.
    zones: [...zoneOut].sort((a, b) => (b.risk ?? -1) - (a.risk ?? -1) || b.density - a.density),
    hotspots: cells.slice(0, HOTSPOT_COUNT),
    cells,
    // Tracked crowd objects, biggest first — what the agent reasons about
    // instead of tens of thousands of points.
    clusters: [...clusters].sort((a, b) => (b.personsEst ?? 0) - (a.personsEst ?? 0)),
    incidents: incidentDocs.map((i) => ({
      id: String(i._id),
      category: i.category,
      status: i.status,
      reporterType: i.reporterType,
      note: i.note,
      at: Number.isFinite(i.geo?.lat) && Number.isFinite(i.geo?.lng) ? [i.geo.lat, i.geo.lng] : null,
      createdAt: i.createdAt,
    })),
    activeAlerts: activeAlerts.map((a) => ({
      id: String(a._id),
      zoneId: a.zoneId,
      zoneName: a.zoneName,
      severity: a.severity,
      risk: a.risk,
      etaCriticalSec: a.etaCriticalSec,
      status: a.status,
      createdAt: a.createdAt,
    })),
    // gate/corridor state travels with the snapshot so consumers see the same
    // operational picture the authority is acting on.
    nodes: (v?.nodes || []).map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      state: n.state,
      throughputPerMin: n.throughputPerMin,
      at: n.at,
    })),
    hasVenue: !!v,
  };
}
