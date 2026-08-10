// v2.6.6: Emergency service-worker unregister reset
// Purpose: remove old cached app files that caused Failed to fetch issues.

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
    await self.clients.claim();
    await self.registration.unregister();
  })());
});

self.addEventListener('fetch', event => {
  // Do not intercept any request. Browser/network handles all files directly.
});
