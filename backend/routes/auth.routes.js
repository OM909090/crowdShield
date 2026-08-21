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
  verifyOtp,
  resendOtp,
  googleAuth,
  completeGoogleSignup,
  forgotPassword,
  resetPassword,
  verifyResetOtp,
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

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8, // ~1 guess per 75s on average within the window — plenty for a real user, not for brute force
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please wait a few minutes and try again." },
});

router.post("/signup", authLimiter, signupValidator, validate, signup);
router.post("/login", authLimiter, loginValidator, validate, login);
router.post("/refresh", authLimiter, refresh);
router.post("/logout", protect, logout);
router.get("/me", protect, getMe);
router.post("/verify-otp", otpLimiter, verifyOtp);
router.post("/resend-otp", otpLimiter, resendOtp);
router.post("/google", googleAuth);
router.post("/google/complete", completeGoogleSignup);
router.post("/forgot-password", otpLimiter, forgotPassword);
router.post("/verify-reset-otp", otpLimiter, verifyResetOtp)
router.post("/reset-password", otpLimiter, resetPassword);

// Admin-only: approve authority accounts before they can publish events
router.get("/admin/pending-authorities", protect, authorize("admin"), listPendingAuthorities);
router.patch("/admin/verify-authority/:id", protect, authorize("admin"), verifyAuthority);

export default router;
