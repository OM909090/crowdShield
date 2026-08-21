import mongoose from "mongoose";
import bcrypt from "bcrypt";

const { Schema } = mongoose;

const pointSchema = new Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: [true, "Location coordinates are required"],
      validate: {
        validator: (val) => Array.isArray(val) && val.length === 2,
        message: "Coordinates must be [longitude, latitude]",
      },
    },
  },
  { _id: false }
);

const refreshTokenSchema = new Schema(
  {
    token: { type: String, required: true }, // stored as SHA-256 hash, never the raw JWT
    createdAt: { type: Date, default: Date.now, expires: "30d" }, // auto-purge stale entries
  },
  { _id: false }
);

const otpSchema = new Schema(
  {
    codeHash: { type: String },
    expiresAt: { type: Date },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },

    mobile: {
      type: String,
      required: true,
      unique: true,
      match: [/^[0-9]{10}$/, "Mobile number must be a valid 10-digit number"],
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    age: { type: Number, required: true, min: 1, max: 120 },

    gender: { type: String, required: true, enum: ["Male", "Female", "Other"] },

    emergencyContact: {
      type: String,
      required: true,
      match: [/^[0-9]{10}$/, "Emergency contact must be a valid 10-digit number"],
    },

    language: {
      type: String,
      required: true,
      enum: ["English", "Hindi", "Odia", "Other"],
    },

    // Optional now — Google accounts have no password. Required for everyone else.
    password: {
      type: String,
      required: [function () { return !this.googleId; }, "Password is required"],
      minlength: 6,
      select: false,
    },

    // Set when an account was created (or linked) via Google Sign-In.
    // Sparse so multiple docs can have googleId: undefined without violating uniqueness.
    googleId: { type: String, select: false, unique: true, sparse: true },

    // Citizens get instant access; authority accounts are gated behind admin
    // approval before they can publish events. Admins are seeded, not self-signed-up.
    role: { type: String, enum: ["citizen", "authority", "admin"], default: "citizen" },

    organizationId: {
      type: String,
      trim: true,
      required: [function () { return this.role === "authority"; }, "Organization / Badge ID is required for authority accounts"],
    },

    // Authority accounts start unverified until an admin/moderator approves them.
    isVerifiedAuthority: {
      type: Boolean,
      default: function () {
        return this.role !== "authority";
      },
    },

    // Email + phone OTP verification, separate from authority approval above.
    // Google sign-ups skip this (Google has already verified the email).
    isVerified: {
      type: Boolean,
      default: function () {
        return !!this.googleId;
      },
    },
    otp: { type: otpSchema, select: false },

    // Mandatory at signup — no longer optional.
    location: { type: pointSchema, required: [true, "Location access is required to create an account"] },

    refreshTokens: { type: [refreshTokenSchema], default: [] },
  },
  { timestamps: true }
);

userSchema.index({ location: "2dsphere" });

// Hash password before persisting, only when it has changed and one exists (Google accounts may have none)
userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (candidatePassword) {
  if (!this.password) return Promise.resolve(false); // Google-only account, no password to compare
  return bcrypt.compare(candidatePassword, this.password);
};

// Strip sensitive fields before sending a user object back to the client
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshTokens;
  delete obj.googleId;
  delete obj.otp;
  delete obj.__v;
  return obj;
};

export default mongoose.model("User", userSchema);