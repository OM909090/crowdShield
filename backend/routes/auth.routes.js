import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  signup,
  login,
  logout,
  refresh,
  getMe,
  listPendingAuthorities,
  verifyAuthority,
} from "../controllers/auth.controller.js";
import { signupValidator, loginValidator } from "../validators/auth.validator.js";
import { validate } from "../middlewares/validate.middleware.js";
import { protect, authorize } from "../middlewares/auth.middleware.js";

const router = Router();

// Throttle brute-force / credential-stuffing attempts on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again in a few minutes." },
});

router.post("/signup", authLimiter, signupValidator, validate, signup);
router.post("/login", authLimiter, loginValidator, validate, login);
router.post("/refresh", authLimiter, refresh);
router.post("/logout", protect, logout);
router.get("/me", protect, getMe);

// Admin-only: approve authority accounts before they can publish events
router.get("/admin/pending-authorities", protect, authorize("admin"), listPendingAuthorities);
router.patch("/admin/verify-authority/:id", protect, authorize("admin"), verifyAuthority);

export default router;
