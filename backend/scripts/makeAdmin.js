// Promote an existing user to admin by email, or bootstrap a brand-new admin
// if no account exists yet.
//
//   Promote existing user:
//     node scripts/makeAdmin.js <email>
//
//   Create a new admin (only runs if no account exists for that email):
//     ADMIN_MOBILE=9876543210 ADMIN_PASSWORD=changeme123 node scripts/makeAdmin.js <email>
//
import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";

const email = (process.argv[2] || process.env.PROMOTE_EMAIL || "").toLowerCase().trim();

// Fallback coordinates for the "create a new admin" path only. A CLI script has
// no browser, so no real GPS reading is possible here — point this at your
// actual control room / HQ, or override per-run with ADMIN_LATITUDE /
// ADMIN_LONGITUDE.
const DEFAULT_ADMIN_LOCATION = {
  type: "Point",
  coordinates: [
    Number(process.env.ADMIN_LONGITUDE || 85.8245), // Bhubaneswar, Odisha
    Number(process.env.ADMIN_LATITUDE || 20.2961),
  ],
};

if (!email) {
  console.error("Usage: node scripts/makeAdmin.js <email>");
  process.exit(1);
}

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const existing = await User.findOne({ email });

  if (existing) {
    // Promote in place. updateOne bypasses save hooks, so the password is never
    // re-hashed and no newly-required field (location, etc.) can trip
    // validation on a legacy account.
    const res = await User.updateOne(
      { _id: existing._id },
      { $set: { role: "admin", isVerified: true, isVerifiedAuthority: true } }
    );

    console.log(
      `Promoted ${email} (${existing.name}) from "${existing.role}" to "admin". ` +
        `matched=${res.matchedCount} modified=${res.modifiedCount}`
    );
    await mongoose.disconnect();
    process.exit(0);
  }

  // No account exists — bootstrap a fresh admin. This is the only path that
  // needs the schema's other required fields filled in manually, since there's
  // no signup form behind a CLI script.
  const mobile = process.env.ADMIN_MOBILE;
  const password = process.env.ADMIN_PASSWORD;

  if (!mobile || !password) {
    console.error(
      `No account found with email: ${email}.\n` +
        "To create a new admin instead of promoting one, set ADMIN_MOBILE and " +
        "ADMIN_PASSWORD env vars, e.g.:\n" +
        `  ADMIN_MOBILE=9876543210 ADMIN_PASSWORD=changeme123 node scripts/makeAdmin.js ${email}\n` +
        "Optional: ADMIN_NAME, ADMIN_AGE, ADMIN_GENDER, ADMIN_EMERGENCY_CONTACT, " +
        "ADMIN_LANGUAGE, ADMIN_LATITUDE, ADMIN_LONGITUDE (all have sane defaults)."
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  const user = await User.create({
    name: process.env.ADMIN_NAME || "System Admin",
    email,
    mobile,
    password,
    age: Number(process.env.ADMIN_AGE || 30),
    gender: process.env.ADMIN_GENDER || "Other",
    emergencyContact: process.env.ADMIN_EMERGENCY_CONTACT || mobile,
    language: process.env.ADMIN_LANGUAGE || "English",
    role: "admin",
    isVerified: true, // created by a trusted operator running this script, not self-signup — OTP is pointless here
    isVerifiedAuthority: true,
    location: DEFAULT_ADMIN_LOCATION,
  });

  console.log(`Created new admin account for ${email} (${user.name}).`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
