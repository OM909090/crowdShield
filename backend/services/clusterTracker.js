/**
 * clusterTracker — turns a field of hexagons into a handful of crowd OBJECTS.
 *
 * This is the piece ARCHITECTURE §8 has always called for. Two consumers need
 * it, for the same underlying reason:
 *
 *   • The map. Forty thousand individual dots is neither drawable nor readable.
 *     When people are spread out you want to see people; when they pack together
 *     you want to see *the pack*, with a number on it. So a cluster carries both
 *     its cells and its head count, and the client decides which to draw.
 *
 *   • The agent. "Cell 8b61a072...f is at 4.1 p/m²" is not a sentence anyone can
 *     act on. "K3, about 4,200 people, moving north-east at 0.4 m/s, growing by
 *     900/min, about to touch K7" is. Roughly twenty named objects instead of
 *     forty thousand points is also what makes the reasoning pass affordable
 *     (§10).
 *
 * The dangerous signal this exists to catch is a MERGE. Two crowds arriving at
 * the same chokepoint from different directions is the classic crush geometry —
 * a stationary crowd compressed from behind by an advancing one. Density alone
 * cannot see it coming; two tracked objects on a converging course can.
 *
 * Identity is the hard part and the reason this holds state. A cluster is only
 * meaningful over time — growth rate, merges, "is this the same crowd as a second
 * ago" — so ids are matched tick to tick and survive as long as the crowd does.
 *
 * Honesty rules, as everywhere else (§17): a cluster's speed and heading are null
 * when the devices in it never reported motion, growth is null until we have two
 * comparable samples, and nothing is smoothed into looking more certain than it
 * is.
 */
import { neighbors } from "../utils/h3.js";
import { haversineMeters, densityLevel, PEDESTRIAN } from "../utils/geo.js";

/**
 * Density at which a group of cells is worth calling a crowd rather than a
 * scattering of people. Fruin's "comfortable" bound: below this, individuals
 * still have personal space and free choice of direction, which is exactly when
 * a map should be showing individuals.
 */
const CROWD_DENSITY = PEDESTRIAN.DENSITY.COMFORTABLE; // 1.5 p/m²

/**
 * Head count at which a cluster is worth reporting movements of, regardless of
 * how tightly packed it is.
 *
 * Density and significance are different questions, and conflating them hid the
 * most important case: two loose bodies of several thousand people converging is
 * *how* a dense crowd forms. Waiting for them to be dense before reporting the
 * convergence means reporting it after the fact.
 */
const SIGNIFICANT_PERSONS = 200;

/**
 * Baseline age for a growth rate, in seconds.
 *
 * Growth cannot be measured tick-to-tick: the loop runs at 1 Hz, so consecutive
 * samples are a second apart and the head count difference between them is mostly
 * sampling noise amplified by the participation multiplier. Instead each cluster
 * keeps a baseline sample and only refreshes it once this much time has passed,
 * so "people per minute" is measured over a window long enough to mean something.
 */
const GROWTH_WINDOW_S = 8;

/**
 * How far a cluster's centroid may move between ticks and still be considered
 * the same crowd. At a brisk 2 m/s and a 1 Hz tick a real crowd centroid moves
 * ~2 m; this allows for a much larger jump caused by the cluster changing shape
 * (cells joining at one end pull the centroid), while staying far below the
 * distance between genuinely different crowds.
 */
const MATCH_RADIUS_M = 60;

/**
 * Two clusters this close are about to become one. Reported as a converging pair
 * before they actually merge — a warning that arrives after the merge is of no
 * use to anyone.
 */
const CONVERGE_DISTANCE_M = 80;

const round = (n, dp = 2) => {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};

// eventId -> { byId: Map<clusterId, tracked>, seq: number, lastAt: number }
const events = new Map();

const stateFor = (eventId) => {
  const key = String(eventId);
  let s = events.get(key);
  if (!s) {
    s = { byId: new Map(), seq: 0, lastAt: 0 };
    events.set(key, s);
  }
  return s;
};

/* ------------------------------------------------------------------ *
 * Component finding
 * ------------------------------------------------------------------ */

/**
 * Group occupied cells into connected components using H3 adjacency.
 *
 * Adjacency, not a density threshold, decides membership: the question "are
 * these the same body of people" is about whether they are touching, not about
 * how tightly packed they are. Density then describes the component we found,
 * and `isCrowd` marks the ones dense enough to matter. Thresholding first would
 * shatter one real crowd into islands wherever it happened to thin out.
 *
 * @param {Array} cells aggregator cell output (needs `h3`)
 * @returns {Array<Array>} components, each an array of cells
 */
