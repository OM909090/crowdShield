/**
 * gateLoad — how hard is each open gate being pushed right now.
 *
 * A gate is "overloaded" when far more people are packed at it than it can pass:
 * we sum the people in the cells right around the gate and divide by its
 * throughput (people/min). The result is a rough minutes-to-clear, which is the
 * number that actually matters to an operator — a gate that needs 40 minutes to
 * drain is a crush forming, whatever its width on paper.
 *
 * Computed every tick from the same live cells the map draws, so the gate pulse,
 * the agent's divert decision and the numbers all agree.
 */
import { haversineMeters } from "../utils/geo.js";

/** People within this radius of the gate are "at" it (queue + approach). */
const NEAR_M = 45;
/** If a gate has no throughput on record, assume a modest single-file rate. */
const DEFAULT_THROUGHPUT_PER_MIN = 60;
/** Below this many people, a gate is never "overloaded" — it's just a few folks. */
const MIN_PERSONS = 120;
/** Minutes-to-clear thresholds. */
const BUSY_MIN = 4;
const OVERLOAD_MIN = 8;

/**
 * @param {Array} cells aggregator cells (need center + personsEst)
 * @param {Object} venue venue doc (nodes)
 * @returns {Array} [{ id, name, at, state, nearPersons, capacityPerMin, clearMin, level }]
 */
export function computeGateLoads(cells = [], venue = null) {
  const gates = (venue?.nodes || []).filter((n) => n.type === "gate" && n.state !== "closed");
  if (!gates.length) return [];

  return gates.map((gate) => {
    let nearPersons = 0;
    for (const c of cells) {
      if (!Array.isArray(c.center)) continue;
      if (haversineMeters(gate.at, c.center) <= NEAR_M) nearPersons += c.personsEst || 0;
    }
    nearPersons = Math.round(nearPersons);
    const capacityPerMin = gate.throughputPerMin > 0 ? gate.throughputPerMin : DEFAULT_THROUGHPUT_PER_MIN;
    const clearMin = Math.round((nearPersons / capacityPerMin) * 10) / 10;

    let level = "ok";
    if (nearPersons >= MIN_PERSONS) {
      if (clearMin >= OVERLOAD_MIN) level = "overload";
      else if (clearMin >= BUSY_MIN) level = "busy";
    }

    return {
      id: gate.id,
      name: gate.name || gate.id,
      at: gate.at,
      state: gate.state,
      nearPersons,
      capacityPerMin,
      clearMin,
      level,
    };
  });
}
