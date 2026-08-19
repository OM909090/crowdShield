# CrowdShield — End-to-End Implementation Plan

> AI-Powered Early Warning System for Preventing Crowd Stampedes
> TechNova Season 3 · Round 2 (Grand Master) · Problem Statement 1
> Status: planning baseline · Owner: team · Last updated: 2026-08-12

---

## 0. How to read this document

This is the single source of truth for finishing CrowdShield. It captures the
strategy, the current-state audit, the target architecture, and a phased,
checkable task list. Work top-to-bottom through the phases in Section 12.
Anything labeled **[ASSUMPTION]** should be confirmed; anything labeled
**[OPEN]** is a decision still owed by the team.

---

## 1. Problem statement (condensed)

Design an affordable, scalable, AI-powered mobile + cloud solution that predicts
potential stampede situations **before** they occur, with **minimum hardware
dependencies**. It must answer: where is density rising abnormally, which spots
are becoming bottlenecks, is a crush likely in the next few minutes, which
evacuation route is safest, how to redistribute personnel, which gates to
open/close, and what announcements to make.

Functional pillars: Crowd Monitoring · Risk Prediction · Intelligent
Recommendations · Command Dashboard · Citizen Mobile App.
Bonus: Digital Twin · AI crowd simulation · Voice command center · Multilingual
AI assistant · Generative incident summaries.
Constraints: limited infrastructure, low-cost deployment, network outages, high
scalability, data privacy, real-time performance, false-alarm reduction, ease of
use by authorities.

## 2. Round 2 deliverables (ALL mandatory — missing any = disqualification)

1. A prototype: a **working mobile app** and a **reporting portal**.
2. **Architecture diagram & source code** (data flow, modules, third-party APIs).
3. A **pitch deck** (max 10 slides) and a **demo video**.
4. **Documentation** (tech choices, assumptions, compliance checks).

### Evaluation weighting

| Criterion | Weight | What it rewards |
|---|---:|---|
| Innovation & Originality | 40% | Unique use of technology, UX design, enforcement logic |
| Technical Feasibility | 30% | Realism of tech stack and solution architecture |
| User Friendliness | 20% | Clear, intuitive design and walkthroughs |
| Data Ethics & Privacy | 10% | Responsible data handling, especially public imagery |

Every decision below is justified against this table.

---

## 3. Strategic thesis — "The Citizen App IS the Sensor"

The problem demands minimum hardware. The current code fakes all crowd data with
`Math.random()`. The pivot that resolves both at once:

The companion **PWA that citizens install becomes a participatory sensor**. With
explicit opt-in, phones send anonymized, coarse GPS heartbeats. The backend bins
them into venue zones to compute **real density, real flow vectors, and real
bottlenecks**, then a short-horizon forecaster projects density 5–10 minutes
ahead to deliver the "alert 10 minutes before" success vision.

Why this wins the rubric:

- Innovation (40%): the mandatory mobile app becomes the core novelty, not a
  side feature. Participatory sensing for stampede prevention is genuinely
  original and software-only.
- Feasibility (30%): replaces random numbers with an explainable, real pipeline
  that runs on commodity infra; no CCTV, no CV compute, no new hardware.
- User Friendliness (20%): one clean citizen flow (install → consent → alerts)
  and one authority portal.
- Data Ethics (10%): no cameras/imagery at all; anonymized, aggregate-only,
  opt-in, short-retention location data. This is a direct scoring win.

A **real crowd-simulation engine** (not random) runs alongside to (a) drive the
live demo since we can't summon 45,000 real phones, (b) power the Digital Twin
bonus, and (c) act as a fallback data source during network outages.

Honesty principle: heuristic layers are labeled "heuristic" and ML layers "ML"
in all docs. Defensible engineering beats inflated AI claims and protects the
Data Ethics score.

Signal-fusion note: heartbeats are the primary signal, but the fusion layer is
designed to also weight optional, no-new-hardware signals — gate/ticket scan
deltas (entry−exit ⇒ occupancy) and manual marshal reports — degrading
gracefully when a signal is missing.

