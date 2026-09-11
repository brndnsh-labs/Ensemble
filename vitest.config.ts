import preact from '@preact/preset-vite';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [preact()],
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
            include: ['public/**/*.{ts,tsx}'],
            exclude: [
                'public/components/**',
                'public/data/**',
                'public/sw.ts',
                'public/main.ts',
                'public/ui-root.tsx',
                'public/App.tsx',
            ],
        },
        exclude: [
            ...configDefaults.exclude,
            'tests/e2e/**',
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
