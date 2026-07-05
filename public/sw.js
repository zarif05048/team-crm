// Minimal service worker: makes the app installable as a PWA.
// Network-first passthrough — the CRM is realtime, so we never serve stale data.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (event) => {
  // Only handle GET; let the browser do its normal thing via network.
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request));
});
