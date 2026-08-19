# CrowdShield — Progress Log

> A plain-English record of what has been built and how to run it.
> Written so someone who has never seen this project can pick it up and understand
> where things stand. Read top-to-bottom.
>
> Last updated: 2026-08-18

---

## 1. What this project is (30-second version)

CrowdShield (folder name: `crowd_help`) is an AI-powered early-warning system
meant to predict and prevent crowd stampedes at large events. It is a MERN app:

- **backend/** — Node + Express API, MongoDB via Mongoose, cookie-based JWT auth.
- **frontend/** — React 19 + Vite, TailwindCSS v4, framer-motion, react-leaflet.
- **docs/** — planning + this progress log. `PLAN.md` is the full spec/roadmap.

There are three user roles: **citizen**, **authority**, and **admin**.
Authorities run the command dashboard; citizens are the "sensors" (the plan is
for the citizen phone app to report density, which later replaces the current
fake data).

---

## 2. Overall status at a glance

| Area | State |
|------|-------|
| Auth (login/signup, roles, JWT cookies) | Working |
| Backend API (auth + events + markers + command/analytics snapshots) | Working |
| Map editor (authority-only venue map) | Working — real map, see §5 |
| Crowd numbers / risk / heat map | **Real, measured** — the mock engine is deleted, see §6.16 |
| In-website AI assistant popup | Working against a real hosted model, see §6.13.3 |
| **Venue Graph backend (E0)** | **Working — see §6.5** |
| **Venue Graph authoring UI (draw AoR/zones/corridors)** | **Working — new this session, see §6.6** |
| **Real-time crowd pipeline (E1)** | **Working — new this session, see §6.7** |
| **Frontend live-map visualization (dots + heat)** | **Working — new this session, see §6.8** |
| **Tier 1 predictor / risk / alerts (E2)** | **Working (backend) — new this session, see §6.9** |
| Login/signup bounce | **Fixed this session, see §6.10** |
| **Frontend consuming risk/alerts (map coloring, alerts, toasts)** | **Working — new this session, see §6.11** |
| **Personal guidance / routing (E3 backend)** | **Working — new this session, see §6.12.1** |
| **Incidents / SOS reporting (E3 backend)** | **Working — new this session, see §6.12.2** |
| **Citizen PWA (consent, GPS, goal picker, SOS, i18n)** | **Working — new this session, see §6.12.3** |
| **User-configured LLM provider (base URL + key + model discovery)** | **Working — new this session, see §6.13.1** |
| **Tier 2 AI agent (autonomous proposals + approvals)** | **Working — new this session, see §6.13.2** |
| **AI assistant popup wired to a real LLM (streaming)** | **Working — new this session, see §6.13.3** |
| **Google Maps agent tools + crowd-risk route fusion** | **Working — new this session, see §6.14** |
| **Free real routing (OpenStreetMap/OSRM) as the default engine** | **Working — new this session, see §6.15.1** |
| **Authority: AI decisions drawn on the live map + real broadcasts** | **Working — new this session, see §6.15.2** |
| **Citizen: route map, "safest way out", multilingual broadcasts** | **Working — new this session, see §6.15.3** |
| **End-to-end verified with a gradual ramp (real alert fired)** | **Verified — see §6.15.4** |
| **Real hosted model driving the autonomous agent (alert → decision → gate flip)** | **Verified — new this session, see §6.16** |
| **No fabricated data anywhere on screen** | **Enforced + verified — new this session, see §6.16** |
| **Freehand pen coverage area, filtering what is monitored and drawn** | **Working — new this session, see §6.17.1** |
| **Real OSM street network imported inside the coverage area (free, no key)** | **Working — new this session, see §6.17.2** |
| **Crowd clusters — dots merge into one bubble; merges/convergences detected** | **Working — new this session, see §6.17.3** |
| **The agent sees streets + crowds and routes people BY STREET NAME** | **Verified with the real model — see §6.17.6** |
| Digital Twin · voice command centre · incident summaries · pitch assets | Not started |

Short version: the crowd intelligence is now **real end to end** — measured
readings, a deterministic predictor, and an autonomous agent running on a model
the operator supplies. The mock crowd engine has been deleted, every fabricated
number has been removed or replaced with an honest "—", and the whole chain
(ramp → alert → real inference → approval → gate flip → citizen broadcast) has
been observed running. §6.16 is the record of that pass.

---

## 3. How to run it locally

You need **Node.js** and a running **MongoDB** (default `mongodb://127.0.0.1:27017`).

**1) MongoDB** — make sure it is running (on this machine it runs as a service):
```
systemctl status mongod        # or: mongod --config /etc/mongod.conf
```

**2) Seed demo data** (creates a pre-verified authority + one demo event):
```
cd backend
npm install
npm run seed:admin   # creates the platform admin (reads creds from backend/.env)
npm run seed:demo    # creates the demo authority + "Demo Rath Yatra" event
```

**3) Backend** (port 5000):
```
cd backend
npm run dev          # nodemon server.js  -> http://localhost:5000
```

**4) Frontend** (default port 5173):
```
cd frontend
npm install
npm run dev          # vite -> http://localhost:5173
```

Then open the frontend URL and log in (see §4).

> **Port note for this machine:** port **5173** is already taken by another app
> here, so during this session the frontend was started on **5199** instead:
> ```
> # frontend
> npm run dev -- --port 5199 --strictPort
> # backend (so CORS + auth cookies match the new origin)
> CLIENT_URL=http://localhost:5199 npm run dev
> ```
> The backend's CORS origin is pinned to `CLIENT_URL` (see `backend/app.js`),
> so if you change the frontend port you **must** pass the matching `CLIENT_URL`
> to the backend or logins will silently fail (cookies get rejected).

---

## 4. Login credentials (demo / seeded accounts)

These come from the seed scripts in `backend/scripts/` and are **test accounts
only**:

- **Authority** (use this to see the command dashboard + map editor):
  - email: `demo.authority@crowdhelp.local`
  - password: `Demo@1234`
  - This account is pre-verified (`isVerifiedAuthority: true`), so it skips the
    admin approval step.
- **Admin**: created by `npm run seed:admin`; its credentials live in
  `backend/.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`). Not needed for normal demos.

> Heads-up: the frontend login **does not auto-redirect** after a successful
> login right now — the API call succeeds and sets the auth cookies, but you may
> need to navigate to `/dashboard` manually. This is a known small gap.

Key routes:
- `/` landing · `/login` · `/signup`
- `/dashboard` — command center (any signed-in role)
- `/events` — event picker
- `/authority/events/:id/map` — **map editor (authority only)**
- `/admin/verify-authorities` — admin only

The seeded demo event id is stable; find it with the demo authority under
`/events`, or query MongoDB (`db.events.findOne({name:"Demo Rath Yatra"})`).

---

## 5. The map (what powers it) — IMPORTANT

The map is **not Google Maps** and uses **no Google Maps API / API key**.

- Rendering library: **Leaflet** via **react-leaflet**.
- Base map tiles: **CARTO** "dark_all" (`basemaps.cartocdn.com/dark_all/...`) —
  free, no API key.
- Underlying map data: **OpenStreetMap**.
- Heat map layer: **leaflet.heat**.

Because it uses real CARTO/OpenStreetMap tiles, the base map is **real and
production-ready** — point it at any real coordinates and it renders that real
place. The demo event centers on **Grand Road, Puri**.

Everything drawn *on top* of the map (venue pin, barricades, safe zones, gates,
risk zones, heat) is rendered by the app as Leaflet layers, driven by app data.

Map editor code lives in:
- `frontend/src/pages/authority/MapEditor.jsx` (the page)
- `frontend/src/components/VenueMap.jsx` (the Leaflet map + tile layer)
- `frontend/src/components/map/mapLayers.jsx`, `mapIcons.js`

Markers are saved via the backend: `GET/POST/DELETE /api/events/:id/markers`
(read is open to any signed-in user; **write requires a verified authority**).
The demo DB currently has **0 custom markers**.

---

## 6. NEW this session — the in-website AI assistant popup

> **UPDATE (E4, see §6.13):** the "streaming seam" and "provider layer NOT
> wired yet" notes below are now **superseded** — the popup streams from a real,
> user-configured LLM and the autonomous agent is built. This section is kept as
> the record of the original UI scaffold; §6.13 documents the live wiring.

A fully-scaffolded **agentic AI chat assistant** was added as a **floating popup
that appears on every page** (for signed-in users). It is **not** a separate
page/route — it is a global widget mounted once.

### What it does
- A **floating launcher** (cyan robot button, bottom-right) on every page.
- Click it → expands into a full chat panel (spring animation).
- **Minimize (—)** → collapses back to the launcher **and keeps the
  conversation** (state survives).
- **Close (×)** → collapses and resets the thread (fresh session next open).
- Full chat UI: scrollable transcript, user/assistant bubbles, a "thinking"
  three-dot indicator, a streaming caret, quick-prompt suggestion pills, an
  auto-growing composer (Enter to send, Shift+Enter for newline, Esc to
  minimize), and a Stop button while streaming.
- Matches the app's design language exactly: dark slate glass panels
  (`backdrop-blur`), cyan-400→blue-500 gradients, framer-motion transitions,
  lucide-react icons.

### Files
```
frontend/src/components/assistant/
├── AssistantChat.jsx      # the whole widget: launcher + panel + state + mock stream
├── ChatMessage.jsx        # one chat row (user gradient bubble / assistant glass bubble)
└── ThinkingIndicator.jsx  # the animated three-dot "thinking" dots
```
Mounted globally in `frontend/src/App.jsx` — `<AssistantChat />` sits inside
`<AuthProvider>` right after `<AppRoutes />`, so it renders on top of every
route. It hides itself for logged-out users (`if (!user) return null`).

### Architecture & the "seams" left for later
This step was intentionally **UI + architecture only**. The real AI is stubbed
so the interface is fully demoable now, with clean seams to plug in later:

- **Provider layer (the actual AI model): NOT wired yet — stubbed.**
  In `AssistantChat.jsx`, `streamReply()` + `generateReply()` are a self-
  contained **mock** that fakes token-by-token streaming with canned answers
  (bottlenecks, gates, exits, announcements). There is an explicit comment
  marking the **STREAMING SEAM**: replace `streamReply` with a real call to a
  streaming endpoint (e.g. `POST /events/:id/assistant` returning SSE / a
  `ReadableStream`) and feed decoded chunks into `onChunk` — **nothing else in
  the UI needs to change.**
- **Custom providers (decision):** the provider layer will use **custom
  providers** (not a single fixed vendor). Wiring this is a **later phase**, to
  be done **after** the current UI/architecture work is accepted.
- **Tools system:** not built yet — to be added behind a clean interface later.
- **Memory:** conversation state is currently in-component React state; a
  durable memory layer is a later addition.
- **Page access / autonomy:** the long-term vision is an autonomous agent that
  can read/modify content across every page. That wiring is **deliberately not
  built** — only the popup UI is globally mounted now. ("Show on every page NOW"
  = the popup is visible everywhere; "page connection LATER" = the agent's
  ability to act on page content comes in a later phase.)

### Verified working
Logged in as the demo authority, opened `/dashboard`, launched the popup, tapped
a suggested prompt ("Where is the bottleneck forming?") and confirmed the mock
assistant streamed a full on-brand reply with recommended actions. Launcher →
expand → send → streamed reply → collapse all work.

---

## 6.5 NEW — Venue Graph backend (Phase E0)

The authority's map pins are now backed by a real **Venue Graph**: the machine-usable
ground truth that everything else (routing, prediction, the AI agent) depends on.
Full design rationale is in `docs/ARCHITECTURE.md`.

### Why it exists
Previously `MapMarker` held decorative points. The graph adds structure so the
system can *reason* and *route*:

- **AoR** — Area of Responsibility polygon (the guarded area) + a buffer ring
  (default 1500 m) for approach guidance.
- **Zones** — named polygons with server-derived `areaM2` and safe `capacity`.
- **Nodes** — gates / junctions / POIs / medical / exits, each with `state`
  (`open` · `closed` · `exit_only` · `entry_only`), width, throughput, and an
  `isDestination` flag (what a citizen can pick as a goal).
- **Edges** — walkable corridors with width, length, direction
  (`bi` · `oneway_forward` · `oneway_reverse`), state, and capacity per minute.

Key property: **the router may only use these edges and open gates**, so the AI
physically cannot route someone through a barricade or a closed gate.

### Physics (why the numbers are defensible)
`backend/utils/geo.js` holds the shared spatial + pedestrian model, so
"critical" means the same thing everywhere:

- Pedestrian flow **1.3 persons/metre/second** of usable width →
  `capacityPerMin = widthM × 1.3 × 60`.
- Fruin level-of-service density bands (persons/m²): comfortable 1.5,
  constrained 2.0, dense 3.0, critical 4.0, dangerous 5.0.
- Zone capacity = `areaM2 × 2.0` (planning density).
- Spherical-excess polygon area, haversine distances, point-in-polygon,
  distance-to-polyline.

**All measurements are derived server-side** from geometry — the client never
supplies areas, lengths or capacities.

### Files
```
backend/utils/geo.js                  # geometry + pedestrian physics (shared with Tier 1 later)
backend/models/Venue.js               # the graph: aor, zones, nodes, edges, h3 res, calibration
backend/controllers/venue.controller.js
backend/validators/venue.validator.js
backend/routes/event.routes.js        # venue routes wired in
```

### API
| Method | Route | Access |
|---|---|---|
| GET | `/api/events/:id/venue` | any signed-in user |
| GET | `/api/events/:id/venue/destinations` | any signed-in user (citizen goal picker) |
| PUT | `/api/events/:id/venue` | verified authority (replaces whole graph) |
| PATCH | `/api/events/:id/venue/nodes/:nodeId` | verified authority (open/close a gate) |
| PATCH | `/api/events/:id/venue/edges/:edgeId` | verified authority (block / one-way a corridor) |

Reads are open to citizens because personal routing needs the destination list
and corridor network. The narrow PATCH endpoints exist because "open Gate 3" is
a high-frequency action during an event and must not require re-submitting the
whole graph.

Short ids are auto-assigned by type (`Z1`, `G1`, `J1`, `P1`, `M1`, `X1`, `E1`…)
and client-supplied ids are preserved, so the editor can round-trip them.

### Verified working
Tested against the seeded "Demo Rath Yatra" event with a realistic Grand Road,
Puri layout (3 zones, 7 nodes, 5 corridors):

- `PUT` returned 200 with correct derived values — AoR 837,587 m²; zone Z1
  34,899 m² / capacity 69,799; Gate 1 (8 m) → 624 p/min; edge E3 311 m /
  936 p/min. Cross-checked independently in Python (matches within 0.14%,
  the expected planar-vs-spherical difference).
- `GET /venue/destinations` returned the 4 destination nodes.
- `PATCH` opened gate `G3` and set edge `E3` to `oneway_forward`.
- Validation rejected an edge pointing at a nonexistent node (422) and a
  2-point zone polygon (422).

---

## 6.6 NEW — Venue Graph authoring UI (E0 frontend)

The authority can now *draw* the ground truth the backend (§6.5) stores. The old
marker-only `MapEditor` is now a full graph editor, built to match the existing
design language.

### Files
```
frontend/src/components/map/venueNodes.js   # node/zone metadata, cached state-aware
                                            # node divIcons, path styles, client id gen
frontend/src/components/map/VenueEditor.jsx # mode-aware editor map (draw + render)
frontend/src/pages/authority/MapEditor.jsx  # rewritten page: toolbar + panels + save
frontend/src/venueMap.css                   # + .cs-node styles
```

### Modes (toolbar)
- **Select** — click a node / corridor / zone to edit its properties or delete it.
- **Area** — trace the AoR polygon; Finish closes it. (Clear to redo.)
- **Zones** — trace a polygon → name + type modal → adds a zone.
- **Points** — pick a type (gate / junction / POI / medical / exit / parking /
  holding) and click to drop nodes.
- **Corridors** — click a start node, drop bend points on the map, click an end
  node → creates an edge with width + direction. Nodes snap as endpoints.
- **Markers** — the legacy free-form annotation pins (unchanged, immediate save).

### Design notes
- Interactivity is **mode-aware**: while drawing, existing shapes go
  non-interactive so clicks fall through as new vertices; in Corridor mode nodes
  stay clickable as endpoints; in Select mode everything is clickable.
- Client-generated ids use the **same prefix scheme as the backend**
  (`G/J/P/M/X/K/H`, `Z`, `E`) so edges can reference nodes before the first save
  and ids survive the round-trip unchanged.
- The whole graph is edited client-side and saved with one `PUT /venue`; the
  server re-derives every area / length / capacity and the UI re-hydrates from
  the response (so the property panel shows real m² and persons/min).
- Node/corridor property panels expose `state` (open/closed/exit_only/…),
  width, direction, and the `isDestination` flag — the levers the command centre
  and the AI agent will later toggle.

### Verified
- Transforms 200, ESLint clean.
- Editor-shaped `PUT` (client ids `G1/P1/E1`, `aor:{polygon}`) → 200; ids
  preserved; server-derived edge 490 m / 936 p/min, zone 34,899 m² / cap 69,799;
  `GET` returns the hydrate shape with correct stats.
- Runtime click interactions not verifiable headlessly (no browser) — logic and
  contract are proven; recommend a quick visual pass in the browser.

---

## 6.7 NEW — Real-time crowd pipeline (E1)

The phase that replaces `Math.random()` with a real, derived data pipeline. Full
rationale in `docs/ARCHITECTURE.md` §4–5.

### Flow
```
GPS heartbeats ─► liveStore (hot, TTL) ─► aggregator (H3 + zones) ─► snapshot
                                                     │
                            simulator ──feeds──┘     └─► broadcaster ─► Socket.IO ─► clients
```

### Files
```
backend/utils/h3.js                  # h3-js v4 wrapper (res 11 ≈ 2,368 m² cells)
backend/services/liveStore.js        # in-process hot device store, TTL prune, Redis-swappable
backend/services/aggregator.js       # H3 cells + authority-zone rollup
backend/services/snapshot.js         # the Situation Snapshot read model
backend/realtime/socket.js           # Socket.IO server, per-event rooms
backend/realtime/broadcaster.js      # 1 Hz aggregate + emit crowd:tick (viewer-driven)
backend/services/simulator.js        # synthetic crowd (routes + gradual ramp)
backend/controllers/ingest.controller.js
backend/server.js                    # now http.Server + initSocket
```

### What it computes (no fabrication)
- **Participation scaling**: `personsEst = sampledDevices / participationRate`
  (0.12 in the demo). Honest about only a fraction of the crowd running the app.
- **Density** per H3 cell and per zone in persons/m² → Fruin level → Safe/Moderate/Critical.
- **Flow bearing**: circular mean of device headings (real direction, not random).
- **Hotspots**: cells sorted by density.

### API
| Method | Route | Access |
|---|---|---|
| POST | `/api/events/:id/ingest` | any signed-in (citizen sensor) |
| GET | `/api/events/:id/snapshot` | any signed-in (map + AI) |
| POST | `/api/events/:id/sim/start` `{count,rampSeconds,speed}` | verified authority |
| POST | `/api/events/:id/sim/stop` | verified authority |
| GET | `/api/events/:id/sim/status` | verified authority |
| WS | `subscribe {eventId}` → `crowd:tick` frames | Socket.IO |

### Verified end-to-end (Demo Rath Yatra venue)
- Ramp correct: 8 s into a 15 s ramp → 320/600 agents.
- Scaling correct: 600 sampled / 0.12 → 5,000 personsEst.
- Flow coherent: ~170–182° (south, down the G1→P1 corridor), not random.
- Density concentrates in corridor cells (0.69 p/m²) vs the large zone (0.08).
- Socket.IO delivered live `crowd:tick` frames; `sim-1` moved coherently across
  ticks (lat 19.802406 → 19.802381, heading ~170°, 1.4 m/s).

### Notes
- **Redis deferred**: `liveStore` is in-process (fine for single-instance dev),
  behind a narrow interface so the Redis swap touches only that one file.
- Legacy `mockCrowdEngine.js` / `/crowd` still exist but are superseded by
  `/snapshot`; they'll be removed once the frontend moves over.
- Simulator doubles as the future **gradual-ramp test harness** (ARCHITECTURE §15).

---

## 6.8 NEW — Live-map visualization (E1 frontend)

Turns the E1 pipeline into the visible "watch the crowd move" view.

### Files
```
frontend/src/utils/socket.js               # shared Socket.IO client (one connection)
frontend/src/hooks/useCrowdFeed.js         # subscribe to an event -> latest crowd:tick + status
frontend/src/components/map/DotsLayer.jsx  # canvas people-dots, rAF interpolation, speed colouring
frontend/src/components/map/LiveCrowdMap.jsx # read-only command view (graph + heat + zones + dots)
frontend/src/pages/LiveMap.jsx             # rewired: live feed, real metrics, sim controls
```

### What it shows
- **Live dots** on a single `<canvas>` (not thousands of DOM markers), smoothed
  by requestAnimationFrame interpolation between 1 Hz ticks so motion is 60 fps.
  Dots are **coloured by speed** (cyan moving / amber slowing / red stalled) —
  the visual tell of a dangerous, stalling crowd.
- **Heatmap** from H3 cell density (leaflet.heat).
- **Zones tinted live** by status (Safe/Moderate/Critical) with density in the
  tooltip; AoR outline, corridors and gate/POI nodes from the venue graph.
- **Real HUD metrics** (estimated crowd, sampled app users, busiest zone) and a
  connection badge (live / connecting / disconnected) — no more fake numbers.

### Authority simulation controls
On `LiveMap`, a verified authority can Start/Stop the crowd simulation (agents +
ramp seconds) and watch the ramp reflected live — the demo driver until real
phones exist. Hidden for citizens.

### Demo flow
Open an event's Live map → (authority) set ~3,000 agents, 30 s ramp → Start →
watch dots stream along the corridors from gates toward the temple, the heatmap
bloom at the chokepoint, and zones shift colour as density rises.

### Verified
- ESLint clean; all five modules transform (HTTP 200) on the dev server; Vite
  resolves `socket.io-client`.
- Not verifiable headlessly: actual in-browser rendering/animation — needs a
  visual pass. The data contract is proven by the E1 socket smoke test (§6.7).

---

## 6.9 NEW — Tier 1 predictor + alerts (E2, backend)

The "radar": always-on, deterministic, explainable prediction. No LLM.

### Files
```
backend/services/forecaster.js   # Holt double-exponential smoothing + secondsToThreshold
backend/services/predictor.js    # risk model + zone state machine (per-event, per-zone)
backend/services/aggregator.js   # + speedVar & dirCoherence (pressure/turbulence inputs)
backend/services/alerts.js       # transitions -> durable Alert docs + alertBus
backend/models/Alert.js
backend/realtime/alertBus.js     # EventEmitter (E4 LLM trigger will subscribe)
backend/controllers/alert.controller.js
```

### Risk model (explainable, weighted)
`risk = 0.35·density + 0.25·crush + 0.15·pressure + 0.10·turbulence + 0.15·forecast`, each 0..1:
- **density** — persons/m² vs Fruin dangerous (5).
- **crush** — dense AND slow (the crush signature): `density × (1 − speed/1.3)`.
- **pressure** — `density × speedVariance` (stop-and-go turbulence).
- **turbulence** — `1 − directionCoherence` (conflicting headings / counter-flow).
- **forecast** — proximity of the projected time-to-critical.
Each zone also reports `forecast.etaCriticalSec` (the "~9 min before" number) and
`riskFactors` so the UI/LLM can explain *why*.

### State machine (false-alarm control)
`NORMAL → WATCH → ELEVATED → HIGH → CRITICAL`, with:
- **sustained-breach**: promotion needs 3 consecutive ticks above the band.
- **hysteresis**: demotes only after risk falls 0.08 below the band (no flapping).
- **confidence gate**: a zone with < ~8 sampled devices can't exceed WATCH.
- **multi-signal CRITICAL**: needs high density AND (crush or pressure), not one inflated signal.

### Alerts
Upward transitions into the elevated band create an `Alert` (superseding the prior
active one for that zone); dropping to NORMAL/WATCH resolves it. Each fires on the
`alertBus` (for E4) and as a socket `alert:new`. `GET /:id/alerts`, `PATCH
/:id/alerts/:alertId/ack` (authority). The Situation Snapshot now carries
`activeAlerts` and per-zone risk/forecast.

### Verified
- forecaster: rising series → trend +0.28, eta-to-critical 15s; flat/falling → Infinity; over → 0.
- predictor: synthetic ramp escalated NORMAL→WATCH(eta 25s)→ELEVATED(13s)→HIGH(5s)→CRITICAL(0s),
  each transition firing **once**; a 3-sample zone stayed capped at WATCH.
- alerts service: HIGH→CRITICAL supersede (1 active, 2 docs), ack, resolve-on-calm — all pass.
- live tick: zones now carry `riskLevel/risk/forecast/riskFactors`; `GET /alerts` 200;
  snapshot includes `activeAlerts`.
- Honest note: the seeded demo zone is ~35,000 m², so even 16,667 people = 0.47 p/m²
  (NORMAL). A live *escalation* demo needs a denser scenario / smaller zone; the
  escalation logic itself is unit-proven.

## 6.10 Login/signup bounce — FIXED

Root cause: `Login`/`Signup` authenticated (cookie set) but never updated
`AuthContext`, so `ProtectedRoute` saw `user=null` and redirected straight back.
Fix: both now `setUser(res.data.user)` on success before navigating; `axios.js`
gained a 401→refresh→retry interceptor so sessions survive the 15-min access-token
expiry. Verified login/me/refresh all 200.

---

## 6.11 NEW — E2 made visible (frontend)

The Tier 1 risk + alerts now surface in the UI.

### Files
```
frontend/src/utils/riskUi.js         # shared risk-level colours/labels, severity, formatEta, timeAgo
frontend/src/hooks/useCrowdFeed.js   # now also returns alerts[] (socket alert:new), resets per event
frontend/src/components/AlertsFeed.jsx  # reusable live alert list
frontend/src/components/map/LiveCrowdMap.jsx  # zones tinted by riskLevel + ETA tooltip
frontend/src/pages/LiveMap.jsx       # risk HUD, alerts overlay, toasts, risk legend
frontend/src/pages/authority/CommandCenter.jsx  # live Early-Warning Alerts panel + toasts
```

### What changed
- **Zones colour by risk** (NORMAL→CRITICAL from `riskUi`) instead of raw density
  status, with HIGH/CRITICAL drawn heavier and the tooltip showing
  "critical in ~Xm" (the forecast ETA).
- **LiveMap HUD** now reads "Highest risk" (coloured) and "Time to critical",
  plus a floating Early-Warning Alerts overlay and a risk legend.
- **alert:new toasts** on both LiveMap and CommandCenter, deduped via a seen-set.
- **CommandCenter** gained a live Early-Warning Alerts panel (and subscribing
  there keeps the broadcaster/predictor running).

### Verified
- ESLint clean (incl. fixing a set-state-in-effect by using the
  adjust-state-during-render reset pattern in useCrowdFeed).
- All six modules transform HTTP 200 on the dev server.
- Not verifiable headlessly: live in-browser colour/toast behaviour — needs a
  visual pass.

### Demo caveat (important)
Zone-level alerts key off **zone density**, and the seeded demo zones are huge
(~35,000 m²), so even tens of thousands of simulated agents stay NORMAL. To see
a live escalation (amber→red zone + toast), draw a **small zone (~500–1,000 m²)
at a chokepoint** in the Map Editor, then run the simulation. A future
enhancement is cell/chokepoint-level alerts (crush happens at ~cell scale, not
whole-zone scale) so escalations fire without hand-drawn small zones.

---

## 6.12 NEW — E3: personal guidance, incidents/SOS, and the citizen PWA

Phase E3 adds the citizen-facing half of the system: personal risk-aware routing,
incident/SOS reporting, and the installable phone app that turns a citizen into
both a sensor and a guided user. Built as three parallel workstreams (guidance,
incidents, PWA), then wired into the event router as one integration step.

### 6.12.1 Guidance & routing (backend)

Risk-aware, goal-aware personal routing over the Venue Graph — the deterministic
"what should *I* do right now" layer that serves individuals **without ever
calling the LLM** (ARCHITECTURE §7).

```
backend/services/router.js               # graph build, nearestNode, k-safest-paths (risk-weighted)
backend/services/guidance.js             # classifyUser + guideUser (pure; anti-herding)
backend/controllers/guidance.controller.js
```

- **User classification** from geometry + heading: INSIDE / APPROACHING /
  TRANSIT / OUTSIDE.
- **k-safest routes** on the risk-weighted graph (only open gates + walkable
  edges — a barricade or closed gate is uncrossable), then an **anti-herding**
  probabilistic pick weighted toward safer paths, so the crowd fans out instead
  of everyone being sent down the single "best" corridor.
- **APPROACHING** users get a gate assignment ranked by plaza-zone risk then
  walking distance, with a **soft hold** ("wait — area near capacity") when the
  AoR runs hot.
- Coordinates are `[lat, lng]` (Leaflet order) throughout; ETAs use the shared
  pedestrian walk-speed constant from `utils/geo.js`.

Route: `POST /api/events/:id/guidance` (any signed-in user), body
`{ lat, lng, heading?, destinationId? }` → `{ guidance: { classification,
instruction, route?, alternatives?, assignedGateId?, hold? } }`. A missing venue
returns a graceful message, not a 404.

### 6.12.2 Incidents / SOS (backend)

Citizens (and field marshals) report incidents; authorities triage them from the
command dashboard; new reports push live over Socket.IO.

```
backend/models/Incident.js               # event, reporterType, category, note, geo, status, audit
backend/controllers/incident.controller.js
backend/validators/incident.validator.js
```

- Categories: `sos` (highest-urgency panic) · `medical` · `hazard` · `blocked` ·
  `lost` · `other`. Reporter type is derived from the account role
  (authority → marshal, admin → system, otherwise citizen).
- Lifecycle `open → acknowledged → resolved`. Geo is optional and only stored
  when both lat/lng are finite (a partial pair = "no location shared").
- New incidents emit `incident:new` to the event room (best-effort — a socket
  hiccup never fails the report itself).

Routes: `POST /:id/incidents` (any signed-in), `GET /:id/incidents` (authority,
verified — defaults to the actionable open+acknowledged set),
`PATCH /:id/incidents/:incidentId/ack` and `/resolve` (authority, verified).

### 6.12.3 Citizen PWA (frontend)

The installable phone app: consent-first, GPS-heartbeat sensor, goal picker, live
alerts, SOS/report, tri-lingual.

```
frontend/public/manifest.webmanifest     # installable app metadata (standalone, start /citizen)
frontend/public/sw.js                     # service worker (offline shell)
frontend/index.html                       # + manifest link + theme-color
frontend/src/main.jsx                     # service-worker registration
frontend/src/pages/CitizenApp.jsx         # rewritten: the whole citizen experience
```

- **Consent-first**: plain-language opt-in before any location is read; only an
  anonymized salted **device hash** (persisted in localStorage) is sent — never
  tied to the account (ARCHITECTURE §11).
- **GPS heartbeat sensor** posts to `/ingest` on an adaptive cadence, so the
  phone becomes one of the anonymous points the pipeline aggregates.
- **Goal picker** from the venue destination list → calls `/guidance` and renders
  the instruction + route + ETA, coloured by risk.
- **Live alerts** via the shared crowd feed (`alert:new`), one-tap **SOS** +
  incident report (calls `/incidents`), and **i18n** in English / Hindi / Odia.

### Integration + verified (end-to-end)

Routes wired into `backend/routes/event.routes.js` (guidance + the four incident
routes). Backend restarted clean (nodemon; `MongoDB connected`; no import errors),
then — logged in as the demo authority over cookie auth — exercised against the
seeded full-graph event (AoR box, Gate 1 `G1`, Gundicha Temple `P1`, corridor
`E1`):

| Call | Result |
|---|---|
| `POST /guidance` INSIDE (dest P1) | 200 · INSIDE · routes G1→P1, 490 m, ETA 366 s (≈ 490 / 1.34 m/s), riskLevel NORMAL |
| `POST /guidance` APPROACHING | 200 · "Enter via Gate 1", `assignedGateId G1`, routed |
| `POST /guidance` OUTSIDE | 200 · graceful "you're outside the monitored area" |
| `POST /guidance` (missing lng) | 422 · validation |
| `POST /incidents` SOS | 201 · created (reporterType `marshal`, geo attached, status `open`) |
| `POST /incidents` bad category | 422 · validation |
| `GET /incidents` | 200 · returns the open incident |

Frontend: ESLint clean; `CitizenApp.jsx`, `main.jsx`, `manifest.webmanifest`,
`sw.js` all serve/transform 200 on the dev server. In-browser GPS + PWA-install
behaviour needs a device pass (not verifiable headlessly).

---

## 6.13 NEW — E4: the agentic LLM layer

The reasoning tier. A **user-configured** LLM now powers both a conversational
assistant (the global popup) and an **autonomous agent** that wakes on Tier 1
escalations, proposes interventions grounded in the venue graph, and routes them
through human approval. Built in two sub-phases; full design in ARCHITECTURE §9,
§10, §16.

### 6.13.1 User-configured LLM provider

No vendor is hardcoded. An authority/admin points CrowdShield at any
OpenAI-compatible endpoint, we discover its models, they pick one, and it's
stored encrypted server-side.

```
backend/utils/cryptoBox.js            # AES-256-GCM encrypt/decrypt for the key at rest
backend/models/ProviderConfig.js      # singleton config (baseUrl, apiKeyEnc select:false, model, status)
backend/services/llmProvider.js       # OpenAI-compatible client: listModels + chat + chatStream
backend/controllers/provider.controller.js
backend/validators/provider.validator.js
backend/routes/provider.routes.js     # mounted at /api/ai
frontend/src/pages/settings/AiProvider.jsx   # the config UI (route /settings/ai-provider)
```

- Key handling: **encrypted at rest** (AES-256-GCM, key derived from
  `PROVIDER_ENC_SECRET` ‖ `JWT_ACCESS_SECRET` ‖ dev fallback), stored
  `select:false`, and **never returned to the client** — responses expose only
  `hasKey`.
- Model discovery on paste (`GET {baseUrl}/models`) with clear states: loading,
  success, auth failure, unreachable, and a **manual model fallback** for
  non-standard providers.
- Graceful degradation: if the provider is unset/unreachable, Tier 0/1 keep
  working (pure math) and the UI reports the assistant is unavailable.

| Method | Route | Access |
|---|---|---|
| GET | `/api/ai/provider` | verified authority |
| POST | `/api/ai/provider/discover` | verified authority |
| POST | `/api/ai/provider` | verified authority |
| POST | `/api/ai/provider/test` | verified authority |

**Single entry point (2026-08-18).** Provider setup is reachable from exactly one
place in the UI: the **AI Provider** button on the Authority Console
(`/authority/events`), which opens `/settings/ai-provider`. The earlier duplicate
doors — a global floating launcher, a button on the Command Centre, a link on the
Admin Console, and a gear + empty-state link in the assistant chat — were removed
because they were four extra routes to the same screen. **Admin no longer has
access** to provider or Maps config (`/settings*` is `roles={["authority"]}`, and
both route guards are `authorize("authority")`): an admin's scope is authority
verification, not running the control room.

### 6.13.2 Tier 2 agent — autonomous proposals + human approval

The agent never acts on individuals and never executes consequential actions on
its own (ARCHITECTURE §0, §7, §9).

```
backend/services/agentTools.js   # read-only spatial tools (top risks, gates, routes, what-if) + TOOL_SPECS + runTool
backend/services/agentBrief.js   # compact, decision-ready brief + pre-computed feasible candidates
backend/services/actionSchema.js # the action vocabulary + validation vs the venue graph + advisory/consequential split
backend/services/agent.js        # orchestrator: alertBus wake, tool-calling loop, persist proposal, socket push
backend/models/AgentProposal.js  # audit-trail record (trigger, severity, reasoning, actions[], status)
backend/controllers/agent.controller.js  # ask-stream (SSE) + list/run/approve/reject
backend/validators/agent.validator.js
frontend/src/components/AgentProposals.jsx  # command-center panel (list, run, approve/reject, live push)
```

- **Wakes** on the `alertBus` (a Tier 1 risk escalation) with **cooldown +
  dedupe** per (event, zone) so a zone that stays hot doesn't storm the LLM;
  a jump to CRITICAL bypasses the cooldown. Also runnable on demand.
- **Reasons with tools**: it's handed a compact brief + read-only tools
  (`get_top_risks`, `get_gate_status`, `find_safest_route`,
  `simulate_intervention`, …) and calls them before deciding.
- **Structured, validated output**: the model emits a JSON envelope
  (`{severity, reasoning, actions[]}`); every action is validated against the
  real venue graph, so an invented gate/zone id is rejected — it cannot route
  through a barricade or a nonexistent gate.
- **Advisory auto-applies; consequential needs sign-off**: highlight/route/
  camera/policy apply immediately; open/close gate, deploy units, broadcast wait
  for an authority's Approve, then execute against the venue (a gate actually
  flips state). Every proposal is persisted for the audit trail.

| Method | Route | Access |
|---|---|---|
| GET | `/api/events/:id/agent/proposals` | authority (verified) |
| POST | `/api/events/:id/agent/run` | authority (verified) |
| PATCH | `/api/events/:id/agent/proposals/:pid/approve` | authority (verified) |
| PATCH | `/api/events/:id/agent/proposals/:pid/reject` | authority (verified) |

### 6.13.3 Conversational assistant (the global popup, wired for real)

The floating popup's mock stream (§6) is replaced by a real streamed answer.

```
backend/routes/agent.routes.js        # POST /api/ai/assistant/ask (SSE), any signed-in user
frontend/src/utils/assistantStream.js # fetch-based SSE client -> onDelta seam
frontend/src/components/assistant/AssistantChat.jsx  # same UI, now real
```

- `POST /api/ai/assistant/ask` streams Server-Sent Events
  (`{type:"delta"|"done"|"error"}`). When the popup is on an event page it
  auto-scopes to that event and **grounds the answer in the live snapshot brief**
  (so "where's the bottleneck?" reads real zones). History (last ~10 turns) is
  carried; Stop aborts the upstream call.

### Verified (end-to-end, against a mock OpenAI-compatible provider)

Backend boots clean (`[agent] subscribed to alertBus (autonomous wake armed)`).
Logged in as the demo authority, provider saved (key encrypted, never echoed):

| Check | Result |
|---|---|
| provider discover (mock) / unreachable | `ok:true` 3 models / `ok:false kind:"unreachable"` |
| provider save + get | `status:ok`, `hasKey:true`, key never returned |
| `POST /agent/run` (seeded event) | 200 · proposal severity `high`, `highlight_zone Z1` (advisory→applied) + `open_gate G1` (consequential→pending) |
| `PATCH …/approve` | 200 · status `executed`; `open_gate G1` executed (venue gate set open) |
| invalid ids in envelope | rejected by `validateActions` (never proposed) |
| `POST /ai/assistant/ask` SSE (event-scoped) | 200 · `delta` frames → `done` |
| provider unreachable mid-ask | SSE `{type:error}` → `{type:done}`, clean (no hang) |
| Frontend | ESLint clean; `AiProvider`, `AssistantChat`, `AgentProposals`, `CommandCenter`, `assistantStream` all Vite 200 |

Honest note: verification used a local mock endpoint (no real API key needed).
Plug in a real OpenAI-compatible base URL + key at `/settings/ai-provider` and
the same paths drive a real model. Tool-calling depth is capped at 3 loops.

---

## 6.14 NEW — Google Maps as agent tools, fused with live crowd risk

A spatial-intelligence refinement on top of E4. The agent can now use Google
Maps for the geography CrowdShield can't know (roads, transit, parking, the
approach to a venue), while our own graph stays authoritative inside the fence.
The key design decisions:

- **Google owns *outside the fence*; the venue graph owns *inside*.** A temple
  compound / stadium / festival field has no Google paths — Google walking
  directions stop at the perimeter. So Google routes a person *to a gate*
  (outside), and the E3 venue router handles *gate → destination* (inside). The
  **gate is the handoff.**
- **Tools, not a screenshot; direct API, not model-side grounding.** Google is
  exposed to the agent as function-call tools our orchestrator resolves —
  provider-agnostic (works with any user-configured LLM, since "Grounding with
  Google Maps" is Gemini-only). That keeps the fusion in *our* deterministic
  code, not inside the model.
- **Fusion is the crown jewel.** Google returns candidate routes; `routeFusion`
  samples each polyline against the live zone-risk grid and gate state, then
  re-ranks — so Google's "fastest" route never wins if it threads a hot zone or
  ends at a closed gate.
- **Best-effort, never a hard dependency.** Maps is off by default and
  bring-your-own-key (encrypted at rest). If it's disabled/unreachable, the tool
  returns a fallback signal and the agent uses the in-venue router instead.

```
backend/models/MapsConfig.js       # singleton BYO-key config (encrypted; mockable base URLs; enabled flag)
backend/services/googleMaps.js     # Routes/Places client — field masks, timeouts, typed errors, [lat,lng]
backend/services/routeFusion.js    # PURE: decode polyline, sample risk along route, re-rank (safe-first)
backend/services/agentMapTools.js  # google_maps_route / _route_matrix / _places + get_safe_exit_route
backend/controllers/maps.controller.js + validators/maps.validator.js + routes/maps.routes.js  # /api/ai/maps
frontend/src/components/settings/GoogleMapsCard.jsx  # BYO-key card on /settings/ai-provider
```

- Agent tools (merged into the E4 tool loop): `google_maps_route`,
  `google_maps_route_matrix`, `google_maps_places`, and the fused
  `get_safe_exit_route` (Google routes to the nearest open gates → risk re-rank
  → recommended gate + "inside uses the venue router" note).
- Scale/privacy guardrails baked in: routing is done at **gate granularity, not
  per-user** (`get_safe_exit_route` caps at the nearest ~3 open gates), field
  masks trim payloads, and the agent only reaches for Maps on a meaningful event
  (it's wired into the same wake-on-alert loop).

**When MCP fits later:** Google's *Maps Grounding Lite* is a model-agnostic MCP
server (places/weather/routing essentials). It's a clean fast-path for ambient
"what's near me / weather at gate-time" in the chat assistant — but safety-
critical routing stays here (direct API + our risk fusion) so we keep the
deterministic control crowd safety needs.

### Verified

- `routeFusion` + client smoke (`/tmp/fusion_smoke.mjs`): **15/15 pass** — decodes
  Google's canonical polyline, a route through a hot zone (risk 0.9) is rejected,
  a clear route is preferred even though it's slower, a route ending at a closed
  gate is rejected, and the client parses routes/matrix/places from a mock.
- Config API (as the demo authority, against a mock Google endpoint): save →
  `status:ok`, `hasKey:true`; GET is masked (**key never returned**); test → ok;
  an unreachable base URL degrades to `status:error` + a warning but still saves.
- Backend boots clean with the merged toolset; the settings card lints clean and
  transforms 200. (Verification used a local mock — drop a real key in
  `/settings/ai-provider` and the same paths hit Google.)

---

## 6.15 NEW — going real (no mocks), and completing both roles

Everything below runs on **real, free infrastructure**: no paid API keys, no
proprietary dependency, and the mock servers used during E4 development are
retired. The two people the system exists for — the **authority** running the
event and the **citizen** in the crowd — now each get the full AI experience.

### 6.15.1 Free real routing by default (OpenStreetMap / OSRM)

```
backend/services/routing/index.js        # provider-neutral interface
backend/services/routing/osrmProvider.js # real OSM routing, no key needed
```

- **OSRM is the default** and needs no API key, so a fresh deployment has working
  real road routing out of the box. Google is used only if an operator enables
  it; `ROUTING_PROVIDER` can force either. The agent's tools were renamed
  provider-neutral (`road_route`, `road_route_matrix`, `places_search`).
- Every engine returns the same shape, so `routeFusion` (the crowd-risk
  re-ranking) is unchanged — swapping engines never touches the AI.
- **Honest pedestrian ETAs.** The public demo server only has the *car* profile
  loaded and ignores the profile in the URL: it returned 387 m in 53 s (~26 km/h).
  We therefore keep OSRM's real geometry + distance and recompute duration from
  our own walking-speed constant (measured: 299 s walking vs ~55 s "car").
  Operators self-hosting a genuine foot profile can set `OSRM_TRUST_DURATION=true`.
- **The public demo is unreliable** — a direct probe timed out on 2 of 3 requests
  and served a perfect route on the 3rd. Mitigated with 3 retries and exponential
  backoff (a citizen must not be told "no route" because of someone else's
  traffic). `GET /api/ai/routing` now live-probes the engine so an unreachable
  router is visible rather than looking like "the crowd is blocked".
  **Production should self-host OSRM** (podman + a regional OSM extract) — still
  free, and it removes the flakiness entirely.

### 6.15.2 What the authority now gets

The agent used to reason invisibly. Now its decisions land on the map and reach
the crowd:

- **AI directives drawn on the live map.** `highlight_zone` outlines the flagged
  zone (pink dashed); `draw_route` draws the actual corridor path. Geometry is
  resolved **server-side** (`withGeometry`) using the same risk-aware router
  citizens get, so the map never shows a straight-line lie — and an invented id
  gains no geometry at all.
- **A real map in the Command Center.** The decorative CSS circle is gone,
  replaced by the live venue map with crowd dots, heat, risk-tinted zones and the
  AI overlay.
- **Approved actions change reality and say so.** Approving now emits
  `agent:action` for each executed action, so a flipped gate or a sent broadcast
  is reflected immediately.
- **Real public announcements** (`services/broadcast.js`, `models/Broadcast.js`):
  an authority can compose one (with optional Hindi/Odia), or approve the agent's
  proposed `broadcast_alert`. Both take the same path — persisted for the audit
  trail and for phones that join late, then pushed to every phone in the event
  room. The agent can never broadcast alone; it is a consequential action.

### 6.15.3 What the citizen now gets

- **Their route, drawn.** The app was already receiving `route.waypoints` and
  throwing them away; it now renders them on a phone-sized map with distance,
  walking ETA and a route-condition badge coloured by live risk.
- **"Safest way out"** (`POST /events/:id/exit-route`): real road geometry to the
  nearest **open** gates, re-ranked by live crowd risk, rejecting routes through
  critical zones or to closed gates. It calls the **same service the agent uses**,
  so a citizen and the command centre can never be given contradictory advice.
- **Announcements in their language**, as a prominent severity-coloured banner
  (with `messages[lang]`), labelled "Event control" or "AI advisory", with
  acknowledge — plus history for late joiners.
- Consent-first privacy, the GPS heartbeat, SOS and incident reporting are
  unchanged.

### 6.15.4 End-to-end verification with a gradual ramp

Run exactly as the testing philosophy demands — a **monotonic ramp**, never an
instant random scatter — against the seeded Puri venue with a live subscriber
attached (the predictor only runs while someone is watching):

| Time | Observation (real pipeline, real data) |
|---|---|
| 33s | first heartbeats land; H3 cells appear |
| 105s | chokepoint 0.27 p/m², time-to-critical 114 s |
| 116s | 1.13 p/m², ETA 32 s |
| 126s | 3.03 p/m² → **WATCH**, ETA 5 s |
| **136s** | 5.73 p/m², risk 0.55 → ***ALERT: ELEVATED*** (fired once, after the 3-tick sustain gate) |
| 177s | 19.18 p/m² sustained ELEVATED |

Then, through the real endpoints: the authority **approved** a proposal →
`highlight_zone` applied, `open_gate` executed, `broadcast_alert` executed → and a
connected client standing in for a citizen phone received, live:
`### BROADCAST [warning] from agent: "Heavy crowding at the Singhadwara
approach…"` plus both `agent:action` events. The broadcast persisted with all
three languages.

**A finding that matters more than the test:** the seeded "Singhadwara Approach"
zone is **34,899 m²**, so reaching 4 p/m² there would need ~139,600 people — it
can never escalate. Crush happens in chokepoints of a few hundred m². We added a
**1,956 m² chokepoint zone** hugging the corridor and it escalated properly, while
the big zone only reached WATCH at the same moment. Two consequences:
zones must be authored at chokepoint scale, and **cell-level alerting** (already
on the roadmap) is the structural fix so safety never depends on how generously
someone drew a polygon.

Honest scope of this verification: every link is real except the **LLM reasoning
pass**, which needs an operator-supplied model. The provider layer itself is
proven (discovery, save, test, streaming, graceful timeout), but a CPU-only 4.7B
local model could not complete a 7-tool reasoning pass inside Node's 300 s header
timeout — so that leg was verified by persisting the proposal a reasoning pass
would produce and driving the **real** approval path. Point the provider at a
reasonably fast endpoint and the same path runs unchanged.

---

## 6.16 NEW — a real hosted model, and the end of fabricated data

Two goals this session: get the agent working well against the operator's own
hosted model, and make good on a hard requirement — **nothing on screen may be
invented**. Every figure must trace to a measurement, a database record, or say
plainly that it isn't known.

### 6.16.1 The agent against a real model

The provider layer was pointed at a real hosted OpenAI-compatible endpoint
(`nemotron-3-ultra`). The first reasoning pass took **35.5 s**, which is useless
for crowd safety. After optimisation it runs in **~6–15 s** depending on how many
actions it decides on:

- Tool rounds capped at 2 — the brief already carries top risks, ETAs, gate state
  and pre-computed feasible actions, and the prompt now says so explicitly
  ("Trust the brief over any assumption. Only call a tool for something genuinely
  missing — every tool call costs seconds a crowd may not have").
- Tool calls in a round run **concurrently** (`Promise.all`) instead of serially.
- **One `AbortController` for the whole pass** with a 75 s wall-clock budget, so a
  slow provider can never hang the endpoint; it surfaces as an operator-readable
  `PROVIDER_TIMEOUT` rather than a spinner.
- Streaming is used even for the final answer, because a non-streaming request
  sends no headers until generation finishes and trips Node's 300 s header
  timeout on slow models.

**A bug this surfaced, and why it mattered.** The output cap had been tightened to
500 tokens. That was fine for a one-gate venue, but the moment a second gate
existed the model's JSON was cut off mid-object — and the code fell back to
`{severity:"low", actions:[]}`, quietly rendering a *lost decision* as a
confident "nothing to do". The model had in fact decided to open the relief gate.
Three changes:

- Cap raised to 1200 tokens (an envelope is still small; this is headroom).
- **One corrective round-trip** when the envelope doesn't parse ("resend only the
  envelope, compact, no markdown").
- If it still can't be read, the proposal is stored with `parseFailed: true` and
  the UI shows an amber **"Unreadable reply"** badge instead of a severity, with
  text telling the operator to assess the alert themselves. Truncated JSON is
  *never* repaired into actions: closing `"gateId": "G` would yield the
  parseable-but-wrong gate `G`, and a `"count": 12` cut from `1200` can't be
  detected at all. Guessing an instruction that moves a crowd is not a trade this
  system makes.

### 6.16.2 Fabricated data: found, and removed

An audit of all 46 frontend and 76 backend source files found no hardcoded
metrics in the JSX — but real fabrication in two other places.

**Deleted outright** (surfaces with no real data source):

```
backend/utils/mockCrowdEngine.js          # the Math.random() crowd engine
backend/controllers/crowd.controller.js   # + its GET /:id/crowd route (now 404)
frontend/src/pages/{Dashboard,RiskPredictions,Recommendations,
                    DigitalTwin,AIAssistant,IncidentSummary}.jsx
frontend/src/utils/{crowdSimulation,densityCalculator,
                    riskEngine,recommendationEngine}.js
frontend/src/components/{StatCard,RiskCard,Loader}.jsx   # 0-byte stubs
frontend/src/components/{Navbar,Sidebar}.jsx             # 0-byte, imported by nothing
frontend/src/components/VenueMap.jsx      # never mounted; only re-exported MARKER_TYPES
frontend/src/layouts/DashboardLayout.jsx
```

They were deleted rather than rewritten because **real equivalents already
exist**: `LiveMap`, `CommandCenter`, `AgentProposals` and the global assistant
popup. `/dashboard` now resolves through a role-aware `DashboardRedirect`, and
`/risk`, `/recommendations`, `/digital-twin`, `/ai-assistant`, `/incident`
redirect to `/events`. A generic `ZonesLayer` also went, because it rendered
`density` as a percentage while the pipeline measures persons/m² — "2.4%" for
2.4 p/m².

**Rewritten over real data:** `command.controller.js` and
`analytics.controller.js` now derive everything from `buildSnapshot`, with trend
persisted in a new `Reading` collection (20 s rate limit, 24 h TTL) so it survives
a restart and only records a sample when something was actually measured.
Recommendations were removed from the command snapshot entirely: they come from
`AgentProposal`, where each one is auditable and human-approved. Hardcoded if/else
advice presented as "AI recommendations" was a lie, and the Command Center's
"Security units are being routed…" status text — which described actions nothing
in the system performed — went with it.

**Two one-word backend bugs** meant these surfaces were dead on arrival: both
files read `snap.totals.devices` (the aggregator emits `sampledDevices`) and
`cell.speedMean` (it emits `meanSpeed`), so `hasLiveData` was permanently false
and `avgSpeed` permanently null. Fixed and verified live.

### 6.16.3 The sampling layer stopped inventing measurements

The subtler fabrication: an absent sensor reading was coerced to `0`, then
rendered as a confident measurement.

| Before | Rendered as | Now |
|---|---|---|
| `heading: h ?? prev ?? 0` | "Flow Direction: **N**" | `null` |
| `speed: isFinite(s) ? s : 0` | "Avg Movement **0.0 m/s** · Live" | `null` |
| `d.heading \|\| 0` in the aggregator | `dirCoherence 1.0` = "perfectly orderly" | device excluded from the mean |
| `d.speed \|\| 0` | `meanSpeed 0` = "stalled crowd" | device excluded from the mean |
| `flowBearing: … ?? 0` | every bearing-less cell voting north | `null` |
| `dots: s: d.s ?? 0` | grey dots painted **red** ("stalled") | neutral grey |

This wasn't cosmetic. A missing heading zeroed the predictor's **turbulence**
term (understating counter-flow risk) while a missing speed maxed its **crush**
term (overstating it) — errors in opposite directions, both invisible.

Now `null` propagates from `liveStore` through the aggregator, predictor,
controllers and into the UI as "—". Absent motion contributes *nothing* to crush,
pressure or turbulence, and the cost of that blindness is charged where it
belongs: cells and zones report `speedSamples`/`dirSamples`, and the predictor's
`confidence` is scaled by **motion coverage** (a zone measured by headcount alone
keeps 60% confidence, and the state machine's confidence gate caps it at WATCH).
So a zone we can only count cannot quietly claim a crush signature.

**Participation is now visible.** `currentCrowd` is an estimate —
`sampledDevices ÷ participationRate` — and multiplying by ~8 without saying so is
the single most misleading number on the screen. `/command` returns both inputs
and the card reads "Estimated from 300 reporting phones · assumes 12% use the
app".

### 6.16.4 Two correctness bugs found while verifying

**Nested zones never accumulated.** The aggregator assigned each device to the
*first* polygon containing it, in authoring order. Zones nest in practice — a
1,956 m² chokepoint sits inside a 34,899 m² approach — so the chokepoint's crowd
was credited to the 18× larger parent and diluted to nothing. The exact
bottleneck an operator drew was the one thing that could not escalate. Devices
now count toward the **smallest** containing polygon. Measured effect: with 420
phones in the chokepoint, ZC1 went from 0 samples to 386 (parent zone: 19).

**Risk was frozen whenever nobody was watching.** The broadcaster's 1 Hz loop is
viewer-driven, and `buildSnapshot` reused whatever it last computed — serving zone
density and risk from minutes earlier stamped `generatedAt: now`. The same class
of lie as a stale alert. Now a read reuses that pass only if it is under 1.5 s
old, and otherwise **advances the predictor itself** against the readings it just
aggregated, passing real elapsed time so the forecaster's slope stays meaningful.
Transitions found on that path are persisted, so **an alert can now fire even
with no dashboard open**. When the cached pass *is* fresh, only the risk
decoration is reused — measurements always come from the current aggregation, so
a response can never pair a live headcount with a stale density.

### 6.16.5 The stale-alert fix, proven

An alert used to stay `active` forever once ticks stopped, because alerts are
resolved by predictor *transitions* and transitions need a running loop. Two
mechanisms, both verified against MongoDB:

| Check | Result |
|---|---|
| alert resolved by the per-tick sync while the loop ran | `status: resolved`, `resolvedReason: "conditions cleared"` |
| an "active" alert last refreshed 10 min ago, loop stopped | a plain `GET /alerts` swept it → `"no longer reported"` |
| a legacy alert with no `lastSeenAt` field at all | swept correctly (the `$or` fallback to `createdAt` works) |
| a **fresh** alert during the same sweep | still `active` — no over-resolving |

### 6.16.6 End-to-end, with the real model

Driven through the production sensor path (`POST /events/:id/ingest`, the same
endpoint a phone posts to) with positions placed inside the authored chokepoint so
density rises monotonically and thresholds can be observed exactly. A second
socket client stood in for a citizen phone.

| Phones in ZC1 | Density | Level | Risk | ETA critical |
|---|---|---|---|---|
| 120 | 0.47 p/m² | NORMAL | 0.26 | 85 s |
| 260 | 1.02 p/m² | WATCH | 0.34 | 64 s |
| 420 | 1.64 p/m² | WATCH | 0.43 | 45 s |
| **600** | **2.36 p/m²** | **ELEVATED** | **0.54** | **11 s** → alert fired |

Then, with no human in the loop until the approval step:

- **Autonomous wake** on the alert bus → real inference on `nemotron-3-ultra`,
  proposal in **14.5 s** (6.3 s when it proposed a single action).
- Its reasoning, verbatim: *"Singhadwara Chokepoint (ZC1) is at elevated risk with
  only 11s to critical; opening Gate 2 (West Relief) adds 780/min egress capacity
  to relieve pressure, while highlighting the zone directs immediate attention."*
  That 780/min is the server-derived throughput of the 10 m gate — the model is
  reasoning over real venue measurements, not inventing plausible numbers.
- Two actions: `highlight_zone ZC1` (advisory → auto-applied, emitted to clients
  with the real polygon) and `open_gate G2` (consequential → pending).
- **Approve** → `open_gate` executed → `GATES AFTER: Gate 2 (West Relief) open`.
  The gate actually flipped.
- A three-language broadcast (en/hi/or) reached the citizen socket.
- Crowd dispersed → the alert **auto-resolved within 4 s**.
- `avgSpeed` read `"0.2 m/s"` throughout and `null` once nobody was moving.

Because a one-gate venue gives the agent nowhere to divert anyone, a second gate
(`G2`, held closed, with a corridor bypassing the chokepoint) was authored through
the real `PUT /venue` endpoint — all areas, lengths and capacities derived
server-side. It is left closed so a demo starts from a state the agent can act on.

### 6.16.7 Verification of the UI itself

A static check can't prove a React render, so Chromium was driven through the
real login form and every authority page (headless Playwright against the system
browser):

| Page | Result |
|---|---|
| Command Center | renders, 0 console errors, 0 page errors |
| Analytics · Live Map · Authority Events · AI Provider · Landing | all clean |

This caught and confirmed the fix for a **blocking crash**: the backend rewrite
correctly stopped sending `snapshot.recommendations`, but `CommandCenter.jsx`
still iterated it — `Cannot read properties of undefined (reading 'map')`, a blank
page. The page also had unguarded `snapshot.*` reads that would crash on a failed
first fetch; it now shows an honest "couldn't load the live snapshot" state.

The screenshot confirms the honesty goal in the one place it counts — the operator's
screen: "No readings" / "Not measured" badges with "—" instead of numbers,
"Waiting for phones to report", real gate state `1/2 Restricted`, a real
OpenStreetMap venue, "No active alerts — all zones nominal", and the agent's real
reasoning with `AI · nemotron-3-ultra` in the provider pill.

### 6.16.8 What "no dummy data" now means, precisely

Allowed, and why each is legitimate:

- `services/simulator.js` and `scripts/seed*.js` — a load simulator the operator
  starts deliberately, and demo seed data. Both are explicit, never disguised as
  live readings.
- The anti-herd `Math.random()` in `guidance.js` — a real algorithm that fans
  people across exits instead of sending everyone down the "best" corridor.
- Published physical constants: pedestrian free-walk 1.34 m/s, Fruin density
  bands, H3 resolution, 1.3 persons/m/s flow.
- The Landing page's decorative particles — now a deterministic golden-angle
  scatter, so there is no `Math.random()` left in frontend rendering at all. Its
  tiles state capabilities ("Live density heatmap"), never measurements; the old
  "99% Prediction Accuracy" and fake telemetry (82% / High / Stable / 3 Active)
  are gone, and the preview panel is labelled "Illustrative preview".
- A random device-id generator in the citizen app — an anonymous identifier, not
  a measurement.

Not allowed anywhere: a number presented as measured that wasn't, a zero standing
in for an unknown, or a default that renders before real data arrives.

### 6.16.9 Files touched

```
backend/services/aggregator.js       # null propagation, speed/dir sample counts, smallest-zone assignment
backend/services/liveStore.js        # heading/speed stay null when unknown
backend/services/predictor.js        # absence-of-evidence factors, motionCoverage confidence, getLatestAt()
backend/services/snapshot.js         # risk freshness window; advances the predictor when the loop is stopped
backend/services/agent.js            # token cap, envelope retry, salvageReasoning, parseFailed
backend/services/alerts.js           # (verified) heartbeat + read-time sweep
backend/realtime/broadcaster.js      # dots carry null motion instead of 0/north
backend/controllers/command.controller.js    # field-name fixes + sampledDevices/participationRate
backend/controllers/analytics.controller.js  # field-name fixes
backend/models/AgentProposal.js      # parseFailed flag
backend/models/Reading.js            # NEW: persisted trend
backend/services/readings.js         # NEW
frontend/src/pages/authority/CommandCenter.jsx  # crash fix, honest empty states, participation note
frontend/src/pages/authority/Analytics.jsx      # real data
frontend/src/pages/CrowdMonitoring.jsx          # real data
frontend/src/components/AgentProposals.jsx      # "Unreadable reply" badge
frontend/src/components/map/DotsLayer.jsx       # unknown speed = grey, not red
frontend/src/components/map/mapLayers.jsx       # removed the density-as-% ZonesLayer
frontend/src/pages/Landing.jsx                  # deterministic particles
frontend/src/pages/authority/MapEditor.jsx      # MARKER_TYPES from its real source
frontend/src/routes/AppRoutes.jsx               # role-aware /dashboard + redirects
```

Checks: `node --check` clean on every changed backend file; `npx eslint src` down
to **5 pre-existing** issues (2 in `AuthContext`, 3 react-hook-form warnings) with
zero introduced; `vite build` exits 0; no source file imports anything deleted.

---

## 6.17 NEW — the agent can finally see the ground

The problem, in the user's words: *"the agent is not aware of anything happening on
map … agent can't see the road, the ways on map, tracks, routes, nothing it can see,
so it cannot predict which way or which route the users should select."*

That was accurate. The agent knew `Z1` was at risk and `G2` was shut. It could not
name a street, did not know a road network existed, and had no verb for "send these
people that way". Full design rationale in `ARCHITECTURE.md` §18.

### 6.17.1 Coverage is drawn with a pen, and it means something

```
frontend/src/components/map/CoverageDrawLayer.jsx  # the pen (pointer events, one stroke)
frontend/src/utils/geoClient.js                    # RDP simplify + area preview
frontend/src/components/map/VenueEditor.jsx        # `coverage` mode
frontend/src/pages/authority/MapEditor.jsx         # toolbar + live readout + save
backend/services/aggregator.js                     # filterToCoverage()
```

Hold and drag to trace the area you want monitored. A ~300-point freehand trace is
simplified with Ramer–Douglas–Peucker at a **4 m tolerance** (street width, not
pixel width) and saved through the existing `PUT /venue`, so the server still
derives the authoritative area. The client's area formula is *bit-identical* to the
server's (verified: `837587.2266131357` from both), so the number under your finger
cannot disagree with the number that gets stored.

The boundary is now operational, not decorative:

| Verified | Result |
|---|---|
| 200 phones inside + 150 outside ingested | `sampledDevices: 200`, `outsideCoverage: 150` |
| live dots drawn on the map | **200**, not 350 |
| the excluded 150 | reported, not silently dropped |

That last row matters: a surge building just outside your line is something you
need to see coming, so it is counted separately rather than hidden.

### 6.17.2 The real streets, imported free

```
backend/services/osmNetwork.js     # Overpass import + way splitting into a graph
backend/models/RoadNetwork.js      # one doc per event, keyed by a coverage hash
backend/services/roadCrowd.js      # live crowd projected onto each segment
backend/controllers/roads.controller.js
   POST /events/:id/roads/import        (verified authority)
   GET  /events/:id/roads               (any signed-in user)
   GET  /events/:id/roads/congestion    (any signed-in user)
```

Overpass — **free, no API key, no account**. The real work is splitting each OSM way
at every node it shares with another way, which turns a bag of overlapping polylines
into a routable graph.

The demo event's coverage was extended west to include **Grand Road (Bada Danda)**,
the actual Rath Yatra procession route, which the original 0.84 km² box missed
entirely. Result:

```
coverage 1.68 km²  ->  95 OSM ways  ->  331 segments, 267 junctions, 26.94 km
named roads the agent can now reason about:
   Grand Road          7 segs   535 m   up to 1092/min  [secondary,primary]
   VIP Road           22 segs  1534 m   up to  702/min  [primary]
   Marine Drive Road  12 segs   726 m   up to  702/min  [trunk]
   Kutcheri Road      11 segs  1038 m   up to  546/min  [secondary]
   Clarke Road         9 segs   469 m   up to  390/min  [unclassified]
   Station Road        3 segs   364 m   up to  546/min  [secondary]
   (+267 unnamed lanes and footpaths OSM has no name for)
```

Marine Drive Road is in that list because of a judgement call worth recording: OSM
tags it `highway=trunk`, and the first cut excluded trunk roads alongside
motorways. But in Indian urban tagging `trunk` is routinely a wide arterial with
footpaths, and Marine Drive is a road Puri crowds actually walk. Excluding it left
the agent blind to a major egress corridor — a worse failure than including a road
an operator can see and reject.

Street-level crowding is measured, and unmeasured roads say so:

| Check | Result |
|---|---|
| crowd of 4,025 people projected onto streets | `Kutcheri Road 1.70 p/m² · 0.5 m/s · congested` |
| segments with no readings nearby | `density: null`, `personsEst: null`, `state: "unmeasured"` |
| segments faking a zero | **0** |
| re-import with an unchanged coverage polygon | `skipped: true`, no network call |
| coverage redrawn | stored network flagged `stale`, not served as current |
| Overpass rate-limited | `502` + "wait a minute and import again", no stack trace |

### 6.17.3 Crowds became objects (ARCHITECTURE §8, finally built)

```
backend/services/clusterTracker.js            # connected components + identity over time
frontend/src/components/map/ClustersLayer.jsx # merged bubbles, animated
frontend/src/components/map/crowdSplit.js     # one place decides dots vs bubble
frontend/src/components/TrackedCrowds.jsx     # the operator's read-out
```

Occupied H3 cells are grouped by **adjacency** (not by a density threshold — a
threshold shatters one real crowd wherever it thins out), tracked tick to tick so
ids persist, and described with head count, density, pace, heading and growth.

The map does what was asked: sparse people stay individual dots, and as they gather
they merge into one sized bubble carrying the count, with the position, radius and
count interpolated between ticks so it swells and drifts rather than jumping. A
`merge` event animates the absorbed bubble collapsing into the survivor.

| Verified live | Result |
|---|---|
| two blobs 300 m apart | 2 clusters, `K1` and `K2` |
| another tick | same ids — identity persisted |
| ~300 phones added to K1 | growth rate appeared (measured over an 8 s window, not per tick) |
| blobs walked together | `converging K1 + K2 gap=25m combined=8998` |
| blobs touching | `MERGE K2 -> K1 n=5167` |
| speed never reported | `meanSpeed: null`, never 0 |

Three bugs were found and fixed by that run: growth could never compute (the 1 Hz
tick was always below a 2 s floor), merge detection used a strict centre-to-centre
threshold that could never fire (a survivor's centroid sits *between* the crowds
that fused), and events were gated on density so two large *loose* crowds
converging — which is precisely how a dense one forms — were invisible.

### 6.17.4 Routing over real streets

```
backend/services/roadRouter.js  # Dijkstra over junctions, congestion-weighted
```

Cost is walking time inflated by crowding and **infinite at crush density** — a
route 200 m shorter through a critical street is not shorter. `oneway` is treated as
the vehicle restriction it is in OSM, not a walking rule. Named roads get a 10% cost
discount because an instruction nobody can follow moves nobody.

Steps are merged so the output is speakable — same-street runs into one
instruction, and unnamed runs into a direction:

> 1. Continue west for 757 m  2. Head north-west on Kutcheri Road for 731 m
> 3. Head north-east on Grand Road for 232 m

Every route reports `measuredFraction`, so "safest route" never implies we checked
streets we cannot see.

### 6.17.5 `direct_crowd` — the verb the agent was missing

`draw_route` speaks only in venue node ids. Fine for a drawn corridor, useless for
telling thousands of people where to walk. So the action vocabulary gained one
advisory verb taking places by the names people use:

```json
{ "type": "direct_crowd", "from": "Singhadwara Chokepoint", "to": "Grand Road" }
```

| Check | Result |
|---|---|
| valid directive | accepted, resolved to **41 waypoints** via Kutcheri Road → Grand Road, 1,720 m, 21 min |
| spoken output | "1. Continue west for 757 m 2. Head north-west on Kutcheri Road for 731 m 3. Head north-east on Grand Road for 232 m" |
| `to: "Baker Street"` (does not exist) | **REJECTED** — "not a known junction, street, gate or zone" |
| `from` and `to` the same place | **REJECTED** |
| crowd on that route | `null` — reported as unmeasured, not as clear |

An unknown place name errors rather than snapping to the nearest junction, so a
hallucinated street cannot quietly become a route.

### 6.17.6 What the real model does with it

Coverage drawn, 331 segments imported, a crowd ramped into the chokepoint until
Tier 1 escalated, agent woken autonomously on the alert bus against the operator's
own hosted model (`nemotron-3-ultra`). Its reasoning, verbatim and unprompted:

> "Singhadwara Chokepoint (ZC1) is 12 seconds from critical with risk 0.50
> ELEVATED. Crowd **K1** has 4,167 people at 0.44 p/m² **growing at 10,608
> people/minute — a crush precursor**. Immediate egress expansion and crowd
> diversion are essential."

Actions proposed:

| Action | Class | Effect |
|---|---|---|
| `open_gate G2` | consequential | held for the authority's approval |
| `direct_crowd Singhadwara Chokepoint → Grand Road` | advisory | resolved to a real drawable route + spoken directions |
| `highlight_zone ZC1` | advisory | applied immediately |

Every element of that sentence was unavailable to it a day earlier: the cluster id,
the head count, the growth rate, the inference that growth *is* a precursor, and a
real street to divert onto.

**Latency, and the fix it forced.** The first run with the new tools took **50.2 s** —
worse than the 35.5 s baseline §6.16.1 had cut to ~7 s. Cause: tool schemas are
re-sent on every round-trip, and 17 tools is **1,761 tokens of schema per call**. The
toolset is now chosen per pass: the external map tools are the fallback for
geography we do not hold, so they drop out once a street network is imported (the
spatial tools supersede them, and route over a graph that is both local and
risk-aware). 17 → 13 tools, 1,761 → **1,191 tokens**, pass back to **31 s**.

### 6.17.7 The citizen gets the same streets

`POST /events/:id/exit-route` now prefers the imported network over an external
router. Verified from inside the chokepoint:

```
source        : imported street network
gate          : Gate 1 (G1)     distance: 251 m, 3 min
crowd on route: — not measured  (measured share 0)
TELL THE USER : 1. Continue north for 251 m
```

Three reasons this is the right default: it is **measured** (each segment carries
this event's own live density, so a road filling up is priced into the route), it is
**local** (no third-party request to time out at the moment someone is trying to get
out), and it is the **same graph the agent names streets from** — so a citizen's
phone and the command centre can never send people down different roads. Without an
imported network it falls back to the external engine, and says which one it used.

### 6.17.8 Verified

| Check | Result |
|---|---|
| `node --check` on every backend file | all parse |
| `npx eslint src` | 5 problems — **the same 5 pre-existing**, none added |
| `npx vite build` | exit 0 |
| Headless Chromium on Live Map + Command Center with live clusters | **0 page errors, 0 console errors** |
| On screen | coverage boundary dashed, merged bubble, "K1 4.8k people · 0.51 p/m²", real street names, "Estimated from 580 reporting phones · assumes 12% use the app" |

### 6.17.9 Three bugs the first real use surfaced

Asked on a freshly-drawn event *"can you have access to the marks and areas you are
covering?"*, the assistant replied **"I don't have any live zone data … nothing to
assess."** It was wrong, and the reasons were worth the trip.

**1. The brief threw everything away when there were no zones.** `buildBrief`
early-returned on `!zones.length`, discarding a 196,144 m² hand-drawn coverage
area, three gates and two POIs — all of it real, all of it useful. No zones is not
"nothing to assess": an authority reasonably draws the boundary and drops their
gates before authoring a single zone. Now only a *missing venue* degrades the
brief; zero zones just says so, and coverage/gates/streets/crowds are reported
regardless. Gates are also listed **by name with throughput** — "gates 1/3 open" is
a ratio the model cannot pass on to anybody, "Gate 2 [G2] closed 390/min" is
something it can propose opening.

**2. Nothing ever imported the streets.** The import existed only as an endpoint
the operator had no way to discover, so the agent stayed blind to every road inside
an area that had just been drawn. Drawing the coverage *is* the request to know
what is inside it, so `PUT /venue` now triggers the import itself — fire-and-forget
so the save stays instant, bounded by the coverage hash so re-saving markers costs
nothing, with spaced retries (20 s, 60 s) because nobody is waiting, and a
`roads:import_failed` socket event if it ultimately can't. Verified on the real
event: saved the coverage, **24 segments / 20 junctions / 1.84 km arrived in 4 s**
with no button pressed.

**3. A mirror that lies politely.** The public Overpass instance was 504-ing under
load, so a fallback list was added — and one candidate, `overpass.osm.ch`, turned
out to serve **Switzerland only**. For anywhere else it returns **HTTP 200 with an
empty element list**: 0 ways for a Puri box the planet instances answer with 22, and
10 ways for the same box in Zurich. It had already written a 0-segment network for
the user's event, which the hash check would then have treated as "already
imported".

That is the worst failure mode this feature could have — not an error we surface,
but a confident *"there are no roads here"* that gets cached while the agent stays
blind believing it checked. Three consequences, all now in place: the regional
instance is removed with the measurement recorded next to the endpoint list so
nobody re-adds it; an empty answer is **verified against the next endpoint** before
being accepted, and only believed when every endpoint agrees; and an empty stored
network never satisfies the skip check, because "we already know there are no
roads" is not a claim worth caching.

The brief also now distinguishes **"not imported"** from **"imported, and
OpenStreetMap has no mapped roads inside this area"** — different facts, and
conflating them would have the model either deny an import that happened or imply
streets exist to route onto when none are mapped.

Finally, `COVERAGE` was moved to the **top** of the brief. Buried below the risk
table it got skimmed: asked whether it knew the areas being covered, the model
opened with "No" and then listed them. The boundary is the frame everything else
sits in, so it reads first. After the fix, the same question gets: coverage area,
all three gates with throughput, both POIs, 24 street segments — and an explicit
*"none have live crowd readings, so I cannot describe any as clear or busy."*

### 6.17.10 Honest limits

- **Only 19% of segments carry a name** in this area, so the agent describes more
  stretches by direction than by street. That is the data, not a defect.
- **Reading coverage is thin**: with a crowd in one chokepoint, 8–9 of 331 segments
  have live readings. The rest are `unmeasured` — never "clear" — and
  `measuredFraction` tells the operator when a route is geometric rather than
  informed.
- **Every width here is a class default** (no OSM `width`/`lanes` tags), so
  capacities are estimates with their provenance recorded in `widthSource`.
- **Overpass is a shared free service.** One import per coverage area, honest
  rate-limit advice, `OVERPASS_URL` for your own instance.
- **Clusters are in-process per event**, like the predictor — multi-instance needs
  the same Redis treatment.
- The pen has only been exercised in headless Chromium; **a real touch/stylus pass
  on a tablet is still owed**.

---

## 7. Known limitations / honest caveats

> The first three caveats here previously read "crowd data is fake", "AI assistant
> has no real model" and "models not built yet". All three are **resolved** — see
> §6.16, §6.13 and §6.9. What follows is what is genuinely still open.

- **Crowd size is an estimate, not a census.** `currentCrowd` is
  `sampledDevices ÷ participationRate`, and the demo assumes 12% of the crowd runs
  the app. Both inputs are now shown in the UI, but the multiplier is only as good
  as the operator's calibration.
- **Alerting is zone-scoped, so it depends on how zones were drawn.** Nested zones
  now resolve correctly (§6.16.4), but a venue whose zones are all large still
  can't escalate. **Cell-level alerting** is the structural fix and is the top
  remaining item. Cluster tracking (§6.17.3) partly covers the gap — a merge or a
  growth spike is now detected regardless of polygon size — but it raises no Tier 1
  alert of its own yet.
- **Street coverage is sparse where it matters most.** The chokepoint sits on
  unnamed lanes, so the agent's diversions name a road at the *destination* end
  ("→ Grand Road") more reliably than at the origin.
- **`liveStore` is in-process.** Fine for a single instance; multi-instance needs
  the Redis swap (deliberately behind a ~6-function interface).
- **The public OSRM demo server is flaky** — mitigated with retries; production
  should self-host (§6.15.1).
- **Agent latency depends entirely on the operator's model.** ~6–15 s on the model
  tested. A slow endpoint degrades to a clean `PROVIDER_TIMEOUT`, never a hang.
- **Not load-tested past ~4,000 simulated devices.** At that level the single Node
  process briefly stalls while spawning agents (observed as transport timeouts in
  the test harness, not a product fault). The WebGL dot layer and Redis are the
  planned answers for 40k+.
- **In-browser GPS and PWA install** still need a real device pass; headless
  Chromium verified rendering only.
- **Login does not auto-redirect** (see §4).
- **Uncommitted work in git.** Not yet committed.

---

## 8. What's next (recommended order)

Build order is the E-phases in `docs/ARCHITECTURE.md` §12.

**Done: E0** (venue graph + authoring) · **E1** (real-time pipeline — kills the
fake crowd data) · **E2** (Tier 1 predictor + alerts) · **E3** (personal guidance
+ incidents/SOS + citizen PWA) · **E4** (user-configured LLM provider + Tier 2
agent + live assistant popup) · **Maps fusion** (agent routing tools + crowd-risk
route re-ranking, §6.14) · **Real & free** (OSM/OSRM routing by default, the AI's
decisions on the authority map, real broadcasts, the citizen route map +
"safest way out", end-to-end verified, §6.15) · **Real model + no fabricated
data** (agent optimised 35.5 s → ~6–15 s on the operator's own hosted model, the
mock crowd engine deleted, absent sensor readings kept absent, alert → real
inference → approval → gate flip → citizen broadcast observed end to end, §6.16) ·
**The agent can see the ground** (freehand pen coverage that filters what is
monitored, the real OSM street network imported inside it, tracked crowd clusters
that merge on the map, routing over real streets, and a `direct_crowd` verb the
model used to divert a crowd onto Grand Road by name, §6.17). Remaining:

1. **E5 (next milestone)** — Digital Twin (`simulateIntervention` grown into a
   real what-if the agent can compare options with), voice command centre,
   generative incident summaries (from the `AgentProposal` audit trail), pitch
   deck + demo video.
2. **Testing layer — deliberately last.** Injects GPS positions in a *gradual
   ramp* (never instant-random) to verify exactly when each trigger fires and
   that behaviour matches design. Spec in `ARCHITECTURE.md` §15.
3. **Cell/chokepoint-level alerting** — still the highest-value structural fix.
   Nested-zone attribution is now correct (§6.16.4), so a drawn chokepoint does
   escalate, but safety should not depend on an operator having drawn one at all.
   H3 cells (~2,150 m² at res 11) are already computed every tick with density,
   speed and coherence — the work is running the state machine over cells, not
   just zones.
4. **Self-host OSRM** (podman + regional OSM extract) — removes the public demo
   server's flakiness; still free. `GET /api/ai/routing` shows the live status.
5. **Optional: event-type risk profiles** — let `Event.type` tune the predictor
   (concert vs marathon vs procession vs rally) so the generic engine is sharper
   per theme. Data-driven, not hardcoded.
6. **Scale work**, in the order the numbers demand: Redis for `liveStore`
   (multi-instance), then the WebGL dot layer for 40k+ (the single Node process
   already stalls briefly around 4,000 simulated agents).
7. Fix the small gaps: login auto-redirect; commit the in-progress work.

### Locked decisions (2026-08-13)
- **Redis**: yes, added in E1 (where ingestion lives) — not before.
- **Demo scale**: 40k+ live dots via a WebGL layer, with zoom-based LOD.
- **Zone authoring**: authority draws AoR + zones + corridors (approved).
- **LLM provider**: user supplies base URL + API key; app lists available models
  to pick from. No vendor hardcoded.
- **Testing**: after the system is built, using a gradual ramp injector.

---

## 9. Quick file map (where to look)

```
crowd_help/
├── backend/
│   ├── app.js                     # express app, CORS pinned to CLIENT_URL, route mounting
│   ├── server.js                  # boot: connect Mongo, listen on PORT (5000)
│   ├── .env                       # MONGO_URI, CLIENT_URL, JWT secrets, admin seed creds
│   ├── config/db.js               # Mongo connection
│   ├── controllers/               # auth, event, marker, venue, ingest, alert, guidance,
│   │                              # incident, agent, command, analytics, provider, maps
│   ├── models/                    # User, Event, MapMarker, Venue, Alert, Incident,
│   │                              # Reading, Broadcast, AgentProposal, ProviderConfig, MapsConfig
│   ├── services/                  # THE ENGINE — see §6.7/6.9/6.13:
│   │   ├── liveStore.js           #   hot device positions (TTL, Redis-swappable)
│   │   ├── aggregator.js          #   H3 cells + zone rollup (nulls stay null)
│   │   ├── predictor.js           #   Tier 1 risk + state machine
│   │   ├── forecaster.js          #   Holt smoothing -> time-to-critical
│   │   ├── snapshot.js            #   the Situation Snapshot read model
│   │   ├── alerts.js              #   durable alerts + heartbeat/sweep
│   │   ├── router.js · guidance.js#   risk-aware personal routing
│   │   ├── agent*.js              #   Tier 2 agent, brief, tools, action schema
│   │   ├── routing/               #   OSRM (default, free) / Google behind one interface
│   │   ├── readings.js            #   persisted trend samples
│   │   └── simulator.js           #   deliberate synthetic crowd (ramp harness)
│   ├── realtime/                  # socket.js, broadcaster.js (1 Hz), alertBus.js
│   ├── routes/                    # auth, event, provider, agent, maps
│   └── scripts/                   # seedAdmin.js, seedDemo.js, clearProvider.js
├── frontend/
│   └── src/
│       ├── App.jsx                # mounts <AssistantChat/> + <AiProviderLauncher/> globally
│       ├── routes/AppRoutes.jsx   # all routes + role guards + legacy redirects
│       ├── context/AuthContext.jsx
│       ├── hooks/useCrowdFeed.js  # socket -> crowd:tick + alerts + agent actions + broadcasts
│       ├── pages/                 # Landing, Login, Signup, EventsSelection, LiveMap,
│       │                          # CrowdMonitoring, CitizenApp, authority/*, admin/*, settings/*
│       ├── components/
│       │   ├── assistant/         # the AI popup (§6.13.3)
│       │   ├── map/               # Leaflet layers, LiveCrowdMap, VenueEditor, DotsLayer
│       │   ├── settings/          # AiProviderLauncher, GoogleMapsCard
│       │   ├── AgentProposals.jsx # approve/reject the agent's actions
│       │   └── AlertsFeed.jsx
│       └── utils/                 # axios.js, socket.js, riskUi.js, agentOverlay.js
└── docs/
    ├── PLAN.md                    # full spec + phased roadmap
    ├── ARCHITECTURE.md            # the engineering design
    └── PROGRESS.md                # this file
```

> Deleted on purpose (§6.16.2): `utils/mockCrowdEngine.js`,
> `controllers/crowd.controller.js`, the fake `Dashboard`/`RiskPredictions`/
> `Recommendations`/`DigitalTwin`/`AIAssistant`/`IncidentSummary` pages, the four
> frontend fabricator utils, `components/VenueMap.jsx` and
> `layouts/DashboardLayout.jsx`. If a doc or comment still mentions them, the doc
> is out of date.

---

## Assistant personas — citizen and authority (2026-08-18)

The conversational assistant was one prompt addressed to "the operator", served to
everybody. Two consequences, both visible in use:

1. **A citizen got no data at all.** The popup is mounted in `App.jsx`, outside the
   route tree, and scraped the event id out of the URL. That works for
   `/authority/events/:id/...` but `/citizen` carries no id, so *every* citizen
   question reached the model with no event, no position and no language. It
   answered from nothing.
2. **Replies rendered as plain text.** `**bold**` and `- ` bullets arrived as
   literal characters.

### What changed

| Area | Before | After |
|---|---|---|
| Persona | one operator prompt for all roles | `CITIZEN_SYSTEM_PROMPT` / `OPERATOR_SYSTEM_PROMPT`, chosen by `req.user.role` |
| Citizen grounding | none | `services/citizenBrief.js` — position, zone, nearby named streets, nearest crowd, safest exit, open/closed places, recent announcements |
| Authority grounding | `agentBrief` (kept) | same brief, plus zone **names** in TOP RISKS and an explicit "unmeasured ≠ unset-up" note in COVERAGE |
| Situation channel | URL regex only | `context/AssistantContext.jsx` + `context/assistantSituation.js`; pages publish, popup reads |
| Rendering | raw text | `components/assistant/Markdown.jsx` (no dependency, React elements only) |
| Request body | `{message, eventId, history}` | `+ {lat, lng, heading, lang}` |
| Token budget | 600 | 1200 (Devanagari/Odia cost 2-3 tokens per character and were truncating) |

The situation channel is ref-backed with no state: a citizen's GPS fix lands about
once a second, and routing that through `setState` would re-render the chat panel
on every fix. The popup needs the situation only when it opens and when a message
is sent — both user events, which can read the ref directly.

### Defects this surfaced and fixed

Found by running the real endpoint against the live model, not by reading code:

- A **closed** gate (`Gate 2 (West Relief)`) was being offered to citizens as a
  place to walk to. The exit router already skipped closed gates; the destination
  list did not. Now excluded, and listed separately as closed so "can I use Gate 2?"
  gets "it's closed, use Gate 1".
- `Kutcheri Road — not measured` appeared three times in one line: one street is
  many segments. Now collapsed by name, keeping the worst crowding seen on any
  segment of it.
- Internal ids (`R44`) were being read out to citizens. Unnamed roads now carry
  `null` and are described as "the road you're on".
- `TOP RISKS` printed zone ids only, so the operator assistant said "ZC1" — it had
  no name to use. Now `Singhadwara Chokepoint [ZC1]`.
- Asked to redistribute personnel with zero phones reporting, the assistant advised
  drawing the coverage area, authoring zones, importing streets and "enabling the
  camera/edge feeds" — coverage was drawn, 2 zones existed, 331 segments were
  imported, and **this platform has no cameras at all**. `COVERAGE` now states why
  nothing is measured, and both prompts forbid inventing hardware.
- `set_camera` in the action vocabulary means *centre the dashboard map on a zone*,
  not a CCTV. The operator prompt said "point a camera", which is what invited the
  invented feeds. Reworded.
- `personsEst: 0` was being reported as "about 0 people in the area". Zero means
  nobody is sharing location, not that the street is empty — a dangerous thing to
  tell someone standing in a crowd. Now explicitly UNKNOWN.
- Announcements carried no age, so a 17-hour-old "chokepoint congested" notice was
  being repeated as current. Now age-stamped and marked OLD past 20 minutes.

### Verified behaviour (live model, real venue data)

Citizen: names only real places (`Gate 1`, `Gundicha Temple`, `Kutcheri Road`,
`Singhadwara Approach` — all present in the DB); admits when location is not shared;
does not invent an event when none is joined; declines gate/deployment questions;
points at the SOS button without promising anyone was dispatched; refuses to route
via a road that isn't in the data ("I have no readings for Netaji Marg"); answers
in Hindi when the app language is Hindi; renders bold and bullets.

Authority: answers all seven problem-statement questions; recommends rather than
acts ("this requires your approval in the command centre"); states that unit
redistribution is advisory with no dispatch integration; refuses to track an
individual; refuses to call an unmeasured road clear; denies camera hardware
exists; ~77-130 words per answer.

Known soft limit: the instruction not to quote internal section labels
(`TOP RISKS`, `CROWDS`) is followed most of the time, not always — roughly 1 answer
in 3 still mentions one. Prompt-level constraint, no effect on correctness.
