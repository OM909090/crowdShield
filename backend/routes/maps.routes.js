import { Router } from "express";
import { protect, authorize, requireVerifiedAuthority } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { getMaps, saveMaps, testMaps, getRoutingStatus } from "../controllers/maps.controller.js";
import { saveMapsValidator } from "../validators/maps.validator.js";

const router = Router();

// Google Maps credentials are an operations setting, like the LLM provider:
// verified authority only. Admins are excluded for the same reason.
const guard = [protect, authorize("authority"), requireVerifiedAuthority];

router.get("/maps", ...guard, getMaps);
router.post("/maps", ...guard, saveMapsValidator, validate, saveMaps);
router.post("/maps/test", ...guard, testMaps);

// Which routing engine is active (free OSM/OSRM by default, or Google) and can
// we actually reach it right now? Live probe, not just configuration.
router.get("/routing", ...guard, getRoutingStatus);

export default router;
