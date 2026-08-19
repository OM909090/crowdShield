/**
 * liveStore — hot, per-device last-known position, kept in memory.
 *
 * This is the "now" of the system: raw positions with a short lifetime. Only
 * aggregates (H3 cells / zone rollups) are ever persisted; individual tracks
 * live here transiently and are pruned aggressively (privacy + memory).
 *
 * Deliberately a narrow, storage-agnostic interface. Swapping this for Redis
 * later (for multi-instance scale) means reimplementing these ~6 functions and
 * nothing else — callers never touch the underlying Map.
 *
 * device shape:
 *   { id, lat, lng, prevLat, prevLng, heading, speed, t, updatedAt }
 *   heading = degrees 0-360 (0 = north); speed = m/s
 */
import { haversineMeters, bearingDeg } from "../utils/geo.js";

const DEFAULT_TTL_MS = 15000; // a device unheard-from for 15s drops off the map

// eventId -> Map<deviceHash, device>
const events = new Map();

const eventMap = (eventId) => {
  const key = String(eventId);
  let m = events.get(key);
  if (!m) {
    m = new Map();
    events.set(key, m);
  }
  return m;
};

/**
 * Record a heartbeat. Heading/speed are derived from the previous fix when the
 * client doesn't supply them (real phones often will; the simulator always does).
 *
 * When neither the client reports motion nor a previous fix exists to derive it
 * from, heading/speed stay **null**. That matters: a first-ever heartbeat stored
 * as `speed: 0, heading: 0` would tell the aggregator "stalled, facing north",
 * which reads as a measurement but is really just missing data. Downstream code
 * (aggregator, predictor, UI) is written to treat null as "unknown".
 */
export function upsertDevice(eventId, { deviceHash, lat, lng, heading, speed, t } = {}) {
  if (deviceHash == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const now = Date.now();
  const m = eventMap(eventId);
  const prev = m.get(String(deviceHash));

  let h = Number.isFinite(heading) ? heading : null;
  let s = Number.isFinite(speed) ? speed : null;
  if ((h == null || s == null) && prev) {
    const dtSec = Math.max(0.001, (now - prev.updatedAt) / 1000);
    const dist = haversineMeters([prev.lat, prev.lng], [lat, lng]);
    if (s == null) s = dist / dtSec;
    // Below ~0.3 m the GPS jitter swamps the bearing, so keep the last known
    // heading if we have one rather than fabricating a direction.
    if (h == null && dist > 0.3) h = bearingDeg([prev.lat, prev.lng], [lat, lng]);
  }

  const device = {
    id: String(deviceHash),
    lat,
    lng,
    prevLat: prev ? prev.lat : lat,
    prevLng: prev ? prev.lng : lng,
    heading: Number.isFinite(h) ? h : (prev?.heading ?? null),
    speed: Number.isFinite(s) ? s : null,
    t: t ?? now,
    updatedAt: now,
  };
  m.set(device.id, device);
  return device;
}

/** Batch heartbeats (the HTTP ingestion path). Returns count accepted. */
export function upsertBatch(eventId, heartbeats = []) {
  let accepted = 0;
  for (const hb of heartbeats) if (upsertDevice(eventId, hb)) accepted += 1;
  return accepted;
}

/** Current live devices for an event (optionally pruning stale first). */
export function getDevices(eventId, { ttlMs = DEFAULT_TTL_MS } = {}) {
  const m = events.get(String(eventId));
  if (!m) return [];
  const cutoff = Date.now() - ttlMs;
  const out = [];
  for (const d of m.values()) if (d.updatedAt >= cutoff) out.push(d);
  return out;
}

/** Drop devices not heard from within ttl. Returns number removed. */
export function prune(eventId, ttlMs = DEFAULT_TTL_MS) {
  const m = events.get(String(eventId));
  if (!m) return 0;
  const cutoff = Date.now() - ttlMs;
  let removed = 0;
  for (const [id, d] of m) {
    if (d.updatedAt < cutoff) {
      m.delete(id);
      removed += 1;
    }
  }
  return removed;
}

export const count = (eventId) => events.get(String(eventId))?.size || 0;

export function clearEvent(eventId) {
  events.delete(String(eventId));
}

export const activeEvents = () => [...events.keys()];
