/**
 * citizenBrief — the "what does THIS person need to know" read model.
 *
 * The operator brief (services/agentBrief.js) answers "how is the whole event
 * doing": every zone, every crowd, every street, ranked worst-first. A citizen
 * asking "where do I go?" needs almost none of that. They need six things:
 *
 *   1. Am I inside the monitored area, or approaching it?
 *   2. What is it like right where I am standing?
 *   3. Is something building near me that I should move away from?
 *   4. If I want out, which way — by street name?
 *   5. Where can I ask to be taken (stage, medical, gate)?
 *   6. What has the control room already told the crowd?
 *
 * So this builds a small, personal brief instead of handing a member of the
 * public the command-centre picture. That is a privacy boundary as much as a
 * usability one: nothing here describes another individual, and no operational
 * lever (unit deployment, pending agent proposals, gate policy) appears.
 *
 * Honesty rules, same as the operator brief:
 *   • A road or zone we have no readings for is reported "not measured", never
 *     "clear". The difference matters when someone is deciding where to walk.
 *   • Every distance, level and street name here is measured or imported. If a
 *     fact is missing it is listed under WHAT I DON'T KNOW so the model cannot
 *     quietly invent it.
 *
 * Coordinates are [lat, lng] (Leaflet order) throughout, matching the rest of
 * the backend.
 */
import { pointInPolygon, distanceToPathMeters, haversineMeters, bearingDeg } from "../utils/geo.js";
import { sampleRoadCongestion, UNMEASURED_STATE } from "./roadCrowd.js";
import { safestRoadExits, buildRoadGraph, nearestJunction, roadLabel } from "./roadRouter.js";
import { findSafeExitRoute } from "./exitRoute.js";
import { classifyUser } from "./guidance.js";

/** How far around someone still counts as "near me". */
const NEARBY_RADIUS_M = 300;

/** How many nearby streets / destinations / announcements to list. */
const NEARBY_ROADS = 3;
const MAX_DESTINATIONS = 12;
const MAX_ANNOUNCEMENTS = 3;

/** Past this age an announcement is history, not the current situation. */
const STALE_NOTICE_MIN = 20;

/** Plain-language compass direction, so "180 m north-east" beats a bearing. */
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
const compassFrom = (from, to) => COMPASS[Math.round((bearingDeg(from, to) % 360) / 45) % 8];

const metres = (m) => (Number.isFinite(m) ? `${Math.round(m)} m` : null);
const mins = (sec) => (Number.isFinite(sec) ? `~${Math.max(1, Math.round(sec / 60))} min` : null);
const people = (n) => (Number.isFinite(n) ? Number(n).toLocaleString("en-IN") : null);

/** Human wording for where someone is relative to the guarded area. */
const WHERE = {
  INSIDE: "inside the monitored area",
  APPROACHING: "just outside the monitored area, heading toward it",
  TRANSIT: "near the monitored area but walking past it",
  OUTSIDE: "outside the monitored area",
};

/**
 * The zone whose polygon contains the point, decorated with live risk.
 * Returns null when there are no zones or the point is in none of them —
 * a real and common case (gaps between drawn zones).
 */
function zoneAt(venue, snapshot, point) {
  for (const z of venue?.zones || []) {
    if (!Array.isArray(z.polygon) || z.polygon.length < 3) continue;
    if (!pointInPolygon(point, z.polygon)) continue;
    const live = (snapshot?.zones || []).find((s) => s.id === z.id);
    return {
      id: z.id,
      name: z.name || z.id,
      riskLevel: live?.riskLevel ?? null,
      density: live?.density ?? null,
      personsEst: live?.personsEst ?? null,
      measured: !!live && Number.isFinite(live.density),
    };
  }
  return null;
}

/**
 * Streets within NEARBY_RADIUS_M of the point, with this event's own live
 * crowding on them. `nearest` is the one underfoot; `busiest` is what to avoid.
 */
