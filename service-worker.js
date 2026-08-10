// v2.6.7: self-unregister no-cache service worker reset.
// The app now runs network-first without offline caching to avoid Failed to fetch during testing.
self.addEventListener('install', event => {
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
      await self.registration.unregister();
      const clientsList = await self.clients.matchAll({ type: 'window' });
      for (const client of clientsList) client.navigate(client.url);
    } catch (_) {}
  })());
});
self.addEventListener('fetch', () => {
  return;
});
