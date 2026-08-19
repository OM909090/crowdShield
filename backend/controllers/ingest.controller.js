import Event from "../models/Event.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { upsertBatch, count as liveCount } from "../services/liveStore.js";
import { buildSnapshot } from "../services/snapshot.js";
import { startSim, stopSim, statusSim } from "../services/simulator.js";

const findEventOr404 = async (id) => {
  const event = await Event.findById(id);
  if (!event) throw new ApiError(404, "Event not found");
  return event;
};

/**
 * Ingest one or more anonymized GPS heartbeats (the citizen-app "sensor" path).
 * Body: { heartbeats: [{ deviceHash, lat, lng, heading?, speed?, t? }] }
 *   or a single { deviceHash, lat, lng, ... }.
 * Positions land in the hot store; only aggregates are ever persisted.
 */
export const ingest = asyncHandler(async (req, res) => {
  const list = Array.isArray(req.body?.heartbeats)
    ? req.body.heartbeats
    : req.body?.deviceHash
      ? [req.body]
      : null;
  if (!list || !list.length) throw new ApiError(422, "Provide heartbeats: [{ deviceHash, lat, lng }]");
  if (list.length > 1000) throw new ApiError(413, "Too many heartbeats in one request (max 1000)");

  const accepted = upsertBatch(req.params.id, list);
  res.status(202).json({ accepted, live: liveCount(req.params.id) });
});

/** The Situation Snapshot — derived crowd state for the map + AI. */
export const getSnapshot = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id);
  const snapshot = await buildSnapshot(event);
  res.status(200).json({ snapshot });
});

/* ---- Simulator control (authority; used for demos + the ramp test) ---- */

export const startSimulation = asyncHandler(async (req, res) => {
  const event = await findEventOr404(req.params.id);
  const center = event.location?.coordinates?.coordinates
    ? [event.location.coordinates.coordinates[1], event.location.coordinates.coordinates[0]]
    : undefined;

  const status = await startSim(req.params.id, {
    count: req.body?.count,
    rampSeconds: req.body?.rampSeconds,
    speed: req.body?.speed,
    center,
  });
  res.status(200).json({ message: "Simulation started", status });
});

export const stopSimulation = asyncHandler(async (req, res) => {
  await findEventOr404(req.params.id);
  const status = stopSim(req.params.id);
  res.status(200).json({ message: "Simulation stopped", status });
});

export const simulationStatus = asyncHandler(async (req, res) => {
  await findEventOr404(req.params.id);
  res.status(200).json({ status: statusSim(req.params.id) });
});