---

## 4. Current-state audit (verified by reading the code)

### 4.1 Real and solid — keep
- Auth: JWT access (15m) + refresh (7/30d) in httpOnly cookies, refresh-token
  rotation, SHA-256 token storage, rate limiting, max-5 sessions.
- Roles: `citizen` / `authority` / `admin`, with an admin approval gate for
  authorities (`isVerifiedAuthority`, `requireVerifiedAuthority`).
- Event CRUD (owner-scoped) and Map Marker CRUD (Leaflet `VenueMap`, 8 marker
  types, click-to-place editor).
- Frontend routing with role-based `ProtectedRoute`.
- Security middleware (helmet, cors+credentials, centralized error handling,
  express-validator).

### 4.2 Exists but MOCKED (fake data) — must be replaced
- `backend/utils/mockCrowdEngine.js` — every crowd/risk number is `Math.random()`
  (3s cache, 12-point in-memory trend). Feeds `crowd`, `command`, `analytics`
  controllers. Self-labeled temporary.
- `frontend/src/utils/riskEngine.js`, `recommendationEngine.js` — if/else
  heuristics fed HARDCODED inputs on `RiskPredictions` / `Recommendations`.
- `Dashboard`, `CitizenApp`, `DigitalTwin`, `IncidentSummary`, `AIAssistant` —
  100% hardcoded UI. `AIAssistant.sendMessage` is `console.log`. Command Center
  "broadcast" is a toast only.

### 4.3 MISSING entirely
- Any real crowd sensing / ingestion pipeline.
- Any ML/forecasting model (only rules exist).
- Real-time layer (currently `setInterval` polling; no socket.io dep).
- i18n / multilingual (only a `User.language` enum; UI says "Multilingual").
- Mobile app / PWA (CitizenApp is a static desktop page; no manifest/SW).
- Voice, LLM, generative summaries (all bonus features are UI shells).
- Persisted `Alert` / `Incident` / `CrowdReading` collections.

### 4.4 Broken wiring / dead code (fix early — cheap UX wins)
- Empty 0-byte components: `Navbar`, `Sidebar`, `StatCard`, `RiskCard`,
  `Loader`, `MapContainer`.
- `DashboardLayout` links to unregistered routes (`/crowd`, `/map`,
  `/analytics`, `/settings`); Landing "Start Monitoring" → `/crowd` (404).
- No logout / user menu in the shell.
- Dead/unused: `geocode.js` (never imported), `crowdSimulation.js`,
  `densityCalculator.js`, `CrowdMap.jsx`.
- `axios` base URL hardcoded (`http://localhost:5000/api`); no `.env`; no
  401→refresh interceptor. Duplicate `<Toaster/>`.
- `seed:demo` referenced but no npm script exists.
- `.env` committed with placeholder secrets + a plaintext admin password
  (rotate + gitignore).

---

## 5. Gap analysis vs functional requirements

Legend: OK = real · MOCK = fake data · MISS = missing.

### Crowd Monitoring
| Capability | Now | Target |
|---|---|---|
| Crowd density | MOCK | Real: zone-binned heartbeats + simulation; Fruin LOS A–F |
| Movement speed | MOCK | Real: position deltas over time per device |
| Congestion hotspots | MOCK | Real: per-zone density thresholds |
| Unusual behavior | MISS | Anomaly detection (speed collapse, density spike, dispersal) |
| Flow directions | MOCK | Real: aggregated velocity vectors per zone |
| Bottlenecks | MOCK | Real: density at chokepoints + flow convergence |

### Risk Prediction
| Capability | Now | Target |
|---|---|---|
| Crush / stampede likelihood | MOCK | Risk model: density+flow+turbulence+forecast slope → 0–100 |
| Panic propagation | MISS | Neighboring-zone contagion in simulation + risk map |
| Sudden surge | MOCK | Forecast slope + surge detector |
| Reverse crowd movement | MISS | Counter-flow detector from velocity vectors |
| Route blockage | MISS | Path state from markers + zone density on route graph |
| High-risk zones (pre-emptive) | MOCK | Forecaster → time-to-critical per zone |

