import { Router } from "express";
import { protect, authorize, requireVerifiedAuthority } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { createEventValidator, updateEventValidator, eventIdValidator } from "../validators/event.validator.js";
import {
  createEvent,
  listEvents,
  listMyEvents,
  getEventById,
  updateEvent,
  deleteEvent,
} from "../controllers/event.controller.js";

import { getCommandSnapshot } from "../controllers/command.controller.js";
import { getAnalyticsSnapshot } from "../controllers/analytics.controller.js";
import { listMarkers, createMarker, deleteMarker } from "../controllers/marker.controller.js";
import { createMarkerValidator, markerIdValidator } from "../validators/marker.validator.js";
import {
  getVenue,
  getDestinations,
  upsertVenue,
  patchNode,
  patchEdge,
} from "../controllers/venue.controller.js";
import {
  upsertVenueValidator,
  nodeIdValidator,
  edgeIdValidator,
  patchNodeValidator,
  patchEdgeValidator,
} from "../validators/venue.validator.js";
import { importRoads, getRoads, getRoadCongestion } from "../controllers/roads.controller.js";
import { importRoadsValidator } from "../validators/roads.validator.js";
import {
  ingest,
  getSnapshot,
  startSimulation,
  stopSimulation,
  simulationStatus,
} from "../controllers/ingest.controller.js";
import { listAlerts, ackAlert } from "../controllers/alert.controller.js";
import { getGuidance, getExitRoute } from "../controllers/guidance.controller.js";
import {
  createIncident,
  listIncidents,
  acknowledgeIncident,
  resolveIncident,
} from "../controllers/incident.controller.js";
import {
  createIncidentValidator,
  incidentIdValidator,
} from "../validators/incident.validator.js";
import {
  listProposals,
  runAgentNow,
  approveProposal,
  rejectProposal,
  createBroadcast,
  listBroadcasts,
} from "../controllers/agent.controller.js";
import { proposalIdValidator, broadcastValidator } from "../validators/agent.validator.js";

const router = Router();

// Order matters: "/mine" must be registered before "/:id" or it will be
// swallowed by the :id route and fail the ObjectId cast.
router.get("/mine", protect, authorize("authority"), listMyEvents);

router.get("/", protect, listEvents);
router.get("/:id", protect, eventIdValidator, validate, getEventById);

// ---- E1 real-time pipeline ----
// Anonymized GPS heartbeats from the citizen app (the "sensor" path).
router.post("/:id/ingest", protect, eventIdValidator, validate, ingest);
// The Situation Snapshot: derived crowd state (map data source + AI eyes).
router.get("/:id/snapshot", protect, eventIdValidator, validate, getSnapshot);

// Crowd simulator control (authority; demos + the gradual-ramp test harness).
router.post("/:id/sim/start", protect, authorize("authority"), requireVerifiedAuthority, eventIdValidator, validate, startSimulation);
router.post("/:id/sim/stop", protect, authorize("authority"), requireVerifiedAuthority, eventIdValidator, validate, stopSimulation);
router.get("/:id/sim/status", protect, authorize("authority"), requireVerifiedAuthority, eventIdValidator, validate, simulationStatus);

// ---- E2 Tier 1 alerts (command dashboard) ----
router.get("/:id/alerts", protect, authorize("authority"), requireVerifiedAuthority, eventIdValidator, validate, listAlerts);
router.patch("/:id/alerts/:alertId/ack", protect, authorize("authority"), requireVerifiedAuthority, eventIdValidator, validate, ackAlert);

// Authority-only control room views
router.get(
  "/:id/command",
  protect,
  authorize("authority"),
  requireVerifiedAuthority,
  eventIdValidator,
  validate,
  getCommandSnapshot
);

router.get(
  "/:id/analytics",
  protect,
  authorize("authority"),
  requireVerifiedAuthority,
  eventIdValidator,
  validate,
  getAnalyticsSnapshot
);

// Venue map markers — anyone can read, only verified authorities can write
router.get("/:id/markers", protect, eventIdValidator, validate, listMarkers);

router.post(
  "/:id/markers",
  protect,
  authorize("authority"),
  requireVerifiedAuthority,
  eventIdValidator,
  createMarkerValidator,
  validate,
  createMarker
);

router.delete(
  "/:id/markers/:markerId",
  protect,
  authorize("authority"),
  requireVerifiedAuthority,
  eventIdValidator,
  markerIdValidator,
  validate,
  deleteMarker
);

// ---- Venue Graph (AoR, zones, nodes, edges) ----
// Read is open to any signed-in user: citizens need destinations + the corridor
// network for personal routing. Writes are verified-authority only.
router.get("/:id/venue", protect, eventIdValidator, validate, getVenue);
router.get("/:id/venue/destinations", protect, eventIdValidator, validate, getDestinations);

router.put(
  "/:id/venue",
  protect,
  authorize("authority"),
  requireVerifiedAuthority,
  eventIdValidator,
  upsertVenueValidator,
  validate,
  upsertVenue
);

