/// <reference lib="webworker" />

/** @type {ServiceWorkerGlobalScope} */
const sw = /** @type {any} */ (self);

// Note: Keep CACHE_NAME version in sync with APP_VERSION in config.js
const CACHE_NAME = '/* CACHE_NAME_PLACEHOLDER */';
/** @type {string[]} */
const ASSETS = [
    /* ASSETS_PLACEHOLDER */
];

sw.addEventListener('install', (/** @type {ExtendableEvent} */ e) => {
    e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

sw.addEventListener('message', (/** @type {ExtendableMessageEvent} */ event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        sw.skipWaiting();
    }
});

sw.addEventListener('activate', (/** @type {ExtendableEvent} */ e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all([
                ...keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                    return Promise.resolve(false);
                }),
                sw.clients.claim(),
            ]);
        }),
    );
});

sw.addEventListener('fetch', (/** @type {FetchEvent} */ e) => {
    e.respondWith(caches.match(e.request).then((response) => response || fetch(e.request)));
});
