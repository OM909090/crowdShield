import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * ProviderConfig — the deploying operator's chosen LLM provider.
 *
 * This is a SINGLETON: there is exactly one active provider config for the
 * whole deployment. Singleton-ness is enforced by a fixed, unique `key`
 * ("active"), so upserts always target the same row.
 *
 * The provider is any OpenAI-compatible endpoint: the operator supplies a
 * `baseUrl` + API key, we discover its `/models`, they pick one, and we store
 * it here. The raw key is never persisted — only its AES-GCM ciphertext in
 * `apiKeyEnc` (see utils/cryptoBox.js), which is `select:false` so it never
 * leaks into ordinary reads.
 */

// Lifecycle of the last known health check against the provider.
export const PROVIDER_STATUSES = ["unconfigured", "ok", "error"];

const providerConfigSchema = new Schema(
  {
    // Singleton anchor. Always "active"; the unique index makes a second
    // document impossible.
    key: { type: String, default: "active", unique: true },

    baseUrl: { type: String, trim: true, required: true },

    // AES-256-GCM ciphertext of the API key (never the plaintext). Hidden by
    // default; callers that genuinely need it must `.select("+apiKeyEnc")`.
    apiKeyEnc: { type: String, select: false },

    model: { type: String, trim: true },
    label: { type: String, trim: true, maxlength: 80 },

    status: { type: String, enum: PROVIDER_STATUSES, default: "unconfigured" },
    lastTestedAt: { type: Date },
    lastError: { type: String },

    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Normalize baseUrl so `${baseUrl}/models` and `${baseUrl}/chat/completions`
// are always well-formed regardless of trailing slashes the operator pastes.
providerConfigSchema.pre("save", function normalizeBaseUrl(next) {
  if (typeof this.baseUrl === "string") {
    this.baseUrl = this.baseUrl.trim().replace(/\/+$/, "");
  }
  next();
});

const ProviderConfig = mongoose.model("ProviderConfig", providerConfigSchema);

/**
 * Load the singleton config. Returns a Query (await it), and by design does NOT
 * include the encrypted key (apiKeyEnc is select:false). Chain
 * `.select("+apiKeyEnc")` when you actually need to decrypt it.
 */
export function getSingleton() {
  return ProviderConfig.findOne({ key: "active" });
}

export default ProviderConfig;
