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

// ---- Web Push: Windows/desktop pop-ups even when the CRM is closed ----------
// The server (/api/push/notify) sends a JSON payload {title, body, url, tag,
// kind}; we render it as an OS notification. requireInteraction keeps it on
// screen until the user acts (so a busy clinic doesn't miss it), and clicking
// it opens the exact conversation and dismisses the notification.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Klinik Hijraa CRM", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Klinik Hijraa CRM";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag || undefined, // same tag replaces an earlier pop-up
      renotify: !!data.tag, // ...but still buzz for the new one
      requireInteraction: true, // stay until clicked/dismissed
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/inbox" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close(); // "disappear after click"
  const target = (event.notification.data && event.notification.data.url) || "/inbox";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Reuse an open CRM tab if there is one — navigate it to the conversation.
      for (const client of all) {
        if (client.url.includes(self.location.origin)) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(target);
            } catch {
              /* cross-origin/navigation guard — fall through to openWindow */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
