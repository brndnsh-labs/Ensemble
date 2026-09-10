import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Native transaction lifetime and rollback must work in both desktop and iPhone engines.
// Kept separate so the existing audio oracles retain their established Chromium contract.
export default defineConfig({
    publicDir: false,
    test: {
        // Listed one by one on purpose: a glob here would silently stop covering a file that
        // was renamed, and these are the only proof of real IDB transaction/range behavior.
        include: [
            'tests/browser/account-songbook.browser.test.ts',
            'tests/browser/account-songbook-list.browser.test.ts',
        ],
        browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }, { browser: 'webkit' }],
        },
    },
});