### Intelligent Recommendations
| Capability | Now | Target |
|---|---|---|
| Open exits / close gates / redirect / redeploy / one-way / barricade | MOCK | Rules engine over real zone state + LLM to phrase the "why" |
| Multilingual announcements | MISS | LLM generation + i18n + Web Speech TTS |

### Command Dashboard
| Capability | Now | Target |
|---|---|---|
| Live event map | OK-ish | Keep Leaflet; add live layers |
| Crowd heat map | MISS | Real density heat overlay |
| Risk zones | MOCK | Color-coded zones from risk engine |
| Crowd trend analytics | MOCK | Real trends from persisted readings |

### Mobile Application (PWA)
| Capability | Now | Target |
|---|---|---|
| Incident notifications | MISS | Web Push (VAPID) |
| Live multilingual congestion alerts | MISS | Socket + i18n + push |
| Location-based warnings | MISS | Zone match from device geolocation |
| Incident reporting | MISS | SOS + photo/geotag report → `Incident` |

### Bonus
| Feature | Now | Target |
|---|---|---|
| Digital Twin | MOCK | Venue zones + animated real simulation state |
| AI crowd simulation | MISS | Agent/flow model over venue graph |
| Voice command center | MISS | Web Speech API (free, in-browser) |
| Multilingual AI assistant | MOCK | LLM + RAG over live event state |
| Generative incident summaries | MOCK | LLM over persisted incident/alert timeline |

---

## 6. Target architecture

### 6.1 Data flow
```
Citizen PWA ──(anonymized GPS heartbeat, opt-in)──┐
Marshal (manual zone reports, authority app) ─────┤
Gate/ticket scan deltas (optional, no new HW) ────┤─► Ingestion API ─► Sensor Fusion
Simulation engine (demo + outage fallback) ───────┘        │                 │
                                                           ▼                 ▼
                                                 CrowdReading (TS store)   Zone State
                                                           │                 │
                                                           ▼                 ▼
                                            Forecaster (Holt/EWMA) ─► Risk Engine ─► Alert Engine
                                                                          │             │
                                                  Recommendation Engine ◄─┘             │
                                                          │                             ▼
                                                    LLM Service ─► Socket.IO ─► Portal + PWA
                                                                             └► Web Push (offline)
```

### 6.2 Module map
- Ingestion service — validate + anonymize heartbeats, coarse geohash, bin to zones.
- Sensor fusion — confidence-weighted signal merge; participation-rate scale-up
  from sampled phones to full-crowd estimate; graceful degradation.
- Simulation engine — agent/flow model over the venue graph (zones, gates,
  capacities, paths). Real math, deterministic seed for demos.
- Forecaster — per-zone double-exponential smoothing (Holt) → projected density
  and time-to-threshold. Cheap, explainable, runs anywhere.
- Risk engine — multi-signal 0–100 score with hysteresis (false-alarm control).
- Alert + recommendation engine — thresholds → alerts → rule-based actions →
  LLM phrasing/translation.
- Real-time — Socket.IO rooms per event; polling retained as fallback.
- LLM service — pluggable provider; graceful "assistant offline" degradation.

### 6.3 Third-party APIs / libraries (credits table for docs)
| Service | Use | Cost |
|---|---|---|
| Leaflet + CARTO/OSM tiles | Maps, heat map | Free, no key |
| Nominatim (OSM) | Address → coordinates (wire in existing `geocode.js`) | Free |
| Google Gemini Flash **[ASSUMPTION: primary]** or Groq | LLM assistant, summaries, announcements | Free tier |
| Ollama (local) | Offline LLM fallback | Free |
| Web Push (VAPID) | Citizen notifications | Free |
| Web Speech API | Voice input + TTS announcements | Free, browser |
| Twilio SMS | Optional alert channel | Paid — optional only |
| Socket.IO | Real-time push | Free (OSS) |

---

## 7. Data model changes (MongoDB / Mongoose)

