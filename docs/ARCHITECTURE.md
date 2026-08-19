# CrowdShield — System Architecture & Execution Pipeline

> Refined design: authority-defined ground truth, real-time participatory sensing,
> tiered intelligence, event-triggered LLM agent, and goal-aware personal guidance.
> Companion to `PLAN.md` (roadmap) and `PROGRESS.md` (build log).
>
> Last updated: 2026-08-18
> Build status: E0–E4 built + verified, plus free OSM/OSRM routing with crowd-risk
> fusion (routing addendum) and the **no-fabrication contract** in §17 — the rule
> that every figure is measured or openly unknown, verified end to end against a
> real hosted model (`PROGRESS.md` §6.16).

---

## 0. Design axioms

These five rules resolve almost every downstream decision.

1. **The map is a view, not a source.** The map renders world state; the AI reads
   the same world state. They never talk to each other.
2. **Prediction is math. Reasoning is the LLM.** Numeric forecasting is
   deterministic and always-on. The LLM sleeps until something meaningful changes.
3. **The LLM sets policy; deterministic services serve individuals.** The agent
   never runs per-user. It decides strategy; the router applies that strategy to
   40,000 people. (See §7 — this is the scale-critical rule.)
4. **The authority's marked area is a hard constraint, not a hint.** The AI may
   only route people along authority-sanctioned paths.
5. **Advisory actions auto-execute; consequential actions need human approval.**

---

## 1. Layered architecture

```
        CITIZEN APP            AUTHORITY APP           EVENT SYSTEMS
      GPS + alerts + goal    Dashboard + map        Gate counts / ticket scans
             │                      │                       │
             └──────────────────────┼───────────────────────┘
                                    ▼
                        REAL-TIME INGESTION  (WebSocket, adaptive rate)
                                    ▼
                          SENSOR FUSION  (confidence-weighted, calibrated)
                                    ▼
        VENUE GRAPH ──────────►  H3 ENGINE  ◄────────── (authority ground truth)
      AoR · zones · nodes         │  │  │
      edges · capacities   Density │  │ Flow │ Coverage/Confidence
                                    ▼
                           CLUSTER TRACKER   (group people into objects)
                                    ▼
                          TIER 1 PREDICTOR   (forecast · risk · state machine)
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
      LIVE WORLD STATE        ALERT BUS            EVENT DETECTOR
              │                     │              (state transitions)
      ┌───────┼───────┐             │                     │
      ▼       ▼       ▼             ▼                     ▼
   MAP UI  GUIDANCE  AI AGENT   CITIZENS            LLM TRIGGER
           SERVICE      ▲                          (cooldown/dedupe)
              │         └──────────────────────────────┘
              │                     │
              │              spatial tools
              │                     │
              │       ┌─────────────┼─────────────┐
              ▼       ▼             ▼             ▼
        per-user   Routing        Gates     Announcements
         routes       │             │             │
                      └─────────────┼─────────────┘
                                    ▼
                            ACTION PROPOSAL
                                    ▼
                         APPROVAL (consequential)
                                    ▼
                           AUTHORITY ACTION → world state
```

Additions to the baseline design, and why:

| Component | Why it exists |
|---|---|
| **Venue Graph** | Turns authority markers into a routable, capacity-aware graph. Without it the AI cannot legally or safely route anyone. |
| **Cluster Tracker** | Converts 40k points into ~20 named crowd objects the LLM can reason about; detects merges (crush precursor). |
| **Guidance Service** | Serves per-user routes deterministically at scale, *without* the LLM in the loop. |
| **Event Detector + LLM Trigger** | State-transition detection with cooldown, so the LLM wakes only when it earns it. |
| **Coverage/Confidence** | Prevents alarms based on 3 phones; makes sampling honest. |

---

## 2. Tiers and cadence

| Tier | Cadence | Nature | Responsibility |
|---|---|---|---|
| 0 — Sense | ~1 s | Pure math | Ingest GPS → H3 cells → density, speed, flow vectors, coverage |
| 1 — Predict | 2–5 s | Deterministic / statistical | Forecast, ETA-to-critical, pressure, counter-flow, risk 0–1, zone state machine |
| 2 — Reason | Event-triggered (+ 20–30 s strategic review) | LLM + tools | Diagnose, choose interventions, draft multilingual messages, propose actions |
| 3 — Authorize | Human | Authority | Approve consequential actions |

Story for judges: **Tier 0 SEES · Tier 1 PREDICTS · Tier 2 REASONS · Authority AUTHORIZES.**
The LLM is a *Decision & Coordination Agent*, never the prediction engine.

---

## 3. Venue Graph — the authority's ground truth

The authority already places markers. We promote that into a machine-usable model.

```
Venue {
  aor:      Polygon              // Area of Responsibility (the guarded area)
  buffer:   Polygon              // approach ring (e.g. AoR + 1.5 km)
  zones:    [{ id, name, polygon, areaM2, capacity, type }]
  nodes:    [{ id, type: gate|junction|poi|medical|exit, latlng,
               throughputPerMin?, state: open|closed|exit_only|entry_only }]
  edges:    [{ id, from, to, path[], widthM, lengthM,
               direction: bi|oneway, state: open|blocked, capacityPerMin }]
}
```

Capacity model (published pedestrian figures, so the numbers are defensible):

- Optimal pedestrian flow ≈ **1.2–1.4 persons/metre/second** of usable width.
  A 5 m corridor ≈ **~360–420 persons/min**.
- Fruin Level of Service, as people/m²: comfortable **< 1.5**, constrained
  **2–3**, critical **4–5**, dangerous **> 5**.
- Zone capacity = `areaM2 × safe_density (≈2.0 p/m²)`.

**Why this is the keystone:** it makes routing *legal and physical*. The AI cannot
suggest crossing a barricade, entering a closed gate, or using a path that has no
capacity left — those are hard constraints in the graph. Every recommendation the
agent makes is expressed in the authority's own vocabulary ("open Gate 3", "make
Grand Road segment E7 one-way"), which is also why authorities will trust it.

**Authoring effort (kept low):** authority draws (1) the AoR polygon, (2) zone
polygons, (3) corridors as polylines with a width value, and drops gate/POI/
medical pins — all in the existing MapEditor. Optional enhancement: auto-import
the footpath network from OpenStreetMap (we already use OSM tiles) and let the
authority confirm it.

---

## 4. Sensing and low-latency transport

