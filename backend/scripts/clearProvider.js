/**
 * Remove the stored LLM provider configuration (base URL + encrypted key +
 * model), returning the deployment to a clean "not configured" state.
 *
 * Useful when handing the system to a new operator: they then supply their own
 * OpenAI-compatible base URL and API key in Settings → AI Provider.
 *
 * Usage:  npm run clear:provider
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { connectDB } from "../config/db.js";

dotenv.config();

const run = async () => {
  await connectDB();
  const result = await mongoose.connection.db.collection("providerconfigs").deleteMany({});
  const remaining = await mongoose.connection.db.collection("providerconfigs").countDocuments();
  console.log(`Removed ${result.deletedCount} provider config row(s); ${remaining} remaining.`);
  console.log("The AI provider is now unconfigured — set it in Settings → AI Provider.");
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error("clearProvider failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
