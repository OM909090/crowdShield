import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { generateOtp, hashOtp } from "../utils/otp.js";
import { sendOtpEmail } from "../utils/sendEmail.js";
import {
  signAccessToken,
  signRefreshToken,
  hashToken,
  setAuthCookies,
  clearAuthCookies,
} from "../utils/token.js";

const MAX_ACTIVE_SESSIONS = 5; // cap concurrent refresh tokens per user
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const issueSession = async (res, user, { rememberMe = false } = {}) => {
  const accessToken = signAccessToken(user._id, user.role);
  const refreshToken = signRefreshToken(user._id, { rememberMe });

  user.refreshTokens.push({ token: hashToken(refreshToken) });
  if (user.refreshTokens.length > MAX_ACTIVE_SESSIONS) {
    user.refreshTokens = user.refreshTokens.slice(-MAX_ACTIVE_SESSIONS);
  }
  await user.save();

  setAuthCookies(res, accessToken, refreshToken, { rememberMe });
};

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
    location,
  } = req.body;

  if (!location?.latitude || !location?.longitude) {
    throw new ApiError(400, "Location access is required to create an account");
  }

  const existing = await User.findOne({ $or: [{ email }, { mobile }] });
  if (existing) throw new ApiError(409, "An account with this email or mobile already exists");

  // If both the email and mobile match the reserved admin credentials in
  // .env, this signup becomes the system admin regardless of whichever role
  // was selected on the form — the credential match is what decides it, not
  // the dropdown.
  const normalizedEmail = email.toLowerCase().trim();
  const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const adminMobile = (process.env.ADMIN_MOBILE || "").trim();

  const isReservedAdmin =
    adminEmail &&
    adminMobile &&
    normalizedEmail === adminEmail &&
    mobile.trim() === adminMobile;
    
    console.log("Role=",isReservedAdmin)
    console.log("Admin email=",process.env.ADMIN_EMAIL)
    console.log("Admin mobile=",process.env.ADMIN_MOBILE)
    console.log("Form email=",email)
    console.log("Form mobile=",mobile)

  const resolvedRole = isReservedAdmin ? "admin" : role || "citizen";

  const otp = generateOtp();

  const user = await User.create({
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
    location: { type: "Point", coordinates: [location.longitude, location.latitude] },
    isVerified: false,
    otp: { codeHash: hashOtp(otp), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });

  await sendOtpEmail(user.email, otp, user.name);

  res.status(201).json({
    message: "Verification code sent to your email",
    userId: user._id,
    email: user.email,
  });
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const { userId, otp } = req.body;

  const user = await User.findById(userId).select("+otp");
  if (!user) throw new ApiError(404, "Account not found");

  
  console.log("OTP expiresAt:", user.otp?.expiresAt);
console.log("Current time:", new Date());
console.log("Expired:", user.otp?.expiresAt < new Date());

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
        ? "Verified. Your authority access is pending approval."
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
  await sendOtpEmail(user.email, otp, user.name);

  res.status(200).json({ message: "A new code has been sent" });
});

// ---- Google Sign-In ----

export const googleAuth = asyncHandler(async (req, res) => {
  const { credential } = req.body;


  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

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
    location,
  } = req.body;

  if (!location?.latitude || !location?.longitude) {
    throw new ApiError(400, "Location access is required to create an account");
  }

  const existing = await User.findOne({ $or: [{ email }, { mobile }] });
  if (existing) throw new ApiError(409, "An account with this email or mobile already exists");

  const user = await User.create({
    name,
    email,
    mobile,
    age,
    gender,
    emergencyContact,
    language,
    googleId,
    role: role || "citizen",
    organizationId: role === "authority" ? organizationId : undefined,
    location: { type: "Point", coordinates: [location.longitude, location.latitude] },
    isVerified: true, // Google already verified the email
  });

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

// ---- Forgot / Reset Password ----

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw new ApiError(400, "Email is required");

  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  // Respond identically whether or not the account exists — never leak
  // which emails are registered. Only actually send mail if it's real.
  if (user) {
    const otp = generateOtp();
    user.otp = { codeHash: hashOtp(otp), expiresAt: new Date(Date.now() + OTP_TTL_MS) };
    await user.save();
    await sendOtpEmail(user.email, otp, user.name);
  }

  res.status(200).json({
    message: "If that email is registered, a reset code has been sent.",
  });
});

// Checks the code without consuming it — lets the frontend confirm the code
// is right before the user moves on to typing a new password. resetPassword
// re-validates the same code again before actually changing anything.
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