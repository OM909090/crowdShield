/**
 * Incidents / SOS subsystem.
 *
 * Citizens (and field marshals) report incidents against an event; authorities
 * triage them from the command dashboard. Newly created incidents are pushed
 * live to the event's Socket.IO room so the dashboard updates without polling.
 *
 * Intended routes (wired up in the routes layer — NOT in this file):
 *   POST   /api/events/:id/incidents                      (protect)                        -> createIncident
 *   GET    /api/events/:id/incidents                      (protect, authority, verified)   -> listIncidents
 *   PATCH  /api/events/:id/incidents/:incidentId/ack      (protect, authority, verified)   -> acknowledgeIncident
 *   PATCH  /api/events/:id/incidents/:incidentId/resolve  (protect, authority, verified)   -> resolveIncident
 */
import Incident from "../models/Incident.js";
import Event from "../models/Event.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { getIO, roomName } from "../realtime/socket.js";

const findEventOr404 = async (id) => {
  const event = await Event.findById(id);
  if (!event) throw new ApiError(404, "Event not found");
  return event;
};

// Map the reporter's account role to how the incident is labelled. Authorities
// filing from the field are "marshals"; admins are "system"; everyone else is
// a self-reporting citizen.
const reporterTypeForRole = (role) =>
  role === "authority" ? "marshal" : role === "admin" ? "system" : "citizen";

/**
 * Any authenticated user can report an incident.
 * Body: { category, note?, lat?, lng? }
 */
export const createIncident = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id);

  const { category, note, lat, lng } = req.body;

  // Only attach coordinates when both are real finite numbers — a partial or
  // non-numeric pair is treated as "no location shared".
  const geo = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;

  const incident = await Incident.create({
    event: event._id,
    reporterType: reporterTypeForRole(req.user.role),
    category,
    note,
    geo,
    createdBy: req.user._id,
  });

  // Best-effort live push; a socket hiccup must never fail the report itself.
  const io = getIO();
  if (io) {
    io.to(roomName(req.params.id)).emit("incident:new", {
      id: incident._id,
      category: incident.category,
      status: incident.status,
      geo: incident.geo,
      note: incident.note,
      createdAt: incident.createdAt,
    });
  }

  res.status(201).json({ incident });
});

/**
 * Authority: list incidents for an event. Defaults to the actionable set
 * (open + acknowledged); pass ?status= to narrow to a single state.
 */
export const listIncidents = asyncHandler(async (req, res) => {
  await findEventOr404(req.params.id);

  const { status } = req.query;
  const filter = { event: req.params.id };
  filter.status = status ? status : { $in: ["open", "acknowledged"] };

  const incidents = await Incident.find(filter).sort({ createdAt: -1 }).limit(100);
  res.status(200).json({ incidents });
});

/**
 * Authority: acknowledge an incident (took notice). Only transitions when the
 * incident is currently open, but always returns the current document.
 */
export const acknowledgeIncident = asyncHandler(async (req, res) => {
  await findEventOr404(req.params.id);

  const incident = await Incident.findOne({ _id: req.params.incidentId, event: req.params.id });
  if (!incident) throw new ApiError(404, "Incident not found");

  if (incident.status === "open") {
    incident.status = "acknowledged";
    incident.acknowledgedBy = req.user._id;
    incident.acknowledgedAt = new Date();
    await incident.save();
  }

  res.status(200).json({ incident });
});

/**
 * Authority: mark an incident resolved (handled/closed out).
 */
export const resolveIncident = asyncHandler(async (req, res) => {
  await findEventOr404(req.params.id);

  const incident = await Incident.findOne({ _id: req.params.incidentId, event: req.params.id });
  if (!incident) throw new ApiError(404, "Incident not found");

  incident.status = "resolved";
  incident.resolvedAt = new Date();
  await incident.save();

  res.status(200).json({ incident });
});
