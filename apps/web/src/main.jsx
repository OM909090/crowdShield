import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {Toaster} from "react-hot-toast";
import "leaflet/dist/leaflet.css";

import {
BrowserRouter
} from "react-router-dom";


import './index.css'
import App from './App.jsx'


createRoot(
document.getElementById('root')
)
.render(

<StrictMode>

<BrowserRouter>

<Toaster/>

<App/>

</BrowserRouter>

</StrictMode>

)

// ---------------------------------------------------------------------------
// Offline app-shell service worker (installable citizen PWA).
//
// PRODUCTION ONLY, deliberately. In dev the SW's cache-first strategy can serve
// a stale copy of Vite's optimized dependency chunks (/node_modules/.vite/deps/
// react.js?v=HASH). When Vite re-optimizes, the hash changes — a cached old
// `react` alongside a fresh `react-dom` means TWO React copies, which produces
// "Invalid hook call" / "Cannot read properties of null (reading 'useMemo')"
// and a blank page. A stale `@vite/client` also carries a dead HMR token, which
// breaks the websocket. So: never run the SW against the dev server.
// ---------------------------------------------------------------------------
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* non-fatal — offline support just won't be available */
      });
    });
  } else {
    // Dev self-heal: tear down any SW (and its caches) left over from a previous
    // build/session so it can't shadow dev assets. Reload once if this page is
    // still being served by that old worker.
    const wasControlled = !!navigator.serviceWorker.controller;

    const cleanup = Promise.all([
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {}),
      "caches" in window
        ? caches
            .keys()
            .then((keys) =>
              Promise.all(keys.filter((k) => k.startsWith("crowdshield")).map((k) => caches.delete(k)))
            )
            .catch(() => {})
        : Promise.resolve(),
    ]);

    // Guard against a reload loop: only ever reload once per tab session.
    const RELOAD_FLAG = "cs-sw-dev-reloaded";
    if (wasControlled && !sessionStorage.getItem(RELOAD_FLAG)) {
      cleanup.then(() => {
        sessionStorage.setItem(RELOAD_FLAG, "1");
        window.location.reload();
      });
    }
  }
}
