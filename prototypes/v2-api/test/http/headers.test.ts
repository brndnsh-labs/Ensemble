import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createWebAuthnConfig, type WebAuthnConfig } from '../../src/auth/config.js';
import { createApp } from '../../src/http/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

/**
 * Security headers must appear on every /api/* response (#1189 decision 12) — including 404,
 * 413, 415, 401, 403 and 500. This is the exact failure mode the design comment calls out:
 * middleware headers are easy to lose on the notFound/onError paths specifically.
 */

const CONFIG: WebAuthnConfig = createWebAuthnConfig({
    rpId: 'ensembletest.brndn.zip',
    rpName: 'Ensemble Test',
    origin: 'https://ensembletest.brndn.zip',
});

const REQUIRED_HEADERS: Record<string, string> = {
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
};

function expectSecurityHeaders(res: Response): void {
    for (const [name, value] of Object.entries(REQUIRED_HEADERS)) {
        expect(res.headers.get(name), `header ${name} on a ${res.status} response`).toBe(value);
    }
}

describe('security headers on every /api/* response', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('401 (GET /api/auth/session, unauthenticated)', async () => {
        testDb = createTestDatabase();
        const app = createApp({ db: testDb.db, config: CONFIG });
        const res = await app.request('https://ensembletest.brndn.zip/api/auth/session');
        expect(res.status).toBe(401); // still exercises the header path on a non-2xx
        expectSecurityHeaders(res);
    });

    it('403 (same-origin rejection)', async () => {
        testDb = createTestDatabase();
        const app = createApp({ db: testDb.db, config: CONFIG });
        const res = await app.request('https://ensembletest.brndn.zip/api/auth/logout', {
            method: 'POST',
            headers: { origin: 'https://evil.example' },
        });
        expect(res.status).toBe(403);
        expectSecurityHeaders(res);
    });

    it('404 (unknown route)', async () => {
        testDb = createTestDatabase();
        const app = createApp({ db: testDb.db, config: CONFIG });
        const res = await app.request('https://ensembletest.brndn.zip/api/does-not-exist');
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'not_found' });
        expectSecurityHeaders(res);
    });

    it('415 (wrong content type on a route with a body)', async () => {
        testDb = createTestDatabase();
        const app = createApp({ db: testDb.db, config: CONFIG });
        const body = 'not json';
        const res = await app.request('https://ensembletest.brndn.zip/api/auth/register/verify', {
            method: 'POST',
            headers: {
                origin: CONFIG.origin,
                'content-type': 'text/plain',
                // Set explicitly: app.request()'s in-memory Request never surfaces a computed
                // Content-Length via `.headers` the way a real over-the-wire request would.
                'content-length': String(Buffer.byteLength(body, 'utf8')),
            },
            body,
        });
        expect(res.status).toBe(415);
        expectSecurityHeaders(res);
    });

    it('413 (body over the limit, in-memory request)', async () => {
        testDb = createTestDatabase();
        const app = createApp({ db: testDb.db, config: CONFIG });
        const oversized = 'x'.repeat(64 * 1024 + 1);
        const res = await app.request('https://ensembletest.brndn.zip/api/auth/register/verify', {
            method: 'POST',
            headers: { origin: CONFIG.origin, 'content-type': 'application/json' },
            body: JSON.stringify({ padding: oversized }),
        });
        expect(res.status).toBe(413);
        expectSecurityHeaders(res);
    });

    it('500 (an unhandled exception reaches app.onError)', async () => {
        testDb = createTestDatabase();
        const app = createApp({ db: testDb.db, config: CONFIG });
        testDb.db.close(); // any route touching the db now throws synchronously
        // A 43-character (well-formed-length) token so readSession's length guard doesn't
        // short-circuit before ever touching the (now-closed) database.
        const res = await app.request('https://ensembletest.brndn.zip/api/auth/session', {
            headers: { cookie: `__Host-ensemble_session=${'a'.repeat(43)}` },
        });
        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: 'internal_error' });
        expectSecurityHeaders(res);
        // db is already closed (node:sqlite throws "database is not open" on a double close) —
        // clean up the temp directory by hand and skip the afterEach cleanup for this test.
        rmSync(dirname(testDb.path), { recursive: true, force: true });
        testDb = undefined as unknown as TestDatabase;
    });

    describe("headers on '*', not just '/api/*' (P3)", () => {
        it('carries headers on a path outside /api entirely', async () => {
            testDb = createTestDatabase();
            const app = createApp({ db: testDb.db, config: CONFIG });
            const res = await app.request('https://ensembletest.brndn.zip/totally/unrelated');
            expect(res.status).toBe(404);
            expectSecurityHeaders(res);
        });

        it('carries headers on a double-slash path (POST //api/auth/logout)', async () => {
            testDb = createTestDatabase();
            const app = createApp({ db: testDb.db, config: CONFIG });
            const res = await app.request('https://ensembletest.brndn.zip//api/auth/logout', {
                method: 'POST',
            });
            expectSecurityHeaders(res);
        });

        it('carries headers on a differently-cased /API/... path', async () => {
            testDb = createTestDatabase();
            const app = createApp({ db: testDb.db, config: CONFIG });
            const res = await app.request('https://ensembletest.brndn.zip/API/auth/session');
            expect(res.status).toBe(404); // route matching is case-sensitive; this is unmatched
            expectSecurityHeaders(res);
        });
    });
});
