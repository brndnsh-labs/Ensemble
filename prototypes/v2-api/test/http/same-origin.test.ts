import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWebAuthnConfig, type WebAuthnConfig } from '../../src/auth/config.js';
import { createApp } from '../../src/http/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

/**
 * The same-origin guard (#1189 decision 9) exercised through the real app, on `POST
 * /api/auth/logout` — a route that needs neither a session, a ceremony cookie, nor a body, so a
 * test can isolate exactly the same-origin gate. A logout that gets past the gate always
 * resolves `204`; anything else means the gate itself decided the outcome.
 */

const CONFIG: WebAuthnConfig = createWebAuthnConfig({
    rpId: 'ensembletest.brndn.zip',
    rpName: 'Ensemble Test',
    origin: 'https://ensembletest.brndn.zip',
});

const URL_BASE = 'https://ensembletest.brndn.zip';
const LOGOUT_URL = `${URL_BASE}/api/auth/logout`;

describe('same-origin guard', () => {
    let testDb: TestDatabase;

    // A fresh database per test, assigned before every test runs — never a `testDb ?? create...`
    // fallback in the helper below, which could otherwise resolve to a PRIOR test's already
    // `cleanup()`-closed database if a test ever forgot to assign one itself.
    beforeEach(() => {
        testDb = createTestDatabase();
    });

    afterEach(() => {
        testDb.cleanup();
    });

    function post(headers: Record<string, string>, url: string = LOGOUT_URL) {
        const app = createApp({ db: testDb.db, config: CONFIG });
        return app.request(url, { method: 'POST', headers });
    }

    it('allows Sec-Fetch-Site: same-origin with a matching Origin', async () => {
        const res = await post({ 'sec-fetch-site': 'same-origin', origin: CONFIG.origin });
        expect(res.status).toBe(204);
    });

    it('rejects Sec-Fetch-Site: cross-site even with a matching Origin', async () => {
        const res = await post({ 'sec-fetch-site': 'cross-site', origin: CONFIG.origin });
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: 'forbidden_origin' });
    });

    it('rejects Sec-Fetch-Site: same-site (mutation: only same-origin is accepted)', async () => {
        const res = await post({ 'sec-fetch-site': 'same-site', origin: CONFIG.origin });
        expect(res.status).toBe(403);
    });

    it('rejects Sec-Fetch-Site: same-origin with NEITHER Origin NOR Referer (R18 guard)', async () => {
        // A mutant that lets `Sec-Fetch-Site: same-origin` short-circuit past the Origin/Referer
        // check entirely would wrongly allow this — the header alone is not sufficient.
        const res = await post({ 'sec-fetch-site': 'same-origin' });
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: 'forbidden_origin' });
    });

    it('allows a matching Origin with no Sec-Fetch-Site header', async () => {
        const res = await post({ origin: CONFIG.origin });
        expect(res.status).toBe(204);
    });

    it('rejects a foreign Origin', async () => {
        const res = await post({ origin: 'https://evil.example' });
        expect(res.status).toBe(403);
    });

    it('compares Origin against config.origin, never the request URL', async () => {
        const app = createApp({ db: testDb.db, config: CONFIG });
        // The request URL's own origin ("http://internal-container:9999", the shape Caddy would
        // present to this service) differs from config.origin, but the Origin header equals
        // config.origin exactly. A middleware that compared against the request URL (the
        // documented Caddy footgun) would reject this; the correct implementation allows it.
        const res = await app.request('http://internal-container:9999/api/auth/logout', {
            method: 'POST',
            headers: { origin: CONFIG.origin },
        });
        expect(res.status).toBe(204);
    });

    it('falls back to Referer when Origin is absent, requiring a matching parsed origin', async () => {
        const res = await post({ referer: `${CONFIG.origin}/some/page` });
        expect(res.status).toBe(204);
    });

    it('rejects a foreign Referer when Origin is absent', async () => {
        const res = await post({ referer: 'https://evil.example/some/page' });
        expect(res.status).toBe(403);
    });

    it('rejects a look-alike-subdomain Referer (R12 guard: exact match, not startsWith)', async () => {
        // "https://ensembletest.brndn.zip.evil.example" STARTS WITH config.origin as a string,
        // but its parsed origin is a completely different host. A `startsWith(config.origin)`
        // implementation (mutant R12) would wrongly accept this.
        const res = await post({ referer: 'https://ensembletest.brndn.zip.evil.example/x' });
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: 'forbidden_origin' });
    });

    it('rejects an unparseable Referer when Origin is absent', async () => {
        const res = await post({ referer: 'not a url' });
        expect(res.status).toBe(403);
    });

    it('rejects a request with neither Origin nor Referer (mutation case)', async () => {
        const res = await post({});
        expect(res.status).toBe(403);
    });

    it('rejects a valid JSON body and ceremony cookie carried alongside a foreign Origin', async () => {
        const app = createApp({ db: testDb.db, config: CONFIG });
        const rawBody = JSON.stringify({ id: 'x', rawId: 'x', response: {} });
        const res = await app.request(`${URL_BASE}/api/auth/register/verify`, {
            method: 'POST',
            headers: {
                origin: 'https://evil.example',
                'content-type': 'application/json',
                'content-length': String(Buffer.byteLength(rawBody, 'utf8')),
                cookie: '__Host-ensemble_ceremony=some-token',
            },
            body: rawBody,
        });
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: 'forbidden_origin' });
    });

    it('does not gate a safe method (GET) at all, even with a foreign Origin', async () => {
        const app = createApp({ db: testDb.db, config: CONFIG });
        const res = await app.request(`${URL_BASE}/api/auth/session`, {
            method: 'GET',
            headers: { origin: 'https://evil.example' },
        });
        // No session cookie was sent either, so this is 401 unauthenticated — proof the
        // same-origin guard never ran (it would have produced 403 forbidden_origin instead).
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: 'unauthenticated' });
    });

    it('rejects PUT with no Origin', async () => {
        const app = createApp({ db: testDb.db, config: CONFIG });
        const res = await app.request(`${URL_BASE}/api/auth/logout`, { method: 'PUT' });
        expect(res.status).toBe(403);
    });

    it('rejects DELETE with no Origin', async () => {
        const app = createApp({ db: testDb.db, config: CONFIG });
        const res = await app.request(`${URL_BASE}/api/auth/logout`, { method: 'DELETE' });
        expect(res.status).toBe(403);
    });

    it('rejects DELETE to an unknown /api/... route with 403, not 404 (guard runs before routing)', async () => {
        const app = createApp({ db: testDb.db, config: CONFIG });
        const res = await app.request(`${URL_BASE}/api/does-not-exist`, { method: 'DELETE' });
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: 'forbidden_origin' });
    });

    it('rejects PURGE (R17 guard: not only POST/PUT/PATCH/DELETE count as unsafe)', async () => {
        const app = createApp({ db: testDb.db, config: CONFIG });
        // `fetch`'s Request constructor accepts custom/WebDAV methods like PURGE (only CONNECT,
        // TRACE and TRACK are actually forbidden), so this exercises the guard in-memory.
        const res = await app.request(`${URL_BASE}/api/auth/logout`, { method: 'PURGE' });
        expect(res.status).toBe(403);
    });

    it('rejects PATCH with no Origin (R17c guard: PATCH counts as unsafe too)', async () => {
        const app = createApp({ db: testDb.db, config: CONFIG });
        const res = await app.request(`${URL_BASE}/api/auth/logout`, { method: 'PATCH' });
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: 'forbidden_origin' });
    });

    it('does not gate HEAD, even with a foreign Origin (N13 guard)', async () => {
        const app = createApp({ db: testDb.db, config: CONFIG });
        const res = await app.request(`${URL_BASE}/api/auth/logout`, {
            method: 'HEAD',
            headers: { origin: 'https://evil.example' },
        });
        // No route is registered for HEAD /api/auth/logout (only POST is), so this is Hono's own
        // 404 — never 403. That is the actual, observed status: the point of this test is that
        // the same-origin guard is NOT what produced it (a mutant that gates HEAD would turn
        // this into a 403 instead).
        expect(res.status).toBe(404);
    });

    it('does not gate OPTIONS, even with a foreign Origin (N14 guard)', async () => {
        const app = createApp({ db: testDb.db, config: CONFIG });
        const res = await app.request(`${URL_BASE}/api/auth/logout`, {
            method: 'OPTIONS',
            headers: { origin: 'https://evil.example' },
        });
        // Same reasoning as the HEAD case above: no OPTIONS route exists, so this is a plain 404
        // from Hono's router, not the same-origin guard's 403.
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'not_found' });
    });
});
