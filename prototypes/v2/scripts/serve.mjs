import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { basePathFromEnv } from './base-path.mjs';

const root = path.resolve('out');
// Serve the export where it was built to live — `/v2/` today, `/` at the cutover. The build
// and this harness read the same variable (scripts/base-path.mjs) but in separate processes,
// so the artifact on disk is asked too: `offline.mjs` keys every `build.json` asset under the
// base it was built for, and serving a `/v2` export at `/` (or the reverse) is a blank app and
// a suite of confusing timeouts rather than one clear sentence.
const base = basePathFromEnv();
const scope = `${base}/`;
const built = JSON.parse(readFileSync(path.join(root, 'build.json'), 'utf8')).assets;
// The shell's own entry is the tell: `/v2/index.html` in a `/v2` export, `/index.html` in a
// root one. A prefix test cannot tell them apart, since every `/v2/…` key also starts with `/`.
if (!Object.hasOwn(built, `${scope}index.html`)) {
    throw new Error(
        `out/ was not built for ENSEMBLE_V2_BASE=${base || '/'} — rebuild with the same value.`,
    );
}
// 0 = ephemeral; the Playwright fixture (checks/fixtures.ts) starts one server per worker
// and reads the bound port back from the startup line below.
const port = Number(process.env.V2_PREVIEW_PORT ?? 3100);
let networkDisconnected = false;
// Where `/api/*` goes, set per worker by the account fixture (checks/fixtures.ts). Unset, the
// path 404s — as an out-of-scope path does at `/v2`, and as a missing file does at the site
// root — so guest specs never depend on the API being up.
let apiTarget = null;
const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
};

// ---------------------------------------------------------------------------------------------
// Stand-ins for the two workers a returning browser can already hold at the cutover (#1355).
//
// The handover specs (checks/root-handover.chromium.spec.ts) need a browser that has BEEN here
// before, which no build of this app can produce: the point is what happens to code that is
// about to stop existing. So this harness can serve, in place of the root export, a minimal v1
// and a minimal `/v2/` preview — each faithful in the two respects the handover turns on, its
// cache NAMES and its waiting policy, and deliberately nothing else. Toggled per test through
// `/__test/legacy`, and reset by the spec's afterEach; the toggle is process-global, which is
// why checks/fixtures.ts already gives every Playwright worker its own server.
// ---------------------------------------------------------------------------------------------

/**
 * Mirrors `public/pwa.ts`: register `./sw.js`, ask for an update, reload on any controller.
 *
 * `?reload=0` serves the same page WITHOUT that reload, which is the case the worker's belt
 * exists for and the only shape that catches an awaited `client.navigate` (#1355 review R1/R8).
 * A page that reloads itself hides the deadlock completely: it is already on its way to the new
 * shell before the belt's navigation would have mattered. Real examples of a non-reloading
 * window in scope at the cutover: a build older than #1048, a tab where `initPWA` took its
 * `navigator.webdriver`/localhost branch, and the v2 shell itself, which has no such listener.
 */
const v1Page = (reload) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Ensemble v1 stand-in</title></head>
<body data-standin="v1">
<main>Old Ensemble app shell.</main>
<script>
${
    reload
        ? `let refreshing = false;
navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
});`
        : '// This build never reloads itself. Only the worker can move this window.'
}
navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    .then((registration) => registration.update())
    .catch(() => {});
