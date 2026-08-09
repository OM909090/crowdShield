import Event from "../models/Event.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { getSimulatedState } from "../utils/mockCrowdEngine.js";

export const getCrowdSnapshot = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) throw new ApiError(404, "Event not found");

  const state = getSimulatedState(event);

  res.status(200).json({
    snapshot: {
      currentCrowd: state.currentCrowd,
      avgSpeed: state.avgSpeed,
      flowDirection: state.flowDirection,
      hotspotCount: state.hotspotCount,
      zones: state.zones,
      generatedAt: state.generatedAt,
    },
  });
});
