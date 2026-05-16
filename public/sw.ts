/// <reference lib="webworker" />
import { setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, type PrecacheEntry, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & {
    __WB_MANIFEST: Array<PrecacheEntry | string>;
};

// Preserve the historical ensemble-test-* / ensemble-* cache-name split.
// Vite mode `production` → `ensemble`; anything else (e.g. `test`) → `ensemble-test`.
setCacheNameDetails({
    prefix: import.meta.env.MODE === 'production' ? 'ensemble' : 'ensemble-test',
});

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});
