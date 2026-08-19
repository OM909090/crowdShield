/**
 * roadCrowd — projects the live crowd onto the real road network.
 *
 * The aggregator measures the crowd in H3 hexagons, which is the right shape for
 * density fields and the wrong shape for talking to people. This module joins
 * the two: for each imported road segment it rolls up the cells that actually
 * sit on that road, so the system can say "Grand Road between J4 and J7 is at
 * 4.1 p/m²" instead of "cell 8b61...f is critical".
 *
 * Pure functions, no I/O: the caller supplies the network (models/RoadNetwork)
 * and the Situation Snapshot (services/snapshot.js). That keeps this callable
 * from the snapshot path, the agent brief and a test with no database.
 *
 * The honesty rule from ARCHITECTURE §17 is the whole design constraint here.
 * A road with no cells near it is NOT reported as empty — a road nobody is
 * standing on and a road we cannot see are different facts, and only one of them
 * is safe to route a crowd down. Unmeasured segments carry nulls and
 * `measured: false`, and getCongestedRoads never ranks them.
 */
import { distanceToPathMeters, densityLevel } from "../utils/geo.js";
import { cellAreaM2 } from "../utils/h3.js";

/**
 * Level-of-service band -> a word an operator (or a broadcast) can use about a
 * street. Derived from the shared Fruin bands in geo.js so a road and a zone
 * never disagree about what "dense" means.
 */
const STATE_BY_LEVEL = {
  free: "flowing",
  comfortable: "flowing",
  constrained: "busy",
  dense: "congested",
  critical: "severe",
  dangerous: "impassable",
};

/** Said out loud when we have no readings. Never mistakable for "clear". */
export const UNMEASURED_STATE = "unmeasured";

const round = (n, dp = 2) => {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/** Degrees of latitude/longitude that cover `metres` near a given latitude. */
function degreePad(metres, lat) {
  const latPad = metres / 111_132;
  const cos = Math.cos((lat * Math.PI) / 180);
  // Near the poles the longitude pad would explode; clamp the divisor so the
  // pre-filter stays a filter and never narrows to nothing.
  const lngPad = metres / Math.max(1_000, 111_412 * Math.abs(cos));
  return [latPad, lngPad];
}

/** Bounding box of a polyline, expanded by the match radius. */
function paddedBounds(path, radiusM) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lat, lng] of path) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  const [latPad, lngPad] = degreePad(radiusM, (minLat + maxLat) / 2);
  return [minLat - latPad, maxLat + latPad, minLng - lngPad, maxLng + lngPad];
}

/**
 * Roll the snapshot's H3 cells up onto every road segment.
 *
 * A cell counts toward a segment when its centre is within `radiusM` of the
 * segment's polyline. Cells are shared, not allocated: a hexagon straddling a
 * crossroads legitimately reports on both roads, because the crowd in it is on
 * both. That is different from zone attribution (§17.5), where a device must
 * count exactly once or the density is diluted.
 *
 * @param {Object} network  a RoadNetwork doc (or plain object) with `segments`
 * @param {Object} snapshot the Situation Snapshot, with `cells`
 * @param {{ radiusM?: number }} [opts] how far from the centre-line a cell still counts
 * @returns {Array<Object>} one row per segment, worst-first ordering left to the caller
 */
