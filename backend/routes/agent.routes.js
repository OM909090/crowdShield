import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { askAssistant } from "../controllers/agent.controller.js";
import { askValidator } from "../validators/agent.validator.js";

const router = Router();

// The conversational assistant popup is available to any signed-in user (it is
// mounted on every page). Event-scoped agent proposals/approvals live on the
// event router instead, gated to verified authorities.
router.post("/assistant/ask", protect, askValidator, validate, askAssistant);

export default router;
