/// <reference lib="webworker" />
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, type PrecacheEntry, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & {
    __WB_MANIFEST: Array<PrecacheEntry | string>;
};

const IS_PROD = import.meta.env.MODE === 'production';

// Preserve the historical ensemble-test-* / ensemble-* cache-name split.
// Vite mode `production` → `ensemble`; anything else (e.g. `test`) → `ensemble-test`.
setCacheNameDetails({
    prefix: IS_PROD ? 'ensemble' : 'ensemble-test',
});

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// synth-audit Epic 6 S4 — sample packs are large (a few MB each), lazy-loaded,
// and must NOT touch the precached <1 MB core bundle (pack assets are excluded
// from the precache glob in vite.config.ts). Cache pack files at runtime in a
// dedicated Cache Storage bucket so a downloaded pack persists across reloads
// and works offline, while the core's instant-load guarantee is untouched.
// CacheFirst because pack assets are immutable — once fetched, always served
// from cache (no revalidation round-trip), the right trade for a few-MB sample.
registerRoute(
    ({ url }) => url.pathname.startsWith('/packs/'),
    new CacheFirst({
        cacheName: IS_PROD ? 'ensemble-packs' : 'ensemble-test-packs',
        // statuses: 0 keeps opaque cross-origin pack responses cacheable (a pack
        // may be served from a CDN); 200 covers same-origin.
        plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
    }),
);

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});
