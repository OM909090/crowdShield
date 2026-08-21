/**
 * Socket.IO server: the low-latency channel that pushes live crowd state to
 * subscribed clients (authority dashboard, citizen app).
 *
 * A client sends `subscribe { eventId }` to join that event's room; the
 * broadcaster then streams `crowd:tick` frames to the room. When the last
 * viewer of an event leaves, the broadcaster stops — no wasted work.
 */
import { Server } from "socket.io";
import { addViewer, removeViewer } from "./broadcaster.js";

let io = null;

export const roomName = (eventId) => `event:${eventId}`;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    // The live feed is open (a client only `subscribe`s — no auth rides this
    // socket) and is consumed from three origins: the hosted web console, the
    // packaged mobile app (capacitor://localhost / https://localhost), and local
    // dev. Reflect the requesting origin so all of them can connect; nothing
    // sensitive crosses this channel beyond already-aggregated crowd density.
    cors: { origin: true, credentials: true },
  });

  io.on("connection", (socket) => {
    socket.on("subscribe", ({ eventId } = {}) => {
      if (!eventId) return;
      // one event per socket keeps bookkeeping simple; re-subscribe switches
      if (socket.data.eventId && socket.data.eventId !== eventId) {
        socket.leave(roomName(socket.data.eventId));
        removeViewer(socket.data.eventId);
      }
      socket.join(roomName(eventId));
      socket.data.eventId = eventId;
      addViewer(eventId);
    });

    socket.on("unsubscribe", () => {
      const eventId = socket.data.eventId;
      if (!eventId) return;
      socket.leave(roomName(eventId));
      removeViewer(eventId);
      socket.data.eventId = null;
    });

    socket.on("disconnect", () => {
      if (socket.data.eventId) removeViewer(socket.data.eventId);
    });
  });

  return io;
}

export const getIO = () => io;
