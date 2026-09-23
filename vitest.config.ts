import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            // The same alias `prototypes/v2/tsconfig.json` and `next.config.mjs` give the preview,
            // so a unit test can import a v2 `lib/` module whose own imports reach back into the
            // shared engine. Inert for `public/` and `tests/`, which never spell it.
            '@engine': fileURLToPath(new URL('./public', import.meta.url)),
        },
    },
    test: {
        globals: true,
        environment: 'node',
        pool: 'threads',
        // Default 5s; raised to 30s so slow integration tests (notably soloist
        // hook/triplet/motivic-response specs) don't trip the 15s coverage-mode
        // limit when v8 instrumentation roughly quadruples runtime.
        testTimeout: 30000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['public/**/*.ts'],
            exclude: ['public/data/**'],
        },
        exclude: [
            ...configDefaults.exclude,
            'tests/browser/**',
            'tests/bench/**',
            // The isolated Next preview owns a separate Playwright runner.
            'prototypes/v2/checks/**',
            // The standalone account API has its own package, tsconfig, Vitest config and CI
            // step (npm run test:api). Collected here it would run twice, under a root config it
            // was not written for, and knip would resolve its imports against the root manifest.
            'prototypes/v2-api/**',
            // Agent-tool worktrees are full checkouts under the repo root — without
            // this, every vitest run (and any filename filter) also discovers and
            // runs their copies of the whole suite.
            '.claude/worktrees/**',
        ],
    },
});
