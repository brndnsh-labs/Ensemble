import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve('out');
// The stand is served from the site root and nowhere else (#1734), so the worker's scope and the
// asset keys are `/…`.
const scope = '/';
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
await cp(path.resolve('../core/packs'), path.join(root, 'packs'), { recursive: true });
const packFiles = {};
for (const file of await walk(path.join(root, 'packs'))) {
    packFiles[`/${path.relative(root, file).split(path.sep).join('/')}`] = createHash('sha256')
        .update(await readFile(file))
        .digest('hex');
}
await writeFile(path.join(root, 'pack-files.json'), JSON.stringify(packFiles));
// The web manifest and its icons, at the site root. The four icons are copied out of `core/`
// the way the packs above are (one copy in the export, none in git).
//
// `id: '/'` must never change. It is the app's identity to every browser that installed it: a
// manifest with a different `id` is a NEW app, a second Ensemble on the home screen beside the
// installed one, which would then never update again. `checks/offline-shell.chromium.spec.ts`
// pins it.
const WEB_MANIFEST_ICONS = [
    { file: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { file: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { file: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { file: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
];
for (const icon of WEB_MANIFEST_ICONS) {
    await cp(path.resolve('../core', icon.file), path.join(root, icon.file));
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

// --- Content-Security-Policy: a build-time <meta>, not an nginx header (#1395) -------------
//
// Brandon's 2026-09-26 decision on the issue: bake the policy into each exported page here
// rather than send it as an nginx response header, because the Playwright preview server
// (scripts/serve.mjs) sets no headers at all — an nginx-only policy would never be exercised
// by the one suite that checks it. `hosting/web/nginx.conf` keeps `frame-ancestors` (a `<meta>`
// CSP cannot carry that directive) and its comment points here.
//
// A static export has no per-request nonce, so every inline `<script>` (the constant theme
// script in `app/layout.tsx`, plus the per-page RSC streaming pushes Next itself emits) gets its
// own sha256 hash instead of `'unsafe-inline'`. Those RSC pushes carry per-page streamed data —
// `index.html` and `404.html` do not inline the same bytes — so the hash set is computed PER
// FILE and each page's `<meta>` lists exactly what that page inlines, rather than a repo-wide
// union that would let one page vouch for a script text it never actually ships.
const NON_JS_SCRIPT_TYPE =
    /(^|\s)type\s*=\s*(["'])(?!\2)(?!text\/javascript|application\/javascript|module)/i;
function extractInlineScripts(html) {
    const scripts = [];
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
    for (let match = re.exec(html); match; match = re.exec(html)) {
        const [, attrs, content] = match;
        // A `src=` attribute makes it an external script (already covered by `'self'`), and a
        // non-JS `type` (Next has never emitted one at time of writing, but a JSON data island
        // would be) is inert markup the HTML parser never executes — neither needs a hash.
        if (/(^|\s)src\s*=/i.test(attrs) || NON_JS_SCRIPT_TYPE.test(attrs)) {
            continue;
        }
        scripts.push(content);
    }
    return scripts;
}
function buildCsp(scriptHashes) {
    return [
        `default-src 'self'`,
        // Next's own chunks are same-origin ('self'); the export's inline scripts are the sha256
        // hashes above. Umami's tracker (#1420, `lib/telemetry.ts`) is the one cross-origin
        // script the stand ever loads, and only in a production build on the canonical host — a
        // CSP violation everywhere else is silent, not a hole.
        [
            'script-src',
            "'self'",
            ...scriptHashes.map((h) => `'sha256-${h}'`),
            'https://umami.brndn.zip',
        ].join(' '),
        // Same-origin only: the account API (`/api/*`, same origin behind Caddy —
        // `lib/account/api.ts`) and sound-pack downloads (`lib/sounds.ts`). Umami's client posts
        // events back to the same host its script loaded from.
        `connect-src 'self' https://umami.brndn.zip`,
        // The only worker this app registers is its own service worker (this script's `sw.js`),
        // same-origin. No `Worker`/`AudioWorklet` runs — the band plays on the main-thread
        // `AudioContext` (`band/CLAUDE.md`; the old logic/MIDI workers are gone, #1404).
        `worker-src 'self'`,
        `img-src 'self'`,
        // `chart-sheet.tsx` sets two runtime-calculated inline `style={{...}}` props (the
        // section-letter menu's position, a v2-schema measure's `flex` basis), but React applies
        // those through the CSSOM (`element.style[prop] = value`), and `style-src` does not gate
        // CSSOM property writes — only `style="..."` attributes already in parsed markup (or a
        // `setAttribute('style', …)`) and `<style>` elements, neither of which the export
        // contains. Verified empirically: the full suite (load/open/play/stop across every spec,
        // via `checks/fixtures.ts`'s violation net) is clean at `'self'`.
        `style-src 'self'`,
        `font-src 'self'`,
        // `core/platform.ts`'s `unlockAudio()` plays a tiny `data:audio/wav;base64,...`
        // `<audio>` element on every Play — the pre-#1404 engine's iOS (16 and older, ringer on
        // silent) fix for Web Audio staying muted until a media element has played once. It has
        // no served URL to allow by origin, so `data:` is the one addition here.
        `media-src 'self' data:`,
        `object-src 'none'`,
        `base-uri 'self'`,
        `form-action 'self'`,
    ].join('; ');
}
function injectCspMeta(html, csp) {
    const metaTag = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
    // As early in <head> as this export can put it — the very first thing after the opening tag,
    // ahead of the charset meta, the stylesheet link and every script — so nothing in <head> ever
    // renders or runs unpolicied.
    return html.replace(/<head(?=[\s>])[^>]*>/i, (openTag) => `${openTag}${metaTag}`);
}
for (const file of (await walk(root)).filter((p) => p.endsWith('.html'))) {
    const html = await readFile(file, 'utf8');
    const hashes = extractInlineScripts(html).map((script) =>
        createHash('sha256').update(script, 'utf8').digest('base64'),
    );
    await writeFile(file, injectCspMeta(html, buildCsp(hashes)));
}

const paths = (await walk(root))
    // `sw.js` and `build.json` are this script's own output.
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

// The shell cache's namespace. Every root worker names its cache `ensemble-v2-root-<fingerprint>`
// and, on activate, deletes every OTHER cache in this namespace — the shells of the releases it
// replaced. The prefix must never change: a worker only retires the caches its own prefix
// matches, so a rename would leave every installed browser's old shells behind for good. Nor may
// it reach `ensemble-v2-sounds-v1` (`lib/sounds.ts`), which holds packs the musician downloaded
// and survives every upgrade.
const shellCaches = 'ensemble-v2-root-';

// What an in-scope navigation gets when it is not in the cache. The scope is the origin, so
// `/anything` reaches this handler. The rule: a navigation that the NETWORK refuses falls back
// to the cached shell, so a page with a query (`/?autoplay=1`) still opens a working stand on a train. A 404 is a
// fetch that SUCCEEDED, so a real missing path stays a real missing path, and a subresource
// request is never given HTML.
const navigationFallback = `
        if (event.request.mode === 'navigate') {
            return await cache.match(key) || await fetch(event.request).catch(async () => await cache.match(SCOPE) || Response.error());
        }`;

// One atomic cache installation: a partial download never earns offline-ready.
// A newer worker waits behind the running one until the musician presses Reload (its
// `skip-waiting` message, #1889) or every tab closes. Once it takes over, every page reloads
// (`app/use-offline-install.ts`): activate deletes the old shell, so a page left on the old
// release would miss its own lazy chunks.
//
// SCOPE is `/`, so the prefix test alone matches everything on the origin, the account API
// included. PASSES names that exclusion explicitly instead of inheriting it from a narrower
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
const SHELL_CACHES = '${shellCaches}';
const ASSETS = ${JSON.stringify([...Object.keys(assets).filter((url) => !url.startsWith(`${scope}packs/`)), scope, `${scope}build.json`])};
self.addEventListener('install', event => event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try { await cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' }))); }
    catch (error) { await caches.delete(CACHE); throw error; }
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
    for (const name of await caches.keys().catch(() => [])) if (name.startsWith(SHELL_CACHES) && name !== CACHE) await caches.delete(name).catch(() => {});
    await self.clients.claim();
})()));
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'skip-waiting') self.skipWaiting();
});
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
    if (url.pathname === SCOPE + 'sw.js') return;
    if (PASSES.some(prefix => url.pathname === prefix || url.pathname.startsWith(prefix + '/'))) return;
    // Sound files are never in this cache (ASSETS leaves them out; \`lib/sounds.ts\` keeps its own),
    // so they go straight to the network. Answered here, an offline miss failed respondWith,
    // which WebKit reports as a page error even when the page catches its fetch (#1997: the
    // band's background sound fetch, offline); answered by the network, it is only a failed fetch.
    if (url.pathname.startsWith(SCOPE + 'packs/')) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const key = url.pathname;${navigationFallback}
        return await cache.match(key) || fetch(event.request);
    })());
});
`,
);

console.log(
    `V2 artifact ${fingerprint.slice(0, 16)} · ${paths.length} deployed assets (sounds download on demand)`,
);
