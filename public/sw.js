// Service worker: makes the app installable as a PWA and caches immutable
// static assets so repeat visits on a phone don't re-download the app shell.
//
// - `/_next/static/*` files are content-hashed by Next.js (a changed file gets
//   a new URL), so cache-first is always safe and never serves stale code.
// - Icons/logo change rarely; cached the same way, and the cache NAME below is
//   versioned — bump it if these ever need to be forced fresh.
// - Everything else (pages, API, Supabase) is NOT intercepted at all: the
//   browser talks to the network natively, so live CRM data is never stale and
//   the worker doesn't burn CPU proxying every request.
const CACHE = "crm-static-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const cacheable =
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname === "/logo.png");
  if (!cacheable) return; // let the browser handle it natively

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      const res = await fetch(request);
      if (res.ok) cache.put(request, res.clone());
      return res;
    })(),
  );
});
