// v2.6.5: Emergency no-cache service worker reset
// This removes old cached files that caused Failed to fetch issues.

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Do not intercept requests anymore. Let the browser/network handle everything.
  return;
});
