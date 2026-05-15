/// <reference lib="webworker" />

const swSelf = self as unknown as ServiceWorkerGlobalScope;

// Note: Keep CACHE_NAME version in sync with APP_VERSION in config.ts
const CACHE_NAME = '/* CACHE_NAME_PLACEHOLDER */';
// The deploy script replaces the single-element sentinel with the real comma-
// separated asset list. Using a string (rather than a /* comment */ placeholder)
// ensures esbuild's --minify pass preserves the marker so sed can find it.
const ASSETS: string[] = ['ASSETS_PLACEHOLDER'];

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
