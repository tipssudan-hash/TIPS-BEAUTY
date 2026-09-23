// Minimal offline shell for the web Storefront. Deliberately small: it caches the app shell so a
// customer who loses connection sees the app and an Arabic offline message instead of a dead browser
// error page. It does NOT cache catalogue data or images — stale prices and stock would be worse
// than an honest "no connection".
//
// Native builds never use this: Capacitor serves the same assets from the app bundle already.

const SHELL_CACHE = 'tips-beauty-shell-v1';
const SHELL_URL = '/index.html';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE)
            .then((cache) => cache.addAll([SHELL_URL, '/manifest.webmanifest']))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return; // Supabase and fonts are never cached here

    // Navigations: network first so a deploy is picked up immediately, shell from cache when offline.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    void caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_URL, response.clone()));
                    return response;
                })
                .catch(() => caches.match(SHELL_URL).then((cached) => cached ?? Response.error())),
        );
        return;
    }

    // Hashed build assets are immutable, so cache-first is safe and makes repeat opens instant.
    if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
        event.respondWith(
            caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
                if (response.ok) {
                    void caches.open(SHELL_CACHE).then((cache) => cache.put(request, response.clone()));
                }
                return response;
            })),
        );
    }
});
