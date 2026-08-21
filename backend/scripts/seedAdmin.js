// Run with: npm run seed:admin
// Requires ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_MOBILE set in .env
// Optional: ADMIN_NAME, ADMIN_LATITUDE, ADMIN_LONGITUDE
import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";

// Fallback HQ coordinates — this script has no browser/GPS to pull a real
// reading from. Point this at your actual control room before real use, or
// override with ADMIN_LATITUDE / ADMIN_LONGITUDE without editing the file.
const DEFAULT_ADMIN_LOCATION = {
  type: "Point",
  coordinates: [
    Number(process.env.ADMIN_LONGITUDE || 85.8245), // Bhubaneswar, Odisha
    Number(process.env.ADMIN_LATITUDE || 20.2961),
  ],
};

const run = async () => {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_MOBILE, ADMIN_NAME } = process.env;

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_MOBILE) {
    console.error("Set ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_MOBILE in your .env before seeding.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const existing = await User.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    console.log(`Admin already exists: ${ADMIN_EMAIL}`);
    await mongoose.disconnect();
    process.exit(0);
  }

  await User.create({
    name: ADMIN_NAME || "Platform Admin",
    email: ADMIN_EMAIL,
    mobile: ADMIN_MOBILE,
    password: ADMIN_PASSWORD,
    age: 30,
    gender: "Other",
    emergencyContact: ADMIN_MOBILE,
    language: "English",
    role: "admin",
    isVerified: true, // seeded by a trusted operator, not self-signup — OTP would be pointless here
    isVerifiedAuthority: true,
    location: DEFAULT_ADMIN_LOCATION,
  });

  console.log(`Admin created: ${ADMIN_EMAIL}`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});