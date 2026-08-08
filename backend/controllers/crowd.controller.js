import Event from "../models/Event.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";

const ZONE_TEMPLATE = ["Main Entrance", "Food Court", "Exit Zone", "Stage / Central Area"];
const DIRECTIONS = ["North", "North-East", "East", "South-East", "South", "South-West", "West", "North-West"];

const randomBetween = (min, max) => Math.random() * (max - min) + min;

/**
 * TEMPORARY MOCK DATA SOURCE.
 * There's no camera/sensor pipeline wired up yet, so this generates a
 * plausible-looking live reading each time it's called, scaled against the
 * event's expected attendance. Swap the body of this function for a real
 * read from your crowd-density model/service later — the response shape
 * below is the contract the frontend already expects, so nothing else
 * should need to change.
 */
const generateSnapshot = (event) => {
  const baseline = event.expectedAttendance || 5000;
  const occupancyRatio = randomBetween(0.3, 0.95);
  const currentCrowd = Math.round(baseline * occupancyRatio);

  const zones = ZONE_TEMPLATE.map((name) => {
    const density = Math.round(randomBetween(15, 96));
    const status = density >= 80 ? "Critical" : density >= 50 ? "Moderate" : "Safe";
    return { name, density, status };
  }).sort((a, b) => b.density - a.density);

  const hotspotCount = zones.filter((z) => z.status === "Critical").length;

  return {
    currentCrowd,
    avgSpeed: `${randomBetween(0.6, 1.6).toFixed(1)} m/s`,
    flowDirection: DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)],
    hotspotCount,
    zones,
    generatedAt: new Date().toISOString(),
  };
};

export const getCrowdSnapshot = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) throw new ApiError(404, "Event not found");

  res.status(200).json({ snapshot: generateSnapshot(event) });
});
