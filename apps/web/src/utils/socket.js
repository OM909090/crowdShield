import { io } from "socket.io-client";

// The Socket.IO server shares the backend origin (axios baseURL is "…/api").
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

let socket = null;

/** Lazily-created shared Socket.IO client (one connection for the whole app). */
export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ["websocket"],
      autoConnect: true,
    });
  }
  return socket;
}
