import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { basePathFromEnv } from './base-path.mjs';

const root = path.resolve('out');
// Where this artifact will be served from — `/v2` today, `''` at the cutover. The same value
// `next.config.mjs` gave the export, so the worker's scope and the asset keys cannot disagree
// with the URLs the app actually loads. See scripts/base-path.mjs.
const base = basePathFromEnv();
const scope = `${base}/`;
// Everything gated on this is the phase-5 cutover's alone (#1355). At `/v2` the stand is a beta
// living beside v1 and must stay exactly what it is today: no second installable identity, no
// opinion about v1's caches, no worker at anyone else's scope. At `/` it inherits v1's URL, its
// registration and its returning browsers, and has to clean up after both of them.
const atSiteRoot = base === '';
// Where the old beta lived. The tombstone below is emitted under it, and the paths it forwards
// are its own minus this prefix.
const PREVIEW_BASE = '/v2';
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
// The web manifest and its icons, at the site root only (#1355).
//
// Making `/v2/` separately installable today would mint a SECOND PWA identity that the cutover
// then strands — an installed beta pinned to a path that will redirect away. At `/` the
// manifest deliberately repeats v1's `public/manifest.json`: the same served path, the same
// `id`, name, display mode and colours, and the same four icons copied out of `public/` the way
// the packs above are (one copy in the export, none in git). A manifest whose `id` resolves to
// what v1's did is an UPDATE of the app a musician already installed, not a rival entry beside
// it on their home screen.
const WEB_MANIFEST_ICONS = [
    { file: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { file: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { file: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { file: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
];
if (atSiteRoot) {
    for (const icon of WEB_MANIFEST_ICONS) {
        await cp(path.resolve('../../public', icon.file), path.join(root, icon.file));
    }
    await writeFile(
        path.join(root, 'manifest.json'),
        `${JSON.stringify(
            {
                name: 'Ensemble',
                short_name: 'Ensemble',
                id: '/',
                start_url: '/',
                scope: '/',
                display: 'standalone',
                background_color: '#14110d',
                theme_color: '#14110d',
                icons: WEB_MANIFEST_ICONS.map(({ file, sizes, type, purpose }) => ({
                    src: `/${file}`,
                    sizes,
                    type,
                    purpose,
                })),
            },
            null,
            4,
        )}\n`,
    );
}
const paths = (await walk(root))
    // `sw.js` and `build.json` are this script's own output. So is the `/v2/` tombstone, which
    // belongs to a scope this worker does not serve and must never be answered from its cache —
    // it is listed here rather than left to the fact that the walk ran before it was written,
    // because a rerun over an existing `out/` would otherwise fold it in.
    .filter(
        (p) => !['sw.js', 'build.json', path.join('v2', 'sw.js')].includes(path.relative(root, p)),
    )
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

// ---------------------------------------------------------------------------------------------
// The root-only parts of the worker below (#1355). Each one is the empty string — or, for the
// activate body, character-for-character today's text — in a `/v2` build, so the published
// worker keeps the code it has apart from the fingerprint. The beta's behaviour is not up for
// revision in a cutover story.
// ---------------------------------------------------------------------------------------------

// The shell cache's namespace, and why there are two of them (#1355 review R5).
//
// The beta names its shell `ensemble-v2-preview-<fingerprint>`. The root build first shared that
// name, which left the beta's tombstone unable to tell a dead preview cache from the LIVE root
// shell and forced it to carry one baked-in exception — an exception a later root release would
// invalidate, so a tombstone shipped today could delete the live shell of a root worker still
// serving tabs. Two namespaces instead: `ensemble-v2-preview-` is the beta era in its entirety,
// `ensemble-v2-root-` is the site. The tombstone can then delete every preview cache with no
// exception at all, and each root worker retires older root shells itself. Both stay inside
// `ensemble-v2-`, so the v1 rule below still cannot reach either of them.
const shellCaches = atSiteRoot ? 'ensemble-v2-root-' : 'ensemble-v2-preview-';

// Which caches belong to v1, exactly.
//
// `public/sw.ts` calls `setCacheNameDetails({ prefix })`, and workbox-core composes a name as
// `<prefix>-<cacheName>-<suffix>` where the suffix is the registration scope. So v1 owns
// `ensemble-precache-v2-<scope>` in production and `ensemble-test-precache-v2-<scope>` on the
// test host, plus the literal `ensemble-packs`/`ensemble-test-packs` bucket its `/packs/` route
// names, plus any `workbox-*` cache an older build left behind from before that prefix was set.
// This app owns the `ensemble-v2-` namespace and nothing else: the two shell namespaces above,
// and `ensemble-v2-sounds-v1` in `lib/sounds.ts`, which holds packs the musician downloaded and
// must survive the cut intact. The v2 test is therefore first and by prefix — no v1 rule can
// reach past it — and both halves are plain string prefixes on strings out of `caches.keys()`,
// with no table to index and nothing to inherit.
const legacyCacheRule = atSiteRoot
    ? `
const PREVIEW_CACHES = 'ensemble-v2-preview-';
const ROOT_CACHES = 'ensemble-v2-root-';
const V2_CACHES = 'ensemble-v2-';
const isLegacyShellCache = name => !name.startsWith(V2_CACHES) && (name.startsWith('ensemble-') || name.startsWith('workbox-'));`
    : '';

// The handover itself. At `/` this script is served from `/sw.js` — v1's own script URL and
// scope — so the browser runs its ordinary update check and this becomes an UPDATE of v1's
// registration rather than a second one. An update then WAITS behind the running worker, and
// v1's worker answers the whole origin cache-first: a musician with one tab open would keep
// being served v1's shell, from a release that no longer exists, until every tab closed. So this
// worker skips waiting — but only when what it is replacing is demonstrably v1, and only after
// its own precache is complete, so a failed install can never hand a browser a half-built shell.
// A v2-over-v2 update finds no v1 evidence and keeps the preview's "close all tabs" policy.
//
// Known and accepted (#1355 review R11/R12): a browser whose v1 caches were evicted under
// storage pressure still holds v1's REGISTRATION but offers no evidence, so this update waits
// until its last v1 tab closes — at which point it activates normally. The alternative, a
// timeout that skips waiting without evidence, would risk replacing the code of a running v2
// band; waiting is the safe side of that trade. See hosting/README.md.
//
// "Demonstrably v1" has a second half (closure review N1): a v1-named cache that SURVIVES the
// handover — a delete that keeps failing, or a name something else minted — must not make every
// later release skip waiting and reload a running v2 band. So the evidence only counts when no
// OTHER root shell cache exists: `replacingRoot` means a root v2 worker already ran here, and
// what this update replaces is that worker, whatever else is lying in Cache Storage. This build's
// own cache is excluded because `install` has just created it.
const replacingRootRule = atSiteRoot
    ? `
const replacingRoot = names => names.some(name => name.startsWith(ROOT_CACHES) && name !== CACHE);`
    : '';
const installHandover = atSiteRoot
    ? `
    const present = await caches.keys().catch(() => []);
    if (present.some(isLegacyShellCache) && !replacingRoot(present)) await self.skipWaiting();`
    : '';

// Activate. The `/v2` branch is today's text verbatim; the root branch is its own thing, because
// three of this review's findings live in it and surgical fragments would have made it unreadable.
//
// R4 — one read of the cache index, BEFORE anything is deleted, is both the sweep list and the
// answer to "did this replace v1?" (`isLegacyShellCache` evidence and not `replacingRoot`, the same
// pair `install` asks). The module-global flag it replaces was set during install and would not
// survive the browser terminating the worker in between; this cannot disagree with itself.
// R3 — every delete is guarded, so one rejecting cache cannot cost the `claim()` that puts this
// worker in charge of the windows v1 was serving.
// R1 — the belt is NOT awaited. `navigate()` resolves when the navigation COMPLETES, and that
// navigation is inside this worker's scope, so its fetch cannot be dispatched until the worker
// leaves `activating` — which it cannot do while `waitUntil` is still waiting on the navigation.
// Awaiting it deadlocks: measured, a window that does not reload itself sat blank for 58s with no
// request reaching the origin, and every in-scope fetch from every controlled client queued behind
// it. Firing and forgetting lets `activate` settle, which is what releases those fetches.
//
// The belt exists because `public/pwa.ts` reloads on workbox-window's `controlling` event, but
// only where that registration actually ran (not under `navigator.webdriver`, not on localhost,
// not in a build older than #1048) — and the v2 shell, if it is already the document, has no such
// listener at all. The cost when both fire is one extra page load; the cost when neither does is a
// window rendering a shell whose assets have been deleted from the origin.
const activateBody = atSiteRoot
    ? `
    const names = await caches.keys().catch(() => []);
    const handover = names.some(isLegacyShellCache) && !replacingRoot(names);
    for (const name of names) if (name.startsWith(PREVIEW_CACHES) || (name.startsWith(ROOT_CACHES) && name !== CACHE) || isLegacyShellCache(name)) await caches.delete(name).catch(() => {});
    await self.clients.claim();
    if (handover) for (const client of await self.clients.matchAll({ type: 'window' }).catch(() => [])) void client.navigate(client.url).catch(() => {});`
    : `
    for (const name of await caches.keys()) if (name.startsWith('ensemble-v2-preview-') && name !== CACHE) await caches.delete(name);
    await self.clients.claim();`;

// What an in-scope navigation gets when it is not in the cache. At `/v2/` the scope was this
// artifact and nothing else, so falling through to the network was the whole story. At `/` the
// scope is the origin, and `/anything` now reaches this handler. The rule: a navigation that the
// NETWORK refuses falls back to the cached shell, so `/?s=…`, `/?accounts=on` and a bookmarked
// `/v2/…` all still open a working stand on a train. A 404 is a fetch that SUCCEEDED, so a real
// missing path stays a real missing path, and a subresource request is never given HTML.
const navigationFallback = atSiteRoot
    ? `
        if (event.request.mode === 'navigate') {
            return await cache.match(key) || await fetch(event.request).catch(async () => await cache.match(SCOPE) || Response.error());
        }`
    : '';

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
const CACHE = '${shellCaches}${fingerprint}';
const SCOPE = ${JSON.stringify(scope)};
const PASSES = ['/api'];
const ASSETS = ${JSON.stringify([...Object.keys(assets).filter((url) => !url.startsWith(`${scope}packs/`)), scope, `${scope}build.json`])};${legacyCacheRule}${replacingRootRule}
self.addEventListener('install', event => event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try { await cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' }))); }
    catch (error) { await caches.delete(CACHE); throw error; }${installHandover}
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {${activateBody}
})()));
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
    if (url.pathname === SCOPE + 'sw.js') return;
    if (PASSES.some(prefix => url.pathname === prefix || url.pathname.startsWith(prefix + '/'))) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const key = url.pathname;${navigationFallback}
        return await cache.match(key) || fetch(event.request);
    })());
});
`,
);

// The tombstone for the beta's own worker (#1355), emitted by the ROOT build only.
//
// After the flip `/v2/*` redirects to `/` (#1356), which does nothing for a browser that still
// holds the preview registration: that worker is cache-first over the whole of `/v2/`, so a
// bookmarked `/v2/` is answered from its cache and never reaches the redirect at all. Its ONE
// remaining link to the origin is the update check the browser runs for `/v2/sw.js` after each
// in-scope navigation — and a service-worker script fetch refuses to follow a redirect, so a
// redirect there would leave the old preview serving a dead release forever. Hence a real file,
// which must survive #1356 as a file (see hosting/README.md).
//
// It installs, takes over at once, drops EVERY `ensemble-v2-preview-*` cache — the whole beta era,
// with no exception to get wrong, which is what the `ensemble-v2-root-` split above bought —
// forwards each of its windows to the same path without the `/v2` prefix, query and fragment
// intact, and unregisters itself. `ensemble-v2-sounds-v1` is in neither shell namespace and is not
// touched; the packs in it are re-keyed by `lib/sounds.ts`, not thrown away.
//
// The forward is built through `new URL` against this origin and then checked again (#1355 review
// R2). Slicing the prefix off a path is not safe on its own: a window at `/v2//evil.example/x`
// slices to `//evil.example/x`, a protocol-relative URL that `navigate()` would follow straight
// off the origin — an open redirect out of a worker every returning browser runs. A path that does
// not resolve back to this origin is left where it is; #1356's redirect can have it.
//
// The navigations are fired, not awaited, for the same reason as the root worker's belt: this one
// escapes the deadlock today only because its targets are outside its own scope, which is a
// property of the URLs rather than of the code.
if (atSiteRoot) {
    await mkdir(path.join(root, PREVIEW_BASE.slice(1)), { recursive: true });
    await writeFile(
        path.join(root, PREVIEW_BASE.slice(1), 'sw.js'),
        `
const PREVIEW_CACHES = 'ensemble-v2-preview-';
const PREVIEW_BASE = ${JSON.stringify(PREVIEW_BASE)};
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
    for (const name of await caches.keys().catch(() => [])) if (name.startsWith(PREVIEW_CACHES)) await caches.delete(name).catch(() => {});
    await self.clients.claim();
    for (const client of await self.clients.matchAll({ type: 'window' }).catch(() => [])) {
        const here = new URL(client.url);
        if (here.origin !== self.location.origin) continue;
        if (here.pathname !== PREVIEW_BASE && !here.pathname.startsWith(PREVIEW_BASE + '/')) continue;
        const moved = new URL(here.pathname.slice(PREVIEW_BASE.length) || '/', self.location.origin);
        if (moved.origin !== self.location.origin) continue;
        void client.navigate(moved.pathname + here.search + here.hash).catch(() => {});
    }
    await self.registration.unregister();
})()));
`,
    );
}
console.log(
    `V2 artifact ${fingerprint.slice(0, 16)} · ${paths.length} deployed assets (sounds download on demand)`,
);
