import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createWebAuthnConfig } from '../../src/auth/config.js';
import { createApp } from '../../src/http/app.js';
import { createSoftAuthenticator } from '../helpers/soft-authenticator.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

/**
 * The deployed service closes anonymous registration by policy (`ENSEMBLE_REGISTRATION`,
 * unset = closed) until the product wires accounts in. Closed must refuse BOTH registration
 * routes with the same error, set no ceremony cookie, and leave every other route exactly as
 * it was — the gate is a deployment posture, not a change to the auth model.
 */
const config = createWebAuthnConfig({
    rpId: 'localhost',
    rpName: 'Ensemble test',
    origin: 'http://localhost',
});
const secret = randomBytes(32).toString('hex');
let testDb: TestDatabase | undefined;

afterEach(() => {
    testDb?.cleanup();
    testDb = undefined;
});

function setup(registrationOpen?: boolean) {
    testDb = createTestDatabase();
    return createApp({ db: testDb.db, config, clientIdentity: { secret }, registrationOpen });
}

function post(app: ReturnType<typeof createApp>, path: string, body: unknown) {
    const serialized = JSON.stringify(body);
    return app.request(`${config.origin}${path}`, {
        method: 'POST',
        headers: {
            origin: config.origin,
            'content-type': 'application/json',
            'content-length': String(Buffer.byteLength(serialized)),
        },
        body: serialized,
    });
}

describe('registration gate', () => {
    it('closed refuses both registration routes with 403 registration_closed and no cookie', async () => {
        const app = setup(false);
        // A shape-valid registration response: the route policy's body validation runs before
        // the handler and must keep winning for malformed input (400), so the gate is only
        // observable behind a body that would otherwise reach the ceremony.
        const authenticator = createSoftAuthenticator({ rpId: config.rpId, origin: config.origin });
        const bodies: Array<[string, unknown]> = [
            ['/api/auth/register/options', {}],
            ['/api/auth/register/verify', authenticator.register({ challenge: 'closed' })],
        ];
        for (const [path, body] of bodies) {
            const response = await post(app, path, body);
            expect(response.status, path).toBe(403);
            expect(await response.json()).toEqual({ error: 'registration_closed' });
            // No ceremony cookie is ever minted while closed; verify's unconditional clear is
            // the only Set-Cookie allowed, and it must be a deletion, never a fresh token.
            for (const cookie of response.headers.getSetCookie()) {
                expect(cookie, path).toMatch(/Max-Age=0/);
            }
        }
    });

    it('closed leaves login and session behaviour untouched', async () => {
        const app = setup(false);
        const login = await post(app, '/api/auth/login/options', {});
        expect(login.status).toBe(200);
        expect(await login.json()).toHaveProperty('options');
        const session = await app.request(`${config.origin}/api/auth/session`, {
            headers: { origin: config.origin },
        });
        expect(session.status).toBe(401);
    });

    it('open (the factory default) accepts registration options', async () => {
        const app = setup();
        const response = await post(app, '/api/auth/register/options', {});
        expect(response.status).toBe(200);
        expect(await response.json()).toHaveProperty('options');
    });
});
