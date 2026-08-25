import { existsSync, readFileSync } from 'node:fs';
import { getInitialJavaScriptPaths } from './scripts/initial-js-assets.js';

const outputHtmlPath = 'dist/index.html';
if (!existsSync(outputHtmlPath)) {
    throw new Error('Size Limit needs dist/index.html. Run the production build first.');
}

// Why: Vite factors shared startup code into hashed modulepreload chunks. Measuring
// only dist/index.*.js misses those downloads (including the telemetry boundary),
// while a blanket chunk-* glob would incorrectly charge lazy modal chunks to startup.
const initialJavaScriptPaths = getInitialJavaScriptPaths(readFileSync(outputHtmlPath, 'utf8'));
for (const path of initialJavaScriptPaths) {
    if (!existsSync(path)) {
        throw new Error(`Initial JavaScript asset referenced by index.html is missing: ${path}`);
    }
}

export default [
    {
        path: 'dist/index.*.js',
        limit: '80 kB',
        name: 'Main Entry',
    },
    {
        path: initialJavaScriptPaths,
        limit: '125 kB',
        name: 'Initial JavaScript Graph',
    },
    {
        path: 'dist/logic-worker.*.js',
        limit: '65 kB',
        name: 'Logic Worker (Bundled)',
    },
    {
        path: 'dist/index.*.css',
        limit: '65 kB',
        name: 'Global CSS',
    },
];
