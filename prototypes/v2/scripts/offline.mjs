import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve('out');
async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    return (
        await Promise.all(
            entries.map((e) =>
                e.isDirectory() ? walk(path.join(directory, e.name)) : path.join(directory, e.name),
            ),
        )
    ).flat();
}
const paths = (await walk(root))
    .filter((p) => !['sw.js', 'build.json'].includes(path.relative(root, p)))
    .sort();
const assets = {};
for (const file of paths) {
    assets[`/v2/${path.relative(root, file).split(path.sep).join('/')}`] = createHash('sha256')
        .update(await readFile(file))
        .digest('hex');
}
const offlineRecipe = createHash('sha256')
    .update(await readFile(fileURLToPath(import.meta.url)))
    .digest('hex');
const fingerprint = createHash('sha256')
    .update(JSON.stringify(assets))
    .update(offlineRecipe)
    .digest('hex');
const manifest = {
    fingerprint,
    offlineRecipe,
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(),
    assets,
};
await writeFile(path.join(root, 'build.json'), JSON.stringify(manifest, null, 2));
// One atomic cache installation: a partial download never earns offline-ready.
// Waiting updates do not replace a running band's code. Close all tabs to update.
await writeFile(
    path.join(root, 'sw.js'),
    `
const CACHE = 'ensemble-v2-preview-${fingerprint}';
const ASSETS = ${JSON.stringify([...Object.keys(assets), '/v2/', '/v2/build.json'])};
self.addEventListener('install', event => event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try { await cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' }))); }
    catch (error) { await caches.delete(CACHE); throw error; }
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('ensemble-v2-preview-') && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith('/v2/')) return;
    if (url.pathname === '/v2/sw.js') return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const key = url.pathname;
        return await cache.match(key) || fetch(event.request);
    })());
});
`,
);
console.log(`V2 artifact ${fingerprint.slice(0, 16)} · ${paths.length} offline assets`);
