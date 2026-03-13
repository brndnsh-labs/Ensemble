import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [preact()],
    test: {
        globals: true,
        environment: 'happy-dom',
        exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/test-dist/**',
            '**/cypress/**',
            '**/.{idea,git,cache,output,temp}/**',
            '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,playwright}.config.*',
            'tests/e2e/**',
        ],
    },
});
