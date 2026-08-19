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
    cors: { origin: process.env.CLIENT_URL, credentials: true },
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
