#!/usr/bin/env node
/**
 * crowd-sim — grow a synthetic crowd the way a real one forms, and measure how
 * much warning the system gives before it turns dangerous.
 *
 * Posts to the EXISTING `POST /api/events/:id/ingest` endpoint over HTTP, exactly
 * as a phone does. No backend change, and the real validation/auth path is
 * exercised rather than bypassed.
 *
 * The design constraint that matters: the crowd must accrete, never appear. A
 * thousand devices dropped in at once proves a threshold fires; it says nothing
 * about lead time, which is the entire promise of the product.
 */

const R_EARTH = 6371008.8;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const CONFIG = {
  api: (args.api ?? "http://localhost:5000/api").replace(/\/+$/, ""),
  eventId: args.event,
  anchor: args.anchor ?? "auto",
  peak: Number(args.peak ?? 400),
  seeds: Number(args.seeds ?? 3),
  seedPhase: Number(args["seed-phase"] ?? 25),
  gatherPhase: Number(args["gather-phase"] ?? 60),
  surgePhase: Number(args["surge-phase"] ?? 45),
  holdPhase: Number(args["hold-phase"] ?? 40),
  tick: Number(args.tick ?? 1000),
  /**
   * Pin the dangerous gathering point at "lat,lng" instead of dropping it at a
   * random bearing 40-160 m from the anchor.
   *
   * Random placement is right for a demo but wrong for a test: the zone that is
   * supposed to fail is often only a few metres wide, so a randomly placed
   * attractor lands outside it and the run proves nothing. Naming the point makes
   * the escalation repeatable while leaving every person's path random.
   */
  attractor: typeof args.attractor === "string" ? args.attractor : null,
  /** Hot-attractor radius in metres. Smaller = tighter packing = higher density. */
  radius: args.radius != null && args.radius !== true ? Number(args.radius) : null,
  /** How far out people enter. Governs walk-in time, so it bounds how quickly a crowd can accumulate. */
  spawnDist: Number(args["spawn-dist"] ?? 260),
  identifier: args.identifier ?? "demo.authority@crowdhelp.local",
  password: args.password ?? "Demo@1234",
  quiet: !!args.quiet,
};

if (!CONFIG.eventId) {
  console.error("Usage: node simulate.mjs --event <eventId> [--anchor auto|lat,lng] [--peak 400]");
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * geometry
 * ------------------------------------------------------------------ */

/** Move a [lat,lng] point `metres` along a compass `bearing`. */
function move([lat, lng], bearing, metres) {
  const t = bearing * D2R;
  const d = metres / R_EARTH;
  const p1 = lat * D2R;
  const l1 = lng * D2R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 =
    l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [p2 * R2D, l2 * R2D];
}

function distance(a, b) {
  const dLat = (b[0] - a[0]) * D2R;
  const dLng = (b[1] - a[1]) * D2R;
  const lat1 = a[0] * D2R;
  const lat2 = b[0] * D2R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}

function bearing(a, b) {
  const p1 = a[0] * D2R;
  const p2 = b[0] * D2R;
  const dl = (b[1] - a[1]) * D2R;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) * R2D) + 360) % 360;
}

