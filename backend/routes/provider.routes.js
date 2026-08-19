import { Router } from "express";
import { protect, authorize, requireVerifiedAuthority } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  getConfig,
  discoverModels,
  saveConfig,
  testConnection,
} from "../controllers/provider.controller.js";
import { discoverValidator, saveConfigValidator } from "../validators/provider.validator.js";

const router = Router();

// The LLM provider is an operations setting, so only a verified authority may
// view or change it. Admins are deliberately excluded: their scope is account
// verification, not running the control room.
const guard = [protect, authorize("authority"), requireVerifiedAuthority];

router.get("/provider", ...guard, getConfig);
router.post("/provider/discover", ...guard, discoverValidator, validate, discoverModels);
router.post("/provider", ...guard, saveConfigValidator, validate, saveConfig);
router.post("/provider/test", ...guard, testConnection);

export default router;
