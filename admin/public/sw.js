const CACHE = "mova-admin-v3";
const SHELL = ["/", "/login", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

function isVersionRequest(url) {
  return url.pathname === "/version.json" || url.pathname === "/api/version";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL).catch(() => undefined);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: "MOVA_UPDATE_AVAILABLE" });
      }
    })(),
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING" || event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (isVersionRequest(url) || url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/")) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok && (url.pathname.startsWith("/icon") || url.pathname.endsWith(".webmanifest") || SHELL.includes(url.pathname))) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request)),
  );
});
