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
        exclude: [...configDefaults.exclude, 'tests/e2e/**', 'tests/browser/**', 'tests/bench/**'],
    },
});
