import crypto from "crypto";

// 6-digit numeric one-time code. randomInt is cryptographically strong.
export const generateOtp = () => String(crypto.randomInt(100000, 1000000));

// We only ever persist the SHA-256 hash of the code, never the code itself —
// a leaked DB snapshot can't be replayed against verify-otp.
export const hashOtp = (otp) => crypto.createHash("sha256").update(String(otp)).digest("hex");