export function sampleRoadCongestion(network, snapshot, { radiusM = 25 } = {}) {
  const segments = network?.segments || [];
  const cells = snapshot?.cells || [];

  // Cell area varies with latitude and resolution, so it is read per cell rather
  // than assumed. It is the weight for density: summing persons over summed area
  // is the only way a two-cell and a nine-cell road are comparable.
  const prepared = cells
    .filter((c) => Array.isArray(c?.center) && c.center.length === 2)
    .map((c) => ({
      center: c.center,
      areaM2: cellAreaM2(c.h3),
      personsEst: Number.isFinite(c.personsEst) ? c.personsEst : 0,
      density: Number.isFinite(c.density) ? c.density : 0,
      meanSpeed: Number.isFinite(c.meanSpeed) ? c.meanSpeed : null,
      speedSamples: Number.isFinite(c.speedSamples) ? c.speedSamples : 0,
    }));

  return segments.map((segment) => {
    const path = (segment.path || []).map((p) => [p[0], p[1]]);
    const base = {
      id: segment.id,
      name: segment.name ?? null,
      highway: segment.highway,
      lengthM: segment.lengthM,
      widthM: segment.widthM,
      capacityPerMin: segment.capacityPerMin,
      fromJunction: segment.fromJunction,
      toJunction: segment.toJunction,
    };

    if (path.length < 2) {
      return { ...base, ...unmeasured() };
    }

    const [minLat, maxLat, minLng, maxLng] = paddedBounds(path, radiusM);

    let personsEst = 0;
    let weightedDensity = 0;
    let areaM2 = 0;
    let speedWeight = 0;
    let weightedSpeed = 0;
    let cellCount = 0;

    for (const cell of prepared) {
      const [lat, lng] = cell.center;
      // Cheap box reject first: this runs for every segment on every read, and
      // the exact point-to-polyline test is the expensive part.
      if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) continue;
      if (distanceToPathMeters(cell.center, path) > radiusM) continue;

      cellCount += 1;
      personsEst += cell.personsEst;
      areaM2 += cell.areaM2;
      weightedDensity += cell.density * cell.areaM2;

      // Speed averages only over cells that actually reported motion. A cell of
      // stationary-looking phones that never sent a speed must not drag the
      // road's mean toward zero and manufacture a crush signature.
      if (cell.meanSpeed != null && cell.speedSamples > 0) {
        speedWeight += cell.speedSamples;
        weightedSpeed += cell.meanSpeed * cell.speedSamples;
      }
    }

    if (!cellCount) return { ...base, ...unmeasured() };

    const density = areaM2 > 0 ? weightedDensity / areaM2 : null;
    const level = density != null ? densityLevel(density) : null;

    return {
      ...base,
      measured: true,
      cellCount,
      personsEst: Math.round(personsEst),
      density: density != null ? round(density) : null,
      level,
      state: level ? STATE_BY_LEVEL[level] : UNMEASURED_STATE,
      meanSpeed: speedWeight > 0 ? round(weightedSpeed / speedWeight) : null,
      speedSamples: speedWeight,
    };
  });
}

/**
 * What "we have no readings for this road" looks like. Every quantity is null,
 * because every one of them is unknown — a zero here would be a claim.
 */
function unmeasured() {
  return {
    measured: false,
    cellCount: 0,
    personsEst: null,
    density: null,
    level: null,
    state: UNMEASURED_STATE,
    meanSpeed: null,
    speedSamples: 0,
  };
}

/**
 * The worst n roads we can actually see, worst first.
 *
 * Only measured segments are eligible: ranking a road we have no readings for
 * would be inventing a hazard, and omitting it silently is the honest failure —
 * the caller can compare `measured` counts to know how much of the network is
 * dark.
 *
 * @param {Object} network
 * @param {Object} snapshot
 * @param {number} [n=5]
 * @returns {Array<Object>} congestion rows, each with `name` (may be null) and a
 *                          `label` that is safe to show when there is no name
 */
export function getCongestedRoads(network, snapshot, n = 5) {
  return sampleRoadCongestion(network, snapshot)
    .filter((r) => r.measured && r.density != null)
    .sort((a, b) => b.density - a.density || (b.personsEst ?? 0) - (a.personsEst ?? 0))
    .slice(0, Math.max(0, n))
    .map((road) => ({
      ...road,
      // A nameless road still has to be referable in a brief or an order. The
      // label is built from facts we hold (class + our own id) so it is never
      // mistaken for a street name somebody could look up.
      label: road.name || `unnamed ${road.highway} (${road.id})`,
    }));
}

export default { sampleRoadCongestion, getCongestedRoads, UNMEASURED_STATE };
