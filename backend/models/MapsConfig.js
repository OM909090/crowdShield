import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * MapsConfig — the deploying operator's Google Maps Platform credentials.
 *
 * A SINGLETON (fixed unique `key` "active"), mirroring ProviderConfig. Google
 * Maps is an OPTIONAL enhancement: it supplies road/approach routing and place
 * context OUTSIDE the venue, which the agent fuses with CrowdShield's live
 * crowd risk. If this is unconfigured/disabled, the agent simply falls back to
 * the in-venue graph router — Maps is never a hard dependency.
 *
 * `routesBaseUrl`/`placesBaseUrl` are configurable so the integration can be
 * pointed at a mock endpoint in dev/test. The raw API key is never persisted —
 * only its AES-GCM ciphertext in `apiKeyEnc` (select:false).
 */

export const MAPS_STATUSES = ["unconfigured", "ok", "error"];

const DEFAULT_ROUTES_BASE = "https://routes.googleapis.com";
const DEFAULT_PLACES_BASE = "https://places.googleapis.com";

const mapsConfigSchema = new Schema(
  {
    key: { type: String, default: "active", unique: true },

    // AES-256-GCM ciphertext of the Maps API key (never plaintext). Hidden by
    // default; callers that need it must `.select("+apiKeyEnc")`.
    apiKeyEnc: { type: String, select: false },

    routesBaseUrl: { type: String, trim: true, default: DEFAULT_ROUTES_BASE },
    placesBaseUrl: { type: String, trim: true, default: DEFAULT_PLACES_BASE },

    // Master switch. Even with a key present, the agent only reaches for Maps
    // when enabled — so an operator can stage the key then turn it on.
    enabled: { type: Boolean, default: false },

    status: { type: String, enum: MAPS_STATUSES, default: "unconfigured" },
    lastTestedAt: { type: Date },
    lastError: { type: String },

    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Keep base URLs well-formed regardless of trailing slashes.
mapsConfigSchema.pre("save", function normalizeBaseUrls(next) {
  for (const field of ["routesBaseUrl", "placesBaseUrl"]) {
    if (typeof this[field] === "string") this[field] = this[field].trim().replace(/\/+$/, "");
  }
  next();
});

const MapsConfig = mongoose.model("MapsConfig", mapsConfigSchema);

/** Load the singleton (without the encrypted key; chain .select("+apiKeyEnc") if needed). */
export function getMapsSingleton() {
  return MapsConfig.findOne({ key: "active" });
}

export default MapsConfig;
