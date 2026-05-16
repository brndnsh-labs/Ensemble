import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [preact()],
    test: {
        globals: true,
        environment: 'node',
        pool: 'threads',
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
            '**/node_modules/**',
            '**/dist/**',
            '**/test-dist/**',
            '**/cypress/**',
            '**/.{idea,git,cache,output,temp}/**',
            '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,playwright}.config.*',
            'tests/e2e/**',
            'tests/bench/**',
            undefined,
        ],
    },
});
