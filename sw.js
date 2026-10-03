// The game moved to staz.ai. This replaces the old offline worker: it clears
// the cached app, unregisters itself and reloads open tabs, so returning
// visitors land on the redirect instead of the stale cached game.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: "window" })) {
      client.navigate(client.url);
    }
  })());
});
