/// <reference lib="webworker" />

const swSelf = self as unknown as ServiceWorkerGlobalScope;

// Note: Keep CACHE_NAME version in sync with APP_VERSION in config.js
const CACHE_NAME = '/* CACHE_NAME_PLACEHOLDER */';
const ASSETS: string[] = [
    /* ASSETS_PLACEHOLDER */
];

swSelf.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

swSelf.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        swSelf.skipWaiting();
    }
});

swSelf.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all([
                ...keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                    return Promise.resolve(false);
                }),
                swSelf.clients.claim(),
            ]);
        }),
    );
});

swSelf.addEventListener('fetch', (e) => {
    e.respondWith(caches.match(e.request).then((response) => response || fetch(e.request)));
});
