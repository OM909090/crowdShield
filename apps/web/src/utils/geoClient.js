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
