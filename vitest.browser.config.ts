import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { SYNC_FILES } from './vitest.sync.config.js';

// Browser-mode Vitest — for the handful of engine tests that need a REAL Web
// Audio graph (`OfflineAudioContext`), which happy-dom/jsdom don't implement.
// These were formerly Playwright `@diagnostic` specs that `import()`-ed raw
// `.ts` off the dev server purely to get a browser AudioContext; they never
// rendered the app, so they don't belong in the e2e suite. Here they run as
// plain unit tests in a headless Chromium (reused from the Playwright install),
// which keeps the app's Playwright suite about the app (#1096).
//
// Kept as a SEPARATE config + `npm run test:browser` (not folded into the main
// node-mode `npm test`) so the common unit run stays fast and doesn't launch a
// browser. The main config excludes `tests/browser/**` to match.
export default defineConfig({
    // Vite treats a `public/` dir as static assets. Our source lived in one until
    // #1745 renamed it `core/`; we serve no static assets here, so keep it off.
    publicDir: false,
    // A browser test that reaches the preview's modules needs its engine alias.
    resolve: {
        alias: { '@core': fileURLToPath(new URL('./core', import.meta.url)) },
    },
    test: {
        include: ['tests/browser/**/*.test.ts'],
        // `npm run test:sync` runs these in Chromium and WebKit; here they would run in Chromium a
        // second time in the same CI job.
        exclude: SYNC_FILES,
        browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
        },
    },
});
