import { afterEach, describe, expect, it } from 'vitest';
import { createWebAuthnConfig, type WebAuthnConfig } from '../../src/auth/config.js';
import { createApp } from '../../src/http/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

/**
 * JSON-only guard (#1189 decision 10) and the "no CORS, ever" rule.
 */

const CONFIG: WebAuthnConfig = createWebAuthnConfig({
    rpId: 'ensembletest.brndn.zip',
    rpName: 'Ensemble Test',
    origin: 'https://ensembletest.brndn.zip',
});

const URL_BASE = 'https://ensembletest.brndn.zip';

describe('content-type guard', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('rejects a body-carrying POST with a non-JSON content type', async () => {
        testDb = createTestDatabase();
        const app = createApp({ db: testDb.db, config: CONFIG });
        // Content-Length set explicitly: app.request()'s in-memory Request never surfaces a
        // computed Content-Length via `.headers` the way a real over-the-wire request would.
        const res = await app.request(`${URL_BASE}/api/auth/register/verify`, {
            method: 'POST',
            headers: {
                origin: CONFIG.origin,
                'content-type': 'application/x-www-form-urlencoded',
                'content-length': '3',
            },
            body: 'a=1',
        });
        expect(res.status).toBe(415);
        expect(await res.json()).toEqual({ error: 'unsupported_media_type' });
    });

    it('rejects a body-carrying POST with no content type at all', async () => {
        testDb = createTestDatabase();
        const app = createApp({ db: testDb.db, config: CONFIG });
        const res = await app.request(`${URL_BASE}/api/auth/register/verify`, {
            method: 'POST',
            headers: { origin: CONFIG.origin, 'content-length': '10' },
            body: '{"a": 1}',
        });
        expect(res.status).toBe(415);
    });

    it('allows a body-less POST (logout) with no content type', async () => {
        testDb = createTestDatabase();
        const app = createApp({ db: testDb.db, config: CONFIG });
        const res = await app.request(`${URL_BASE}/api/auth/logout`, {
            method: 'POST',
            headers: { origin: CONFIG.origin },
        });
        expect(res.status).toBe(204);
    });

    it('never sets an Access-Control-Allow-Origin header on a cross-origin preflight', async () => {
        testDb = createTestDatabase();
        const app = createApp({ db: testDb.db, config: CONFIG });
        const res = await app.request(`${URL_BASE}/api/auth/session`, {
            method: 'OPTIONS',
            headers: {
                origin: 'https://evil.example',
                'access-control-request-method': 'GET',
            },
        });
        expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });

    describe('exact media-type matching (P3: split on ";", trim, lowercase)', () => {
        async function postWithContentType(contentType: string): Promise<Response> {
            const app = createApp({ db: testDb.db, config: CONFIG });
            const rawBody = JSON.stringify({ id: 'x', rawId: 'x', response: {} });
            return app.request(`${URL_BASE}/api/auth/register/verify`, {
                method: 'POST',
                headers: {
                    origin: CONFIG.origin,
                    'content-type': contentType,
                    'content-length': String(Buffer.byteLength(rawBody, 'utf8')),
                },
                body: rawBody,
            });
        }

        it('rejects application/jsonx (startsWith would wrongly accept this)', async () => {
            testDb = createTestDatabase();
            const res = await postWithContentType('application/jsonx');
            expect(res.status).toBe(415);
        });

        it('rejects application/json-patch+json (startsWith would wrongly accept this)', async () => {
            testDb = createTestDatabase();
            const res = await postWithContentType('application/json-patch+json');
            expect(res.status).toBe(415);
        });

        it('accepts application/json; charset=utf-8', async () => {
            testDb = createTestDatabase();
            const res = await postWithContentType('application/json; charset=utf-8');
            // Not 415 -- it reaches the route and fails for an unrelated reason (no valid
            // ceremony cookie), proving the content-type guard let it through.
            expect(res.status).not.toBe(415);
        });

        it('accepts APPLICATION/JSON (case-insensitive)', async () => {
            testDb = createTestDatabase();
            const res = await postWithContentType('APPLICATION/JSON');
            expect(res.status).not.toBe(415);
        });
    });

    it('rejects PURGE with a valid Origin and a text/plain body (N15: shared method list)', async () => {
        testDb = createTestDatabase();
        const app = createApp({ db: testDb.db, config: CONFIG });
        const body = 'not json';
        // A valid Origin so this exercises ONLY the content-type guard, not same-origin. PURGE
        // is unsafe under the shared `http-safe-methods.ts` deny-list; a content-type.ts that
        // rolled its own POST/PUT/PATCH/DELETE list instead of importing the shared one would
        // treat PURGE as "safe" and let this straight through (200/401/etc, never 415).
        const res = await app.request(`${URL_BASE}/api/auth/logout`, {
            method: 'PURGE',
            headers: {
                origin: CONFIG.origin,
                'content-type': 'text/plain',
                'content-length': String(Buffer.byteLength(body, 'utf8')),
            },
            body,
        });
        expect(res.status).toBe(415);
        expect(await res.json()).toEqual({ error: 'unsupported_media_type' });
    });

    it('detects a chunked body via Transfer-Encoding (R16: requestHasBody chunked branch)', async () => {
        testDb = createTestDatabase();
        const app = createApp({ db: testDb.db, config: CONFIG });
        // No Content-Length at all -- only Transfer-Encoding: chunked signals a body is present.
        // Wrong content-type here must still be caught (415), proving requestHasBody's chunked
        // branch actually detected the body rather than treating this as bodyless and skipping
        // the content-type check entirely.
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('a=1'));
                controller.close();
            },
        });
        const res = await app.request(`${URL_BASE}/api/auth/register/verify`, {
            method: 'POST',
            headers: {
                origin: CONFIG.origin,
                'content-type': 'application/x-www-form-urlencoded',
                'transfer-encoding': 'chunked',
            },
            body: stream,
            duplex: 'half',
        } as RequestInit);
        expect(res.status).toBe(415);
    });
});
