import jwt from "jsonwebtoken";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import User from "../models/User.js";

/**
 * Verifies the short-lived access token cookie and attaches the user to req.
 * Frontend should call POST /api/auth/refresh when this returns 401 and
 * retry the original request once.
 */
export const protect = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.accessToken;
  if (!token) throw new ApiError(401, "You must be logged in to access this resource");

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch {
    throw new ApiError(401, "Session expired or invalid, please log in again");
  }

  const user = await User.findById(decoded.sub);
  if (!user) throw new ApiError(401, "User no longer exists");

  req.user = user;
  next();
});

/**
 * Restricts a route to specific roles. Use after `protect`.
 * e.g. router.get("/control-room/summary", protect, authorize("authority"), handler)
 */
export const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    throw new ApiError(403, "You do not have permission to perform this action");
  }
  next();
};

/**
 * Extra gate for authority-only endpoints: blocks accounts pending manual review.
 */
export const requireVerifiedAuthority = (req, res, next) => {
  if (req.user.role === "authority" && !req.user.isVerifiedAuthority) {
    throw new ApiError(403, "Your authority account is pending verification");
  }
  next();
};
