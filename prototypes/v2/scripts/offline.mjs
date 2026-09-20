import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { basePathFromEnv } from './base-path.mjs';

const root = path.resolve('out');
// Where this artifact will be served from — `/v2` today, `''` at the cutover. The same value
// `next.config.mjs` gave the export, so the worker's scope and the asset keys cannot disagree
// with the URLs the app actually loads. See scripts/base-path.mjs.
const base = basePathFromEnv();
const scope = `${base}/`;
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
// Deploy sounds beside the preview, but download only packs the musician uses.
await cp(path.resolve('../../public/packs'), path.join(root, 'packs'), { recursive: true });
const packFiles = {};
for (const file of await walk(path.join(root, 'packs'))) {
    packFiles[`/${path.relative(root, file).split(path.sep).join('/')}`] = createHash('sha256')
        .update(await readFile(file))
        .digest('hex');
}
await writeFile(path.join(root, 'pack-files.json'), JSON.stringify(packFiles));
const paths = (await walk(root))
    .filter((p) => !['sw.js', 'build.json'].includes(path.relative(root, p)))
    .sort();
const assets = {};
for (const file of paths) {
    assets[`${scope}${path.relative(root, file).split(path.sep).join('/')}`] = createHash('sha256')
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
//
// SCOPE is `/v2/` today and `/` at the cutover, so the prefix test alone stops excluding the
// account API the moment the stand takes the site root: at `/` it matches everything on the
// origin. PASSES names that exclusion explicitly instead of inheriting it from the `/v2/`
// prefix by accident (`lib/account/api.ts` documents the reader's side of the same rule).
// `/api/*` is the whole list on purpose — it is the only non-artifact path this origin serves
// (Caddy splits it to the account API; see hosting/README.md), its replies are private and
// per-session, and a cached or re-issued one would be a correctness bug rather than a slow
// path. Everything else under the scope IS this artifact: files in ASSETS are answered from
// the cache and anything else (`/packs/*`, which `lib/sounds.ts` verifies into its own cache)
// misses and falls through to the network unchanged.
await writeFile(
    path.join(root, 'sw.js'),
    `
const CACHE = 'ensemble-v2-preview-${fingerprint}';
const SCOPE = ${JSON.stringify(scope)};
const PASSES = ['/api'];
const ASSETS = ${JSON.stringify([...Object.keys(assets).filter((url) => !url.startsWith(`${scope}packs/`)), scope, `${scope}build.json`])};
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
    if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
    if (url.pathname === SCOPE + 'sw.js') return;
    if (PASSES.some(prefix => url.pathname === prefix || url.pathname.startsWith(prefix + '/'))) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const key = url.pathname;
        return await cache.match(key) || fetch(event.request);
    })());
});
`,
);
console.log(
    `V2 artifact ${fingerprint.slice(0, 16)} · ${paths.length} deployed assets (sounds download on demand)`,
);
