import net from 'node:net';
import { serve } from '@hono/node-server';
import { afterEach, describe, expect, it } from 'vitest';
import { createWebAuthnConfig, type WebAuthnConfig } from '../../src/auth/config.js';
import { createApp } from '../../src/http/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

/**
 * `bodyLimit`'s real enforcement mechanism is Node's own HTTP framing, not Hono in-memory
 * plumbing (#1189 decision/premise 2, mutation table's last item). Verified with a probe against
 * the installed `hono@4.13.7` + `@hono/node-server@2.1.1`: over `app.request()`, a lying
 * `Content-Length: 10` with an actual 1000-byte body reads all 1000 bytes because
 * `bodyLimit`'s Content-Length branch trusts the DECLARED length and never re-checks the
 * ACTUAL bytes read (see its source) — in memory there is no HTTP parser to catch the lie. Over a
 * real listening socket, Node's HTTP parser enforces framing itself: a lying Content-Length gets
 * `400 Bad Request` before the application ever sees it, and an honest oversized body (with
 * either Content-Length or chunked Transfer-Encoding) gets `413` from `bodyLimit`'s streaming
 * byte-count branch. An `app.request()`-only test cannot show any of this — it would either pass
 * for the wrong reason or silently document a bypass that cannot happen in production.
 *
 * This test starts a REAL `@hono/node-server` instance on an ephemeral port and drives it with
 * raw `node:net` sockets, hand-writing HTTP/1.1 request lines (`server.once('listening')` to get
 * the assigned port, then raw `net.connect` + `sock.write(...)`).
 */

const CONFIG: WebAuthnConfig = createWebAuthnConfig({
    rpId: 'ensembletest.brndn.zip',
    rpName: 'Ensemble Test',
    origin: 'https://ensembletest.brndn.zip',
});

interface RawResponse {
    statusLine: string;
    raw: string;
}

function sendRaw(port: number, request: string): Promise<RawResponse> {
    return new Promise((resolve, reject) => {
        const sock = net.connect(port, '127.0.0.1');
        let out = '';
        sock.on('data', (d) => {
            out += d.toString('utf8');
        });
        sock.on('error', reject);
        sock.on('close', () => {
            const statusLine = out.split('\r\n')[0] ?? '';
            resolve({ statusLine, raw: out });
        });
        sock.on('connect', () => {
            sock.write(request);
        });
        // Give the server enough time to respond, then force-close the connection — every
        // request below sets Connection: close so the server closes its end once it has replied.
        setTimeout(() => sock.destroy(), 2000);
    });
}

function chunk(payload: string): string {
    return `${payload.length.toString(16)}\r\n${payload}\r\n`;
}

describe('body-limit enforcement over a real socket', () => {
    let testDb: TestDatabase;
    let server: ReturnType<typeof serve>;
    let port: number;

    afterEach(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        testDb?.cleanup();
    });

    async function startServer(): Promise<void> {
        testDb = createTestDatabase();
        const app = createApp({ db: testDb.db, config: CONFIG });
        server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
        await new Promise<void>((resolve) => server.once('listening', () => resolve()));
        const address = server.address();
        if (address === null || typeof address === 'string') {
            throw new Error('expected a real listening address with a port');
        }
        port = address.port;
    }

    it('honors bodyLimit(64KB) on an honest, oversized Content-Length', async () => {
        await startServer();
        const oversized = 'x'.repeat(64 * 1024 + 1);
        const body = JSON.stringify({ padding: oversized });
        const request =
            'POST /api/auth/register/verify HTTP/1.1\r\n' +
            'Host: ensembletest.brndn.zip\r\n' +
            `Origin: ${CONFIG.origin}\r\n` +
            'Content-Type: application/json\r\n' +
            `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n` +
            'Connection: close\r\n\r\n' +
            body;

        const res = await sendRaw(port, request);
        expect(res.statusLine).toContain('413');
        expect(res.raw).toContain('payload_too_large');
    });

    it('honors bodyLimit(64KB) on a chunked, oversized body with no Content-Length', async () => {
        await startServer();
        const oversized = 'y'.repeat(64 * 1024 + 1);
        const request =
            'POST /api/auth/register/verify HTTP/1.1\r\n' +
            'Host: ensembletest.brndn.zip\r\n' +
            `Origin: ${CONFIG.origin}\r\n` +
            'Content-Type: application/json\r\n' +
            'Transfer-Encoding: chunked\r\n' +
            'Connection: close\r\n\r\n' +
            chunk(oversized) +
            '0\r\n\r\n';

        const res = await sendRaw(port, request);
        expect(res.statusLine).toContain('413');
    });

    it('rejects a lying Content-Length (too small) with a framing-level 400, not a silent pass-through', async () => {
        await startServer();
        const actual = 'x'.repeat(1000);
        const request =
            'POST /api/auth/register/verify HTTP/1.1\r\n' +
            'Host: ensembletest.brndn.zip\r\n' +
            `Origin: ${CONFIG.origin}\r\n` +
            'Content-Type: application/json\r\n' +
            'Content-Length: 10\r\n' +
            'Connection: close\r\n\r\n' +
            actual;

        const res = await sendRaw(port, request);
        // Node's own HTTP parser rejects the malformed framing before the application (and
        // therefore bodyLimit) ever sees it — this is the exact case the design doc's premise 2
        // measured, and the reason a real socket (not app.request()) is required here.
        expect(res.statusLine).toContain('400');
        // This is the assertion an app.request()-only version of this test cannot make: over
        // app.request(), the lying Content-Length is silently trusted, the full 1000 bytes are
        // read anyway, JSON.parse fails on the garbage payload, and OUR OWN error handler emits
        // `{"error":"malformed_request"}` — a 400 for an entirely different, wrong reason. Here,
        // the connection never reaches the application at all, so the body is Node's own plain
        // "Bad Request" text, never our JSON error shape.
        expect(res.raw).not.toContain('malformed_request');
    });

    it('allows a well-formed, in-bounds request through to the application', async () => {
        await startServer();
        const body = JSON.stringify({
            id: 'x',
            rawId: 'x',
            type: 'public-key',
            clientExtensionResults: {},
            response: { clientDataJSON: 'x', attestationObject: 'x' },
        });
        const request =
            'POST /api/auth/register/verify HTTP/1.1\r\n' +
            'Host: ensembletest.brndn.zip\r\n' +
            `Origin: ${CONFIG.origin}\r\n` +
            'Content-Type: application/json\r\n' +
            `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n` +
            'Connection: close\r\n\r\n' +
            body;

        const res = await sendRaw(port, request);
        // Not 413/415/403 — it reaches the route and fails the ceremony (no valid cookie), which
        // collapses to 401, proving the request passed the body-limit and content-type gates.
        expect(res.statusLine).toContain('401');
        expect(res.raw).toContain('authentication_failed');
    });
});