New collections:
- `Venue` (or embed in `Event`): zones `[{ id, name, polygon/centroid, areaM2,
  capacity, type }]`, gates `[{ id, name, latlng, direction }]`, path graph edges.
- `CrowdReading` (time-series): `{ event, zoneId, density, personsEstimate,
  avgSpeed, flowVector, source(heartbeat|sim|marshal|gate), confidence, ts }`
  with a TTL index for privacy/retention.
- `Alert`: `{ event, zoneId, type, severity, riskScore, forecast{etaSeconds},
  status(active|ack|resolved), acknowledgedBy, createdAt }`.
- `Incident`: `{ event, reporterType(citizen|marshal|system), category(SOS|
  medical|hazard|other), note, photoUrl?, geo, status, createdAt }`.
- `DeviceHeartbeat` (ephemeral / short TTL) or fold into `CrowdReading`:
  `{ event, deviceHash, geohash, ts }` — never store name/mobile with location.

Extend `Event`: attach `venueId` or embedded zone geometry; `simulationConfig`.

Privacy-by-design in the schema: store `deviceHash` (salted hash), coarse
`geohash` (not raw lat/lng tracks), aggregate at zone level, TTL raw rows.

---

## 8. Backend workstream

### 8.1 Real-time + ingestion
- [ ] Add `socket.io`; create `http.Server` in `server.js`; namespaces/rooms per event.
- [ ] Emit `crowd:update`, `alert:new`, `incident:new` to event rooms.
- [ ] `POST /api/events/:id/ingest` — heartbeat ingestion: consent-gated,
      rate-limited, anonymized, geohashed, zone-binned.
- [ ] Ingestion → write `CrowdReading` → recompute zone state → forecast → risk
      → maybe alert → socket emit.

### 8.2 Replace the mock engine with the real one
- [ ] Rename/repurpose `mockCrowdEngine.js` → `crowdEngine.js` that reads fused
      real readings; simulation only as fallback / demo mode.
- [ ] Implement `simulationEngine.js` (agent/flow over venue graph, seeded).
- [ ] Implement `forecaster.js` (Holt double-exponential; time-to-threshold).
- [ ] Implement `riskEngine.js` (server-side, documented formula + hysteresis).
- [ ] Implement `recommendationEngine.js` (rules over real zone state).
- [ ] Persist trend history to DB (drop in-memory Map).

### 8.3 New endpoints
- [ ] Incidents: `POST/GET /api/events/:id/incidents` (+ SOS shortcut).
- [ ] Alerts: `GET /api/events/:id/alerts`, `PATCH .../alerts/:id/ack`.
- [ ] Assistant: `POST /api/events/:id/assistant` (LLM + live-state context).
- [ ] Summary: `POST /api/events/:id/summary` (LLM over incident/alert timeline).
- [ ] Announcement: `POST /api/events/:id/announcement` (LLM + target languages).
- [ ] Push: `POST /api/push/subscribe`, server-side Web Push sender.

### 8.4 LLM service
- [ ] `services/llm.js` provider-pluggable (Gemini/Groq/Ollama via env).
- [ ] Prompt templates: assistant (RAG over zone state), summary, announcement.
- [ ] Timeout + fallback to templated non-LLM text when unavailable.

### 8.5 Fixes / hygiene
- [ ] Wire `geocode.js` into event creation (fallback when no client GPS).
- [ ] Add `seed:demo` npm script; extend demo seed with venue zones + a scenario.
- [ ] Move secrets out of committed `.env`; rotate; add to `.gitignore`;
      commit `.env.example` with VAR NAMES only.
- [ ] Add `LLM_PROVIDER`, `LLM_API_KEY`, `VAPID_*`, `CLIENT_URL` env vars.

---

## 9. Frontend workstream (Authority/Admin portal = the "reporting portal")

### 9.1 Fix wiring first (fast UX wins)
- [ ] Implement or remove empty components; rebuild `Navbar`/`Sidebar` around
      real routes; add logout + user menu.
