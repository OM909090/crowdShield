#!/usr/bin/env node
/**
 * observe — instrument the detection chain end to end.
 *
 * `simulate.mjs` builds a crowd and reports when the system *noticed*. It cannot
 * tell you when the command agent woke up, because that arrives on the realtime
 * channel rather than in a snapshot. This connects as a dashboard would and
 * timestamps every link:
 *
 *     ingest -> zone risk -> level transition -> alert -> agent proposal
 *
 * Two reasons it has to be a socket client and not a polling loop:
 *
 *  1. The broadcaster's 1 Hz loop is viewer-driven — it only runs while someone
 *     is subscribed. Polling `/snapshot` advances the predictor on the read path
 *     instead, at the poll interval, which silently changes what SUSTAIN=3 means
 *     (3 polls, not 3 seconds). Subscribing measures the real system.
 *  2. `alert:new` and `agent:proposal` are pushed. Their arrival times are the
 *     only honest measure of wake latency, since nothing in the backend records
 *     elapsed time on the agent path.
 *
 * Usage:
 *   node tools/crowd-sim/observe.mjs --event <id> [--duration 600] [--out /tmp/run.json]
 */

import { writeFileSync } from "node:fs";
import { io } from "socket.io-client";

const args = (() => {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const tok = argv[i];
    if (!tok.startsWith("--")) continue;
    const key = tok.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
})();

const CONFIG = {
  origin: (args.origin ?? "http://127.0.0.1:5000").replace(/\/+$/, ""),
  api: (args.api ?? "http://127.0.0.1:5000/api").replace(/\/+$/, ""),
  eventId: args.event,
  duration: Number(args.duration ?? 600),
  out: args.out ?? null,
  identifier: args.identifier ?? "demo.authority@crowdhelp.local",
  password: args.password ?? "Demo@1234",
  /** Density that counts as "the crush has arrived" (Fruin CRITICAL). */
  critical: Number(args.critical ?? 4.0),
  quiet: !!args.quiet,
};

if (!CONFIG.eventId) {
  console.error("Usage: node observe.mjs --event <eventId> [--duration 600]");
  process.exit(1);
}

const LEVELS = ["NORMAL", "WATCH", "ELEVATED", "HIGH", "CRITICAL"];
/** Levels that actually wake the agent (alerts.js ELEVATED_SET). */
const WAKE_LEVELS = new Set(["ELEVATED", "HIGH", "CRITICAL"]);

const t0 = Date.now();
const rel = (ms = Date.now()) => (ms - t0) / 1000;

const state = {
  ticks: [],
  alerts: [],
  proposals: [],
  actions: [],
  firstLevel: {}, // level -> {t, density, devices, risk}
  criticalAt: null, // when measured density first hit CONFIG.critical
  zoneLevel: new Map(), // zoneId -> last seen level, to log transitions
};

/* ------------------------------------------------------------------ *
 * auth (proposals endpoint is authority-only; the socket needs none)
 * ------------------------------------------------------------------ */
