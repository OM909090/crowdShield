/**
 * LLM provider configuration subsystem.
 *
 * Lets the deploying operator point CrowdShield at any OpenAI-compatible
 * endpoint: enter a base URL (+ API key), discover the models it exposes, pick
 * one, and persist it server-side. The stored key is encrypted at rest and
 * never returned to the client — responses expose only a `hasKey` boolean.
 *
 * Intended routes (wired up in the routes layer — NOT in this file):
 *   GET  /api/ai/provider           (protect, authorize("authority","admin"), requireVerifiedAuthority)  -> getConfig
 *   POST /api/ai/provider/discover  (protect, authorize("authority","admin"), requireVerifiedAuthority)  -> discoverModels
 *   POST /api/ai/provider           (protect, authorize("authority","admin"), requireVerifiedAuthority)  -> saveConfig
 *   POST /api/ai/provider/test      (protect, authorize("authority","admin"), requireVerifiedAuthority)  -> testConnection
 *
 * discoverModels + saveConfig expect their respective validators
 * (validators/provider.validator.js) to run first via the validate middleware.
 */
import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ProviderConfig, { getSingleton } from "../models/ProviderConfig.js";
import { encryptSecret, decryptSecret } from "../utils/cryptoBox.js";
import { listModels, chat } from "../services/llmProvider.js";

/** Client-safe view of the config. Never includes the (encrypted) key. */
const maskConfig = (doc) => {
  if (!doc) return null;
  return {
    baseUrl: doc.baseUrl,
    model: doc.model || "",
    label: doc.label || "",
    hasKey: Boolean(doc.apiKeyEnc),
    status: doc.status || "unconfigured",
    lastTestedAt: doc.lastTestedAt || null,
    updatedAt: doc.updatedAt || null,
  };
};

/** True only for a syntactically valid http(s) URL. */
const isHttpUrl = (value) => {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

const normalizeBaseUrl = (value) => value.trim().replace(/\/+$/, "");

/** Decrypt the stored key, tolerating an unreadable one (returns ""). */
const readStoredKey = (doc) => {
  if (!doc?.apiKeyEnc) return "";
  try {
    return decryptSecret(doc.apiKeyEnc);
  } catch {
    return "";
  }
};

/**
 * GET — return the current (masked) config, or null if never configured.
 */
export const getConfig = asyncHandler(async (req, res) => {
  const doc = await getSingleton().select("+apiKeyEnc");
  res.status(200).json({ config: maskConfig(doc) });
});

/**
 * POST — discover the models a provider exposes.
 * Body: { baseUrl, apiKey? }. When apiKey is omitted we reuse the stored key so
 * the operator can re-discover without re-typing the secret.
 *
 * Provider-side failures are reported as HTTP 200 { ok:false, kind, message }
 * so the UI can render a friendly state instead of handling a thrown error.
 */
export const discoverModels = asyncHandler(async (req, res) => {
  const { baseUrl } = req.body;
  let { apiKey } = req.body;

  if (!isHttpUrl(baseUrl)) {
    throw new ApiError(422, "Base URL must be a valid http(s) URL");
  }

  if (!apiKey) {
    const doc = await getSingleton().select("+apiKeyEnc");
    apiKey = readStoredKey(doc);
  }

  try {
    const models = await listModels({ baseUrl: normalizeBaseUrl(baseUrl), apiKey });
    res.status(200).json({ ok: true, models });
  } catch (err) {
    res.status(200).json({
      ok: false,
      kind: err.kind || "bad_response",
      message: err.message || "Could not list models from the provider",
    });
  }
});

/**
 * POST — create/update the singleton config.
 * Body: { baseUrl, apiKey?, model, label? }.
 *   - apiKey provided        -> encrypt + store
 *   - apiKey omitted, key set -> keep the existing key
 *   - apiKey omitted, no key  -> 422 (a key is required at least once)
 *
 * A lightweight listModels() probe sets status ok/error, but a failing probe
 * NEVER blocks the save — we persist and return a `warning` instead.
 */
export const saveConfig = asyncHandler(async (req, res) => {
  const { baseUrl, model, label, apiKey } = req.body;

  if (!isHttpUrl(baseUrl)) {
    throw new ApiError(422, "Base URL must be a valid http(s) URL");
  }
  if (typeof model !== "string" || !model.trim()) {
    throw new ApiError(422, "A model must be selected");
  }

  const cleanBaseUrl = normalizeBaseUrl(baseUrl);
  const doc = (await getSingleton().select("+apiKeyEnc")) || new ProviderConfig({ key: "active" });

  doc.baseUrl = cleanBaseUrl;
  doc.model = model.trim();
  if (label !== undefined) doc.label = label;
  doc.updatedBy = req.user?._id;

  // Resolve the key we'll validate against, applying the keep/replace rules.
  let effectiveKey;
  if (apiKey) {
    doc.apiKeyEnc = encryptSecret(apiKey);
    effectiveKey = apiKey;
  } else if (doc.apiKeyEnc) {
    effectiveKey = readStoredKey(doc);
  } else {
    throw new ApiError(422, "An API key is required to configure the provider");
  }

  // Lightweight, non-fatal validation of the just-entered settings.
  let warning;
  try {
    await listModels({ baseUrl: cleanBaseUrl, apiKey: effectiveKey });
    doc.status = "ok";
    doc.lastError = undefined;
  } catch (err) {
    doc.status = "error";
    doc.lastError = err.message || "Provider validation failed";
    warning = `Configuration saved, but the provider check failed: ${doc.lastError}`;
  }
  doc.lastTestedAt = new Date();

  await doc.save();

  res.status(200).json({ config: maskConfig(doc), ...(warning ? { warning } : {}) });
});

/**
 * POST — test connectivity. Tests the stored config by default, or an inline
 * { baseUrl, apiKey?, model? } if a valid baseUrl is supplied. Uses a minimal
 * chat when a model is known, else a models-list probe. Persists the result
 * (status/lastTestedAt/lastError) when testing the stored config.
 */
export const testConnection = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const inline = isHttpUrl(body.baseUrl);

  let baseUrl;
  let apiKey;
  let model;
  let doc = null;

  if (inline) {
    baseUrl = normalizeBaseUrl(body.baseUrl);
    apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
    model = typeof body.model === "string" ? body.model : "";

    // If testing the stored endpoint but no inline key, reuse the stored key.
    if (!apiKey) {
      const stored = await getSingleton().select("+apiKeyEnc");
      if (stored && normalizeBaseUrl(stored.baseUrl) === baseUrl) apiKey = readStoredKey(stored);
    }
  } else {
    doc = await getSingleton().select("+apiKeyEnc");
    if (!doc || !doc.baseUrl) {
      return res.status(200).json({ ok: false, message: "No provider is configured yet" });
    }
    baseUrl = doc.baseUrl;
    model = doc.model || "";
    apiKey = readStoredKey(doc);
  }

  let ok = false;
  let message;
  try {
    if (model) {
      await chat({
        baseUrl,
        apiKey,
        model,
        messages: [{ role: "user", content: "ping" }],
        maxTokens: 1,
        temperature: 0,
      });
    } else {
      await listModels({ baseUrl, apiKey });
    }
    ok = true;
    message = "Connection successful";
  } catch (err) {
    ok = false;
    message = err.message || "Connection failed";
  }

  if (doc) {
    doc.status = ok ? "ok" : "error";
    doc.lastError = ok ? undefined : message;
    doc.lastTestedAt = new Date();
    await doc.save();
  }

  res.status(200).json({ ok, message });
});
