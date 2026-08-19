/**
 * readings — the persisted trend behind the dashboards' charts.
 *
 * Two rules keep these honest:
 *   1. we only record a sample when the event actually has live readings, so a
 *      chart can never show a crowd that wasn't being measured; and
 *   2. samples are rate-limited, so a dashboard polling every 5s doesn't inflate
 *      the history into a misleadingly dense line.
 */
import Reading from "../models/Reading.js";

const MIN_SAMPLE_GAP_MS = 20_000; // at most one stored point per 20s per event
const TREND_POINTS = 24; // ~8 minutes of history at that cadence

// eventId -> last write time, so we don't hit the DB just to reject a sample.
const lastWrite = new Map();

/** Label used on the chart's x-axis. */
const hhmm = (d) =>
  d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });

/**
 * Record a sample (when appropriate) and return the trend for charting.
 *
 * @param {string} eventId
 * @param {{people:number, risk:number, hasLiveData:boolean}} sample
 * @returns {Promise<Array<{time:string, people:number, risk:number}>>} oldest → newest
 */
export async function recordReading(eventId, { people, risk, hasLiveData }) {
  const key = String(eventId);
  const now = Date.now();

  if (hasLiveData && now - (lastWrite.get(key) || 0) >= MIN_SAMPLE_GAP_MS) {
    lastWrite.set(key, now);
    try {
      await Reading.create({ event: eventId, people, risk });
    } catch {
      // Telemetry must never break the dashboard it decorates.
    }
  }

  return getTrend(eventId);
}

/** The recent trend, oldest → newest (charts read left to right). */
export async function getTrend(eventId, limit = TREND_POINTS) {
  const rows = await Reading.find({ event: eventId }).sort({ at: -1 }).limit(limit).lean();
  return rows
    .reverse()
    .map((r) => ({ time: hhmm(new Date(r.at)), people: r.people, risk: r.risk }));
}