</script>
</body></html>
`;
const V1_PAGE = v1Page(true);
const V1_PAGE_NO_RELOAD = v1Page(false);

/**
 * Mirrors `public/sw.ts` where the handover reads it: the precache name workbox-core composes
 * from `setCacheNameDetails({ prefix: 'ensemble' })`, the literal `ensemble-packs` bucket its
 * `/packs/` route names, cache-first over the whole origin, and `skipWaiting` only on an
 * explicit SKIP_WAITING message — which is exactly why an update of it would otherwise wait.
 */
const V1_WORKER = `
const PRECACHE = 'ensemble-precache-v2-' + self.registration.scope;
const PACKS = 'ensemble-packs';
self.addEventListener('install', (event) => event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    await cache.add(new Request('/', { cache: 'reload' }));
    await caches.open(PACKS);
})()));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('message', (event) => { if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
    event.respondWith(caches.open(PRECACHE).then((cache) => cache.match(url.pathname).then((hit) => hit || fetch(event.request))));
});
`;

/** Mirrors `app/use-offline-install.ts` registering the beta's worker at its own scope. */
const PREVIEW_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Ensemble v2 preview stand-in</title></head>
<body data-standin="v2-preview">
<main>Old music stand preview.</main>
<script>
navigator.serviceWorker.register('/v2/sw.js', { scope: '/v2/', updateViaCache: 'none' })
    .then((registration) => registration.update())
    .catch(() => {});
</script>
</body></html>
`;

/**
 * Mirrors the worker `scripts/offline.mjs` emitted at base `/v2`: one cache in the
 * `ensemble-v2-preview-` namespace, cache-first for its whole scope, and no `skipWaiting` —
 * so a bookmarked `/v2/` is answered from its cache and never sees the redirect #1356 installs.
 */
const PREVIEW_WORKER = `
const CACHE = 'ensemble-v2-preview-standin';
const SCOPE = '/v2/';
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.add(new Request(SCOPE, { cache: 'reload' })))));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
    if (url.pathname === SCOPE + 'sw.js') return;
    event.respondWith(caches.open(CACHE).then((cache) => cache.match(url.pathname).then((hit) => hit || fetch(event.request))));
});
`;

// A Map, not an object literal: the key is a request path and `TABLE[untrusted]` is how a
// lookup hands back `Object.prototype`'s members as if they were content.
const standIns = (reload) =>
    new Map([
        ['/', ['.html', reload ? V1_PAGE : V1_PAGE_NO_RELOAD]],
        ['/index.html', ['.html', reload ? V1_PAGE : V1_PAGE_NO_RELOAD]],
        ['/sw.js', ['.js', V1_WORKER]],
        ['/v2/', ['.html', PREVIEW_PAGE]],
        ['/v2/index.html', ['.html', PREVIEW_PAGE]],
        ['/v2/sw.js', ['.js', PREVIEW_WORKER]],
    ]);
