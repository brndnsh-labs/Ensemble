import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Native transaction lifetime and rollback must work in both desktop and iPhone engines.
// Kept separate so the existing audio oracles retain their established Chromium contract.
export default defineConfig({
    publicDir: false,
    resolve: {
        alias: {
            // The guest repository (`prototypes/v2/lib/repository.ts`) reaches the engine through
            // the preview's alias, as in `vitest.config.ts`; the account modules do not need it.
            '@engine': fileURLToPath(new URL('./public', import.meta.url)),
        },
    },
    // Next inlines this at build time (`lib/base-path.ts`); a browser test has no `process`.
    define: { 'process.env.NEXT_PUBLIC_BASE_PATH': JSON.stringify('/v2') },
    test: {
        // Listed one by one on purpose: a glob here would silently stop covering a file that
        // was renamed, and these are the only proof of real IDB transaction/range behavior.
        include: [
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
        ],
        browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }, { browser: 'webkit' }],
        },
    },
});
