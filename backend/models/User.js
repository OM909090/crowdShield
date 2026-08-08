import mongoose from "mongoose";
import bcrypt from "bcrypt";

const { Schema } = mongoose;

const pointSchema = new Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], default: undefined }, // [longitude, latitude]
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

    password: { type: String, required: true, minlength: 6, select: false },

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

    location: { type: pointSchema },

    refreshTokens: { type: [refreshTokenSchema], default: [] },
  },
  { timestamps: true }
);

userSchema.index({ location: "2dsphere" });

// Hash password before persisting, only when it has changed
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Strip sensitive fields before sending a user object back to the client
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshTokens;
  delete obj.__v;
  return obj;
};

export default mongoose.model("User", userSchema);
