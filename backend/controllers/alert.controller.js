import Event from "../models/Event.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { getActiveAlerts, acknowledgeAlert } from "../services/alerts.js";

const findEventOr404 = async (id) => {
  const event = await Event.findById(id);
  if (!event) throw new ApiError(404, "Event not found");
  return event;
};

/** Active + acknowledged alerts for an event (command dashboard). */
export const listAlerts = asyncHandler(async (req, res) => {
  await findEventOr404(req.params.id);
  const alerts = await getActiveAlerts(req.params.id);
  res.status(200).json({ alerts });
});

/** Acknowledge an alert (authority took notice). */
export const ackAlert = asyncHandler(async (req, res) => {
  await findEventOr404(req.params.id);
  const alert = await acknowledgeAlert(req.params.id, req.params.alertId, req.user._id);
  if (!alert) throw new ApiError(404, "Alert not found");
  res.status(200).json({ message: "Alert acknowledged", alert });
});
