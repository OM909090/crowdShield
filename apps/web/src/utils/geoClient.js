/**
 * Client-side geometry for live drawing feedback.
 *
 * These helpers deliberately MIRROR `backend/utils/geo.js`:
 *   - `polygonAreaM2` is the same spherical-excess formula (Chamberlain &
 *     Duquette) the server uses to derive `aor.areaM2` / `zone.areaM2`.
 *   - `simplifyPath` reuses the local-metres projection + clamped
 *     segment-distance approach from the server's `distanceToPathMeters`.
 *
 * Why duplicate instead of share: the browser bundle cannot import from the
 * backend package, and more importantly the SERVER STAYS AUTHORITATIVE. Nothing
 * here is ever saved as a measurement — it exists so the number under the
 * authority's finger while they trace matches the number the server will derive
 * a moment later on `PUT /events/:id/venue`. The editor re-hydrates from that
 * response, so if the two ever drift the server value is what is displayed.
 *
 * Coordinates are always [lat, lng] pairs (Leaflet order), never GeoJSON.
 */

export const EARTH_RADIUS_M = 6371008.8;

const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Project [lat,lng] into a local metre plane centred on `originLat`.
 * At venue scale (a few km) the distortion is far below the accuracy of a
 * hand-drawn trace, and it lets the simplifier work in plain metres.
 */
function metreProjector(originLat) {
  const mPerDegLat = 111132.92;
  const mPerDegLng = 111412.84 * Math.cos(toRad(originLat));
  return ([lat, lng]) => [lng * mPerDegLng, lat * mPerDegLat];
}

/**
 * Distance in metres from projected point `p` to the projected segment a→b.
 * Clamped to the segment (not the infinite line) so it never under-reports a
 * deviation near an endpoint — the same variant `distanceToPathMeters` uses.
 * Zero-length segments degrade to point distance, which matters when the caller
 * simplifies an already-closed ring (first and last vertex are identical).
 */
function segmentDistanceM(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Ramer–Douglas–Peucker simplification of an [lat,lng][] path.
 *
 * A freehand trace emits a sample every few screen pixels, so a single stroke
 * around a venue is easily 300+ vertices. That matters twice over: the polygon
 * is stored on the venue and shipped to every client, and the ingest path runs
 * a point-in-polygon test per reading against it — cost is linear in vertices.
 * RDP drops the hand jitter and keeps the corners that actually describe the
 * boundary.
 *
 * Endpoints are always kept. Iterative (explicit stack) rather than recursive so
 * a long, noisy trace cannot blow the call stack.
 *
 * @param {Array<[number,number]>} points
 * @param {number} toleranceMeters max deviation a dropped vertex may have
 * @returns {Array<[number,number]>} new array, a subset of `points`
 */
export function simplifyPath(points = [], toleranceMeters = 4) {
  if (!Array.isArray(points) || points.length <= 2) return Array.isArray(points) ? [...points] : [];
  if (!(toleranceMeters > 0)) return [...points];

  const project = metreProjector(points[0][0]);
  const xy = points.map(project);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let farthest = -1;
    let farthestIdx = -1;
    for (let i = first + 1; i < last; i += 1) {
      const d = segmentDistanceM(xy[i], xy[first], xy[last]);
      if (d > farthest) {
        farthest = d;
        farthestIdx = i;
      }
    }
    if (farthestIdx !== -1 && farthest > toleranceMeters) {
      keep[farthestIdx] = 1;
      stack.push([first, farthestIdx], [farthestIdx, last]);
    }
  }

  return points.filter((_, i) => keep[i] === 1);
}

/**
 * Area of a polygon ring in square metres (spherical excess). Byte-for-byte the
 * server's formula, so the preview matches the derived value. Indifferent to
 * winding order; the ring is treated as closed whether or not the last vertex
 * repeats the first.
 */
