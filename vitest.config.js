import path from 'node:path';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

// Maps each renamed .js → .ts file so `import './foo.js'` resolves to `foo.ts`
// in the test environment. Mirrors TypeScript's `moduleResolution: Bundler` behavior.
const renamedModules = [
    'types',
    'constants',
    'ui-types',
    'worker-types',
    'platform',
    'visualizer-utils',
    'engine/midi-constants',
    'data/instrument-styles',
    'data/shortcut-config',
    'engine/platform-orchestrator',
    'engine/worker-orchestrator',
    'engine/worker-buffer-manager',
    'engine/soloist-mode-policy',
    'utils/manual-metadata',
    'app-controller',
    'performance-controller',
    'pwa',
    'state/visualizer',
    'state/conductor',
    'state/midi',
    'state/arranger',
    'state/groove',
    'state/playback',
    'state/instruments',
    'history',
    'ui-bridge',
    'visualizer-events',
    'engine/coordination-engine',
    'song-generator',
    'lead-sheet-model',
    'state',
    'persistence',
    'sharing',
    'worker-client',
    'midi-controller',
    'engine/chords-styles',
    'engine/drum-seeder',
    'engine/groove-engine',
    'state-hydration',
    'state-effects',
    'arranger-controller',
];

const publicDir = path.resolve(import.meta.dirname, 'public');

// Regex anchors to the full ID so the entire specifier is replaced with the absolute .ts path.
// This avoids Vite appending the absolute replacement to a relative prefix.
const tsAliases = renamedModules.map((mod) => ({
    find: new RegExp(`^.+/${mod.replace(/\//g, '/')}\\.js$`),
    replacement: path.join(publicDir, `${mod}.ts`),
}));

export default defineConfig({
    plugins: [preact()],
    resolve: {
        alias: tsAliases,
    },
    test: {
        globals: true,
        environment: 'node',
        pool: 'threads',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['public/**/*.js'],
            exclude: [
                'public/components/**',
                'public/data/**',
                'public/sw.js',
                'public/main.js',
                'public/ui-root.jsx',
                'public/App.jsx',
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
