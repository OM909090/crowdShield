/**
 * aggregator — turns raw device positions into derived crowd metrics.
 *
 * Two rollups from the same pass:
 *   1. H3 cells   — uniform hexagons for density fields, hotspots, the heatmap.
 *   2. Authority zones — the polygons drawn in the editor, for zone-level state.
 *
 * Nothing here is random. Every number is a function of the live positions,
 * the venue geometry, and the published pedestrian constants in geo.js.
 *
 * Honest sampling: only a fraction of the crowd runs the app, so sampled counts
 * are scaled by 1/participationRate to estimate the true population. Trend and
 * flow direction are ratio-based and stay valid even when that fraction is low.
 */
import { toCell, cellCenter, cellAreaM2 } from "../utils/h3.js";
import { pointInPolygon, densityLevel, PEDESTRIAN } from "../utils/geo.js";

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/** Friendly 3-band status derived from the Fruin level-of-service. */
export function levelToStatus(level) {
  if (level === "dangerous" || level === "critical") return "Critical";
  if (level === "dense" || level === "constrained") return "Moderate";
  return "Safe";
}

/** Circular mean of bearings (degrees). Returns null if no vectors. */
function meanBearing(sumSin, sumCos, n) {
  if (!n) return null;
  const b = Math.atan2(sumSin / n, sumCos / n) * RAD2DEG;
  return (b + 360) % 360;
}

/**
 * Directional coherence R ∈ [0,1] — the mean resultant length of the heading
 * vectors. ~1 = everyone moving the same way (orderly flow); →0 = conflicting
 * directions (counter-flow / turbulence), a crush precursor.
 *
 * Returns null with no vectors: "we don't know" is not the same as "orderly".
 */
function coherence(sumSin, sumCos, n) {
  if (!n) return null;
  return Math.min(1, Math.hypot(sumSin, sumCos) / n);
}

/**
 * Variance of speed (m/s)². High variance = erratic motion (turbulence).
 * Needs at least two samples to mean anything; null below that.
 */
function variance(sum, sum2, n) {
  if (!n || n < 2) return null;
  const mean = sum / n;
  return Math.max(0, sum2 / n - mean * mean);
}

/** round() that passes null/undefined straight through instead of making it 0. */
function roundOrNull(n, dp) {
  return Number.isFinite(n) ? round(n, dp) : null;
}

/**
 * Split reporting devices into those inside the authority's coverage area and
 * those outside it.
 *
 * Exported because the live-dot broadcaster needs exactly the same decision: the
 * map must not draw a person the metrics don't count, or the picture and the
 * numbers disagree. One implementation, two callers.
 *
 * With no coverage drawn yet, everything counts — a fresh event should still
 * show a crowd rather than an empty map while the operator is still drawing.
 *
 * @param {Array} devices
 * @param {Object|null} venue
 * @returns {{ covered: Array, outside: number, coverage: Array|null }}
 */
export function filterToCoverage(devices = [], venue = null) {
  const coverage = (venue?.aor?.polygon || []).length >= 3 ? venue.aor.polygon : null;
  if (!coverage) return { covered: devices, outside: 0, coverage: null };

  const covered = [];
  let outside = 0;
  for (const d of devices) {
    if (pointInPolygon([d.lat, d.lng], coverage)) covered.push(d);
    else outside += 1;
  }
  return { covered, outside, coverage };
}

/**
 * @param {Array} devices   from liveStore.getDevices()
 * @param {Object} venue    the Venue doc (may be null)
 * @returns { cells, zones, totals }
 */
