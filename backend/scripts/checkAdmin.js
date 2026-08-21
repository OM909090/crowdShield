// Run with: node scripts/checkAdmin.js
// Diagnoses "invalid credentials" for the seeded admin without changing anything.
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../models/User.js";

const run = async () => {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, MONGO_URI } = process.env;

  console.log("Connecting to:", MONGO_URI);
  await mongoose.connect(MONGO_URI);

  const email = (ADMIN_EMAIL || "").toLowerCase().trim();
  const user = await User.findOne({ email }).select("+password");

  if (!user) {
    console.log(`No user found for "${email}" in this database.`);
    console.log("→ This means MONGO_URI here doesn't match what your server uses, or the seed never ran.");
  } else {
    console.log("Found user:", user.email, "| role:", user.role, "| isVerified:", user.isVerified);
    const matches = await bcrypt.compare(ADMIN_PASSWORD, user.password);
    console.log("Does current ADMIN_PASSWORD in .env match the stored hash?", matches);
    if (!matches) {
      console.log("→ The account's real password is whatever was in .env the first time seed:admin ran, not what's there now.");
    }
  }

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});