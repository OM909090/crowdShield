/*
 * CrowdShield — minimal offline app-shell service worker.
 * Caches the static shell so the citizen PWA opens instantly and survives
 * flaky venue networks. Live data (/api, /socket.io) is never cached.
 * Bump CACHE when the shell changes to invalidate old caches.
 */
const CACHE = "crowdshield-shell-v4";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/favicon.svg"];

/*
 * Paths this worker must NEVER touch. Dev-server internals (Vite's optimized
 * dependency chunks, the HMR client, raw source) must always come from the
 * network: caching them can pin an outdated `react` chunk next to a fresh
 * `react-dom`, giving the page two React copies ("Invalid hook call" / null
 * hook dispatcher) and a stale HMR token that kills the websocket.
 */
const BYPASS_PREFIXES = ["/@vite", "/@id", "/@fs", "/@react-refresh", "/node_modules", "/src"];
const isBypassed = (url) =>
  BYPASS_PREFIXES.some((p) => url.pathname.startsWith(p)) ||
  url.searchParams.has("v") || // Vite dep-optimizer version hash
  url.searchParams.has("t") || // HMR cache-bust timestamp
  url.searchParams.has("import");

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Only handle our own origin.
  if (url.origin !== self.location.origin) return;
  // Never intercept API calls or the realtime socket — those must hit the network.
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/socket.io")) return;
  // Never intercept dev-server internals / versioned module requests.
  if (isBypassed(url)) return;

  // Navigations: network-first so fresh HTML wins, cached shell as offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/index.html")))
    );
    return;
  }

  // Static assets (JS/CSS/img/fonts): cache-first, then populate on miss.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
