/**
 * dangerZones — the system's own live "danger area" layer.
 *
 * The idea the operator actually wants: a danger zone is not the whole crowd and
 * not a hand-drawn box — it is the pocket of ground where people have packed
 * tight enough to be dangerous. So each tick we take only the cells that are
 * genuinely dense, group the ones that are touching into pockets, and draw a
 * TIGHT boundary around each. Multiple pockets → multiple zones, each sized to
 * the crowd that made it. When a loose crowd has no dense core, there is simply
 * no zone — which is the honest answer.
 *
 * This runs every tick with no LLM in the loop, so it is immediate and always-on
 * (the "guardian that never sleeps"). The agent reasons on top of it; it does not
 * depend on the agent to exist.
 */
import { neighbors } from "../utils/h3.js";
import { tightPolygon } from "../utils/hull.js";

/** Fruin bands that count as a danger pocket, worst first. */
const DANGER_LEVELS = new Set(["dense", "critical", "dangerous"]);
const LEVEL_RANK = { dense: 1, critical: 2, dangerous: 3 };
const SEVERITY = { dense: "elevated", critical: "high", dangerous: "critical" };

/** Ignore specks: a pocket must represent at least this many (scaled) people. */
const MIN_PERSONS = 150;
/** How far past the cell centres to pad, ~one H3-r11 cell reach. */
const PAD_M = 22;
/** Don't flood the map. */
const MAX_ZONES = 8;

/** Connected components of the dense cells, by H3 adjacency. */
function densePockets(cells) {
  const byH3 = new Map();
  for (const c of cells) {
    if (c?.h3 && DANGER_LEVELS.has(c.level)) byH3.set(c.h3, c);
  }
  const seen = new Set();
  const pockets = [];

  for (const h3 of byH3.keys()) {
    if (seen.has(h3)) continue;
    const queue = [h3];
    seen.add(h3);
    const group = [];
    while (queue.length) {
      const cur = queue.pop();
      const cell = byH3.get(cur);
      if (cell) group.push(cell);
      for (const n of neighbors(cur, 1)) {
        if (n === cur || seen.has(n) || !byH3.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    pockets.push(group);
  }
  return pockets;
}

/**
 * @param {Array} cells aggregator cell output (needs h3, center, density, level, personsEst)
 * @returns {Array} danger zones: { id, polygon, centroid, severity, level, personsEst, maxDensity, cellCount }
 */
export function detectDangerZones(cells = []) {
  const zones = [];

  for (const pocket of densePockets(cells)) {
    let personsEst = 0;
    let maxDensity = 0;
    let worst = "dense";
    let latSum = 0;
    let lngSum = 0;
    let weight = 0;
    let minH3 = null;
    const points = [];

    for (const c of pocket) {
      const persons = Number.isFinite(c.personsEst) ? c.personsEst : 0;
      personsEst += persons;
      if ((c.density ?? 0) > maxDensity) maxDensity = c.density ?? 0;
      if ((LEVEL_RANK[c.level] ?? 0) > (LEVEL_RANK[worst] ?? 0)) worst = c.level;
      if (Array.isArray(c.center)) {
        const w = Math.max(persons, 1);
        latSum += c.center[0] * w;
        lngSum += c.center[1] * w;
        weight += w;
        points.push(c.center);
      }
      if (minH3 === null || c.h3 < minH3) minH3 = c.h3;
    }

    if (personsEst < MIN_PERSONS || !points.length || !weight) continue;

    const polygon = tightPolygon(points, PAD_M);
    if (!polygon || polygon.length < 3) continue;

    zones.push({
      // Stable-ish across ticks: the lexicographically smallest member cell.
      id: `dz-${minH3}`,
      polygon,
      centroid: [latSum / weight, lngSum / weight],
      severity: SEVERITY[worst] || "high",
      level: worst,
      personsEst: Math.round(personsEst),
      maxDensity: Math.round(maxDensity * 100) / 100,
      cellCount: pocket.length,
    });
  }

  zones.sort((a, b) => b.personsEst - a.personsEst);
  return zones.slice(0, MAX_ZONES);
}