- [ ] Fix `DashboardLayout` links and Landing "Start Monitoring" target.
- [ ] Axios: `.env` base URL + 401→refresh interceptor; de-dupe `<Toaster/>`.
- [ ] Remove dead code (`crowdSimulation.js`, `densityCalculator.js`,
      `CrowdMap.jsx`) or fold into real engine.

### 9.2 Make mock pages real
- [ ] `CrowdMonitoring`, `CommandCenter`, `Analytics` → Socket.IO live +
      polling fallback; real density heat map overlay on Leaflet.
- [ ] `RiskPredictions`, `Recommendations` → event-scoped, backend-driven.
- [ ] `IncidentSummary` → generated from persisted timeline via LLM.
- [ ] `AIAssistant` → real streaming LLM calls; working quick-prompts; voice
      (Web Speech) input + TTS.
- [ ] `DigitalTwin` → render venue zones + animate real simulation state.
- [ ] Command Center actions (open/close gate, one-way, redeploy, announce)
      call real endpoints and reflect in state.

### 9.3 i18n
- [ ] Add `i18next` + `react-i18next`; locale files for English/Hindi/Odia
      (matches `User.language` enum), extensible; language switcher.

## 10. Citizen PWA (the mandatory "mobile app")

- [ ] `manifest.webmanifest` + icons; installable; standalone display.
- [ ] Service worker: offline app shell + cache last-known alerts (network-outage
      constraint).
- [ ] Consent screen → opt-in geolocation heartbeat sender (the sensor).
- [ ] Web Push subscription; location-based warnings; multilingual alerts.
- [ ] Working SOS button → `Incident`; photo + geotag incident report.
- [ ] Mobile-first UI; big-touch targets; TTS read-aloud of alerts.

## 11. AI/ML strategy (honest labeling)

- Simulation: real crowd-dynamics model (agent/flow), not random. Bonus:
  "AI-powered simulation of crowd movement."
- Forecasting: Holt double-exponential smoothing (statistical, explainable) as
  the baseline. **[OPEN]** Optionally train a small regressor/LSTM on
  simulation-generated data to substantiate an "ML" claim — document as such.
- Risk scoring: transparent weighted formula (density LOS + speed drop +
  counter-flow turbulence + forecast slope) with hysteresis.
- Generative AI: LLM for assistant, incident summaries, multilingual
  announcements (genuinely AI). Web Speech for voice.
- In docs, clearly separate "statistical/heuristic" from "ML" from "generative."

---

## 12. Phased roadmap (execute in order)

Timeline is milestone-based; map to the real Round 2 deadline once confirmed
**[OPEN: deadline]**.

### Phase P0 — Credibility (non-negotiable)
Goal: no more `Math.random()`; a real, explainable, real-time pipeline.
- [ ] Data models: `Venue/zones`, `CrowdReading`, `Alert`, `Incident`.
- [ ] Simulation engine + forecaster + server risk/recommendation engines.
- [ ] Ingestion endpoint + Socket.IO push.
- [ ] Replace mock engine reads; persist trends.
- [ ] Fix all broken wiring + remove dead code.
Exit criteria: a simulated ramp produces a real predicted alert with a
time-to-critical, pushed live to the portal.

### Phase P1 — Deliverable completeness
- [ ] Citizen PWA: installable, heartbeat sensor, push, SOS, incident report.
- [ ] i18n across portal + PWA.
- [ ] Real heat map + event-scoped risk/recommendation pages.
- [ ] Architecture + data-flow diagrams; docs skeleton; `.env.example`.
Exit criteria: both mandatory clients (PWA + portal) work end-to-end on real
pipeline data.

### Phase P2 — Bonus (innovation multipliers) + pitch assets
- [ ] Digital Twin over simulation; LLM assistant; generative incident
      summaries; multilingual announcements; Web Speech voice command center.
- [ ] Pitch deck (≤10 slides); demo video (script in Section 13).
Exit criteria: all five bonus features demonstrably working.

