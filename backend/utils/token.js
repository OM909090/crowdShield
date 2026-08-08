import jwt from "jsonwebtoken";
import crypto from "crypto";

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days (default)
const REFRESH_TOKEN_MAX_AGE_EXTENDED = 30 * 24 * 60 * 60 * 1000; // 30 days ("remember me")

export const signAccessToken = (userId, role) =>
  jwt.sign({ sub: userId.toString(), role }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || "15m",
  });

export const signRefreshToken = (userId, { rememberMe = false } = {}) =>
  jwt.sign({ sub: userId.toString() }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: rememberMe ? "30d" : process.env.JWT_REFRESH_EXPIRES || "7d",
  });

// Refresh tokens are stored server-side as a SHA-256 hash so a leaked DB
// snapshot alone can't be replayed as a valid cookie.
export const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const baseCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/",
};

export const setAuthCookies = (res, accessToken, refreshToken, { rememberMe = false } = {}) => {
  res.cookie("accessToken", accessToken, { ...baseCookieOptions, maxAge: ACCESS_TOKEN_MAX_AGE });
  res.cookie("refreshToken", refreshToken, {
    ...baseCookieOptions,
    maxAge: rememberMe ? REFRESH_TOKEN_MAX_AGE_EXTENDED : REFRESH_TOKEN_MAX_AGE,
  });
};

export const clearAuthCookies = (res) => {
  res.clearCookie("accessToken", baseCookieOptions);
  res.clearCookie("refreshToken", baseCookieOptions);
};
