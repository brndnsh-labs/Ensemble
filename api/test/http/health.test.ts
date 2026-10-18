import { afterEach, describe, expect, it } from 'vitest';
import { createWebAuthnConfig } from '../../src/auth/config.js';
import { createApp } from '../../src/http/app.js';
import { registerHealthCheck } from '../../src/http/health.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

const CONFIG = createWebAuthnConfig({
    rpId: 'localhost',
    rpName: 'Health test',
    origin: 'http://localhost:5173',
});

describe('operator readiness', () => {
    let testDb: TestDatabase;
    afterEach(() => testDb?.cleanup());

    function setup() {
        testDb = createTestDatabase();
        const app = createApp({ db: testDb.db, config: CONFIG });
        registerHealthCheck(app, testDb.db, 'development');
        return app;
    }

    it('is read-only, cookie-free, uncached, and independent of auth state after repeated probes', async () => {
        const app = setup();
        const changesBefore = testDb.db.prepare('SELECT total_changes() AS count').get();
        for (let i = 0; i < 150; i++) {
            const response = await app.request('/healthz');
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ status: 'ok', revision: 'development' });
            expect(response.headers.get('cache-control')).toBe('private, no-store');
            expect(response.headers.get('referrer-policy')).toBe('no-referrer');
            expect(response.headers.get('set-cookie')).toBeNull();
        }
        expect(testDb.db.prepare('SELECT total_changes() AS count').get()).toEqual(changesBefore);
        const session = await app.request('/api/auth/session');
        expect(session.status).toBe(401);
    });

    it('supports bodyless HEAD but not write methods', async () => {
        const app = setup();
        const head = await app.request('/healthz', { method: 'HEAD' });
        expect(head.status).toBe(200);
        expect(await head.text()).toBe('');
        expect((await app.request('/healthz', { method: 'POST' })).status).toBe(404);
    });

    it('reports database failure without exposing errors or account/schema details', async () => {
        const app = setup();
        // Disposable schema fault: a constant SELECT 1 would falsely report healthy here.
        testDb.db.exec('DROP TABLE _migrations');
        const response = await app.request('/healthz');
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ status: 'unavailable' });
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(response.headers.get('set-cookie')).toBeNull();
    });
});
