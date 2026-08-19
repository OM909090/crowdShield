import "dotenv/config";
import http from "http";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { initSocket } from "./realtime/socket.js";
import { initAgent } from "./services/agent.js";

const PORT = process.env.PORT || 5000;

// Wrap Express in a bare HTTP server so Socket.IO can share the same port.
const server = http.createServer(app);
initSocket(server);

// Arm the Tier 2 agent's autonomous wake (subscribes to the alert bus). Safe to
// call before DB connect — it only attaches an in-process listener.
initAgent();

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || "development"}]`);
  });
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  process.exit(1);
});
