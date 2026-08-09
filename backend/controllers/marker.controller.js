import MapMarker from "../models/MapMarker.js";
import Event from "../models/Event.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";

// Any logged-in user (citizen or authority) can view markers for an event —
// this is what future routing/guidance logic would read to avoid blockages.
export const listMarkers = asyncHandler(async (req, res) => {
  const markers = await MapMarker.find({ event: req.params.id }).sort({ createdAt: 1 });
  res.status(200).json({ markers });
});

// Authority-only: place a new marker
export const createMarker = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) throw new ApiError(404, "Event not found");

  const { type, label, note, lat, lng } = req.body;

  const marker = await MapMarker.create({
    event: event._id,
    type,
    label,
    note,
    lat,
    lng,
    createdBy: req.user._id,
  });

  res.status(201).json({ message: "Marker added", marker });
});

// Authority-only: remove a marker (e.g. a barricade that's since been cleared)
export const deleteMarker = asyncHandler(async (req, res) => {
  const marker = await MapMarker.findOne({ _id: req.params.markerId, event: req.params.id });
  if (!marker) throw new ApiError(404, "Marker not found");

  await marker.deleteOne();
  res.status(200).json({ message: "Marker removed" });
});
