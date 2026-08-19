/**
 * cryptoBox — tiny symmetric secret box for provider API keys.
 *
 * We never store a user-supplied LLM API key in plaintext. This wraps
 * AES-256-GCM (authenticated encryption) so a leaked DB row can't reveal the
 * key without the server's env secret, and any tampering with the stored
 * ciphertext is detected (the auth tag check fails on decrypt).
 *
 * Encoding: the returned string is `iv:authTag:ciphertext`, all hex.
 *
 * Key derivation: the 32-byte AES key is sha256(secret), where `secret` is,
 * in order of preference:
 *   1. process.env.PROVIDER_ENC_SECRET  (recommended — dedicated key)
 *   2. process.env.JWT_ACCESS_SECRET    (reuse the existing app secret)
 *   3. a hardcoded DEV-ONLY fallback    (so local dev works with no config)
 *
 * NOTE: rotating the secret makes previously-stored keys undecryptable; callers
 * treat a failed decrypt as "no usable key" and prompt for re-entry.
 */
import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce — the size recommended for GCM
const TAG_BYTES = 16; // GCM auth tag is always 128-bit

// DEV-ONLY: used only when neither PROVIDER_ENC_SECRET nor JWT_ACCESS_SECRET is
// set. Never rely on this in production — set PROVIDER_ENC_SECRET instead.
const DEV_FALLBACK_SECRET = "crowdshield-dev-only-provider-enc-secret-change-me";

const isHex = (s) =>
  typeof s === "string" && s.length > 0 && s.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(s);

/** Derive the 32-byte AES-256 key from the configured env secret. */
function resolveKey() {
  const secret =
    process.env.PROVIDER_ENC_SECRET || process.env.JWT_ACCESS_SECRET || DEV_FALLBACK_SECRET;
  // sha256 always yields exactly 32 bytes — precisely the AES-256 key length.
  return crypto.createHash("sha256").update(String(secret)).digest();
}

/**
 * Encrypt a plaintext secret.
 * @param {string} plain
 * @returns {string} `iv:authTag:ciphertext` (hex)
 */
export function encryptSecret(plain) {
  if (plain === undefined || plain === null) {
    throw new Error("encryptSecret: nothing to encrypt");
  }
  const key = resolveKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/**
 * Decrypt a payload produced by encryptSecret.
 * @param {string} payload `iv:authTag:ciphertext` (hex)
 * @returns {string} the original plaintext
 * @throws if the payload is malformed or fails authentication
 */
export function decryptSecret(payload) {
  if (typeof payload !== "string" || !payload) {
    throw new Error("decryptSecret: payload must be a non-empty string");
  }

  const parts = payload.split(":");
  if (parts.length !== 3) throw new Error("decryptSecret: malformed payload");

  const [ivHex, tagHex, dataHex] = parts;
  if (!isHex(ivHex) || !isHex(tagHex) || !isHex(dataHex)) {
    throw new Error("decryptSecret: malformed payload (invalid hex)");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(dataHex, "hex");
  if (iv.length !== IV_BYTES || authTag.length !== TAG_BYTES || ciphertext.length === 0) {
    throw new Error("decryptSecret: malformed payload (bad segment lengths)");
  }

  const key = resolveKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  // decipher.final() throws if the tag doesn't verify (tampered/wrong key).
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

export default { encryptSecret, decryptSecret };
