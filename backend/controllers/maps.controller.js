/**
 * maps.controller — bring-your-own Google Maps key settings.
 *
 *   GET  /api/ai/maps       (authority/admin, verified) -> getMaps   (masked)
 *   POST /api/ai/maps       (authority/admin, verified) -> saveMaps
 *   POST /api/ai/maps/test  (authority/admin, verified) -> testMaps
 *
 * Mirrors provider.controller: the raw key is encrypted at rest and never
 * returned (only `hasKey`). Google Maps is optional — the agent only reaches
 * for it when enabled, and falls back to the in-venue router otherwise.
 */
import MapsConfig from "../models/MapsConfig.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { encryptSecret, decryptSecret } from "../utils/cryptoBox.js";
import { testMapsConfig } from "../services/googleMaps.js";
import { routingInfo, computeWalkingRoutes } from "../services/routing/index.js";

/** Client-safe view — never includes the key. */
function maskMaps(cfg) {
  if (!cfg) return null;
  return {
    routesBaseUrl: cfg.routesBaseUrl,
    placesBaseUrl: cfg.placesBaseUrl,
    enabled: cfg.enabled,
    hasKey: !!cfg.apiKeyEnc,
    status: cfg.status,
    lastTestedAt: cfg.lastTestedAt || null,
    updatedAt: cfg.updatedAt,
  };
}

export const getMaps = asyncHandler(async (req, res) => {
  const cfg = await MapsConfig.findOne({ key: "active" }).select("+apiKeyEnc");
  res.status(200).json({ config: maskMaps(cfg) });
});

export const saveMaps = asyncHandler(async (req, res) => {
  const { apiKey, routesBaseUrl, placesBaseUrl, enabled } = req.body;

  let cfg = await MapsConfig.findOne({ key: "active" }).select("+apiKeyEnc");
  if (!cfg) cfg = new MapsConfig({ key: "active" });

  if (routesBaseUrl !== undefined) cfg.routesBaseUrl = routesBaseUrl;
  if (placesBaseUrl !== undefined) cfg.placesBaseUrl = placesBaseUrl;
  if (typeof enabled === "boolean") cfg.enabled = enabled;
  if (apiKey) cfg.apiKeyEnc = encryptSecret(apiKey);

  if (cfg.enabled && !cfg.apiKeyEnc) {
    throw new ApiError(422, "A Google Maps API key is required to enable Maps.");
  }

  cfg.updatedBy = req.user._id;

  // Validate against the endpoint when we have something usable, but never hard
  // fail the save — record the outcome + a warning instead.
  let warning;
  if (cfg.enabled && cfg.apiKeyEnc) {
    try {
      await testMapsConfig({
        apiKey: decryptSecret(cfg.apiKeyEnc),
        routesBaseUrl: cfg.routesBaseUrl,
        placesBaseUrl: cfg.placesBaseUrl,
      });
      cfg.status = "ok";
      cfg.lastError = undefined;
    } catch (err) {
      cfg.status = "error";
      cfg.lastError = err.message;
      warning = `Saved, but the test call failed: ${err.message}`;
    }
    cfg.lastTestedAt = new Date();
  } else {
    cfg.status = "unconfigured";
  }

  await cfg.save();
  res.status(200).json({ config: maskMaps(cfg), ...(warning ? { warning } : {}) });
});

export const testMaps = asyncHandler(async (req, res) => {
  const cfg = await MapsConfig.findOne({ key: "active" }).select("+apiKeyEnc");
  if (!cfg || !cfg.apiKeyEnc) {
    return res.status(200).json({ ok: false, message: "No Google Maps key configured." });
  }
  try {
    await testMapsConfig({
      apiKey: decryptSecret(cfg.apiKeyEnc),
      routesBaseUrl: cfg.routesBaseUrl,
      placesBaseUrl: cfg.placesBaseUrl,
    });
    cfg.status = "ok";
    cfg.lastError = undefined;
    cfg.lastTestedAt = new Date();
    await cfg.save();
    res.status(200).json({ ok: true, message: "Google Maps connection OK." });
  } catch (err) {
    cfg.status = "error";
    cfg.lastError = err.message;
    cfg.lastTestedAt = new Date();
    await cfg.save();
    res.status(200).json({ ok: false, message: err.message });
  }
});

/**
 * GET /api/ai/routing — which routing engine is live, and can we reach it?
 *
 * Operational visibility for the thing citizens depend on. Without this, a
 * flaky/unreachable engine only shows up as "no route available" on a phone,
 * which is indistinguishable from "the crowd is blocked" — a dangerous
 * ambiguity. Runs a real probe so the answer reflects reality, not config.
 */
export const getRoutingStatus = asyncHandler(async (req, res) => {
  const info = await routingInfo();

  let probe = { ok: false, message: "not probed" };
  const startedAt = Date.now();
  try {
    const routes = await computeWalkingRoutes({
      // A short hop near the equator-agnostic default; any two nearby points work.
      origin: [19.803, 85.831],
      destination: [19.8044, 85.831],
      alternatives: false,
    });
    probe = routes.length
      ? { ok: true, message: `Reachable — returned ${routes.length} route(s).`, latencyMs: Date.now() - startedAt }
      : { ok: false, message: "Engine answered but returned no route.", latencyMs: Date.now() - startedAt };
  } catch (err) {
    probe = {
      ok: false,
      message: err?.message || "The routing engine could not be reached.",
      kind: err?.kind,
      latencyMs: Date.now() - startedAt,
    };
  }

  res.status(200).json({ routing: { ...info, probe } });
});
