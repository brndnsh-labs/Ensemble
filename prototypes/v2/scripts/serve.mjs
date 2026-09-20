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
};
async function handler(request, response) {
    try {
        const url = new URL(request.url, 'http://localhost');
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
        const body = await readFile(file);
        response.writeHead(200, {
            'Content-Type': types[path.extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store',
        });
        response.end(body);
    } catch {
        response.writeHead(404);
        response.end('Not found');
    }
}
const server = http.createServer(handler);
server.listen(port, '127.0.0.1', () => {
    console.log(`V2 preview: http://127.0.0.1:${server.address().port}${scope}`);
});