function streetsAround(roadNetwork, snapshot, point) {
  const segments = roadNetwork?.segments || [];
  if (!segments.length) return { nearest: null, nearby: [], busiest: null, unmeasuredCount: 0 };

  const congestion = new Map();
  for (const row of sampleRoadCongestion(roadNetwork, snapshot)) congestion.set(row.id, row);

  const scored = [];
  for (const s of segments) {
    if (!Array.isArray(s.path) || s.path.length < 2) continue;
    const d = distanceToPathMeters(point, s.path);
    if (!Number.isFinite(d) || d > NEARBY_RADIUS_M) continue;
    const c = congestion.get(s.id) || {};
    scored.push({
      // A citizen cannot act on "unnamed unclassified (R44)" — that label exists
      // for operator briefs and audit logs, where the id is the point. Here an
      // unnamed road is carried as null and described by position instead, so
      // the model never reads an internal id out to a member of the public.
      name: s.name || null,
      distanceM: d,
      state: c.state || UNMEASURED_STATE,
      density: c.density ?? null,
      measured: !!c.measured,
    });
  }

  scored.sort((a, b) => a.distanceM - b.distanceM);

  // One street is many segments, so "Kutcheri Road" legitimately appears dozens
  // of times within 300 m. Collapse by name — nearest segment wins, but keep the
  // worst crowding seen on any segment of that street, because the busy part is
  // the part that matters when deciding whether to walk down it.
  const byName = new Map();
  for (const r of scored) {
    if (!r.name) continue;
    const seen = byName.get(r.name);
    if (!seen) {
      byName.set(r.name, { ...r });
      continue;
    }
    if (r.measured && (!seen.measured || (r.density ?? 0) > (seen.density ?? 0))) {
      seen.measured = true;
      seen.density = r.density;
      seen.state = r.state;
    }
  }
  const named = [...byName.values()];
  const measured = named.filter((r) => r.measured && r.density != null);
  measured.sort((a, b) => b.density - a.density);

  return {
    nearest: scored[0] || null,
    nearby: named.slice(0, NEARBY_ROADS),
    busiest: measured[0] || null,
    unnamedNearby: scored.filter((r) => !r.name).length,
    unmeasuredCount: named.length - measured.length,
  };
}

/** The tracked crowd nearest the point — distance measured to its edge. */
function nearestCrowd(snapshot, point) {
  let best = null;
  for (const c of snapshot?.clusters || []) {
    if (!Array.isArray(c.centroid) || c.centroid.length !== 2) continue;
    if (!c.isSignificant && !c.isCrowd) continue;
    const gap = Math.max(0, haversineMeters(point, c.centroid) - (c.radiusM || 0));
    if (!best || gap < best.gapM) {
      best = {
        gapM: gap,
        personsEst: c.personsEst ?? null,
        level: c.level ?? null,
        growthPerMin: Number.isFinite(c.growthPerMin) ? c.growthPerMin : null,
        direction: compassFrom(point, c.centroid),
      };
    }
  }
  return best;
}

/**
 * The safest way out for this person, computed with the SAME code path the
 * citizen app's "safest way out" button uses (services/roadRouter over the
 * imported streets, falling back to services/exitRoute). Sharing the path is
 * the point: the assistant must never name a different gate than the button.
 */
async function safestExit({ venue, snapshot, roadNetwork, point }) {
  const exits = (venue?.nodes || [])
    .filter((n) => (n.type === "gate" || n.type === "exit") && n.state !== "closed")
    .map((n) => ({ id: n.id, name: n.name || n.id, at: n.at }));

  if (!exits.length) return { exit: null, reason: "no open gate or exit is published for this event" };

  if (roadNetwork?.segments?.length) {
    const congestion = new Map();
    for (const row of sampleRoadCongestion(roadNetwork, snapshot)) congestion.set(row.id, row);
    const res = safestRoadExits(roadNetwork, congestion, point, exits);
    if (res.ok) {
      const best = res.best;
      return {
        exit: {
          gateName: best.exitName,
          distanceM: best.lengthM,
          etaSec: best.etaSec,
          roads: best.namedRoads || [],
          directions: best.directions || null,
          worstDensity: best.worstDensity ?? null,
          measuredFraction: best.measuredFraction ?? null,
          alternatives: (res.options || []).slice(1, 3).map((o) => ({
            gateName: o.exitName,
            distanceM: o.lengthM,
          })),
          via: "imported street network",
        },
        reason: null,
      };
    }
  }

  const fallback = await findSafeExitRoute({ venue, snapshot, from: point });
  if (!fallback.ok) return { exit: null, reason: fallback.message || "no walkable route found" };
  return {
    exit: {
      gateName: fallback.exit.gateName,
      distanceM: fallback.exit.distanceMeters,
      etaSec: fallback.exit.durationSec,
      roads: [],
      directions: null,
      worstDensity: fallback.exit.maxRisk ?? null,
      measuredFraction: null,
      alternatives: [],
      via: "external routing engine",
    },
    reason: null,
  };
}

