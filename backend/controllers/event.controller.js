import Event from "../models/Event.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";

const toGeoLocation = (location) => ({
  venueName: location.venueName,
  address: location.address,
  coordinates:
    location?.coordinates?.latitude != null && location?.coordinates?.longitude != null
      ? { type: "Point", coordinates: [location.coordinates.longitude, location.coordinates.latitude] }
      : undefined,
});

export const createEvent = asyncHandler(async (req, res) => {
  const { name, type, description, startDate, endDate, location, expectedAttendance, bannerUrl } = req.body;

  const event = await Event.create({
    name,
    type,
    description,
    startDate,
    endDate,
    expectedAttendance,
    bannerUrl,
    location: toGeoLocation(location),
    createdBy: req.user._id,
  });

  res.status(201).json({ message: "Event created successfully", event });
});

// Citizen-facing browse list — everyone logged in can see all non-cancelled events by default
export const listEvents = asyncHandler(async (req, res) => {
  const { type, status } = req.query;

  const filter = {};
  if (type && type !== "All") filter.type = type;
  if (status) filter.status = status;

  const events = await Event.find(filter)
    .sort({ startDate: 1 })
    .populate("createdBy", "name organizationId");

  res.status(200).json({ events });
});

// Authority-facing: only the events this authority account created
export const listMyEvents = asyncHandler(async (req, res) => {
  const events = await Event.find({ createdBy: req.user._id }).sort({ startDate: -1 });
  res.status(200).json({ events });
});

export const getEventById = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id).populate("createdBy", "name organizationId");
  if (!event) throw new ApiError(404, "Event not found");
  res.status(200).json({ event });
});

export const updateEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) throw new ApiError(404, "Event not found");
  if (event.createdBy.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "You can only edit events you created");
  }

  const { location, ...rest } = req.body;
  Object.assign(event, rest);
  if (location) event.location = toGeoLocation({ ...event.location.toObject(), ...location });

  await event.save();
  res.status(200).json({ message: "Event updated successfully", event });
});

export const deleteEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) throw new ApiError(404, "Event not found");
  if (event.createdBy.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "You can only delete events you created");
  }

  await event.deleteOne();
  res.status(200).json({ message: "Event deleted successfully" });
});