const STAND_INS = standIns(true);
const STAND_INS_NO_RELOAD = standIns(false);
let legacyStandIn = false;
// Whether the v1 stand-in page reloads itself on `controllerchange`, as `public/pwa.ts` does.
let legacySelfReload = true;
// How many times the real `/sw.js` has been nudged. A service-worker update turns on the script
// being BYTE-different, so this is what lets a spec stage a newer build of this very app and
// prove it still waits behind the running one.
let workerRevision = 0;
async function handler(request, response) {
    // Declared out here so the catch can tell a bug in a `/__test/*` hook from an ordinary
    // missing file. See the catch.
    let url;
    try {
        url = new URL(request.url, 'http://localhost');
        // Local test harness only; this server is never deployed. Disconnecting
        // sockets proves cache-only navigation without WebKit's broken offline emulation.
        if (request.method === 'POST' && url.pathname === '/__test/network') {
            networkDisconnected = url.searchParams.get('offline') === '1';
            response.writeHead(204);
            response.end();
            return;
        }
        if (networkDisconnected) {
            request.socket.destroy();
            return;
        }
        if (request.method === 'POST' && url.pathname === '/__test/legacy') {
            legacyStandIn = url.searchParams.get('on') === '1';
            legacySelfReload = url.searchParams.get('reload') !== '0';
            response.writeHead(204);
            response.end();
            return;
        }
        if (request.method === 'POST' && url.pathname === '/__test/sw-revision') {
            workerRevision = url.searchParams.get('reset') === '1' ? 0 : workerRevision + 1;
            response.writeHead(204);
            response.end();
            return;
        }
        const table = legacySelfReload ? STAND_INS : STAND_INS_NO_RELOAD;
        if (legacyStandIn && request.method === 'GET' && table.has(url.pathname)) {
            const [extension, body] = table.get(url.pathname);
            response.writeHead(200, {
                'Content-Type': types[extension],
                'Cache-Control': 'no-store',
            });
            response.end(body);
            return;
        }
        if (request.method === 'POST' && url.pathname === '/__test/api') {
            const target = url.searchParams.get('target');
            apiTarget = target ? new URL(target) : null;
            response.writeHead(204);
            response.end();
            return;
        }
        // One origin, as in production: Caddy splits `/api/*` to the account API and serves
        // the rest statically. Headers pass through untouched in both directions — the API's
        // same-origin guard reads `Origin`/`Sec-Fetch-Site`, and its cookies must reach the
        // browser as it set them.
        if (apiTarget && (url.pathname === '/api' || url.pathname.startsWith('/api/'))) {
            const upstream = http.request(
                {
                    host: apiTarget.hostname,
                    port: apiTarget.port,
                    method: request.method,
                    path: request.url,
                    headers: request.headers,
                },
                (reply) => {
                    response.writeHead(reply.statusCode ?? 502, reply.headers);
                    reply.pipe(response);
                },
            );
            upstream.on('error', () => {
                response.writeHead(502);
                response.end();
            });
            request.pipe(upstream);
            return;
        }
        if (!url.pathname.startsWith(scope)) {
            response.writeHead(404);
            response.end();
            return;
        }
        let file = path.resolve(root, decodeURIComponent(url.pathname.slice(scope.length)));
        if (!file.startsWith(`${root}/`) && file !== root) {
            throw new Error('Invalid path');
        }
        if ((await stat(file)).isDirectory()) {
            file = path.join(file, 'index.html');
        }
        // Read BEFORE the head is written: a directory with no `index.html` must reach the
        // 404 below, not throw ERR_HTTP_HEADERS_SENT from inside it and take the server down.
        let body = await readFile(file);
        // A newer build of this same app, for a spec that has to prove one still waits. Only
        // the bytes and the CACHE name change — ASSETS and handlers are the shipped worker's, so
        // what is under test is the update policy and not some fabricated second worker.
        if (workerRevision > 0 && url.pathname === `${scope}sw.js`) {
            // A real release never reuses a shell cache name — the fingerprint in it hashes the
            // assets and the recipe — and the worker's own policy reads those names
            // (`replacingRoot`), so a staged "newer build" has to carry a newer name too.
            body = Buffer.from(
                `${body
                    .toString('utf8')
                    .replace(
                        /^const CACHE = '([^']+)';$/m,
                        `const CACHE = '$1-r${workerRevision}';`,
                    )}// revision ${workerRevision}\n`,
            );
        }
        response.writeHead(200, {
            'Content-Type': types[path.extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store',
        });
        response.end(body);
    } catch (error) {
        // A `/__test/*` path is harness plumbing, never a file on disk, so a throw from one is a
        // BUG in the harness — and answering 404 disguises it as an ordinary missing file. That
        // is not hypothetical: a formatter fixing `let legacyStandIn` to `const` turned the
        // assignment into a TypeError, which surfaced only as a 404 on `/__test/legacy` and cost
        // a debugging round (#1355 review R16). Say so instead.
        if (url?.pathname.startsWith('/__test/')) {
            console.error(`serve.mjs: ${url.pathname} failed`, error);
            response.writeHead(500);
            response.end('Test hook failed');
            return;
        }
        response.writeHead(404);
        response.end('Not found');
    }
}
const server = http.createServer(handler);
server.listen(port, '127.0.0.1', () => {
    console.log(`V2 preview: http://127.0.0.1:${server.address().port}${scope}`);
});