// Narrow, high-frequency actions: open/close a gate, block or one-way a corridor.
router.patch(
  "/:id/venue/nodes/:nodeId",
  protect,
  authorize("authority"),
  requireVerifiedAuthority,
  eventIdValidator,
  nodeIdValidator,
  patchNodeValidator,
  validate,
  patchNode
);

router.patch(
  "/:id/venue/edges/:edgeId",
  protect,
  authorize("authority"),
  requireVerifiedAuthority,
  eventIdValidator,
  edgeIdValidator,
  patchEdgeValidator,
  validate,
  patchEdge
);

// ---- Real road network (OpenStreetMap) ----
// The streets that actually exist inside the coverage area, with their real
// names. Importing costs a query against a free shared service and rewrites what
// the agent reasons over, so it is verified-authority only. Reading is open to
// any signed-in user, like GET /venue: citizens are routed along these roads.
router.post(
  "/:id/roads/import",
  protect,
  authorize("authority"),
  requireVerifiedAuthority,
  eventIdValidator,
  importRoadsValidator,
  validate,
  importRoads
);

router.get("/:id/roads", protect, eventIdValidator, validate, getRoads);

// Street-level crowding: the live pipeline projected onto the imported roads.
// Open to any signed-in user for the same reason as GET /roads — a citizen's app
// needs to know which street is jammed before it routes them down it.
router.get("/:id/roads/congestion", protect, eventIdValidator, validate, getRoadCongestion);

// ---- E3 Personal guidance (citizen app) ----
// Any signed-in user asks "what should I do right now?" given their GPS +
// destination. Returns one instruction and an optional risk-aware route.
router.post("/:id/guidance", protect, eventIdValidator, validate, getGuidance);

// "Get me out safely" — the urgent path: safest route to an open gate, real road
// geometry re-ranked by live crowd risk. Same service the AI agent uses.
router.post("/:id/exit-route", protect, eventIdValidator, validate, getExitRoute);

// ---- E3 Incidents / SOS ----
// Reporting is open to any signed-in user (citizens self-report, marshals from
// the field). Triage (list/ack/resolve) is verified-authority only.
router.post(
  "/:id/incidents",
  protect,
  eventIdValidator,
  createIncidentValidator,
  validate,
  createIncident
);

router.get(
  "/:id/incidents",
  protect,
  authorize("authority"),
  requireVerifiedAuthority,
  eventIdValidator,
  validate,
  listIncidents
);

router.patch(
  "/:id/incidents/:incidentId/ack",
  protect,
  authorize("authority"),
  requireVerifiedAuthority,
  eventIdValidator,
  incidentIdValidator,
  validate,
  acknowledgeIncident
);

router.patch(
  "/:id/incidents/:incidentId/resolve",
  protect,
  authorize("authority"),
  requireVerifiedAuthority,
  eventIdValidator,
  incidentIdValidator,
  validate,
  resolveIncident
);

// ---- E4 Tier 2 agent (command center) ----
// Autonomous proposals + human approval of consequential actions. The agent
// also wakes on its own via the alert bus (see services/agent.js); /run is the
// manual, on-demand trigger for demos and operator-initiated reviews.
router.get(
  "/:id/agent/proposals",
  protect,
  authorize("authority"),
  requireVerifiedAuthority,
  eventIdValidator,
  validate,
  listProposals
);

router.post(
  "/:id/agent/run",
  protect,
  authorize("authority"),
  requireVerifiedAuthority,
  eventIdValidator,
  validate,
  runAgentNow
);

router.patch(
  "/:id/agent/proposals/:proposalId/approve",
  protect,
  authorize("authority"),
  requireVerifiedAuthority,
  eventIdValidator,
  proposalIdValidator,
  validate,
  approveProposal
);

router.patch(
  "/:id/agent/proposals/:proposalId/reject",
  protect,
  authorize("authority"),
  requireVerifiedAuthority,
  eventIdValidator,
  proposalIdValidator,
  validate,
  rejectProposal
);

// ---- Public announcements ----
// Sending reaches every phone in the event room, so it is verified-authority
// only. Reading is open to any signed-in user: a citizen joining late needs to
// see what the crowd has already been told.
router.post(
  "/:id/broadcast",
  protect,
  authorize("authority"),
  requireVerifiedAuthority,
  eventIdValidator,
  broadcastValidator,
  validate,
  createBroadcast
);

router.get("/:id/broadcasts", protect, eventIdValidator, validate, listBroadcasts);

// Event CRUD (creation/editing)
router.post(
  "/",
  protect,
  authorize("authority"),
  requireVerifiedAuthority,
  createEventValidator,
  validate,
  createEvent
);

router.patch(
  "/:id",
  protect,
  authorize("authority"),
  eventIdValidator,
  updateEventValidator,
  validate,
  updateEvent
);

router.delete("/:id", protect, authorize("authority"), eventIdValidator, validate, deleteEvent);

export default router;
