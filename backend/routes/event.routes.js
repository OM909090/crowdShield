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

const router = Router();

// Order matters: "/mine" must be registered before "/:id" or it will be
// swallowed by the :id route and fail the ObjectId cast.
router.get("/mine", protect, authorize("authority"), listMyEvents);

router.get("/", protect, listEvents);
router.get("/:id", protect, eventIdValidator, validate, getEventById);
router.get("/:id/crowd", protect, eventIdValidator, validate, getCrowdSnapshot);

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