let jar = "";
async function call(path, { method = "GET", body } = {}) {
  const res = await fetch(CONFIG.api + path, {
    method,
    headers: { "Content-Type": "application/json", ...(jar ? { Cookie: jar } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  if (setCookie.length) {
    const map = new Map(
      jar.split("; ").filter(Boolean).map((p) => {
        const i = p.indexOf("=");
        return [p.slice(0, i), p.slice(i + 1)];
      })
    );
    for (const line of setCookie) {
      const pair = line.split(";")[0];
      const i = pair.indexOf("=");
      if (i > 0) map.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    jar = [...map].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json?.message ?? ""}`);
  return json;
}

/* ------------------------------------------------------------------ *
 * report
 * ------------------------------------------------------------------ */

/**
 * One-line description of an action.
 *
 * `serializeProposal` flattens an action's parameters onto the action itself, so
 * reading `.params` shows an empty object and hides the very ids that make the
 * decision checkable. Pull the known fields from either shape.
 */
function describeAction(a) {
  const p = { ...(a.params ?? {}), ...a };
  const bits = ["zoneId", "gateId", "edgeId", "direction", "from", "to", "count", "fromNodeId", "toNodeId", "message"]
    .filter((k) => p[k] !== undefined && p[k] !== null && p[k] !== "")
    .map((k) => `${k}=${typeof p[k] === "string" ? p[k] : JSON.stringify(p[k])}`);
  return `${a.type} [${a.klass}/${a.status}] ${bits.join(" ") || "(no params)"}`;
}

function report() {
  const line = "=".repeat(100);
  console.log(`\n${line}\nDETECTION CHAIN REPORT\n${line}`);

  console.log("\n1. WHEN EACH RISK LEVEL WAS FIRST REACHED");
  if (!Object.keys(state.firstLevel).length) console.log("   (no zone ever left NORMAL)");
  for (const lv of LEVELS.slice(1)) {
    const hit = state.firstLevel[lv];
    if (!hit) continue;
    console.log(
      `   ${lv.padEnd(9)} t=${hit.t.toFixed(1).padStart(7)}s  risk ${hit.risk.toFixed(3)}  ` +
        `density ${hit.density.toFixed(2)} p/m²  ${hit.devices} devices in zone` +
        (WAKE_LEVELS.has(lv) ? "   <- wakes the agent" : "")
    );
  }

  console.log("\n2. ALERTS RAISED");
  if (!state.alerts.length) console.log("   none");
  for (const a of state.alerts) {
    console.log(
      `   t=${a.t.toFixed(1).padStart(7)}s  ${a.severity.padEnd(9)} ${a.zoneName}  risk ${a.risk}` +
        `  predicted critical in ${a.etaCriticalSec == null ? "—" : `${a.etaCriticalSec}s`}`
    );
  }

  console.log("\n3. LEAD TIME  (the number the problem statement grades)");
  const firstAlert = state.alerts[0];
  if (!firstAlert) {
    console.log("   no alert fired — nothing to grade");
  } else if (state.criticalAt == null) {
    console.log(
      `   first alert at t=${firstAlert.t.toFixed(1)}s; measured density never reached ` +
        `${CONFIG.critical} p/m² during the run, so the warning was not yet falsifiable.`
    );
  } else {
    const lead = state.criticalAt.t - firstAlert.t;
    console.log(`   first alert          t=${firstAlert.t.toFixed(1)}s`);
    console.log(
      `   density hit ${CONFIG.critical.toFixed(1)} p/m²  t=${state.criticalAt.t.toFixed(1)}s ` +
        `(${state.criticalAt.devices} devices, ${state.criticalAt.persons} people est)`
    );
    console.log(
      `   => LEAD TIME ${lead.toFixed(1)}s (${(lead / 60).toFixed(1)} min)` +
        (lead <= 0 ? "   TOO LATE — detection trailed the crush" : "")
    );
    if (firstAlert.etaCriticalSec != null) {
      // err < 0 means the forecast said critical was NEARER than it turned out
      // to be, i.e. it warned earlier than strictly necessary. For a safety
      // system that is the side to be wrong on.
      const err = firstAlert.etaCriticalSec - lead;
      const verdict =
        err < 0
          ? "under-estimated time-to-critical, so it warned EARLIER than needed (safe direction)"
          : err > 0
            ? "over-estimated time-to-critical, so the crush arrived SOONER than predicted (dangerous direction)"
            : "exact";
      console.log(
        `   forecast at that alert: ${firstAlert.etaCriticalSec}s to critical; actual ${lead.toFixed(0)}s ` +
          `(error ${err > 0 ? "+" : ""}${err.toFixed(0)}s — ${verdict})`
      );
    }
  }

  console.log("\n4. AGENT WAKE-UP LATENCY");
  if (!state.proposals.length) {
    console.log("   the agent never produced a proposal");
    if (state.alerts.length) {
      console.log("   (alerts fired, so check: LLM provider configured? 90s per-zone cooldown? provider timeout?)");
    }
  }
  // Attribute each proposal to the alert that actually woke the agent.
  //
  // Taking simply the nearest preceding alert gets this wrong, because the agent
  // suppresses any alert landing within WAKE_COOLDOWN_MS of its last wake for the
  // same zone (critical bypasses it). Those suppressed alerts never caused an
  // inference, so measuring from one understates the latency badly.
  const WAKE_COOLDOWN_S = 90;
  const lastWakeAt = new Map(); // zoneId -> t of last wake
  const waking = [];
  for (const a of state.alerts) {
    const last = lastWakeAt.get(a.zoneId);
    const suppressed = last != null && a.t - last < WAKE_COOLDOWN_S && a.severity !== "critical";
    if (suppressed) continue;
    lastWakeAt.set(a.zoneId, a.t);
    waking.push(a);
  }
  const suppressedCount = state.alerts.length - waking.length;
  console.log(
    `   ${state.alerts.length} alert(s) raised; ${waking.length} could wake the agent, ` +
      `${suppressedCount} suppressed by the ${WAKE_COOLDOWN_S}s per-zone cooldown\n`
  );

  for (const p of state.proposals) {
    const cause = [...waking].reverse().find((a) => a.t <= p.t);
    const lat = cause ? p.t - cause.t : null;
    console.log(
      `   proposal t=${p.t.toFixed(1).padStart(7)}s  trigger=${String(p.trigger).padEnd(16)} ` +
        `severity=${String(p.severity).padEnd(8)} actions=${p.actionCount}` +
        (lat == null ? "   (no preceding alert — manual run?)" : `   wake latency ${lat.toFixed(1)}s after alert`)
    );
    if (p.parseFailed) console.log("      ! the model's envelope was unreadable — decision lost");
    if (p.reasoning) console.log(`      reasoning: ${p.reasoning.slice(0, 220)}`);
    for (const a of p.actions ?? []) console.log(`      - ${describeAction(a)}`);
  }

  console.log("\n5. ADVISORY ACTIONS PUSHED TO THE MAP");
  if (!state.actions.length) console.log("   none");
  for (const a of state.actions) {
    console.log(`   t=${a.t.toFixed(1).padStart(7)}s  ${a.type}  ${JSON.stringify(a.detail).slice(0, 200)}`);
  }

  console.log(`\n${line}`);

  if (CONFIG.out) {
    // Written synchronously: the caller calls process.exit() straight after this
    // returns, so a dynamic import() here would never resolve and the timeline
    // would silently never reach disk.
    writeFileSync(CONFIG.out, JSON.stringify({ config: CONFIG, ...state, zoneLevel: undefined }, null, 2));
    console.log(`raw timeline written to ${CONFIG.out}`);
  }
}

/* ------------------------------------------------------------------ *
 * run
 * ------------------------------------------------------------------ */
async function main() {
  await call("/auth/login", {
    method: "POST",
    body: { identifier: CONFIG.identifier, password: CONFIG.password },
  });

  const socket = io(CONFIG.origin, { transports: ["websocket"], reconnection: true });

  socket.on("connect", () => {
    console.log(`observer connected (${socket.id}) — subscribing to event ${CONFIG.eventId}`);
    console.log("this subscription is what starts the backend's 1 Hz risk loop\n");
    socket.emit("subscribe", { eventId: CONFIG.eventId });
    if (!CONFIG.quiet) {
      console.log("    t   devices  people  cells  worst zone            dens   risk   level      eta   alerts");
      console.log("-".repeat(100));
    }
  });

  socket.on("connect_error", (e) => console.error("socket error:", e.message));

  socket.on("crowd:tick", (frame) => {
    const t = rel();
    const zones = frame.zones ?? [];
    // Worst by risk, which is how the snapshot and the brief both order them.
    const worst = [...zones].sort((a, b) => (b.risk ?? -1) - (a.risk ?? -1) || b.density - a.density)[0];

    for (const z of zones) {
      const lv = z.riskLevel;
      if (!lv) continue;
      const prev = state.zoneLevel.get(z.id);
      if (prev !== lv) {
        state.zoneLevel.set(z.id, lv);
        if (lv !== "NORMAL" && !state.firstLevel[lv]) {
          state.firstLevel[lv] = { t, density: z.density, devices: z.sampleCount, risk: z.risk ?? 0, zone: z.name };
        }
      }
      if (state.criticalAt == null && z.density >= CONFIG.critical) {
        state.criticalAt = { t, zone: z.name, density: z.density, devices: z.sampleCount, persons: z.personsEst };
      }
    }

    state.ticks.push({
      t,
      devices: frame.totals?.sampledDevices ?? 0,
      persons: frame.totals?.personsEst ?? 0,
      cells: (frame.cells ?? []).length,
      zone: worst?.name ?? null,
      density: worst?.density ?? 0,
      risk: worst?.risk ?? 0,
      level: worst?.riskLevel ?? null,
      eta: worst?.forecast?.etaCriticalSec ?? null,
      factors: worst?.riskFactors ?? null,
    });

    if (!CONFIG.quiet && state.ticks.length % 5 === 0) {
      const r = state.ticks[state.ticks.length - 1];
      console.log(
        `${r.t.toFixed(0).padStart(5)}   ${String(r.devices).padStart(7)}  ${String(r.persons).padStart(6)}  ` +
          `${String(r.cells).padStart(5)}  ${(r.zone ?? "—").slice(0, 20).padEnd(20)} ` +
          `${r.density.toFixed(2).padStart(5)}  ${r.risk.toFixed(3)}  ${(r.level ?? "—").padEnd(9)} ` +
          `${(r.eta == null ? "—" : `${r.eta}s`).padStart(6)}  ${String(state.alerts.length).padStart(6)}`
      );
    }
  });

  socket.on("alert:new", (a) => {
    const t = rel();
    state.alerts.push({
      t,
      id: a.id,
      zoneId: a.zoneId,
      zoneName: a.zoneName,
      severity: a.severity,
      risk: a.risk,
      etaCriticalSec: a.etaCriticalSec,
      createdAt: a.createdAt,
    });
    console.log(
      `\n>>> ALERT  t=${t.toFixed(1)}s  ${a.severity.toUpperCase()}  ${a.zoneName}  risk=${a.risk}` +
        `  eta-to-critical=${a.etaCriticalSec == null ? "—" : `${a.etaCriticalSec}s`}\n`
    );
  });

  socket.on("agent:proposal", (p) => {
    const t = rel();
    state.proposals.push({
      t,
      id: p._id,
      trigger: p.trigger,
      severity: p.severity,
      reasoning: p.reasoning,
      actionCount: (p.actions ?? []).length,
      actions: p.actions,
      parseFailed: p.parseFailed,
      createdAt: p.createdAt,
      status: p.status,
    });
    const cause = [...state.alerts].reverse().find((a) => a.t <= t);
    console.log(
      `\n>>> AGENT PROPOSAL  t=${t.toFixed(1)}s  trigger=${p.trigger}  severity=${p.severity}  ` +
        `actions=${(p.actions ?? []).length}` +
        (cause ? `  [woke ${(t - cause.t).toFixed(1)}s after the ${cause.severity} alert]` : "")
    );
    if (p.reasoning) console.log(`    ${p.reasoning.slice(0, 300)}`);
    for (const a of p.actions ?? []) console.log(`    - ${describeAction(a)}`);
    console.log("");
  });

  socket.on("agent:action", (payload) => {
    state.actions.push({
      t: rel(),
      type: payload.action?.type,
      detail: payload.action,
    });
  });

  const finish = async () => {
    socket.emit("unsubscribe");
    socket.close();
    // Cross-check against the durable record, in case a push was missed.
    try {
      const { proposals } = await call(`/events/${CONFIG.eventId}/agent/proposals`);
      console.log(`\n(persisted proposals for this event: ${(proposals ?? []).length})`);
    } catch (e) {
      console.log(`(could not read persisted proposals: ${e.message})`);
    }
    report();
    process.exit(0);
  };

  process.on("SIGINT", finish);
  setTimeout(finish, CONFIG.duration * 1000);
}

main().catch((e) => {
  console.error(`observer FAILED: ${e.message}`);
  process.exit(1);
});
