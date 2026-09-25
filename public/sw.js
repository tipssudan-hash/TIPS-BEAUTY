// Service Worker Cleanup & Cache Reset
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
            .then(() => self.registration.unregister())
            .then(() => self.clients.claim())
    );
});

// Pass through all fetch requests directly to network without caching
self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request));
});
