import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Browser-mode Vitest — for the handful of engine tests that need a REAL Web
// Audio graph (`OfflineAudioContext`), which happy-dom/jsdom don't implement.
// These were formerly Playwright `@diagnostic` specs that `import()`-ed raw
// `.ts` off the dev server purely to get a browser AudioContext; they never
// rendered the app, so they don't belong in the e2e suite. Here they run as
// plain unit tests in a headless Chromium (reused from the Playwright install),
// which lets the Playwright suite move to a static `vite preview` build (#1096).
//
// Kept as a SEPARATE config + `npm run test:browser` (not folded into the main
// node-mode `npm test`) so the common unit run stays fast and doesn't launch a
// browser. The main config excludes `tests/browser/**` to match.
export default defineConfig({
    // Our source lives in `public/`, which Vite would otherwise treat as a
    // static-assets dir and emit "served at the root path" noise for every
    // engine module. We serve no static assets here, so disable it (matches
    // `vite.config.ts`).
    publicDir: false,
    test: {
        include: ['tests/browser/**/*.test.ts'],
        browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
        },
    },
});
