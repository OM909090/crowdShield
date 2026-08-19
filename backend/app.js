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
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
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
