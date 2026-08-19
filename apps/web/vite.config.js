import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Dev-only guard: tear down the PWA service worker before any module loads.
 *
 * The citizen PWA registers a cache-first service worker. If one is left over
 * from a production build (or an older dev session), it can serve stale copies
 * of Vite's module graph — a cached `react` chunk alongside a fresh `react-dom`
 * gives the page TWO React copies, which surfaces as "Invalid hook call" /
 * "Cannot read properties of null (reading 'useMemo')" and a blank screen. A
 * stale `@vite/client` also carries a dead HMR token, breaking the websocket.
 *
 * index.html is served network-first, so this inline script is the one thing
 * guaranteed to arrive fresh — it unregisters the worker, purges its caches and
 * reloads once, letting an already-poisoned browser heal itself with no
 * DevTools steps. `apply: "serve"` keeps it out of production builds entirely.
 */
const devKillServiceWorker = {
  name: 'dev-kill-service-worker',
  apply: 'serve',
  transformIndexHtml() {
    return [
      {
        tag: 'script',
        injectTo: 'head-prepend',
        children: `
(function () {
  if (!('serviceWorker' in navigator)) return;
  var FLAG = 'cs-sw-killed';
  var wasControlled = !!navigator.serviceWorker.controller;
  var jobs = [
    navigator.serviceWorker.getRegistrations()
      .then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); })
      .catch(function () {})
  ];
  if (window.caches) {
    jobs.push(
      caches.keys()
        .then(function (ks) {
          return Promise.all(ks.filter(function (k) { return k.indexOf('crowdshield') === 0; })
            .map(function (k) { return caches.delete(k); }));
        })
        .catch(function () {})
    );
  }
  // Unregistering doesn't un-control the current page, so reload once (guarded
  // against loops) to get a clean, worker-free module graph.
  if (wasControlled && !sessionStorage.getItem(FLAG)) {
    Promise.all(jobs).then(function () {
      sessionStorage.setItem(FLAG, '1');
      location.reload();
    });
  }
})();
        `.trim(),
      },
    ]
  },
}

export default defineConfig({
  plugins: [
    devKillServiceWorker,
    react(),
    tailwindcss()
  ],
})