function connectedComponents(cells = []) {
  const byH3 = new Map();
  for (const c of cells) if (c?.h3) byH3.set(c.h3, c);

  const seen = new Set();
  const components = [];

  for (const h3 of byH3.keys()) {
    if (seen.has(h3)) continue;

    // Breadth-first over the hex grid. Iterative on purpose: a large festival
    // can produce a component of thousands of cells, and recursion would risk
    // the stack on the one tick that matters most.
    const queue = [h3];
    seen.add(h3);
    const group = [];

    while (queue.length) {
      const current = queue.pop();
      group.push(byH3.get(current));
      for (const n of neighbors(current, 1)) {
        if (n === current || seen.has(n) || !byH3.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    components.push(group);
  }

  return components;
}

/* ------------------------------------------------------------------ *
 * Description
 * ------------------------------------------------------------------ */

/** Circular mean of bearings weighted by how many people hold each one. */
function meanBearing(cells) {
  let sumSin = 0;
  let sumCos = 0;
  let weight = 0;
  for (const c of cells) {
    if (!Number.isFinite(c.flowBearing) || !(c.dirSamples > 0)) continue;
    const rad = (c.flowBearing * Math.PI) / 180;
    sumSin += Math.sin(rad) * c.dirSamples;
    sumCos += Math.cos(rad) * c.dirSamples;
    weight += c.dirSamples;
  }
  if (!weight) return null;
  return (((Math.atan2(sumSin / weight, sumCos / weight) * 180) / Math.PI) + 360) % 360;
}

/** The 8-point compass word for a bearing — how a person would say it. */
function compass(bearing) {
  if (!Number.isFinite(bearing)) return null;
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return points[Math.round(bearing / 45) % 8];
}

/**
 * Describe one component: where it is, how many people, how fast and which way.
 * `areaM2` comes from the cells' own areas, so density is persons over the area
 * actually occupied rather than over a bounding shape that includes empty ground.
 */
function describe(cells, cellAreaOf) {
  let personsEst = 0;
  let areaM2 = 0;
  let latSum = 0;
  let lngSum = 0;
  let weight = 0;
  let speedWeighted = 0;
  let speedWeight = 0;

  for (const c of cells) {
    const persons = Number.isFinite(c.personsEst) ? c.personsEst : 0;
    personsEst += persons;
    areaM2 += cellAreaOf(c);

    // Centroid weighted by people, not by cell count: the middle of a crowd is
    // where the people are, not the middle of the ground they stand on.
    const w = Math.max(persons, 1);
    latSum += c.center[0] * w;
    lngSum += c.center[1] * w;
    weight += w;

    if (Number.isFinite(c.meanSpeed) && c.speedSamples > 0) {
      speedWeighted += c.meanSpeed * c.speedSamples;
      speedWeight += c.speedSamples;
    }
  }

  const centroid = [latSum / weight, lngSum / weight];
  let radiusM = 0;
  for (const c of cells) radiusM = Math.max(radiusM, haversineMeters(centroid, c.center));

  const density = areaM2 > 0 ? personsEst / areaM2 : null;
  const bearing = meanBearing(cells);

  return {
    cells: cells.map((c) => c.h3),
    cellCount: cells.length,
    centroid: [round(centroid[0], 6), round(centroid[1], 6)],
    radiusM: Math.round(radiusM),
    areaM2: Math.round(areaM2),
    personsEst: Math.round(personsEst),
    density: round(density),
    level: density != null ? densityLevel(density) : null,
    // null, not 0: a crowd whose phones never reported motion is a crowd whose
    // speed we do not know, and 0 m/s would read as "stalled" (§17).
    meanSpeed: speedWeight > 0 ? round(speedWeighted / speedWeight) : null,
    heading: bearing == null ? null : Math.round(bearing),
    headingCompass: compass(bearing),
    /** Packed shoulder-to-shoulder. Drives how the map draws it. */
    isCrowd: density != null && density >= CROWD_DENSITY,
    /** Big enough that where it goes matters. Drives what gets reported. */
    isSignificant: personsEst >= SIGNIFICANT_PERSONS,
  };
}

/* ------------------------------------------------------------------ *
 * Tracking
 * ------------------------------------------------------------------ */

/**
 * Advance the tracker one tick.
 *
 * @param {string} eventId
 * @param {Array} cells      aggregator cell output for this tick
 * @param {(cell:Object)=>number} cellAreaOf  area lookup (injected so this stays pure-ish and testable)
 * @returns {{ clusters: Array, events: Array }} clusters newest state; events are merges/splits/convergences
 */
export function advanceClusters(eventId, cells = [], cellAreaOf = () => 0) {
  const state = stateFor(eventId);
  const now = Date.now();

  const described = connectedComponents(cells).map((group) => describe(group, cellAreaOf));

  // Largest first, so the biggest crowd claims its identity before a smaller one
  // can steal it. Without this, a fragment breaking off a big crowd could inherit
  // the id and the growth history of the crowd it left.
  described.sort((a, b) => b.personsEst - a.personsEst);

  const previous = [...state.byId.values()];
  const claimed = new Set();
  const outEvents = [];
  const nextById = new Map();

  for (const current of described) {
    // Every previous cluster this one plausibly continues. More than one means
    // separate crowds have come together.
    const candidates = previous
      .filter((p) => !claimed.has(p.id))
      .map((p) => ({ p, d: haversineMeters(current.centroid, p.centroid) }))
      .filter(({ p, d }) => d <= MATCH_RADIUS_M + p.radiusM + current.radiusM)
      .sort((a, b) => a.d - b.d);

    let tracked;
    if (candidates.length) {
      const [{ p: best }] = candidates;
      claimed.add(best.id);
      tracked = { ...current, id: best.id, firstSeenAt: best.firstSeenAt };

      // Growth over a window, not between adjacent ticks. The baseline is only
      // rolled forward once it is old enough, so the figure stays a real
      // people-per-minute rate instead of per-tick noise × 60.
      const base = best.growthBase || { personsEst: best.personsEst, at: best.firstSeenAt };
      const baseAgeS = (now - base.at) / 1000;
      if (baseAgeS >= GROWTH_WINDOW_S) {
        tracked.growthPerMin = Math.round(((current.personsEst - base.personsEst) / baseAgeS) * 60);
        tracked.growthBase = { personsEst: current.personsEst, at: now };
      } else {
        tracked.growthPerMin = best.growthPerMin ?? null;
        tracked.growthBase = base;
      }

      // A merge is the crush precursor worth waking someone for, so it is judged
      // by the same radius-aware reach used to match identity. A strict
      // centre-to-centre threshold would miss the very case it exists for: when
      // two crowds fuse, the survivor's centroid sits between them, far from
      // either original centre.
      for (const { p } of candidates.slice(1)) {
        claimed.add(p.id);
        outEvents.push({
          kind: "merge",
          clusterId: best.id,
          absorbedId: p.id,
          personsEst: current.personsEst,
          absorbedPersonsEst: p.personsEst,
          at: current.centroid,
          significant: current.isSignificant,
        });
      }
    } else {
      state.seq += 1;
      tracked = {
        ...current,
        id: `K${state.seq}`,
        firstSeenAt: now,
        growthPerMin: null,
        growthBase: { personsEst: current.personsEst, at: now },
      };
      // A handful of people walking into frame is not news; a few hundred is.
      if (current.isSignificant) {
        outEvents.push({ kind: "appeared", clusterId: tracked.id, personsEst: current.personsEst, at: current.centroid });
      }
    }

    tracked.ageSec = Math.round((now - tracked.firstSeenAt) / 1000);
    nextById.set(tracked.id, tracked);
  }

  for (const p of previous) {
    if (!claimed.has(p.id) && p.isSignificant) {
      outEvents.push({ kind: "dispersed", clusterId: p.id, personsEst: p.personsEst, at: p.centroid });
    }
  }

  // Pairs closing on each other. Flagged BEFORE they merge, because a merge
  // alert arrives too late to prevent the thing it describes.
  const live = [...nextById.values()].filter((c) => c.isSignificant);
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const gap = haversineMeters(live[i].centroid, live[j].centroid) - live[i].radiusM - live[j].radiusM;
      if (gap <= CONVERGE_DISTANCE_M) {
        outEvents.push({
          kind: "converging",
          clusterIds: [live[i].id, live[j].id],
          gapM: Math.max(0, Math.round(gap)),
          combinedPersonsEst: live[i].personsEst + live[j].personsEst,
          // Two dense bodies closing is materially worse than two loose ones.
          bothDense: live[i].isCrowd && live[j].isCrowd,
        });
      }
    }
  }

  state.byId = nextById;
  state.lastAt = now;

  return { clusters: [...nextById.values()], events: outEvents };
}

/** Latest tracked clusters without advancing (for read paths). */
export function getClusters(eventId) {
  return [...(events.get(String(eventId))?.byId.values() || [])];
}

export function clearEvent(eventId) {
  events.delete(String(eventId));
}

export { CROWD_DENSITY };
