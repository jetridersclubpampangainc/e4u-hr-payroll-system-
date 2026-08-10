// v2.6.8: no-cache service worker reset
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))).then(() => self.registration.unregister()).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => { return; });
