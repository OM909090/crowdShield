import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { generateOtp, hashOtp } from "../utils/otp.js";
import { sendOtpEmail } from "../utils/sendEmail.js";
import { UPLOAD_DIR, removeUpload } from "../utils/upload.js";
import {
  signAccessToken,
  signRefreshToken,
  hashToken,
  setAuthCookies,
  clearAuthCookies,
} from "../utils/token.js";

const MAX_ACTIVE_SESSIONS = 5; // cap concurrent refresh tokens per user
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const isProd = process.env.NODE_ENV === "production";

// Only construct a Google client when a client id is present, so a server
// without Google configured still boots — the /google endpoints just report
// "not configured" instead of crashing at import time.
const googleClient = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;

const issueSession = async (res, user, { rememberMe = false } = {}) => {
  const accessToken = signAccessToken(user._id, user.role);
  const refreshToken = signRefreshToken(user._id, { rememberMe });

  user.refreshTokens.push({ token: hashToken(refreshToken) });
  if (user.refreshTokens.length > MAX_ACTIVE_SESSIONS) {
    user.refreshTokens = user.refreshTokens.slice(-MAX_ACTIVE_SESSIONS);
  }
  // Only the server-controlled refreshTokens array changed here, so skip full
  // document re-validation — otherwise a legacy/seeded account that predates a
  // newly-required field (e.g. location) could no longer log in.
  await user.save({ validateBeforeSave: false });

  setAuthCookies(res, accessToken, refreshToken, { rememberMe });
};

// Accepts location either as nested { location: { latitude, longitude } } (JSON
// signups) or as flat latitude/longitude form fields (multipart signups, where
// nested objects don't survive FormData). Returns a GeoJSON Point or null.
const resolveLocation = (body) => {
  const lat = body?.location?.latitude ?? body?.latitude;
  const lng = body?.location?.longitude ?? body?.longitude;
  if (lat == null || lng == null || lat === "" || lng === "") return null;
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (Number.isNaN(latNum) || Number.isNaN(lngNum)) return null;
  return { type: "Point", coordinates: [lngNum, latNum] };
};

const idCardFrom = (file) =>
  file
    ? {
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
      }
    : undefined;

// ---- Signup (email OTP required before login) ----

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
  } = req.body;

  const location = resolveLocation(req.body);
  if (!location) {
    removeUpload(req.file?.filename);
    throw new ApiError(400, "Location access is required to create an account");
  }

  const existing = await User.findOne({
    $or: [{ email: (email || "").toLowerCase() }, { mobile }],
  });
  if (existing) {
    removeUpload(req.file?.filename);
    throw new ApiError(409, "An account with this email or mobile already exists");
  }

  // If both email and mobile match the reserved admin credentials in .env, this
  // signup becomes the system admin regardless of the role picked on the form —
  // the credential match decides it, not the dropdown.
  const normalizedEmail = (email || "").toLowerCase().trim();
  const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const adminMobile = (process.env.ADMIN_MOBILE || "").trim();
  const isReservedAdmin =
    adminEmail && adminMobile && normalizedEmail === adminEmail && String(mobile).trim() === adminMobile;

  const resolvedRole = isReservedAdmin ? "admin" : role || "citizen";

  // Authority accounts must upload a government / organization ID document so an
  // admin can verify them before dashboard access is granted.
  if (resolvedRole === "authority" && !req.file) {
    throw new ApiError(
      400,
      "Authority accounts must upload a valid government / organization ID for verification"
    );
  }

  const otp = generateOtp();

  let user;
  try {
    user = await User.create({
      name,
      mobile,
      email,
      age,
      gender,
      emergencyContact,
      language,
      password,
      role: resolvedRole,
      organizationId: resolvedRole === "authority" ? organizationId : undefined,
      idCard: resolvedRole === "authority" ? idCardFrom(req.file) : undefined,
      location,
      isVerified: false,
      otp: { codeHash: hashOtp(otp), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });
  } catch (err) {
    removeUpload(req.file?.filename); // don't orphan the upload if the insert fails
    throw err;
  }

  const { delivered } = await sendOtpEmail(user.email, otp, user.name);

  res.status(201).json({
    message: delivered
      ? "Verification code sent to your email"
      : "Account created — enter the verification code to continue",
    userId: user._id,
    email: user.email,
    role: user.role,
    // Dev convenience: with no SMTP configured, hand the code straight back so
    // local testing needs no inbox. Never present when email actually delivered.
    ...(delivered || isProd ? {} : { devOtp: otp }),
  });
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const { userId, otp } = req.body;

  const user = await User.findById(userId).select("+otp");
  if (!user) throw new ApiError(404, "Account not found");
  if (user.isVerified) throw new ApiError(400, "Account already verified");
  if (!user.otp?.codeHash || user.otp.expiresAt < new Date()) {
    throw new ApiError(400, "Code expired, request a new one");
  }
  if (hashOtp(otp) !== user.otp.codeHash) {
    throw new ApiError(400, "Incorrect verification code");
  }

  user.isVerified = true;
  user.otp = undefined;
  await issueSession(res, user);

  res.status(200).json({
    message:
      user.role === "authority"
        ? "Verified. Your authority access is pending admin approval."
        : "Account verified successfully",
    user: user.toSafeObject(),
  });
});

