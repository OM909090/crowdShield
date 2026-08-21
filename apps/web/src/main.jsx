import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "react-hot-toast";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { BrowserRouter } from "react-router-dom";

import "leaflet/dist/leaflet.css";
import "./index.css";

import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <GoogleOAuthProvider
      clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}
    >
      <BrowserRouter>
        <AuthProvider>
          <Toaster />
          <App />
        </AuthProvider>
      </BrowserRouter>
    </GoogleOAuthProvider>
  </StrictMode>
);

// ---------------------------------------------------------------------------
// Offline app-shell service worker (installable citizen PWA).
//
// PRODUCTION ONLY, deliberately. In dev the SW's cache-first strategy can serve
// a stale copy of Vite's optimized dependency chunks
// (/node_modules/.vite/deps/react.js?v=HASH).
//
// When Vite re-optimizes, the hash changes — a cached old React alongside a
// fresh react-dom can result in TWO React copies, which produces:
//
// "Invalid hook call"
// "Cannot read properties of null (reading 'useMemo')"
//
// and potentially a blank page.
//
// A stale @vite/client can also carry a dead HMR token, which breaks the
// websocket. So: never run the SW against the dev server.
// ---------------------------------------------------------------------------

if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal — offline support just won't be available.
      });
    });
  } else {
    // Dev self-heal: tear down any SW and its caches left over from a
    // previous build/session so it can't shadow dev assets.
    const wasControlled = !!navigator.serviceWorker.controller;

    const cleanup = Promise.all([
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(
            registrations.map((registration) =>
              registration.unregister()
            )
          )
        )
        .catch(() => {}),

      "caches" in window
        ? caches
            .keys()
            .then((keys) =>
              Promise.all(
                keys
                  .filter((key) => key.startsWith("crowdshield"))
                  .map((key) => caches.delete(key))
              )
            )
            .catch(() => {})
        : Promise.resolve(),
    ]);

    // Guard against a reload loop: only ever reload once per tab session.
    const RELOAD_FLAG = "cs-sw-dev-reloaded";

    if (
      wasControlled &&
      !sessionStorage.getItem(RELOAD_FLAG)
    ) {
      cleanup.then(() => {
        sessionStorage.setItem(RELOAD_FLAG, "1");
        window.location.reload();
      });
    }
  }
}