export function polygonAreaM2(ring = []) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [lat1, lon1] = ring[i];
    const [lat2, lon2] = ring[(i + 1) % ring.length];
    sum += toRad(lon2 - lon1) * (Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  return Math.abs((sum * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

/** "12,400 m²" below a square kilometre, "1.24 km²" above it. */
export function formatArea(m2) {
  const value = Number(m2);
  if (!Number.isFinite(value) || value <= 0) return "0 m²";
  if (value < 1e6) return `${Math.round(value).toLocaleString()} m²`;
  return `${(value / 1e6).toFixed(2)} km²`;
}

/**
 * Is [lat,lng] inside a polygon ring? Ray-casting, mirroring
 * `backend/utils/geo.js` so the client agrees with the server about who is
 * inside a zone. The ring is treated as closed; winding order is irrelevant.
 *
 * Used for zone-targeted announcements: a citizen only shows an announcement
 * addressed to specific zones when they are actually standing in one of them.
 *
 * @param {[number,number]} point [lat, lng]
 * @param {Array<[number,number]>} ring
 */
export function pointInPolygon(point, ring = []) {
  if (!Array.isArray(point) || point.length < 2) return false;
  if (!Array.isArray(ring) || ring.length < 3) return false;
  const [lat, lng] = point;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (!Array.isArray(a) || !Array.isArray(b)) continue;
    const [latI, lngI] = a;
    const [latJ, lngJ] = b;
    const straddles = latI > lat !== latJ > lat;
    if (!straddles) continue;
    // lng of the edge at this latitude
    const lngAt = lngI + ((lat - latI) / (latJ - latI)) * (lngJ - lngI);
    if (lng < lngAt) inside = !inside;
  }
  return inside;
}

/** Bounding box of a ring: { minLat, maxLat, minLng, maxLng } or null. */
export function polygonBounds(ring = []) {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of ring) {
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    if (p[0] < minLat) minLat = p[0];
    if (p[0] > maxLat) maxLat = p[0];
    if (p[1] < minLng) minLng = p[1];
    if (p[1] > maxLng) maxLng = p[1];
  }
  if (!Number.isFinite(minLat) || !Number.isFinite(minLng)) return null;
  return { minLat, maxLat, minLng, maxLng };
}

/** Area-weighted centroid of a ring, as [lat,lng]. Null when degenerate. */
export function polygonCentroid(ring = []) {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  let latSum = 0;
  let lngSum = 0;
  let n = 0;
  for (const p of ring) {
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    latSum += p[0];
    lngSum += p[1];
    n += 1;
  }
  return n ? [latSum / n, lngSum / n] : null;
}

/**
 * A uniformly-random point that actually lies INSIDE the ring.
 *
 * Rejection-samples the bounding box, which is simple and correct for the convex-ish
 * venue outlines drawn in practice. Falls back to the centroid if the ring is so
 * thin that sampling keeps missing — better a valid point on the right spot than
 * a point outside the coverage area, which the aggregator would discard.
 */
export function randomPointInPolygon(ring = [], attempts = 200) {
  const b = polygonBounds(ring);
  if (!b) return null;
  for (let i = 0; i < attempts; i += 1) {
    const lat = b.minLat + Math.random() * (b.maxLat - b.minLat);
    const lng = b.minLng + Math.random() * (b.maxLng - b.minLng);
    if (pointInPolygon([lat, lng], ring)) return [lat, lng];
  }
  const c = polygonCentroid(ring);
  return c && pointInPolygon(c, ring) ? c : c;
}

/** Metres → degrees of latitude / longitude at a given latitude. */
export function metresToDegrees(metres, atLat) {
  const dLat = metres / 111132.92;
  const dLng = metres / Math.max(1e-6, 111412.84 * Math.cos(toRad(atLat)));
  return { dLat, dLng };
}

/**
 * Advance a simulated walker one step: a correlated random walk (it mostly keeps
 * going the way it was heading, with a small turn) so the resulting track looks
 * like a person walking rather than teleporting noise. Stays inside `ring`: if a
 * step would leave the polygon, it turns back instead.
 *
 * @param {{lat:number,lng:number,heading:number}} state current position + heading (deg)
 * @param {Array<[number,number]>} ring polygon to stay inside
 * @param {{speedMps?:number, dtSec?:number, turnDeg?:number}} [opts]
 * @returns {{lat:number,lng:number,heading:number,speed:number}}
 */
export function stepWalker(state, ring = [], opts = {}) {
  const speedMps = opts.speedMps ?? 1.3; // average walking pace
  const dtSec = opts.dtSec ?? 4;
  const turnDeg = opts.turnDeg ?? 35;

  let heading = Number.isFinite(state.heading) ? state.heading : Math.random() * 360;
  const distance = speedMps * dtSec;

  // Try the current heading first, then progressively bigger turns, so a walker
  // that reaches the boundary follows it instead of freezing.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const jitter = (Math.random() - 0.5) * turnDeg;
    const tryHeading = (heading + jitter + attempt * 47) % 360;
    const rad = toRad(tryHeading);
    const { dLat, dLng } = metresToDegrees(distance, state.lat);
    const lat = state.lat + Math.cos(rad) * dLat;
    const lng = state.lng + Math.sin(rad) * dLng;
    if (!ring.length || pointInPolygon([lat, lng], ring)) {
      return { lat, lng, heading: tryHeading, speed: speedMps };
    }
  }
  // Boxed in (shouldn't happen inside a sane polygon): stay put, unknown motion.
  return { lat: state.lat, lng: state.lng, heading, speed: 0 };
}
