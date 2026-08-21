/**
 * hull — a convex hull + outward padding, for drawing a TIGHT boundary around a
 * set of occupied cells rather than a circle over their bounding radius.
 *
 * The circle was the bug behind the "it drew the whole map" complaint: a radius
 * from a crowd's centre to its farthest cell sweeps a disc full of empty ground.
 * A convex hull of the cells people are actually in, nudged out by one cell's
 * reach, is the shape of the crowd — small when they are packed in a corner,
 * only large when they genuinely fill the space.
 *
 * Points are [lat, lng]. The hull is computed in (x = lng, y = lat) space; over a
 * venue the planar distortion is far below the pad width, so this is exact enough.
 */

const M_PER_DEG_LAT = 111132.92;
const M_PER_DEG_LNG_EQ = 111412.84;
const DEG = Math.PI / 180;

/** 2D cross product of OA × OB (x = lng, y = lat). */
function cross(o, a, b) {
  return (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);
}

/**
 * Convex hull (Andrew's monotone chain) of [lat,lng] points. Returns an ordered,
 * unclosed ring of [lat,lng]. Fewer than 3 points are returned as-is (the caller
 * squares off a point/line into a small box).
 */
export function convexHull(points = []) {
  const pts = points.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (pts.length < 3) return pts.map((p) => [p[0], p[1]]);

  // Sort by lng, then lat.
  const sorted = [...pts].sort((a, b) => (a[1] === b[1] ? a[0] - b[0] : a[1] - b[1]));

  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Push every hull vertex `meters` further from the hull's centroid, so the
 * boundary clears the people standing at the edge of the outermost cell. Also
 * turns a 1- or 2-point "hull" into a small square so it draws as an area.
 */
export function padHull(hull = [], meters = 22) {
  if (!hull.length) return hull;

  let latSum = 0;
  let lngSum = 0;
  for (const p of hull) {
    latSum += p[0];
    lngSum += p[1];
  }
  const cLat = latSum / hull.length;
  const cLng = lngSum / hull.length;
  const latM = M_PER_DEG_LAT;
  const lngM = M_PER_DEG_LNG_EQ * Math.cos(cLat * DEG) || M_PER_DEG_LNG_EQ;

  // A point or a line has no area to pad — square it off around the centroid.
  if (hull.length < 3) {
    const dLat = (meters * 1.6) / latM;
    const dLng = (meters * 1.6) / lngM;
    return [
      [cLat - dLat, cLng - dLng],
      [cLat - dLat, cLng + dLng],
      [cLat + dLat, cLng + dLng],
      [cLat + dLat, cLng - dLng],
    ];
  }

  return hull.map((p) => {
    const dy = (p[0] - cLat) * latM; // metres north of centroid
    const dx = (p[1] - cLng) * lngM; // metres east of centroid
    const len = Math.hypot(dx, dy) || 1;
    const ny = dy + (dy / len) * meters;
    const nx = dx + (dx / len) * meters;
    return [cLat + ny / latM, cLng + nx / lngM];
  });
}

/** Convenience: tight padded polygon around a set of [lat,lng] points. */
export function tightPolygon(points, meters = 22) {
  return padHull(convexHull(points), meters);
}
