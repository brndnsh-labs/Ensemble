import { serve } from '@hono/node-server';
import { expect, it } from 'vitest';
import { createWebAuthnConfig } from '../../src/auth/config.js';
import { RECOVERY_CLAIM_RATE_LIMIT } from '../../src/auth/recovery.js';
import { createApp } from '../../src/http/app.js';
import { createTestDatabase } from '../helpers/test-db.js';

it('real Node socket uses the configured peer/header for independent rate buckets and ignores XFF', async () => {
    const testDb = createTestDatabase();
    const config = createWebAuthnConfig({
        rpId: 'localhost',
        rpName: 'Test',
        origin: 'http://localhost',
    });
    const app = createApp({
        db: testDb.db,
        config,
        clientIdentity: {
            secret: 'test-only-secret-for-loopback-socket',
            trustedProxyAddresses: ['127.0.0.1'],
            header: 'x-ensemble-client-ip',
        },
    });
    const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
    try {
        await new Promise<void>((resolve, reject) => {
            server.once('listening', resolve);
            server.once('error', reject);
        });
        const address = server.address();
        if (address === null || typeof address === 'string') {
            throw new Error('Expected listening socket');
        }
        const post = async (ip: string, xff: string) => {
            const res = await fetch(`http://127.0.0.1:${address.port}/api/auth/recovery/claim`, {
                method: 'POST',
                headers: {
                    origin: config.origin,
                    'content-type': 'application/json',
                    'x-ensemble-client-ip': ip,
                    'x-forwarded-for': xff,
                },
                body: JSON.stringify({ code: 'invalid' }),
                signal: AbortSignal.timeout(5000),
            });
            await res.arrayBuffer();
            return res;
        };
        for (let i = 0; i < RECOVERY_CLAIM_RATE_LIMIT.max; i++) {
            expect((await post('198.51.100.1', `203.0.113.${i + 1}`)).status).toBe(401);
        }
        const blocked = await post('198.51.100.1', '203.0.113.99');
        expect(blocked.status).toBe(429);
        expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
        expect((await post('198.51.100.2', '203.0.113.99')).status).toBe(401);
    } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        testDb.cleanup();
    }
});