export const resendOtp = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "Account not found");
  if (user.isVerified) throw new ApiError(400, "Account already verified");

  const otp = generateOtp();
  user.otp = { codeHash: hashOtp(otp), expiresAt: new Date(Date.now() + OTP_TTL_MS) };
  await user.save();
  const { delivered } = await sendOtpEmail(user.email, otp, user.name);

  res.status(200).json({
    message: delivered ? "A new code has been sent" : "A new code has been generated",
    ...(delivered || isProd ? {} : { devOtp: otp }),
  });
});

// ---- Google Sign-In ----

export const googleAuth = asyncHandler(async (req, res) => {
  if (!googleClient) throw new ApiError(501, "Google sign-in is not configured on this server");

  const { credential } = req.body;
  if (!credential) throw new ApiError(400, "Missing Google credential");

  // google-auth-library throws raw parse/verification errors (wrong audience,
  // expired, malformed). Translate them into a clean 401 rather than letting a
  // 500 with internal token-parsing details reach the client.
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    console.error("[google-auth] token verification failed:", err.message);
    throw new ApiError(401, "Google sign-in could not be verified. Please try again.");
  }

  if (!payload?.email) throw new ApiError(401, "Google account has no usable email address");
  if (payload.email_verified === false) {
    throw new ApiError(401, "This Google account's email is not verified");
  }

  let user = await User.findOne({ email: payload.email });

  if (!user) {
    // Brand-new Google user — still needs mobile/age/location etc before an account can exist
    return res.status(200).json({
      newUser: true,
      profile: { name: payload.name, email: payload.email, googleId: payload.sub },
    });
  }

  if (!user.googleId) {
    user.googleId = payload.sub;
    await user.save();
  }

  await issueSession(res, user);
  res.status(200).json({ message: "Logged in with Google", user: user.toSafeObject() });
});

export const completeGoogleSignup = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    googleId,
    mobile,
    age,
    gender,
    emergencyContact,
    language,
    role,
    organizationId,
  } = req.body;

  const location = resolveLocation(req.body);
  if (!location) {
    removeUpload(req.file?.filename);
    throw new ApiError(400, "Location access is required to create an account");
  }
  if (!googleId || !email) {
    removeUpload(req.file?.filename);
    throw new ApiError(400, "Missing Google identity — restart the Google sign-up");
  }

  const existing = await User.findOne({ $or: [{ email: email.toLowerCase() }, { mobile }] });
  if (existing) {
    removeUpload(req.file?.filename);
    throw new ApiError(409, "An account with this email or mobile already exists");
  }

  const resolvedRole = role === "authority" ? "authority" : "citizen";
  if (resolvedRole === "authority" && !req.file) {
    throw new ApiError(
      400,
      "Authority accounts must upload a valid government / organization ID for verification"
    );
  }

  let user;
  try {
    user = await User.create({
      name,
      email,
      mobile,
      age,
      gender,
      emergencyContact,
      language,
      googleId,
      role: resolvedRole,
      organizationId: resolvedRole === "authority" ? organizationId : undefined,
      idCard: resolvedRole === "authority" ? idCardFrom(req.file) : undefined,
      location,
      isVerified: true, // Google already verified the email
    });
  } catch (err) {
    removeUpload(req.file?.filename);
    throw err;
  }

  await issueSession(res, user);
  res.status(201).json({ message: "Account created with Google", user: user.toSafeObject() });
});

// ---- Login ----

