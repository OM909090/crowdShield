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
import { getCrowdSnapshot } from "../controllers/crowd.controller.js";
import { getCommandSnapshot } from "../controllers/command.controller.js";
import { getAnalyticsSnapshot } from "../controllers/analytics.controller.js";
import { listMarkers, createMarker, deleteMarker } from "../controllers/marker.controller.js";
import { createMarkerValidator, markerIdValidator } from "../validators/marker.validator.js";

const router = Router();

// Order matters: "/mine" must be registered before "/:id" or it will be
// swallowed by the :id route and fail the ObjectId cast.
router.get("/mine", protect, authorize("authority"), listMyEvents);

router.get("/", protect, listEvents);
router.get("/:id", protect, eventIdValidator, validate, getEventById);

// Citizen-facing live crowd reading
router.get("/:id/crowd", protect, eventIdValidator, validate, getCrowdSnapshot);

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
