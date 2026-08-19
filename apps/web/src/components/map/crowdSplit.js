/**
 * crowdSplit — the ONE definition of "is this body of people drawn as dots, or
 * as a single merged bubble".
 *
 * This is the merge the product is actually about: while people are spread out
 * you want to see people, and once they pack together you want to see *the pack*
 * with a number on it. Drawing both at once would double-count the same humans
 * on screen — the bubble says 4,300 and 4,300 dots crawl out from under it.
 *
 * It lives in its own module (not inside either layer) because two layers each
 * deciding independently is exactly how they drift: one tweak to the radius on
 * the drawing side and dots start leaking out of the blob. Here the radius used
 * to DRAW a bubble and the radius used to HIDE its dots are the same expression,
 * so they cannot disagree. LiveCrowdMap runs this once per tick and hands the
 * results down, which also keeps the thousands-of-dots pass off the 60 fps path.
 */

/** Metres per degree of latitude. Constant enough anywhere on Earth. */
export const M_PER_DEG_LAT = 111132.92;

/** Metres per degree of longitude at the equator; scale by cos(lat). */
const M_PER_DEG_LNG_EQ = 111412.84;

const DEG = Math.PI / 180;

/**
 * How far past its reported radius a cluster actually reaches, in metres.
 *
 * `r` is measured centroid → occupied cell CENTRE, but the people counted in
 * that outermost cell stand anywhere inside it. The analysis grid is H3
 * resolution 11 (~2,400 m² hexes, roughly 25 m centre-to-vertex), so a genuine
 * member of the crowd can be ~25 m further out than `r` implies. Without the pad
 * a single-cell crowd would also come back with r = 0 and draw as a dot.
 *
 * The cost of the pad is that a few bystanders standing just outside a packed
 * crowd get hidden by its bubble. At 25 m against venue scale that is a better
 * error than a ring of dots leaking out of every blob.
 */
export const CELL_REACH_M = 25;

/** Radius in metres to both draw a cluster's bubble at and suppress its dots within. */
export const bubbleRadiusM = (cluster) => (Number.isFinite(cluster?.r) ? cluster.r : 0) + CELL_REACH_M;

/** Stable empty array so callers' useMemo dependencies don't churn. */
const EMPTY = [];

/**
 * Split a tick into merged bubbles plus the dots that are still worth drawing
 * individually.
 *
 * `crowd` (density >= 1.5 p/m², Fruin's comfortable bound) is the server's own
 * "packed shoulder-to-shoulder" flag and the only input to the decision — below
 * it people still have personal space and free choice of direction, which is
 * exactly when a map should show individuals.
 *
 * Cost: O(dots × bubbles), no square roots and no allocation inside the inner
 * loop. Comparison happens in a local metre space (equirectangular around each
 * bubble's own centroid — the distortion over a ~100 m radius is far under a
 * metre) against a squared radius. At the payload cap of 4,000 dots and a
 * realistic handful of packed crowds that is a few tens of thousands of compares
 * once per second, not per frame.
 *
 * @param {Array} clusters tick `clusters`
 * @param {Array} dots     tick `dots`
 * @returns {{ bubbles: Array, dots: Array }} bubbles to draw; dots not inside one
 */
export function splitCrowd(clusters, dots) {
  const allDots = dots || EMPTY;
  const bubbles = [];
  for (const k of clusters || EMPTY) {
    if (k?.crowd && Array.isArray(k.c) && Number.isFinite(k.c[0])) bubbles.push(k);
  }
  if (!bubbles.length || !allDots.length) return { bubbles, dots: allDots };

  // Per-bubble constants hoisted out of the dot loop: one cos() and one divide
  // each, instead of one per dot per bubble. Typed arrays keep the hot loop on
  // unboxed doubles.
  const n = bubbles.length;
  const lat = new Float64Array(n);
  const lng = new Float64Array(n);
  const mPerDegLng = new Float64Array(n);
  const rDeg = new Float64Array(n); // latitude half-extent, for the cheap reject
  const r2 = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const k = bubbles[i];
    const rM = bubbleRadiusM(k);
    lat[i] = k.c[0];
    lng[i] = k.c[1];
    mPerDegLng[i] = M_PER_DEG_LNG_EQ * Math.cos(k.c[0] * DEG);
    rDeg[i] = rM / M_PER_DEG_LAT;
    r2[i] = rM * rM;
  }

  const kept = [];
  for (const d of allDots) {
    let hidden = false;
    for (let i = 0; i < n; i += 1) {
      // Latitude band reject first: one subtract and two compares throws out
      // most bubble/dot pairs before any multiplication happens.
      const dLat = d.lat - lat[i];
      if (dLat > rDeg[i] || dLat < -rDeg[i]) continue;
      const y = dLat * M_PER_DEG_LAT;
      const x = (d.lng - lng[i]) * mPerDegLng[i];
      if (x * x + y * y <= r2[i]) {
        hidden = true;
        break;
      }
    }
    if (!hidden) kept.push(d);
  }

  return { bubbles, dots: kept };
}