export const login = asyncHandler(async (req, res) => {
  const { identifier, password, rememberMe } = req.body;

  const user = await User.findOne({
    $or: [{ email: identifier.toLowerCase() }, { mobile: identifier }],
  }).select("+password");

  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, "Invalid credentials");
  }

  if (!user.isVerified) {
    throw new ApiError(403, "Please verify your account first");
  }

  await issueSession(res, user, { rememberMe: !!rememberMe });

  res.status(200).json({
    message: "Logged in successfully",
    user: user.toSafeObject(),
  });
});

// ---- Forgot / Reset Password ----

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw new ApiError(400, "Email is required");

  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  // Respond identically whether or not the account exists — never leak which
  // emails are registered. Only actually send mail if it's real.
  let devOtp;
  if (user) {
    const otp = generateOtp();
    user.otp = { codeHash: hashOtp(otp), expiresAt: new Date(Date.now() + OTP_TTL_MS) };
    await user.save();
    const { delivered } = await sendOtpEmail(user.email, otp, user.name);
    if (!delivered && !isProd) devOtp = otp;
  }

  res.status(200).json({
    message: "If that email is registered, a reset code has been sent.",
    ...(devOtp ? { devOtp } : {}),
  });
});

// Checks the code without consuming it — lets the frontend confirm the code is
// right before the user types a new password. resetPassword re-validates it.
export const verifyResetOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) throw new ApiError(400, "Email and code are required");

  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail }).select("+otp");

  if (!user || !user.otp?.codeHash || user.otp.expiresAt < new Date()) {
    throw new ApiError(400, "Invalid or expired code");
  }
  if (hashOtp(otp) !== user.otp.codeHash) {
    throw new ApiError(400, "Invalid or expired code");
  }

  res.status(200).json({ message: "Code verified" });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    throw new ApiError(400, "Email, code, and new password are required");
  }
  if (newPassword.length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters");
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail }).select("+otp +password");

  if (!user || !user.otp?.codeHash || user.otp.expiresAt < new Date()) {
    throw new ApiError(400, "Invalid or expired code");
  }
  if (hashOtp(otp) !== user.otp.codeHash) {
    throw new ApiError(400, "Invalid or expired code");
  }

  user.password = newPassword; // pre-save hook rehashes it
  user.otp = undefined;
  user.isVerified = true; // proving control of the inbox is itself proof of ownership

  await issueSession(res, user); // logs them straight in with the new password

  res.status(200).json({
    message: "Password reset successfully",
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
  const users = await User.find({ role: "authority", isVerifiedAuthority: false })
    .select("name email mobile organizationId idCard age gender createdAt")
    .sort({ createdAt: -1 });

  const shaped = users.map((u) => ({
    _id: u._id,
    name: u.name,
    email: u.email,
    mobile: u.mobile,
    organizationId: u.organizationId,
    age: u.age,
    gender: u.gender,
    createdAt: u.createdAt,
    idCard: u.idCard?.filename
      ? {
          hasCard: true,
          originalName: u.idCard.originalName,
          mimeType: u.idCard.mimeType,
          uploadedAt: u.idCard.uploadedAt,
        }
      : null,
  }));

  res.status(200).json({ users: shaped });
});

// Streams the uploaded ID document back to an admin for review. Kept behind
// admin auth (never a public/static link) because the file is sensitive PII.
export const getAuthorityIdCard = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select("idCard role");
  if (!user || !user.idCard?.filename) {
    throw new ApiError(404, "No ID document on file for this account");
  }

  const filePath = path.join(UPLOAD_DIR, user.idCard.filename);
  if (!fs.existsSync(filePath)) throw new ApiError(404, "ID document file is missing");

  res.setHeader("Content-Type", user.idCard.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="idcard-${user._id}"`);
  res.setHeader("Cache-Control", "private, no-store");
  fs.createReadStream(filePath).pipe(res);
});

export const verifyAuthority = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || user.role !== "authority") throw new ApiError(404, "Authority account not found");

  user.isVerifiedAuthority = true;
  await user.save();

  res.status(200).json({ message: "Authority account approved", user: user.toSafeObject() });
});

export const rejectAuthority = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || user.role !== "authority") throw new ApiError(404, "Authority account not found");
  if (user.isVerifiedAuthority) throw new ApiError(400, "This authority is already approved");

  removeUpload(user.idCard?.filename); // drop the uploaded document too
  await user.deleteOne();

  res.status(200).json({ message: "Authority request rejected and removed" });
});
