import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";

import authRoutes from "./routes/auth.routes.js";
import eventRoutes from "./routes/event.routes.js";
import providerRoutes from "./routes/provider.routes.js";
import agentRoutes from "./routes/agent.routes.js";
import mapsRoutes from "./routes/maps.routes.js";
import { notFound, errorHandler } from "./middlewares/error.middleware.js";

const app = express();

app.use(helmet());
// Browser CORS for the web console. CLIENT_URL may be a comma-separated list so
// the hosted web app and local dev can both call the API with credentials. The
// mobile app uses Capacitor's native HTTP and is not subject to browser CORS.
const corsAllowlist = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, cb) {
      // Allow non-browser callers (no Origin header) and any allow-listed origin.
      if (!origin || corsAllowlist.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true, // required so the browser sends/receives httpOnly auth cookies
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/ai", providerRoutes);
app.use("/api/ai", agentRoutes);
app.use("/api/ai", mapsRoutes);
// Future routers plug in here, e.g.:
// app.use("/api/zones", zoneRoutes);
// app.use("/api/alerts", alertRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