**Client (citizen PWA)**
- Adaptive heartbeat: ~1 s when moving or inside a risk zone; 5–10 s when idle
  (battery matters for a 9-hour procession).
- Persistent WebSocket. Compact payload: `[deviceHash, lat, lng, accuracy, heading, speed, t]`.
- Offline queue: buffer positions during network loss, send on reconnect
  (flagged as delayed so they don't pollute "now").

**Server**
- Socket.IO rooms per event. Redis holds hot last-known state per device
  (TTL seconds); MongoDB persists only aggregates.
- **Viewport-scoped fan-out**: the authority client subscribes to its current
  bounding box + zoom; payload size stays flat regardless of crowd size.
- Delta updates only (changed cells / moved dots).

**Rendering**
- Level of detail: zoomed out → H3 aggregates + heatmap; zoomed in → individual dots.
- Canvas for low thousands (already enabled via `preferCanvas`); WebGL overlay
  (deck.gl / Leaflet.glify) beyond ~5–10k dots. 40k DOM markers is not viable.
- **Client-side dead reckoning**: interpolate each dot along its last known
  heading/speed so 1 s server updates render as smooth 60 fps motion. This is the
  trick that makes it feel like Google Maps.

**Latency budget:** GPS→server 50–150 ms · fusion ~100 ms · fan-out ~50 ms →
**< 500 ms end-to-end.**

**Sampling honesty.** Only a fraction of attendees install the app, so raw counts
≠ crowd size. We estimate a **participation rate** by cross-checking a known
count (gate/ticket scans, or one marshal's manual count in one zone) against app
users in that zone, then scale. Crucially, **density trend, flow direction and
ratio-based signals remain valid at low participation** — and those are what
prediction actually needs. Cordon-line balance (inflow − outflow across the AoR
boundary) is also ratio-based and therefore robust to sampling.

---

## 5. H3 spatial engine

Bin positions into [H3](https://h3geo.org/) hexagons rather than raw coordinates
or square geohashes:

- Six **equidistant** neighbours. Square grids make diagonal neighbours 1.41×
  farther, which corrupts flow fields and contagion math.
- Resolution = zoom level for free (same data, coarse or fine).
- Integer cell IDs: cheap Redis keys, cheap LLM tokens.

Working resolutions: analysis at **res 11** (~25 m edge, ~2,000 m² — the right
scale for people/m²), rollup at **res 9** for the overview. Calibrate on site.

Per cell, per tick: `personsEst, densityPerM2, meanSpeed, flowBearing,
velocityVariance, sampleCount, confidence`.

---

## 6. Tier 1 — prediction that is actually predictive

Density alone is a weak predictor. The signal set:

| Signal | Formula / method | Detects |
|---|---|---|
| Density (LOS) | persons / m² | Congestion level |
| Flow | density × speed | Throughput |
| **Crowd pressure** | density × variance(velocity) | **Crush risk (turbulence precedes collapse)** |
| Convergence | −divergence of flow field | Compression building |
| Directional entropy | entropy of heading histogram | Counter-flow / disorder |
| Counter-flow | opposing vectors in one cell | Reverse movement |
| Queue growth | dwell time at gate nodes | Gate saturation |
| Cordon balance | inflow − outflow across AoR | Total occupancy trend |
| Cluster merge | tracked cluster events | Two crowds compressing |

The **pressure** term is the scientifically-grounded one: in studied crush
events, motion becomes turbulent and erratic *before* collapse, while density
alone may look survivable. Density says "crowded"; pressure says "dangerous".

**Forecast.** Per-cell Holt double-exponential smoothing (level + trend) →
projected density curve → `etaCriticalSec` (time until the critical threshold is
crossed). Cheap, explainable, no training data required. Optional later: a small
regressor trained on simulation output, documented honestly as ML.

**Risk score** `0..1` = weighted blend of the signals above, each normalised, and
multiplied by confidence. Every alert carries its contributing factors so the UI
can explain *why* — no black box.

**Zone state machine** (false-alarm control):

```
NORMAL → WATCH → ELEVATED → HIGH → CRITICAL
```
- Promotion requires the condition to **hold for N consecutive ticks**
  (sustained-breach), not a single spike.
- Demotion uses a **lower** threshold than promotion (hysteresis), so states
  don't oscillate.
- Confidence gate: a cell with too few samples cannot exceed WATCH.
- Multi-signal confirmation for CRITICAL (e.g. density AND pressure/convergence).

---

## 7. Guidance Service — personal, goal-aware routing at scale

> **The scale-critical rule: individual routing must never call the LLM.**
> 40,000 users × LLM inference is impossible in cost and latency. The LLM decides
> *policy* ("Grand Road segment E7 one-way; prefer Gate 3; avoid zone C12"); this
> deterministic service applies that policy to every user in milliseconds.

**User classification** (from geometry + heading):

| Class | Definition | Guidance |
|---|---|---|
| `INSIDE` | within AoR | goal-aware safest route to their destination |
| `APPROACHING` | in buffer ring, heading toward AoR | gate assignment + arrival slotting |
| `TRANSIT` | destination on the far side; wants to cross | perimeter bypass or timed crossing window |
| `OUTSIDE` | neither | no guidance (and no tracking) |

**Destination intent.** The user picks a destination from the authority's POI
list (temple entry, chariot viewing area, parking P2, nearest exit, medical). A
fixed list — not free text — so there is no ambiguity and no hallucinated place.

**Time-dependent safest route.** The route must be safe *when the user will be
there*, not now. Edge cost is evaluated at predicted arrival time:

```
cost(e, t_arrive) = (lengthM / walkSpeed)
                  × (1 + α · forecastDensity(e, t_arrive) / criticalDensity)
                  + β · counterFlowPenalty(e, t_arrive)
                  + γ · expectedQueueWait(node)
                  + δ · turnPenalty
cost = ∞  if edge blocked, gate closed, direction violated, or capacity exhausted
```

Solved with time-dependent A*/Dijkstra over the Venue Graph, ETA propagating
along the path. This is *predictive* routing, not current-state routing.

**Anti-herding (the safety property most systems miss).** If you hand 10,000
people the same "safest route", you have engineered the next crush. So:

1. Compute **k safest paths** (k≈3), not one.
2. Assign users **probabilistically, weighted by residual capacity** of each path.
3. Track live assignments; as a path fills, its cost rises for the next user —
   a feedback loop that self-balances load.
4. Cap assignments per edge at its `capacityPerMin`.

**Route stability.** Re-route on material change only, with hysteresis (switch
only if the new route is >20% better). Constantly flip-flopping directions
destroys trust and causes hesitation in crowds.

**Inflow control for `APPROACHING` users — the highest-leverage intervention.**
This is where prediction becomes *prevention*: shape demand before it arrives.
- Gate assignment away from saturated gates ("enter via Gate 5, 7 min walk").
- **Arrival slotting / soft hold** ("wait ~6 min at the plaza, Gate 3 is at capacity").
- Hard advisory if the AoR is CRITICAL ("do not approach; nearest safe waiting area is…").

**`TRANSIT` users.** Either a perimeter bypass polyline around the AoR, or a
timed crossing window at a low-density crossing edge ("cross at Junction J4
within the next 4 minutes").

---

## 8. Grouping people in real time

Two distinct groupings, both essential:

**A. Clusters (physical crowd objects).** Connected components of adjacent H3
cells above a density threshold →

```
Cluster { id, cells[], centroid, areaM2, personsEst,
          meanVelocity, cohesion, growthRatePerMin, state }
```

Cluster IDs are **tracked across ticks** (nearest-centroid / assignment
matching), which yields velocity, growth rate, and **merge / split events**.
Two clusters merging at a chokepoint = compression = a first-class crush
precursor alert. This also gives the LLM ~20 named objects to reason about
instead of 40,000 points.

**B. Cohorts (messaging groups).** Group users by
`(cellId, destinationId, language)`. One generated message per cohort → ~30
messages instead of 40,000. Each cohort gets a *different* route, which is
exactly what anti-herding requires. Cohorts are also the unit for geofenced
push, so a warning reaches only the affected hexagons — no city-wide panic.

*(Optional, later: family/companion groups for "your group is separated" alerts.)*

---

## 9. Tier 2 — the LLM agent

### 9.1 Wake conditions

The Event Detector publishes only on **state transitions** and **material
changes** — never on every numeric wiggle:

```
WAKE if:
  zone state transition   (WATCH→ELEVATED, ELEVATED→HIGH, HIGH→CRITICAL)
  etaCriticalSec < 600
  risk rises > 15% within 30 s
  counter-flow persists > 10 s
  cluster merge detected
  gate becomes unavailable / route becomes blocked
  new incident reported (SOS)
  authority asks a question
  strategic review timer (20–30 s)
```

**Cooldown + dedupe.** After a wake for zone Z, suppress further wakes for Z
until either the cooldown expires *or* the situation **materially** changes
(state change, new blocker, new incident). A zone that stays critical for five
minutes must not trigger 300 inferences.

### 9.2 Read interface — decision-ready brief, not a haystack

The agent receives a compact brief; it never sees raw coordinates.

```
event:     RISK_ESCALATION
zone:      C12  risk 0.89  state HIGH  eta 310s  confidence 0.94
clusters:  K7 4200p 0.4m/s NE growing; K9 1100p 0.6m/s N
top risks: C12 0.89 | A04 0.71 | B02 0.55  (+12 others below 0.4)
assets:    gates open 5/7 (G3 closed, G6 exit_only); blocked edges 2; units free 12
candidates: [G3 open → +900/min to C12] [E7 oneway → +30% outflow]
            [2 units from Market (low density, 400m)]
```

Note `candidates`: **Tier 1 pre-computes the feasible interventions** (gates with
residual capacity, k safest routes, nearest available units). The LLM *chooses
and explains* rather than deriving from scratch. This raises decision quality
while cutting tokens — the direct answer to "maximise throughput without reducing
input quality."

### 9.3 Spatial tools (lazy, on-demand)

```
getZone(id)                    getZoneHistory(id, minutes)
getCluster(id)                 getMarkersNear(latlng, radiusM)
getGateStatus()                getAvailableUnits()
findSafestRoute(from, to)      simulateIntervention(action)   // digital twin
getCordonBalance()
```

`simulateIntervention` is the standout: the agent can ask the simulation engine
"if I open Gate 3, what happens in 10 minutes?" and compare options before
recommending. That is a genuine agentic loop, and it feeds the Digital Twin bonus.

### 9.4 Write interface — structured actions only

The model never emits backend commands or code. It emits a validated schema:

```json
{
  "incidentId": "INC-8291",
  "severity": "high",
  "reasoning": "C12 pressure rising with counter-flow; G3 has spare capacity.",
  "actions": [
    { "type": "highlight_zone",       "zoneId": "C12" },
    { "type": "draw_route",           "routeId": "R17" },
    { "type": "set_policy",           "edgeId": "E7", "direction": "oneway" },
    { "type": "propose_gate_change",  "gateId": "G3", "state": "open" },
    { "type": "deploy_units",         "from": "Market", "count": 2, "to": "C12" },
    { "type": "draft_alert",          "cohorts": ["C12"], "languages": ["or","hi","en"] }
  ]
}
```

Server-side validation against the Venue Graph (does G3 exist? is E7 an edge?),
then execution split:

| Class | Examples | Path |
|---|---|---|
| **Advisory** | highlight, draw route, camera, set routing policy | auto-execute |
| **Consequential** | open/close gate, deploy units, mass broadcast | **authority approval** |

Every proposal, approval and outcome is written to an audit log — which also
becomes the source for the generative incident summary.

---

## 10. Token & throughput economy

Their event-triggering already minimises call *frequency*. These maximise
efficiency *per call* without degrading input quality:

1. **Static/dynamic split + prompt caching.** Venue graph, SOPs, tool schema and
   action schema live in a **cached system prefix** (sent once, cheap on reuse).
   Only the volatile delta goes in the fresh suffix. Biggest single lever.
2. **Delta snapshots.** After the first wake, send *what changed*
   (`C12 risk 0.72→0.89; G3 closed`), not the whole world.
3. **Ranked truncation.** Top-5 risks plus a one-line rollup for the rest.
4. **Compact tabular encoding.** CSV/TSV rows instead of deeply nested JSON —
   repeated keys are pure waste (~40–60% saving on tabular data).
5. **Numeric quantisation.** `risk 0.89`, density to 1 decimal, ETA in whole
   seconds. No decision-relevant information is lost.
6. **Symbolic IDs** (`C12`, `G3`, `R17`) resolved via the cached legend.
7. **Pre-computed candidates** (§9.2) — move derivation into deterministic code.
8. **Model cascade.** Small fast model for triage/classification; strong model
   only for consequential decisions.
9. **Bounded output.** Strict JSON schema, capped `reasoning` length, low
   `max_tokens` — no rambling.
10. **Lazy tool loading.** History and detail only when the agent asks.
11. **Parallel tool calls** batched into one round-trip.

Target per wake: **~1.5–3 KB dynamic input, ~300–600 output tokens, < 2 s**.

---

## 11. Privacy & ethics (scored 10%)

- **Opt-in** consent in plain language before any location is read.
- **No cameras, no imagery** anywhere in the system.
- Fine-grained positions live only in RAM/Redis with a short TTL; **only hex
  aggregates persist**.
- Device IDs are **salted hashes**, never joined with user PII plus location.
- Coarse geohash precision for anything stored; event data auto-deletes after the
  event.
- Easy opt-out and data deletion.

Slide line: **the AI sees hexagons, not humans.**

---

## 12. Execution pipeline (build order)

| Phase | Deliverable | Unblocks |
|---|---|---|
| **E0** | **Venue Graph + AoR authoring** in MapEditor (polygons, corridors, capacities); models `Venue`, upgrade `MapMarker` → nodes/edges | everything — routing and constraints depend on it |
| **E1** | Ingestion endpoint + H3 engine + Redis hot state + Socket.IO fan-out + **crowd simulator** (we cannot summon 45k phones) + `GET /events/:id/snapshot` | the map's real data source *and* the AI's eyes |
| **E2** | Cluster tracker + Tier 1 predictor + state machine + Alert Bus + Event Detector | real prediction; kills `mockCrowdEngine` |
| **E3** | Guidance Service (goal-aware, time-dependent, anti-herd) + citizen PWA (consent, heartbeat, goal picker, push, SOS) + i18n | the mandatory mobile app; the "drive people" capability |
| **E4** | LLM Trigger + agent tools + action schema + validation + approval UI + audit log | the agentic layer (wire into the existing assistant popup's streaming seam) |
| **E5** | Digital Twin (`simulateIntervention`), voice command centre, generative incident summaries, pitch deck + demo video | bonus points + submission assets |

Each phase is independently demoable, and E1 immediately replaces the fake data
that currently undermines the whole system's credibility.

> **Build status (2026-08-15): E0–E4 are built, verified, and demoable** — venue
> graph + authoring; the real-time pipeline that kills the mock data; the Tier 1
> predictor + alerts; the personal-guidance + incidents/SOS + citizen-PWA layer;
> and the E4 agentic LLM layer (user-configured provider with model discovery,
> the Tier 2 agent with validated actions + human approval, and the live
> assistant popup). **E5 — Digital Twin, voice command centre, generative
> incident summaries, pitch assets — is the next milestone.** See `PROGRESS.md`
> for the detailed, verified build log.

---

## 13. Worked scenario — Ratha Yatra, Grand Road, Puri

A ~3 km corridor, chariots advancing, funnels at Gundicha Temple and Singhadwara.
The classic crush pattern: a **stationary** crowd compressed from behind by an
**advancing** one.

| Time | What happens |
|---|---|
| T+0:00 | Tier 0: Singhadwara approach cells pass 3 p/m²; mean speed falls to 0.3 m/s; velocity variance climbing — the crush signature (density ↑, motion ↓, turbulence ↑). |
| T+0:05 | Tier 1: pressure and convergence rising; counter-flow detected (people trying to exit back through inflow); clusters K7 and K9 on a merge course. Forecast: critical in **~9 min**. Zone C12 ELEVATED→HIGH. Publishes `RISK_ESCALATION`. |
| T+0:06 | Event Detector → LLM Trigger (passes cooldown) → agent wakes with the brief. Calls `getZone(C12)`, `getZoneHistory(C12,15)`, `getGateStatus()`, `simulateIntervention(open G3)`. Sees from the **authority's own markers** that G3 is closed and the east edge is barricaded. |
| T+0:07 | Agent proposes: open G3, make E7 one-way, move 2 units from low-density Market, draft Odia/Hindi/English alert for cohort C12. Advisory parts (highlight, route) render instantly; gate + broadcast await approval. |
| T+0:08 | Authority taps approve. Guidance Service immediately re-routes **every** affected user — spread across 3 paths by residual capacity, so the relief route itself doesn't become the next bottleneck. Approaching users outside the AoR get re-assigned to Gate 5 or a short hold. Transit users get the perimeter bypass. |
| T+0:15 | Density and pressure curves bend down. Zone demotes HIGH→ELEVATED (hysteresis prevents flapping). Agent writes the incident summary from the audit log. |

Ten-minute head start, every number auditable, and no single instruction that
could create a second crush.

---

## 14. Locked decisions

Confirmed 2026-08-13:

| # | Decision | Choice |
|---|---|---|
| 1 | **Redis** for hot position state | **Yes.** Added in E1 (where ingestion lives), not before — no dead dependencies. Mongo keeps aggregates only. |
| 2 | **Testing layer** | **Deferred until the system is built.** Design fixed now — see §15. |
| 3 | **Demo scale** | **40k+ dots with a WebGL layer** (LOD: hex aggregates when zoomed out, dots when zoomed in). |
| 4 | **LLM provider** | **User-configured custom provider** — base URL + API key + model, with live model discovery. See §16. |

Still open: **OSM footpath auto-import** for edges (nice-to-have; authority-drawn
corridors are the reliable path). Decide at E0 close.

---

## 15. Testing layer (deferred — built after the system)

Testing happens **after** the system is built, and it is a deliberate,
controllable experiment, not random noise.

**Core requirement: gradual ramp, never instant-random.** GPS positions are
injected on the map in **increasing order** — progressively more devices,
progressively denser, along realistic paths — so we can observe *exactly when and
why* each threshold fires and confirm the behaviour matches the design intent.

Why this matters: random scatter would fire triggers arbitrarily and prove
nothing. A monotonic ramp lets us assert the *sequence*:

```
inject devices → density rises → WATCH fires at t1
              → pressure rises → ELEVATED at t2
              → forecast crosses → HIGH + predicted-crush alert at t3
              → LLM wakes exactly once (cooldown holds)
              → apply intervention → curve bends → demotes with hysteresis
```

The harness must let us verify:

| What to verify | How |
|---|---|
| Trigger timing | at what density/pressure/ETA each state transition fires |
| No premature firing | low sample counts stay capped at WATCH (confidence gate) |
| No trigger storms | repeated ticks in one state wake the LLM **once** (cooldown/dedupe) |
| Hysteresis | demotion happens at a lower threshold than promotion; no flapping |
| Forecast accuracy | predicted `etaCriticalSec` vs when it actually went critical |
| Routing safety | k-path spread — no single relief route gets overloaded |
| Inflow control | approaching users get reassigned/held before they arrive |
| Latency | end-to-end ingest→render under load |

Controls: device count, ramp rate, path/waypoints, dwell behaviour, seeded RNG
for **reproducible** runs, plus scripted scenarios (Ratha Yatra corridor,
gate saturation, counter-flow, cluster merge). Every run replayable from its seed
so a regression can be reproduced exactly.

---

## 16. LLM provider configuration (user-supplied)

No vendor is hardcoded. The provider layer is fully user-configured:

1. User enters **base URL** and **API key** (OpenAI-compatible endpoint shape).
2. On paste, the app **fetches and displays the available models** from that
   provider (`GET {baseURL}/models`), and the user picks one from the list.
3. Selection is persisted as the active provider config; the agent uses it for
   all inference.

Requirements:
- **Model discovery** with clear feedback: loading, success (populated list),
  auth failure, unreachable URL, or non-standard response (fall back to manual
  model entry so an unusual provider is never a dead end).
- **Validate before save** — a "test connection" round-trip so a broken config
  is caught at setup, not mid-incident.
- **Key handling**: stored server-side, never echoed back to the client in full,
  never logged. Treated as a secret at rest.
- **Two personas, one endpoint** (`POST /api/ai/assistant/ask`). The role on the
  session picks both the system prompt and the brief, because a citizen and an
  operator ask the same box entirely different questions:
  - *Citizen* → `CITIZEN_SYSTEM_PROMPT` + `services/citizenBrief.js`. A personal
    brief: where they are, what is around them, the safest way out computed from
    their own position, places they may ask for, what the crowd was already told.
    No other individual appears in it, and no operational lever.
  - *Authority* → `OPERATOR_SYSTEM_PROMPT` + `services/agentBrief.js`. Scoped to
    the seven decisions in the problem statement (abnormal density, bottlenecks,
    crush risk in the next few minutes, safest route, personnel redistribution,
    gates to open/close, what to announce) and pinned to the action vocabulary in
    `services/actionSchema.js` so it can only recommend what the platform can
    actually carry out.
  Both share one formatting contract, because the chat bubble renders Markdown
  (`components/assistant/Markdown.jsx`) — a hand-rolled renderer over the exact
  subset the prompt permits, returning React elements so no HTML from a model
  ever reaches the DOM.
- **Who may configure it, and from where**: a **verified authority only**, from a
  **single** entry point — the *AI Provider* button on the Authority Console
  (`/authority/events`) → `/settings/ai-provider`. Admins are excluded (their
  scope is authority verification, not operations). One door, not several: the
  same screen must not be reachable from a floating launcher, the Command Centre,
  the Admin Console, or the assistant chat.
- **Graceful degradation**: if the provider is unreachable at runtime, Tier 0/1
  keep working (they are pure math) and the UI reports "assistant offline."
  Safety-critical prediction never depends on the LLM.
- Works with any OpenAI-compatible gateway, including a local Ollama base URL.


---

## Addendum — Google Maps as an agent tool (spatial intelligence beyond the venue)

Added 2026-08-17. This refines the agent's spatial reasoning without violating
any design axiom above. Google Maps is a **tool the agent may call**, not a data
source the map talks to, and not a replacement for our engine.

### The authority boundary: Google owns *outside*, the venue graph owns *inside*

Google Maps has no paths inside a controlled venue — a temple compound, stadium
concourse, or festival field. Google walking directions stop at the perimeter.
So responsibilities split cleanly:

- **Google (outside the fence):** public roads, transit, parking, approach and
  egress routing, traffic, road-level diversions, response-vehicle routing.
- **CrowdShield venue graph (inside the AoR):** the only source of truth for
  in-venue movement, because it alone knows live density, flow, corridor state,
  gates, barricades, and event-specific zones.
- **The gate is the handoff.** Google routes a person *to a gate*; the E3 venue
  router handles *gate → destination* (risk-aware). The agent stitches the legs.

This keeps axiom 4 intact: the authority's marked area remains the hard
constraint; Google never overrides an in-venue closure.

### Tools, not grounding — and why direct API over Gemini grounding / MCP

"Grounding with Google Maps" is a **Gemini-model feature**; CrowdShield's LLM
provider is **user-configured and provider-agnostic** (any OpenAI-compatible
endpoint), so we expose Google as ordinary function-call tools our orchestrator
resolves. That also keeps the **fusion in our deterministic code, not inside the
model** — essential for crowd safety, where route selection must be auditable
and validated against the real graph. Google's *Maps Grounding Lite* (a
model-agnostic MCP server for places/weather/routing essentials) remains a good
later fast-path for **ambient chat context** ("what's near me, weather at
gate-time"), but safety-critical routing stays on the direct-API + fusion path.

### The fusion seam (the part that matters)

Google returns candidate routes; `services/routeFusion.js` (pure) samples each
route's polyline against the **live zone-risk grid + gate state** and re-ranks:

```
score = google_duration_sec + maxRiskAlongRoute * RISK_PENALTY
hard-reject if the route threads a zone at/above critical risk,
hard-reject if the route ends at a closed gate.
```

So Google's "fastest" route never wins if it runs people through a 5 p/m²
corridor or dumps them at a shut gate. Google supplies geometry; **we supply the
crowd truth that re-orders it.**

### Operating rules (cost, privacy, reliability)

- **Best-effort, never a hard dependency.** Maps is off by default and
  bring-your-own-key (encrypted at rest, `models/MapsConfig.js`). If disabled or
  unreachable, tools return a fallback signal and the agent uses the in-venue
  router (`find_safest_route`). Prediction (Tier 0/1) never depends on Maps.
- **Gate granularity, not per-user** (axiom 3). `get_safe_exit_route` evaluates
  the nearest ~3 *open gates*, not thousands of individuals — Google calls stay
  O(gates). Per-person guidance reuses the in-process venue router.
- **Wake-on-event.** Map tools live in the same alert-triggered agent loop; the
  LLM only reaches for Google when it actually needs geography.
- **Privacy + payload.** Prefer sending zone/gate coordinates (not raw citizen
  GPS) to Google; field masks request only the fields we use.

### Surface

```
models/MapsConfig.js          singleton BYO-key config (encrypted; mockable base URLs; enabled flag)
services/googleMaps.js        Routes + Places client (field masks, timeouts, typed errors)
services/routeFusion.js       PURE risk-overlay + re-ranking (decode polyline, sample, score)
services/agentMapTools.js     google_maps_route / _route_matrix / _places + get_safe_exit_route
controllers|routes|validators maps.*  ->  /api/ai/maps  (verified authority only)
frontend .../settings/GoogleMapsCard.jsx   BYO-key card on /settings/ai-provider
```

### Addendum update (2026-08-18) — the default engine is free and open

The routing addendum above described Google as the outside-the-venue engine. That
is now the *optional* path. **OpenStreetMap via OSRM is the default**, behind
`services/routing/index.js`:

```
agent tool / citizen endpoint
        │
   routing (interface)  ──►  osrm (default, free, self-hostable)
        │                └─►  google (only if an operator enables it)
        ▼
   routeFusion  ──►  live crowd risk re-ranks whatever geometry came back
```

Why this matters beyond cost: the platform depends on **no proprietary map
infrastructure**, which fits the affordability and scale constraints of the
problem it addresses. Google can be switched on without touching the agent, the
tools, or the fusion layer — the interface is the contract.

Two operational truths learned by measurement, both documented in
`PROGRESS.md` §6.15:

1. **Trust geometry, not someone else's clock.** The public OSRM demo serves the
   car profile regardless of the profile requested (387 m in 53 s). We keep its
   real geometry and distance, and derive pedestrian duration from our own
   walking-speed constant. A self-hosted foot profile can be trusted instead
   (`OSRM_TRUST_DURATION=true`).
2. **Zone granularity is a safety property, not a drawing preference.** A
   34,899 m² zone mathematically cannot reach crush density; a 1,956 m²
   chokepoint on the same corridor escalated to a real alert in the same run.
   Averaging density over a large polygon hides the pinch point. Until
   cell-level alerting lands, authored zones must match chokepoint scale — and
   `GET /api/ai/routing` exists so an unreachable router is never mistaken for a
   blocked crowd.

---

## 17. The no-fabrication contract (added 2026-08-18)

A crowd-safety system earns its authority from one property: **every number on
screen is either measured or openly unknown.** A dashboard that invents plausible
figures is worse than no dashboard, because an operator will act on it. This
section states the rule and the mechanisms that enforce it.

### 17.1 The rule

> No value may be presented as an observation unless it was observed.
> Absence of data is displayed as absence, never as a zero, a default, or a
> confident-looking average.

Three failure modes it forbids, all of which existed in this codebase and were
removed (`PROGRESS.md` §6.16):

1. **Invented sources** — a `Math.random()` engine feeding a dashboard.
2. **Coerced unknowns** — `speed ?? 0` rendering as "0.0 m/s · Live", or
   `heading ?? 0` rendering as "Flow Direction: N". A device that has reported
   one position has a real *location* and no *motion*; those are different facts.
3. **Stale-as-current** — serving a cached computation under a fresh timestamp,
   whether that is a risk score from a stopped loop or an alert nobody has
   re-confirmed.

### 17.2 Where `null` must survive

`null` is a first-class value through the whole read path, and every layer is
written to expect it:

```
liveStore     heading/speed null when neither reported nor derivable
   ▼
aggregator    devices without motion are counted in `sampleCount` but excluded
              from meanSpeed / speedVar / dirCoherence / flowBearing;
              cells and zones publish `speedSamples` / `dirSamples` so a
              consumer can see the basis of every average
   ▼
predictor     missing signal contributes ZERO to crush / pressure / turbulence
              (absence of evidence, never evidence of calm) and the cost is
              charged to `confidence` via `motionCoverage`
   ▼
controllers   avgSpeed is null, not a fabricated default; `hasLiveData` states
              whether anything is being measured at all
   ▼
UI            renders "—" with a "Not measured" / "No readings" badge
```

The asymmetry that makes this a safety matter, not a presentation one: a missing
**heading** zeroes the turbulence term and *understates* risk, while a missing
**speed** treated as 0 maxes the crush term and *overstates* it. Both errors are
invisible in the output. Only propagating the unknown keeps the score honest, and
only the confidence gate keeps a poorly-sampled zone from escalating on it.

### 17.3 Estimates must name themselves

`currentCrowd` is not a count. It is `sampledDevices ÷ participationRate`, and
with a 12% assumption that multiplies observed phones by more than eight. The
snapshot therefore returns **both inputs**, and the UI states them: *"Estimated
from 300 reporting phones · assumes 12% use the app."* An estimate presented
without its multiplier is the most misleading number a control room can hold.

### 17.4 Freshness is part of correctness

Two derived states are viewer-driven, and both had to be made self-healing
because the loop that maintains them is not guaranteed to be running:

| State | Failure if left alone | Mechanism |
|---|---|---|
| Zone risk | frozen at the last tick, served with `generatedAt: now` | a read reuses the cached pass only under 1.5 s; otherwise it **advances the predictor itself** against the readings just aggregated, with real elapsed time. Transitions found this way are persisted, so an alert can fire with no dashboard open. |
| Active alerts | stay `active` forever once ticks stop, because alerts resolve on *transitions* | per-tick heartbeat (`lastSeenAt`) for zones still elevated, resolve for zones that calmed, plus a **read-time sweep** of anything unrefreshed for 3 minutes (`resolvedReason: "no longer reported"`) |

When a cached risk pass *is* fresh enough to reuse, only the risk decoration is
taken from it — measurements always come from the current aggregation, so a
response can never pair a live headcount with a stale density.

### 17.5 Zone attribution is a measurement decision

Zones nest: a chokepoint sits inside an approach plaza. Assigning a device to the
*first* matching polygon credited the chokepoint's crowd to a parent 18× larger
and diluted its density to nothing — the exact bottleneck an operator drew was
the one thing that could not escalate. A device now counts toward the
**smallest** polygon containing it. Most specific wins, because that is the
measurement the operator intended when they drew it.

### 17.6 An unreadable model reply is a failure, not an all-clear

The agent's decisions arrive as a JSON envelope. When that envelope cannot be
parsed, the honest outcome is "we do not have a decision" — never a synthesised
`{severity: "low", actions: []}`, which renders as a confident "nothing to do".
The sequence is: retry once asking for a compact envelope; if it still fails,
persist `parseFailed: true`, extract **no** actions, and show the operator an
"Unreadable reply" state telling them to assess the alert themselves.

Truncated JSON is deliberately **not** repaired into actions. Closing
`"gateId": "G` yields the parseable-but-wrong gate `G`, and a `"count": 12` cut
from `1200` cannot be detected at all. Guessing an instruction that moves a crowd
is not a trade this system makes. Repair is used only to salvage the model's
wording for the audit trail.

### 17.7 What is legitimately synthetic

The contract bans *disguised* synthesis, not all generated numbers. These are
allowed because they are explicit, and none is ever presented as a live reading:

| Thing | Why it is fine |
|---|---|
| `services/simulator.js` | a load generator an operator starts deliberately, reporting through the same ingest path a phone uses. Its output *is* real from the pipeline's point of view — synthetic sensors, real measurement. |
| `scripts/seed*.js` | demo fixtures for a demo event |
| anti-herd jitter in `guidance.js` | a real algorithm: randomised path assignment is what stops 10,000 people being sent down one corridor |
| published constants (1.34 m/s free walk, Fruin bands, 1.3 p/m/s flow, H3 res) | cited physical parameters, not measurements of *this* crowd |
| decorative animation | now a deterministic golden-angle scatter; no `Math.random()` remains in frontend rendering |
| anonymous device-id generation | an identifier, not an observation |

The test for anything new: *if an operator read this number and acted on it,
would the action be justified by something the system actually observed?* If not,
it does not go on the screen.

---

## 18. Coverage, streets and crowds — giving the agent eyes (added 2026-08-18)

Up to §17 the agent reasoned about an abstraction. It knew `Z1` was at risk and
that `G2` was shut, and it could not see a road, name a street, or answer the only
question a crowd manager actually asks: **which way do I send them?** It was
reasoning about a map it had never been shown.

Three things were missing, and they turn out to be one thing: the agent had no
model of the ground.

```
        ┌─ the authority draws the boundary (freehand pen)
        │
   COVERAGE AREA ──► defines what is monitored, and what is somebody else's problem
        │
        ├─► filters SENSING      only phones inside are counted, aggregated, drawn
        │
        └─► scopes the IMPORT    real OSM streets inside it, with real names
                    │
                    ▼
            ROAD NETWORK  segments · junctions · widths · capacities
                    │
        live cells ─┴─► ROAD CONGESTION   "Grand Road is at 3.1 p/m² and slowing"
                              │
   live cells ──► CLUSTERS ───┤            tracked bodies of people (K1, K2 …)
                              ▼
                        THE AGENT'S BRIEF
                    COVERAGE · CROWDS · STREETS
                              │
                              ▼
                    direct_crowd  ZC1 → Grand Road
                              │
                 resolved server-side into real waypoints
                      and spoken directions
```

### 18.1 Coverage is operational, not decorative

The Area of Responsibility used to be a polygon on a map. It is now the seam the
whole system hangs off, and it is drawn the way a person actually draws — hold and
drag, freehand, like a pen (`CoverageDrawLayer.jsx`). A trace of ~300 points is
simplified with Ramer–Douglas–Peucker at a **4 m tolerance** — chosen at street
width rather than pixel width, because the boundary answers one question ("is this
person inside the area I monitor?") and 4 m is well inside the error of both a
hand-drawn line and a phone's GPS fix.

Once drawn it does three jobs:

| Job | Where | Why it matters |
|---|---|---|
| Filters sensing | `aggregator.filterToCoverage` | A phone on a highway 2 km away is not this event's crowd. Counting it inflates the head count with passers-by. |
| Filters the map | `broadcaster` builds dots from the same filtered list | The dots and the numbers beside them must describe the same people, or the operator is reading two different events. |
| Scopes the import | `osmNetwork.importRoadNetwork` | Bounds the Overpass query and, more importantly, bounds what the agent is asked to have an opinion about. |

Devices outside the line are **reported, not discarded** (`totals.outsideCoverage`,
`outsideEst`). An operator watching a surge build just beyond their boundary needs
to see it coming, and "we are ignoring 4,000 people" is a decision they should be
shown rather than have made for them.

### 18.2 The streets are real, and free

`services/osmNetwork.js` imports the actual road and footpath network inside the
coverage polygon from **Overpass** — free, no API key, no account, consistent with
OSRM being the default routing engine. The data is ODbL, so the attribution is
stored with every import and travels with the geometry.

The important step is not the download, it is the **splitting**. An OSM way is an
editing convenience that can run a kilometre through six crossings, so a bag of
ways is a set of overlapping polylines, not a graph. Every way is cut at each node
it shares with another way, which turns 95 ways into 331 segments joined at 267
junctions — and *that* is routable.

Honesty shows up in the details:

- **Names are `null` when OSM has none.** In the demo area only 19% of segments
  are named. Inventing "Unnamed Road 4" would put a name in an operator's mouth
  that no local would recognise; routes describe those stretches by direction
  instead ("continue north-east for 250 m").
- **Widths record their provenance** (`widthSource: tag | lanes | default`). No
  road here carries a `width` or `lanes` tag, so every capacity figure is a
  class-based estimate — and the field exists so that is auditable rather than
  implied. Capacity itself comes from the same `corridorCapacityPerMin` the venue
  graph uses: one formula for the whole system.
- **`trunk` is included, `motorway` is not.** A motorway is not somewhere you
  route people on foot. But in Indian urban tagging `trunk` is routinely a wide
  arterial with footpaths — Marine Drive Road beside this venue is tagged that way
  and is a road Puri crowds genuinely walk. Excluding it left the agent blind to a
  major egress corridor, which is the worse failure.
- **Overpass rate-limits hard**, and a stale import is worse than none, so the
  network is keyed by a **hash of the coverage polygon**: unchanged area, no
  re-fetch; redrawn area, the stored network is flagged `stale` rather than quietly
  served for the wrong place.

### 18.3 Crowds are objects, not points

`services/clusterTracker.js` finally builds the Cluster Tracker §8 has always
specified. Connected components over H3 adjacency become tracked bodies of people
with stable ids, and the tracking is the point — a cluster is only meaningful over
time.

Adjacency, not density, decides membership: "are these the same body of people" is
a question about touching, not about packing. Thresholding first would shatter one
real crowd into islands wherever it happened to thin out. Density then *describes*
what was found.

Two flags, because they answer different questions and conflating them hid the
case that matters:

- `isCrowd` — packed (≥ 1.5 p/m², Fruin's comfortable bound). Drives **how the map
  draws it**: individual dots below, one merged bubble above.
- `isSignificant` — ≥ 200 people. Drives **what gets reported**. Two loose bodies
  of several thousand converging is *how* a dense crowd forms; waiting for them to
  be dense before reporting the convergence means reporting it after the fact.

The events it emits are the crush precursors: `converging` (flagged **before** they
touch, because a merge alert arrives too late to prevent the thing it describes),
`merge`, `appeared`, `dispersed`. Merge detection uses the same radius-aware reach
as identity matching — a strict centre-to-centre test misses the very case it
exists for, since a survivor's centroid sits between the two crowds that fused,
far from either original centre.

Growth is measured over a **window, not between ticks**. At 1 Hz, consecutive head
counts differ mostly by sampling noise amplified by the participation multiplier;
each cluster keeps a baseline and only rolls it forward once it is ≥ 8 s old, so
"people per minute" means something.

### 18.4 Routing over real streets

`services/roadRouter.js` is Dijkstra over the junction graph, with the same cost
philosophy as the venue router: walking time inflated by crowding, and **infinite
at crush density**. A route 200 m shorter through a critical street is not shorter,
it is a decision to push people into a wall.

Two decisions worth stating:

- **`oneway` is not a walking restriction.** In OSM it is a vehicle rule;
  pedestrians may walk either way unless `oneway:foot=yes`, which is vanishingly
  rare. Treating it as a restriction would refuse perfectly good evacuation
  routes. The flag is still carried, because an authority contra-flowing traffic
  needs to see it.
- **Named roads get a 10% cost discount.** Not because they are safer, but because
  a route made of named streets can be *communicated*, and an instruction nobody
  can follow moves nobody. Kept small so it nudges between comparable options and
  never outweighs a congestion signal.

Steps are merged twice before they are shown: consecutive segments of the same
street become one instruction, and consecutive *unnamed* segments become one
direction-based instruction. The result is speakable:

> 1. Continue west for 757 m  2. Head north-west on Kutcheri Road for 731 m
> 3. Head north-east on Grand Road for 232 m

Every route reports `measuredFraction` — how much of itself we have live readings
for. An operator sending 5,000 people down a street is entitled to know whether we
are measuring it or inferring it.

### 18.5 `direct_crowd` — the verb that was missing

`draw_route` can only speak in venue node ids. That is fine for a corridor an
authority drew and useless for telling several thousand people where to walk. So
the action vocabulary gained one advisory verb:

```json
{ "type": "direct_crowd", "from": "Singhadwara Chokepoint", "to": "Grand Road" }
```

`from` and `to` take places by the names people use — a zone, a gate, or a real
street. Both ends are resolved through `resolvePlace`, which returns an **error for
an unknown name rather than a nearest guess**, so a hallucinated street is rejected
at validation instead of quietly becoming a route. At emit time the server resolves
the directive into real waypoints and spoken directions with the same risk-aware
router the citizens get — so the authority and the crowd can never be sent down
different roads.

It is advisory: it recommends a path, it moves no barrier and opens no gate.

### 18.6 One brief, one source of truth

The brief gained three sections — `COVERAGE`, `CROWDS`, `STREETS` — and one
pre-computed candidate. The candidate is what closes the loop: telling the model
"Grand Road has 1,092/min spare" is information, whereas handing it a *validated*
`direct_crowd ZC1 → Grand Road` with a real distance and real directions is a
decision it can simply take. Without it the model reached for the one lever it has
always had — open a gate — even when the useful move was to redirect the flow.

Both halves of the STREETS section matter. The busiest list says where the problem
is; the **streets with room** list says where to send people. A model given only
the first will propose relief onto a road it has no reason to believe exists.

### 18.7 Token cost, and why the toolset is now conditional

Tool schemas are re-sent on every round-trip. Measured at **1,761 tokens of pure
schema per call** once the spatial tools landed, and it showed up directly as
latency: a reasoning pass went from ~15 s to **50 s**.

So the toolset is chosen per pass (`toolsFor`). The venue tools are always
present. The spatial tools only exist once a street network is imported. And the
external map tools are the *fallback* for geography we do not hold ourselves — so
they drop out when we do hold it, because routing over our own imported graph is
both faster and risk-aware where a third-party router is neither. 17 tools → 13,
1,761 → **1,191 tokens**, and the pass came back to 31 s.

### 18.8 What this bought, measured

With the coverage drawn, 331 segments imported and a crowd ramped into the
chokepoint, the operator's own hosted model (`nemotron-3-ultra`) produced this
unprompted:

> "Singhadwara Chokepoint (ZC1) is 12 seconds from critical with risk 0.50
> ELEVATED. Crowd **K1** has 4,167 people at 0.44 p/m² **growing at 10,608
> people/minute — a crush precursor**. Immediate egress expansion and crowd
> diversion are essential."

with three coordinated actions: `open_gate G2` (consequential, held for approval),
`direct_crowd Singhadwara Chokepoint → Grand Road` (advisory), `highlight_zone
ZC1`. The directive resolved to 41 waypoints via Kutcheri Road and Grand Road with
spoken directions.

Every element of that sentence was unavailable to it a day earlier: the cluster id,
the head count, the growth rate, the inference that growth *is* a precursor, and a
real street to divert onto.

### 18.9 Honest limits

- **19% of segments are named** in this area. The agent will describe far more
  stretches by direction than by name. That is the data, not a defect, but it caps
  how natural an instruction can sound.
- **Coverage of readings is low.** With a crowd in one chokepoint, 8–9 of 331
  segments have live readings. The other 322 are reported `unmeasured`, never
  clear — but a route across them is a geometric answer, and `measuredFraction`
  says so.
- **Every width is a class-based default** here, so capacities are estimates with
  their provenance recorded.
- **Overpass is a shared free service**, and it does fall over: the primary
  instance returned 504 under load while a mirror answered the same query in 1.6 s.
  Hence an endpoint list, tried in order, with `OVERPASS_URL` overriding it
  entirely for a self-hosted instance (which is what production should do).
- **Only full-planet Overpass instances may be listed.** A regional one
  (`overpass.osm.ch`, Switzerland) returns **HTTP 200 with an empty result** for
  everywhere else — a confident "no roads here" that caches and leaves the agent
  blind believing it checked. So an empty answer is verified against the next
  endpoint before being accepted, and an empty stored network never satisfies the
  skip check.
- **Drawing the coverage triggers the import.** Requiring a separate action meant
  the agent silently stayed blind to every road inside an area that had just been
  drawn — which is exactly how it came to tell an authority it had no data about
  their own venue.
- **Clusters are per-event in-process state**, like the predictor. Multi-instance
  needs the same Redis treatment.
