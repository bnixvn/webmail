// BNIX Webmail service worker — installable app shell only.
// Strategy: network-first for everything, cache is a fallback for when the
// network is unreachable. Never intercepts /api/* — mail/session data must
// always come from the network, never a stale cache.
const CACHE_VERSION = "bnix-webmail-v14";

const APP_SHELL = [
  "/",
  "/assets/app.js",
  "/assets/css/tailwind.css",
  "/assets/style.css",
  "/assets/dark-mode.css",
  "/assets/theme-init.js",
  "/manifest.json",
  "/brand/mail.png",
  "/brand/bnix-favicon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name !== CACHE_VERSION).map((name) => caches.delete(name)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // never cache mail/session data

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        return Response.error();
      })
  );
});
