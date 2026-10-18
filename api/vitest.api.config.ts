import { defineConfig } from 'vitest/config';

// The account API is a standalone Node service with no DOM and no browser
// dependency — `node:sqlite` needs a real filesystem, not happy-dom or a
// browser sandbox. Kept as this project's own config (mirrors the root
// vitest.browser.config.ts / vitest.sync.config.ts split) so `npm run
// test:api` from the repo root never pulls in a browser install.
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['test/**/*.test.ts'],
        // Each test opens its own disposable on-disk SQLite file (see
        // test/helpers/test-db.ts); running suites in parallel worker threads
        // is safe because no two tests share a database path.
        testTimeout: 10000,
    },
});