/** Is the imported street graph actually routable from where they stand? */
function streetsReachable(roadNetwork, point) {
  if (!roadNetwork?.segments?.length) return false;
  try {
    return !!nearestJunction(buildRoadGraph(roadNetwork), point);
  } catch {
    return false;
  }
}

/**
 * Build the citizen brief.
 *
 * @param {Object}  args
 * @param {Object}  args.event        the Event doc
 * @param {Object=} args.venue        the Venue doc (may be null — nothing drawn yet)
 * @param {Object=} args.snapshot     the Situation Snapshot
 * @param {Object=} args.roadNetwork  imported RoadNetwork doc (may be null)
 * @param {{lat:number,lng:number,heading?:number}=} args.position  their live fix
 * @param {Array=}  args.broadcasts   recent announcements (newest first)
 * @param {string=} args.lang         "en" | "hi" | "or" — picks the announcement copy
 * @returns {{ text: string, facts: Object }}
 */
export async function buildCitizenBrief({
  event,
  venue,
  snapshot,
  roadNetwork,
  position,
  broadcasts = [],
  lang = "en",
} = {}) {
  const L = [];
  const unknown = [];
  const facts = {};

  /* ---------- the event ---------- */
  const venueName = event?.location?.venueName;
  L.push(
    `EVENT: ${event?.name || "this event"}${venueName ? ` at ${venueName}` : ""}` +
      `${event?.liveStatus || event?.status ? ` (${event.liveStatus || event.status})` : ""}`
  );

  if (!venue) {
    L.push(
      "COVERAGE: the authority has not drawn a monitored area for this event yet, so there are no zones, gates or routes to give."
    );
    unknown.push("where the monitored area is, and therefore anything about crowding or exits");
  }

  /* ---------- where they are ---------- */
  const hasFix =
    position && Number.isFinite(position.lat) && Number.isFinite(position.lng);
  const point = hasFix ? [position.lat, position.lng] : null;
  facts.hasFix = !!hasFix;

  if (!hasFix) {
    L.push(
      "YOU: location is NOT being shared, so nothing below is specific to where this person is standing. To answer 'where am I' / 'which way out', they must turn on location sharing in the app."
    );
    unknown.push("this person's position, the zone they are in, and their personal exit route");
  } else if (venue) {
    const where = classifyUser(venue, position);
    const zone = zoneAt(venue, snapshot, point);
    facts.classification = where;
    facts.zone = zone;

    let line = `YOU: ${WHERE[where] || where}.`;
    if (zone) {
      line += ` Standing in zone "${zone.name}"`;
      line += zone.riskLevel ? ` — risk ${zone.riskLevel}` : " — risk not computed yet";
      if (Number.isFinite(zone.density)) line += `, density ${zone.density} people/m²`;
      line += ".";
    } else {
      line += " Not inside any drawn zone (the area has gaps between zones).";
    }
    L.push(line);
    if (!zone) unknown.push("which named zone this person is in");
  }

  /* ---------- what it is like around them ---------- */
  if (hasFix && roadNetwork?.segments?.length) {
    const streets = streetsAround(roadNetwork, snapshot, point);
    facts.streets = streets;

    if (streets.nearest) {
      const crowding = streets.nearest.measured
        ? `${streets.nearest.state}, ${streets.nearest.density} people/m²`
        : "no crowd readings on it right now (NOT the same as clear)";
      L.push(
        streets.nearest.name
          ? `NEAREST STREET: ${streets.nearest.name}${
              metres(streets.nearest.distanceM) ? ` (${metres(streets.nearest.distanceM)} away)` : ""
            } — ${crowding}.`
          : `NEAREST STREET: the road they are standing on has no street name in our map — refer to it as "the road you're on", never by any code — ${crowding}.`
      );
    }
    if (streets.nearby.length) {
      L.push(
        `NAMED STREETS WITHIN ${NEARBY_RADIUS_M} m: ` +
          streets.nearby
            .map((r) => `${r.name} — ${r.measured ? `${r.state} (${r.density} p/m²)` : "not measured"}`)
            .join("; ") +
          "."
      );
    }
    if (streets.busiest) {
      L.push(
        `BUSIEST NAMED STREET NEAR THEM: ${streets.busiest.name} — ${streets.busiest.state} at ${streets.busiest.density} people/m². This is the one to route around.`
      );
    }
    if (streets.unnamedNearby > 0) {
      unknown.push(
        `the names of ${streets.unnamedNearby} nearby lane(s)/path(s) — our map has no name for them, so do not name them at all`
      );
    }
    if (streets.unmeasuredCount > 0) {
      unknown.push(
        `crowding on ${streets.unmeasuredCount} nearby named street(s) that have no readings`
      );
    }
  } else if (hasFix && venue) {
    L.push(
      "STREETS: no street network has been imported for this coverage area, so roads cannot be named."
    );
    unknown.push("street names and per-street crowding");
  }

  if (hasFix) {
    const crowd = nearestCrowd(snapshot, point);
    facts.nearestCrowd = crowd;
    if (crowd) {
      let line = `NEAREST CROWD: about ${people(crowd.personsEst) || "an unknown number of"} people, ${
        metres(crowd.gapM) || "an unknown distance"
      } to the ${crowd.direction}`;
      if (crowd.level) line += `, density band ${crowd.level}`;
      if (crowd.growthPerMin && crowd.growthPerMin > 0)
        line += `, growing by roughly ${people(crowd.growthPerMin)} people per minute`;
      L.push(`${line}.`);
    } else {
      L.push("NEAREST CROWD: no significant crowd is being tracked near this person right now.");
    }
  }

  /* ---------- the wider area, briefly ---------- */
  const worstZone = (snapshot?.zones || []).find((z) => z.riskLevel);
  if (worstZone) {
    L.push(
      `AREA OVERALL: highest-risk zone is "${worstZone.name || worstZone.id}" at ${worstZone.riskLevel}.`
    );
  }

  // The platform only sees people who chose to share location, so a total of
  // zero means "nobody is reporting", NOT "the place is empty". Stating it as a
  // headcount would let the model tell someone standing in a packed street that
  // there are no people around them.
  const total = snapshot?.totals?.personsEst;
  if (Number.isFinite(total) && total > 0) {
    L.push(`ESTIMATED PEOPLE IN THE MONITORED AREA: about ${people(total)}.`);
  } else {
    L.push(
      "CROWD SIZE: nobody near them is sharing location right now, so the crowd size is UNKNOWN. Never say the area is empty or that there are zero people — say you cannot measure it."
    );
    unknown.push("how many people are actually in the area (no devices are reporting)");
  }
  const alerts = snapshot?.activeAlerts || [];
  if (alerts.length) {
    L.push(
      `ACTIVE WARNINGS: ` +
        alerts
          .slice(0, 3)
          .map(
            (a) =>
              `${a.severity} in ${a.zoneName || a.zoneId}${
                Number.isFinite(a.etaCriticalSec) ? ` (critical in ${mins(a.etaCriticalSec)})` : ""
              }`
          )
          .join("; ") +
        "."
    );
  }

  /* ---------- the way out ---------- */
  if (hasFix && venue) {
    const { exit, reason } = await safestExit({ venue, snapshot, roadNetwork, point });
    facts.exit = exit;
    if (exit) {
      let line = `SAFEST WAY OUT (computed for their exact position): ${exit.gateName}`;
      if (metres(exit.distanceM)) line += `, ${metres(exit.distanceM)} away`;
      if (mins(exit.etaSec)) line += `, ${mins(exit.etaSec)} on foot`;
      if (exit.directions) line += `. Route: ${exit.directions}`;
      else if (exit.roads.length) line += `. Via ${exit.roads.join(", then ")}`;
      line += ".";
      if (exit.worstDensity == null) {
        line += " Crowding along this route is NOT measured — do not describe it as clear.";
      } else {
        line += ` Worst crowding on the route: ${exit.worstDensity} people/m²`;
        if (Number.isFinite(exit.measuredFraction)) {
          line += ` (${Math.round(exit.measuredFraction * 100)}% of the route has readings)`;
        }
        line += ".";
      }
      if (exit.alternatives.length) {
        line += ` Other open gates: ${exit.alternatives
          .map((a) => `${a.gateName}${metres(a.distanceM) ? ` (${metres(a.distanceM)})` : ""}`)
          .join(", ")} — offer one of these if they ask for a different way, so people spread out.`;
      }
      L.push(line);
    } else {
      L.push(`SAFEST WAY OUT: cannot be computed — ${reason}.`);
      unknown.push("a specific exit route for this person");
    }
  }

  /* ---------- what they can ask for ---------- */
  // A closed gate must never be offered. The exit router already skips them, but
  // this list was feeding them back in as somewhere to walk to — which is how a
  // closed gate ended up being suggested to a citizen.
  const routable = (venue?.nodes || []).filter(
    (n) => n.isDestination || n.type === "gate" || n.type === "exit" || n.type === "poi"
  );
  const destinations = routable
    .filter((n) => n.state !== "closed")
    .map((n) => n.name || n.id)
    .slice(0, MAX_DESTINATIONS);
  const closed = routable
    .filter((n) => n.state === "closed")
    .map((n) => n.name || n.id)
    .slice(0, MAX_DESTINATIONS);

  if (destinations.length) {
    L.push(`PLACES THEY CAN ASK TO BE ROUTED TO: ${destinations.join(", ")}.`);
    facts.destinations = destinations;
  }
  if (closed.length) {
    L.push(
      `CLOSED RIGHT NOW — NEVER send them here and never list it as an option: ${closed.join(", ")}. If they ask about one of these, say it is closed and give an open alternative.`
    );
    facts.closed = closed;
  }
  if (hasFix && venue && !streetsReachable(roadNetwork, point)) {
    unknown.push("street-level walking directions (no routable street graph near this position)");
  }

  /* ---------- what the crowd was already told ---------- */
  const notices = (broadcasts || []).slice(0, MAX_ANNOUNCEMENTS);
  if (notices.length) {
    // Age matters: an announcement from an hour ago is history, not the current
    // situation. Without it the model reads the newest broadcast as live and
    // will tell somebody a street is congested long after it cleared.
    const aged = notices.map((b) => {
      const copy = b?.messages?.[lang] || b?.message || "";
      const ageMin = b?.createdAt
        ? Math.max(0, Math.round((Date.now() - new Date(b.createdAt).getTime()) / 60000))
        : null;
      const when = ageMin == null ? "time unknown" : ageMin < 1 ? "just now" : `${ageMin} min ago`;
      const stale = ageMin != null && ageMin > STALE_NOTICE_MIN;
      return `[${b?.severity ? `${b.severity}, ` : ""}${when}${stale ? ", OLD" : ""}: ${copy}]`;
    });
    L.push(
      "ANNOUNCEMENTS SENT TO THE CROWD (newest first): " +
        aged.join(" ") +
        ` Reinforce a recent one rather than contradicting it. Anything marked OLD (over ${STALE_NOTICE_MIN} min) is history: never call it "recent" or "the latest", never present it as the situation now, and never claim a street is crowded just because an old notice said so.`
    );
  }

  /* ---------- be explicit about the gaps ---------- */
  if (unknown.length) {
    L.push(
      `WHAT I DON'T KNOW (never guess these — say plainly that it isn't known): ${unknown.join("; ")}.`
    );
  }

  return { text: L.join("\n"), facts };
}

export default { buildCitizenBrief };
