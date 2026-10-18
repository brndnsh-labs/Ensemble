import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve('out');
// The export is served from the site root, the only base there is (#1734). `build.json` keys
// every asset under `/`, so a stale `out/` from before that fails here with one clear sentence
// instead of a blank app and a suite of confusing timeouts.
const built = JSON.parse(readFileSync(path.join(root, 'build.json'), 'utf8')).assets;
if (!Object.hasOwn(built, '/index.html')) {
    throw new Error('out/ was not built for the site root — rebuild it.');
}
// 0 = ephemeral; the Playwright fixture (checks/fixtures.ts) starts one server per worker
// and reads the bound port back from the startup line below.
const port = Number(process.env.V2_PREVIEW_PORT ?? 3100);
let networkDisconnected = false;
// Where `/api/*` goes, set per worker by the account fixture (checks/fixtures.ts). Unset, the
// path 404s, as a missing file does, so guest specs never depend on the API being up.
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
        if (request.method === 'POST' && url.pathname === '/__test/sw-revision') {
            workerRevision = url.searchParams.get('reset') === '1' ? 0 : workerRevision + 1;
            response.writeHead(204);
            response.end();
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
        let file = path.resolve(root, decodeURIComponent(url.pathname.slice(1)));
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
        if (workerRevision > 0 && url.pathname === '/sw.js') {
            // A real release never reuses a shell cache name — the fingerprint in it hashes the
            // assets and the recipe — and the worker's activate sweep reads those names, so a
            // staged "newer build" has to carry a newer name too.
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
        // BUG in the harness — and answering 404 disguises it as an ordinary missing file (a
        // formatter once turned a hook's `let` into `const`, and the TypeError surfaced only as a
        // 404 that cost a debugging round). Say so instead.
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
    console.log(`V2 preview: http://127.0.0.1:${server.address().port}/`);
});