export function aggregate(devices = [], venue = null) {
  const res = venue?.h3?.analysisRes || 11;
  const participation = clampParticipation(venue?.calibration?.participationRate);
  const scale = 1 / participation;

  // ---- Coverage gate ----
  // The authority draws the area they are responsible for, and that boundary is
  // operational, not decorative: a phone outside it belongs to someone else's
  // problem, and counting it would inflate this event's crowd with passers-by on
  // a nearby highway. So everything downstream — cells, zones, totals, the map's
  // dots, the agent's picture — sees only what is inside.
  //
  // The count of those we set aside is reported rather than silently dropped: an
  // operator watching a surge build just outside their line needs to know it is
  // there, and "we're ignoring 4,000 people" is a decision they should see.
  const { covered, outside: outsideCoverage, coverage } = filterToCoverage(devices, venue);

  // ---- H3 cell accumulation ----
  const cellAcc = new Map();
  for (const d of covered) {
    const cell = toCell(d.lat, d.lng, res);
    let a = cellAcc.get(cell);
    if (!a) {
      a = { count: 0, speedN: 0, sumSpeed: 0, sumSpeed2: 0, dirN: 0, sumSin: 0, sumCos: 0 };
      cellAcc.set(cell, a);
    }
    a.count += 1;
    // A device that hasn't reported (or moved enough to derive) speed/heading
    // contributes to the headcount only. Counting it as 0 m/s due-North would
    // invent a stalled northbound crowd out of missing data.
    if (Number.isFinite(d.speed)) {
      a.speedN += 1;
      a.sumSpeed += d.speed;
      a.sumSpeed2 += d.speed * d.speed;
    }
    if (Number.isFinite(d.heading)) {
      a.dirN += 1;
      a.sumSin += Math.sin(d.heading * DEG2RAD);
      a.sumCos += Math.cos(d.heading * DEG2RAD);
    }
  }

  const cells = [];
  for (const [cell, a] of cellAcc) {
    const areaM2 = cellAreaM2(cell);
    const personsEst = a.count * scale;
    const density = personsEst / areaM2; // persons / m²
    const level = densityLevel(density);
    cells.push({
      h3: cell,
      center: cellCenter(cell),
      count: a.count,
      personsEst: Math.round(personsEst),
      density: round(density, 2),
      level,
      status: levelToStatus(level),
      // null (not 0) wherever the sensors were silent — see the note above.
      speedSamples: a.speedN,
      dirSamples: a.dirN,
      meanSpeed: a.speedN ? round(a.sumSpeed / a.speedN, 2) : null,
      speedVar: roundOrNull(variance(a.sumSpeed, a.sumSpeed2, a.speedN), 3),
      dirCoherence: roundOrNull(coherence(a.sumSin, a.sumCos, a.dirN), 2),
      flowBearing: a.dirN ? Math.round(meanBearing(a.sumSin, a.sumCos, a.dirN)) : null,
    });
  }
  cells.sort((x, y) => y.density - x.density);

  // ---- Authority-zone rollup (first-matching polygon) ----
  const zones = (venue?.zones || []).map((z) => ({
    id: z.id,
    name: z.name,
    type: z.type,
    areaM2: z.areaM2 || 0,
    capacity: z.capacity || 0,
    poly: z.polygon, // kept locally for the hit-test, stripped from output
    count: 0,
    speedN: 0,
    sumSpeed: 0,
    sumSpeed2: 0,
    dirN: 0,
    sumSin: 0,
    sumCos: 0,
  }));

  // Each device counts toward exactly one zone: the **smallest** polygon that
  // contains it. Zones nest in practice — a "Singhadwara Chokepoint" sits inside
  // a broad "Singhadwara Approach" — and taking the first match in authoring
  // order would credit the chokepoint's crowd to the 18×-larger parent, diluting
  // its density to nothing and hiding the exact bottleneck the operator drew.
  for (const d of covered) {
    let target = null;
    for (const z of zones) {
      if (!z.poly || !pointInPolygon([d.lat, d.lng], z.poly)) continue;
      // areaM2 0 means unknown: least specific, only used if nothing else matches.
      if (!target || (z.areaM2 || Infinity) < (target.areaM2 || Infinity)) target = z;
    }
    if (!target) continue;
    target.count += 1;
    if (Number.isFinite(d.speed)) {
      target.speedN += 1;
      target.sumSpeed += d.speed;
      target.sumSpeed2 += d.speed * d.speed;
    }
    if (Number.isFinite(d.heading)) {
      target.dirN += 1;
      target.sumSin += Math.sin(d.heading * DEG2RAD);
      target.sumCos += Math.cos(d.heading * DEG2RAD);
    }
  }

  const zoneOut = zones.map((z) => {
    const personsEst = z.count * scale;
    const density = z.areaM2 > 0 ? personsEst / z.areaM2 : 0;
    const level = densityLevel(density);
    return {
      id: z.id,
      name: z.name,
      type: z.type,
      areaM2: z.areaM2,
      capacity: z.capacity,
      sampleCount: z.count,
      personsEst: Math.round(personsEst),
      density: round(density, 2),
      level,
      status: levelToStatus(level),
      loadPct: z.capacity > 0 ? Math.min(100, Math.round((personsEst / z.capacity) * 100)) : null,
      // Motion metrics are based only on devices that actually reported motion.
      speedSamples: z.speedN,
      dirSamples: z.dirN,
      meanSpeed: z.speedN ? round(z.sumSpeed / z.speedN, 2) : null,
      speedVar: roundOrNull(variance(z.sumSpeed, z.sumSpeed2, z.speedN), 3),
      dirCoherence: roundOrNull(coherence(z.sumSin, z.sumCos, z.dirN), 2),
      flowBearing: z.dirN ? Math.round(meanBearing(z.sumSin, z.sumCos, z.dirN)) : null,
    };
  });

  const sampled = covered.length;
  return {
    cells,
    zones: zoneOut,
    totals: {
      sampledDevices: sampled,
      personsEst: Math.round(sampled * scale),
      participationRate: participation,
      occupiedCells: cells.length,
      /** Whether a coverage boundary is in force at all. */
      coverageDefined: !!coverage,
      /** Reporting devices excluded because they fall outside that boundary. */
      outsideCoverage,
      outsideEst: Math.round(outsideCoverage * scale),
    },
  };
}

function clampParticipation(p) {
  if (!Number.isFinite(p) || p <= 0) return 0.1;
  return Math.min(1, p);
}

function round(n, dp) {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export { PEDESTRIAN };
