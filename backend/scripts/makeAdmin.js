// Promote an existing user to admin by email.
//   node scripts/makeAdmin.js <email>
//   npm run make:admin -- <email>
import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";

const email = (process.argv[2] || process.env.PROMOTE_EMAIL || "").toLowerCase().trim();

if (!email) {
  console.error("Usage: node scripts/makeAdmin.js <email>");
  process.exit(1);
}

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const user = await User.findOne({ email });
  if (!user) {
    console.error(`No account found with email: ${email}. Sign up first, then promote.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // updateOne bypasses the save hooks, so the password is never re-hashed and
  // the authority-only "organizationId required" validator won't trip.
  const res = await User.updateOne(
    { _id: user._id },
    { $set: { role: "admin", isVerifiedAuthority: true } }
  );

  console.log(
    `Promoted ${email} (${user.name}) from "${user.role}" to "admin". ` +
      `matched=${res.matchedCount} modified=${res.modifiedCount}`
  );
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
