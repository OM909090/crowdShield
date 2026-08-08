import jwt from "jsonwebtoken";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  signAccessToken,
  signRefreshToken,
  hashToken,
  setAuthCookies,
  clearAuthCookies,
} from "../utils/token.js";

const MAX_ACTIVE_SESSIONS = 5; // cap concurrent refresh tokens per user

const issueSession = async (res, user, { rememberMe = false } = {}) => {
  const accessToken = signAccessToken(user._id, user.role);
  const refreshToken = signRefreshToken(user._id, { rememberMe });

  user.refreshTokens.push({ token: hashToken(refreshToken) });
  // Keep only the most recent sessions to stop unbounded array growth
  if (user.refreshTokens.length > MAX_ACTIVE_SESSIONS) {
    user.refreshTokens = user.refreshTokens.slice(-MAX_ACTIVE_SESSIONS);
  }
  await user.save();

  setAuthCookies(res, accessToken, refreshToken, { rememberMe });
};

export const signup = asyncHandler(async (req, res) => {
  const {
    name,
    mobile,
    email,
    age,
    gender,
    emergencyContact,
    language,
    password,
    role,
    organizationId,
    location,
  } = req.body;

  const existing = await User.findOne({ $or: [{ email }, { mobile }] });
  if (existing) throw new ApiError(409, "An account with this email or mobile already exists");

  const user = await User.create({
    name,
    mobile,
    email,
    age,
    gender,
    emergencyContact,
    language,
    password,
    role: role || "citizen",
    organizationId: role === "authority" ? organizationId : undefined,
    location:
      location?.latitude != null && location?.longitude != null
        ? { type: "Point", coordinates: [location.longitude, location.latitude] }
        : undefined,
  });

  await issueSession(res, user);

  res.status(201).json({
    message:
      user.role === "authority"
        ? "Account created. Your authority access is pending verification."
        : "Account created successfully",
    user: user.toSafeObject(),
  });
});

export const login = asyncHandler(async (req, res) => {
  const { identifier, password, rememberMe } = req.body;

  const user = await User.findOne({
    $or: [{ email: identifier.toLowerCase() }, { mobile: identifier }],
  }).select("+password");

  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, "Invalid credentials");
  }

  await issueSession(res, user, { rememberMe: !!rememberMe });

  res.status(200).json({
    message: "Logged in successfully",
    user: user.toSafeObject(),
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) throw new ApiError(401, "No refresh token provided");

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new ApiError(401, "Refresh token invalid or expired, please log in again");
  }

  const user = await User.findById(decoded.sub);
  const hashed = hashToken(token);

  if (!user || !user.refreshTokens.some((rt) => rt.token === hashed)) {
    throw new ApiError(401, "Refresh token not recognized, please log in again");
  }

  // Rotate: invalidate the used refresh token, issue a fresh pair
  user.refreshTokens = user.refreshTokens.filter((rt) => rt.token !== hashed);
  await issueSession(res, user);

  res.status(200).json({ message: "Session refreshed" });
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;

  if (token) {
    const hashed = hashToken(token);
    req.user.refreshTokens = req.user.refreshTokens.filter((rt) => rt.token !== hashed);
    await req.user.save();
  }

  clearAuthCookies(res);
  res.status(200).json({ message: "Logged out successfully" });
});

export const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({ user: req.user.toSafeObject() });
});

// ---- Admin: authority approval workflow ----

export const listPendingAuthorities = asyncHandler(async (req, res) => {
  const users = await User.find({ role: "authority", isVerifiedAuthority: false }).select(
    "name email mobile organizationId createdAt"
  );
  res.status(200).json({ users });
});

export const verifyAuthority = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || user.role !== "authority") throw new ApiError(404, "Authority account not found");

  user.isVerifiedAuthority = true;
  await user.save();

  res.status(200).json({ message: "Authority account verified", user: user.toSafeObject() });
});
