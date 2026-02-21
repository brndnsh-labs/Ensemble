// Note: Keep CACHE_NAME version in sync with APP_VERSION in config.js
const CACHE_NAME = '/* CACHE_NAME_PLACEHOLDER */';
const ASSETS = [
    /* ASSETS_PLACEHOLDER */
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                    return Promise.resolve();
                }),
            );
        }),
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(caches.match(e.request).then((response) => response || fetch(e.request)));
});