### Phase P3 — Stretch / hardening
- [ ] Trained lightweight ML forecaster (documented honestly).
- [ ] Redis socket adapter + reading store notes for multi-instance scale.
- [ ] Optional SMS channel; load/perf pass; false-alarm tuning.

---

## 13. Demo narrative (drives the video + live walkthrough)

1. Authority opens a demo event; simulation ramps a zone toward critical.
2. Forecaster fires a predicted alert: "projected critical in ~9 min."
3. Socket pushes it to the command portal AND a Web Push lands on the citizen
   PWA in another language (Hindi/Odia).
4. Authority applies a recommendation (open Gate C, one-way flow, redeploy).
5. Voice announcement plays (Web Speech TTS), multilingual.
6. Density curve bends down; risk drops.
7. Generative incident summary is produced for the timeline.

This single flow exercises the full rubric (prediction, action, multilingual,
voice, generative AI, ethics narrative).

---

## 14. Non-functional requirements (constraints → design)

| Constraint | Design response |
|---|---|
| Limited infrastructure | Software-only, commodity Node + Mongo; no CV/GPU |
| Low-cost deployment | Free tiers: OSM tiles, LLM free tier/Ollama, Web Push |
| Network outages | PWA offline cache + last-known; server sim fallback; polling fallback |
| High scalability | Socket.IO rooms per event; TTL time-series; Redis path documented |
| Data privacy | Opt-in, hashed device IDs, coarse geohash, aggregate-only, TTL, no imagery |
| Real-time performance | Socket push instead of 4–5s polling |
| False-alarm reduction | Hysteresis, sustained-breach windows, multi-signal confirmation, marshal override |
| Ease of use by authorities | One portal, clear recommendations with one-tap actions, plain-language "why" |

---

## 15. Data ethics & privacy checklist (scored 10%)

- [ ] Explicit opt-in consent before any location is collected.
- [ ] No cameras / no public imagery anywhere in the system.
- [ ] Device identifiers salted-hashed; never linked to user PII with location.
- [ ] Coarse geohash precision only; no fine-grained personal tracks stored.
- [ ] Aggregate at zone level; raw rows TTL-expired quickly.
- [ ] Clear in-app privacy notice + easy opt-out / data deletion.
- [ ] Documented in `/docs/COMPLIANCE.md`.

---

## 16. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| LLM key/cost/rate limits | Bonus features fail in demo | Free tier + Ollama fallback + graceful offline text |
| Low phone penetration realism | "Is the data real?" doubt | Calibration factor + marshal reports + documented assumption + sim for demo |
| Time pressure | Bonuses unfinished | P0/P1 locked before P2; bonuses are additive |
| Over-claiming "AI" | Loses ethics/credibility | Honest labeling of heuristic vs ML vs generative |
| Committed secrets | Security | Rotate, gitignore, `.env.example` only |
| Single-instance in-memory state | Won't scale | Persist to DB now; document Redis path |

---

## 17. Documentation deliverables (build under `/docs`)

- [ ] `ARCHITECTURE.md` + diagram image (C4-ish + data-flow).
- [ ] `TECH_DECISIONS.md` (stack rationale, trade-offs, API credits table).
- [ ] `ASSUMPTIONS.md` (participation rate, venue model, demo mode).
- [ ] `COMPLIANCE.md` (privacy/ethics checklist above).
- [ ] `RUNBOOK.md` (setup, seed, run, demo steps).
- [ ] Pitch deck (≤10 slides) + demo video.

---

## 18. Open questions / decisions owed

- [OPEN] Round 2 submission deadline (drives how far into P2/P3 we go).
- [OPEN] LLM provider: Gemini free tier vs Groq vs local Ollama.
- [OPEN] Do target venues realistically have gate/ticket-scan data to fuse, or
  is heartbeat + marshal + simulation sufficient for the prototype?
- [OPEN] Push channel: Web Push only (free) vs add SMS (paid) for the demo.
- [OPEN] Languages to ship first (proposed: English, Hindi, Odia).

---

## 19. Progress log

| Date | Phase | Change |
|---|---|---|
| 2026-08-12 | — | Plan baseline created |