/** Ray casting on a [lat,lng] ring. */
function inPolygon([lat, lng], ring) {
  if (!Array.isArray(ring) || ring.length < 3) return true; // no boundary drawn: anywhere is fine
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/* ------------------------------------------------------------------ *
 * API (cookie session, same as any client)
 * ------------------------------------------------------------------ */

let jar = "";

function captureCookies(response) {
  const lines =
    typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  if (!lines.length) return;
  const map = new Map(
    jar
      .split("; ")
      .filter(Boolean)
      .map((pair) => {
        const i = pair.indexOf("=");
        return [pair.slice(0, i), pair.slice(i + 1)];
      })
  );
  for (const line of lines) {
    const pair = line.split(";")[0];
    const i = pair.indexOf("=");
    if (i > 0) map.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  jar = [...map].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function call(path, { method = "GET", body } = {}) {
  const response = await fetch(CONFIG.api + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(jar ? { Cookie: jar } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  captureCookies(response);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  if (!response.ok) {
    const message = json?.message ?? `${response.status}`;
    throw new Error(`${method} ${path} -> ${response.status} ${message}`);
  }
  return json;
}

/* ------------------------------------------------------------------ *
 * agents
 * ------------------------------------------------------------------ */

let seq = 0;

/**
 * One synthetic phone.
 *
 * `walking` devices head for their attractor at a pedestrian pace; `milling` ones
 * have arrived and take small random steps. The milling is what makes a gathered
 * crowd look alive instead of a frozen blob, and it keeps the flow-coherence
 * signal realistic — a stationary dense crowd is a different signature from a
 * moving one, and the predictor reads both.
 */
function spawn(attractor, ring, anchor) {
  // Enter from a random direction, some way out: people arrive from elsewhere.
  // The distance is a knob because it sets the walk-in time, and walk-in time
  // caps how fast a crowd can build — spawning people 260 m from the gate means
  // a device created in the last minute of a run never arrives at all.
  const far = Math.max(20, CONFIG.spawnDist);
  let at = move(attractor.at, rand(0, 360), rand(far * 0.4, far));
  if (!inPolygon(at, ring)) at = move(attractor.at, bearing(attractor.at, anchor), rand(far * 0.25, far * 0.55));
  return {
    hash: `sim-${Date.now().toString(36)}-${(seq += 1).toString(36)}`,
    at,
    attractor,
    state: "walking",
    speed: rand(0.9, 1.5),
  };
}

function step(device, ring, dtSeconds) {
  const target = device.attractor.at;
  const gap = distance(device.at, target);

  if (device.state === "walking") {
    if (gap <= device.attractor.radiusM) {
      device.state = "milling";
    } else {
      // Head roughly toward the attractor; the jitter keeps paths from being rays.
      const heading = bearing(device.at, target) + rand(-25, 25);
      const next = move(device.at, heading, device.speed * dtSeconds);
      device.at = inPolygon(next, ring) ? next : device.at;
      device.heading = heading;
      device.speedNow = device.speed;
      return device;
    }
  }

  // Milling: shuffle within the attractor, drifting back if pushed to the edge.
  const heading = gap > device.attractor.radiusM ? bearing(device.at, target) : rand(0, 360);
  const pace = rand(0, 0.45);
  const next = move(device.at, heading, pace * dtSeconds);
  if (inPolygon(next, ring)) device.at = next;
  device.heading = heading;
  device.speedNow = pace;
  return device;
}

/* ------------------------------------------------------------------ *
 * run
 * ------------------------------------------------------------------ */

const LEVELS = ["NORMAL", "WATCH", "ELEVATED", "HIGH", "CRITICAL"];

async function main() {
  console.log("crowd-sim — gradual synthetic crowd\n" + "=".repeat(96));

  await call("/auth/login", {
    method: "POST",
    body: { identifier: CONFIG.identifier, password: CONFIG.password },
  });

  const { venue } = await call(`/events/${CONFIG.eventId}/venue`);
  const ring = venue?.aor?.polygon ?? [];
  if (!ring.length) console.log("! no coverage polygon drawn — devices will not be filtered by area");

  /* ---- anchor: where is the real phone? ---- */
  let anchor = null;
  if (CONFIG.anchor === "auto") {
    const { snapshot } = await call(`/events/${CONFIG.eventId}/snapshot`);
    const cells = snapshot?.cells ?? [];
    if (cells.length) {
      // Whoever is already reporting — normally the phone in your hand.
      const busiest = cells.reduce((a, c) => (c.personsEst > (a?.personsEst ?? -1) ? c : a), null);
      anchor = busiest.center;
      console.log(`anchor: your live device at ${anchor[0].toFixed(6)}, ${anchor[1].toFixed(6)}`);
    }
  } else if (typeof CONFIG.anchor === "string" && CONFIG.anchor.includes(",")) {
    const [lat, lng] = CONFIG.anchor.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) anchor = [lat, lng];
  }
  if (!anchor) {
    const lat = ring.reduce((a, p) => a + p[0], 0) / (ring.length || 1);
    const lng = ring.reduce((a, p) => a + p[1], 0) / (ring.length || 1);
    anchor = ring.length ? [lat, lng] : [20.2961, 85.8245];
    console.log(
      `anchor: no live device found, using coverage centre ${anchor[0].toFixed(6)}, ${anchor[1].toFixed(6)}`
    );
    console.log("        (open the app, share location, confirm you appear, then re-run for a true test)");
  }

  /* ---- attractors: where people decide to gather ---- */
  const attractors = [];
  for (let i = 0; i < CONFIG.seeds; i += 1) {
    let at = move(anchor, rand(0, 360), rand(40, 160));
    let tries = 0;
    while (!inPolygon(at, ring) && tries < 40) {
      at = move(anchor, rand(0, 360), rand(30, 140));
      tries += 1;
    }
    attractors.push({
      id: `A${i + 1}`,
      at,
      radiusM: rand(12, 26),
      // Uneven shares: real gatherings are lopsided, and an even split would
      // never produce the one hot spot the predictor is supposed to catch.
      weight: rand(0.5, 1.5),
      hot: false,
    });
  }
  // Exactly one becomes the dangerous one, chosen now but not acted on until surge.
  // When --attractor names a point, that point IS the dangerous one: the run is
  // aimed at a specific zone so the same test produces the same escalation.
  let hotspot;
  const pinned = CONFIG.attractor?.includes(",")
    ? CONFIG.attractor.split(",").map(Number)
    : null;
  if (pinned && pinned.length === 2 && pinned.every(Number.isFinite)) {
    attractors[0].at = pinned;
    hotspot = attractors[0];
    console.log(`hotspot: pinned at ${pinned[0].toFixed(6)}, ${pinned[1].toFixed(6)}`);
    if (!inPolygon(pinned, ring)) {
      console.log("       ! that point is OUTSIDE the coverage polygon — it will never be counted");
    }
  } else {
    hotspot = pick(attractors);
  }
  if (Number.isFinite(CONFIG.radius) && CONFIG.radius > 0) hotspot.radiusM = CONFIG.radius;
  console.log(`hotspot: ${hotspot.id} radius ${hotspot.radiusM.toFixed(1)} m`);
  hotspot.hot = true;
  console.log(
    `attractors: ${attractors
      .map((a) => `${a.id}@${Math.round(distance(anchor, a.at))}m${a.hot ? "*" : ""}`)
      .join("  ")}   (* becomes the surge)`
  );

  const total = CONFIG.seedPhase + CONFIG.gatherPhase + CONFIG.surgePhase + CONFIG.holdPhase;
  console.log(
    `plan: seed ${CONFIG.seedPhase}s -> gather ${CONFIG.gatherPhase}s -> surge ${CONFIG.surgePhase}s -> hold ${CONFIG.holdPhase}s   peak ${CONFIG.peak} devices\n`
  );

  const devices = [];
  const observations = [];
  const firstSeen = {}; // level -> seconds
  let firstAlert = null;
  let criticalAt = null;
  let stopping = false;

  process.on("SIGINT", () => {
    stopping = true;
  });

  if (!CONFIG.quiet) {
    console.log(
      "   t  phase     devices  people  cells  worst zone            dens   level      eta   alerts"
    );
    console.log("-".repeat(96));
  }

  const started = Date.now();
  for (let t = 0; t < total && !stopping; t += 1) {
    const dt = CONFIG.tick / 1000;

    /* ---- which phase, and how fast do people arrive? ---- */
    let phase;
    let spawnRate; // devices per second
    if (t < CONFIG.seedPhase) {
      phase = "seed";
      // One at a time. This is the "single dots appearing" the map should show.
      spawnRate = Math.max(1, Math.round(CONFIG.peak * 0.06)) / CONFIG.seedPhase;
    } else if (t < CONFIG.seedPhase + CONFIG.gatherPhase) {
      phase = "gather";
      spawnRate = (CONFIG.peak * 0.34) / CONFIG.gatherPhase;
    } else if (t < CONFIG.seedPhase + CONFIG.gatherPhase + CONFIG.surgePhase) {
      phase = "surge";
      spawnRate = (CONFIG.peak * 0.6) / CONFIG.surgePhase;
    } else {
      phase = "hold";
      spawnRate = 0;
    }

    // Fractional rates accumulate, so 0.4/s really is one device every 2.5 s
    // rather than silently rounding to zero.
    spawnCarry += spawnRate * dt;
    while (spawnCarry >= 1 && devices.length < CONFIG.peak) {
      spawnCarry -= 1;
      // During surge the hot attractor takes most arrivals.
      const target =
        phase === "surge" && Math.random() < 0.75
          ? hotspot
          : weightedPick(attractors);
      devices.push(spawn(target, ring, anchor));
    }

    // Migration: once the surge starts, some people already here drift toward it.
    if (phase === "surge") {
      for (const device of devices) {
        if (device.attractor !== hotspot && Math.random() < 0.02) {
          device.attractor = hotspot;
          device.state = "walking";
        }
      }
    }

    for (const device of devices) step(device, ring, dt);

    /* ---- report positions exactly as the app does ---- */
    const heartbeats = devices.map((d) => ({
      deviceHash: d.hash,
      lat: d.at[0],
      lng: d.at[1],
      heading: Math.round(d.heading ?? 0),
      speed: Number((d.speedNow ?? 0).toFixed(2)),
    }));
    if (heartbeats.length) {
      // The endpoint caps a request at 1000.
      for (let i = 0; i < heartbeats.length; i += 1000) {
        await call(`/events/${CONFIG.eventId}/ingest`, {
          method: "POST",
          body: { heartbeats: heartbeats.slice(i, i + 1000) },
        });
      }
    }

    /* ---- observe what the system now thinks ---- */
    const { snapshot } = await call(`/events/${CONFIG.eventId}/snapshot`);
    const zones = snapshot?.zones ?? [];
    const worst = zones[0] ?? null;
    const level = worst?.riskLevel ?? null;
    const density = worst?.density ?? 0;
    const eta = worst?.etaCriticalSec ?? worst?.forecast?.etaCriticalSec ?? null;
    const alerts = snapshot?.activeAlerts ?? [];

    if (level && !firstSeen[level]) firstSeen[level] = { t, density, people: snapshot.totals.personsEst };
    if (!firstAlert && alerts.length) {
      firstAlert = { t, severity: alerts[0].severity, eta: alerts[0].etaCriticalSec };
    }
    if (!criticalAt && density >= 4) criticalAt = t;

    observations.push({ t, phase, devices: devices.length, snapshot });

    if (!CONFIG.quiet) {
      console.log(
        `${String(t).padStart(4)}  ${phase.padEnd(8)} ${String(devices.length).padStart(7)}  ` +
          `${String(snapshot.totals.personsEst).padStart(6)}  ${String(snapshot.cells.length).padStart(5)}  ` +
          `${(worst?.name ?? "—").slice(0, 20).padEnd(20)} ${density.toFixed(2).padStart(5)}  ` +
          `${(level ?? "—").padEnd(9)} ${(eta == null ? "—" : `${eta}s`).padStart(5)}  ` +
          `${String(alerts.length).padStart(6)}`
      );
    }

    const elapsed = Date.now() - started - t * CONFIG.tick;
    await new Promise((r) => setTimeout(r, Math.max(0, CONFIG.tick - elapsed)));
  }

  /* ---- the number that actually matters ---- */
  console.log("\n" + "=".repeat(96));
  console.log("LEAD-TIME REPORT");
  for (const level of LEVELS) {
    const hit = firstSeen[level];
    if (hit) {
      console.log(
        `  first ${level.padEnd(9)} at t=${String(hit.t).padStart(3)}s   ` +
          `density ${hit.density.toFixed(2)} p/m²   ~${hit.people} people`
      );
    }
  }
  if (firstAlert) {
    console.log(
      `  first ALERT     at t=${String(firstAlert.t).padStart(3)}s   severity=${firstAlert.severity}` +
        `${firstAlert.eta != null ? `   predicted critical in ${firstAlert.eta}s` : ""}`
    );
  } else {
    console.log("  first ALERT     never fired");
  }

  if (criticalAt != null) {
    console.log(`  critical density reached at t=${criticalAt}s`);
    const warned = firstAlert?.t ?? firstSeen.ELEVATED?.t ?? firstSeen.WATCH?.t;
    if (warned != null) {
      const lead = criticalAt - warned;
      console.log(
        `  → WARNING ARRIVED ${lead}s BEFORE the crowd became critical` +
          (lead <= 0 ? "  (too late — this is a failure)" : "")
      );
    }
  } else {
    console.log("  critical density never reached — raise --peak or lower --seeds to concentrate it");
  }
  console.log("=".repeat(96));
  console.log(
    "Synthetic positions live only in the in-memory hot store and expire on their own;\n" +
      "restarting the API clears them. Nothing synthetic was persisted."
  );
}

let spawnCarry = 0;

function weightedPick(attractors) {
  const total = attractors.reduce((sum, a) => sum + a.weight, 0);
  let r = Math.random() * total;
  for (const a of attractors) {
    r -= a.weight;
    if (r <= 0) return a;
  }
  return attractors[0];
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}`);
  process.exit(1);
});
