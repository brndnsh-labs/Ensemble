import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * The account-storage tests, which run in both engines. Listed one by one on purpose: a glob would
 * silently stop covering a file that was renamed, and these are the only proof of real IDB
 * transaction/range behavior. `vitest.browser.config.ts` leaves exactly these out, so each runs
 * in Chromium once and a new browser test that is not listed here still runs there.
 */
export const SYNC_FILES = [
    'tests/browser/account-songbook.browser.test.ts',
    'tests/browser/account-songbook-list.browser.test.ts',
    'tests/browser/account-outbox-pass.browser.test.ts',
    'tests/browser/account-library-download.browser.test.ts',
    'tests/browser/account-cloud-delete.browser.test.ts',
    'tests/browser/account-keep-both.browser.test.ts',
    'tests/browser/account-adopt-candidate.browser.test.ts',
    'tests/browser/account-sign-out.browser.test.ts',
    'tests/browser/account-library-prefs.browser.test.ts',
    'tests/browser/account-home.browser.test.ts',
    'tests/browser/account-collections.browser.test.ts',
    'tests/browser/account-starred.browser.test.ts',
    'tests/browser/account-playlist-import.browser.test.ts',
    'tests/browser/account-purge.browser.test.ts',
    'tests/browser/account-retired-text-chart.browser.test.ts',
    'tests/browser/account-unreadable-row.browser.test.ts',
];

// Native transaction lifetime and rollback must work in both desktop and iPhone engines.
// Kept separate so the existing audio oracles retain their established Chromium contract.
export default defineConfig({
    publicDir: false,
    resolve: {
        alias: {
            // The guest repository (`web/lib/repository.ts`) reaches the engine through
            // the preview's alias, as in `vitest.config.ts`; the account modules do not need it.
            '@core': fileURLToPath(new URL('./core', import.meta.url)),
        },
    },
    test: {
        include: SYNC_FILES,
        browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }, { browser: 'webkit' }],
        },
    },
});
