import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createWebAuthnConfig } from '../../src/auth/config.js';
import { createApp } from '../../src/http/app.js';
import { createCookieJar } from '../helpers/cookie-jar.js';
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

function setup(registrationOpen?: boolean, registrationCap?: number) {
    testDb = createTestDatabase();
    return createApp({
        db: testDb.db,
        config,
        clientIdentity: { secret },
        registrationOpen,
        registrationCap,
    });
}

/**
 * Seeds `count` bare account rows directly — cheaper than running `count` real ceremonies.
 * Ids are drawn from a module-wide counter (not reset per test) so a test calling this more than
 * once — to fill the cap in two steps — never collides with its own earlier seeded rows.
 */
let nextSeededAccountId = 0;
function seedAccounts(count: number): void {
    if (testDb === undefined) {
        throw new Error('seedAccounts called before setup()');
    }
    const insert = testDb.db.prepare('INSERT INTO accounts (id, created_at) VALUES (?, ?)');
    for (let i = 0; i < count; i += 1) {
        insert.run(`seeded-account-${nextSeededAccountId}`, Date.now());
        nextSeededAccountId += 1;
    }
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

/**
 * The service-wide registration cap (#1272 — DECISION 2026-09-17 on #1256): per-owner storage
 * caps have no ceiling on the NUMBER of owners. At or above the configured cap, both routes
 * answer the SAME `403 registration_closed` as the closed-by-policy case above — a client at the
 * cap cannot tell the two apart — and every existing account keeps working exactly as it did
 * under the closed-by-policy tests: login, sessions and adding a second passkey are untouched.
 */
/** A cookie-carrying `POST`, needed for any two-step ceremony (options -> verify) test below. */
function jarPost(app: ReturnType<typeof createApp>, jar: ReturnType<typeof createCookieJar>) {
    return async (path: string, body?: unknown): Promise<Response> => {
        const serialized = body === undefined ? undefined : JSON.stringify(body);
        const res = await app.request(`${config.origin}${path}`, {
            method: 'POST',
            headers: {
                origin: config.origin,
                'content-type': 'application/json',
                ...(serialized !== undefined
                    ? { 'content-length': String(Buffer.byteLength(serialized, 'utf8')) }
                    : {}),
                ...(jar.header() !== undefined ? { cookie: jar.header() as string } : {}),
            },
            body: serialized,
        });
        jar.ingest(res);
        return res;
    };
}

describe('registration cap (#1272)', () => {
    it('at the cap, register/options refuses immediately with 403 registration_closed', async () => {
        const app = setup(true, 3);
        seedAccounts(3);

        const optionsRes = await post(app, '/api/auth/register/options', {});
        expect(optionsRes.status).toBe(403);
        expect(await optionsRes.json()).toEqual({ error: 'registration_closed' });
    });

    it('the authoritative check at verify also refuses once the cap fills after the ceremony started', async () => {
        // register/options's own count check is a CHEAP EARLY refusal, not the enforcement
        // point — this proves the authoritative one, inside verifyRegistration's transaction,
        // by starting a ceremony BELOW the cap and only then filling it, so this presentation
        // can only be caught by the check inside the transaction, never the early one.
        const app = setup(true, 2);
        const jar = createCookieJar();
        const postWithJar = jarPost(app, jar);
        seedAccounts(1); // one below the cap of 2

        const authenticator = createSoftAuthenticator({ rpId: config.rpId, origin: config.origin });
        const optionsRes = await postWithJar('/api/auth/register/options');
        expect(optionsRes.status).toBe(200);
        const { options } = (await optionsRes.json()) as { options: { challenge: string } };
        const response = authenticator.register({ challenge: options.challenge });

        seedAccounts(1); // a concurrent registration fills the cap before this one verifies

        const verifyRes = await postWithJar('/api/auth/register/verify', response);
        expect(verifyRes.status).toBe(403);
        expect(await verifyRes.json()).toEqual({ error: 'registration_closed' });
    });

    it('with N-1 accounts present registration succeeds; the resulting Nth account then refuses the next attempt', async () => {
        const app = setup(true, 2);
        const jar = createCookieJar();
        const postWithJar = jarPost(app, jar);
        seedAccounts(1); // one below the cap of 2

        const authenticator = createSoftAuthenticator({ rpId: config.rpId, origin: config.origin });
        const optionsRes = await postWithJar('/api/auth/register/options');
        expect(optionsRes.status).toBe(200);
        const { options } = (await optionsRes.json()) as { options: { challenge: string } };
        const response = authenticator.register({ challenge: options.challenge });
        const verifyRes = await postWithJar('/api/auth/register/verify', response);
        expect(verifyRes.status).toBe(200);

        // The cap (2) is now reached — the next caller is refused at the cheap early check.
        const overflowRes = await post(app, '/api/auth/register/options', {});
        expect(overflowRes.status).toBe(403);
        expect(await overflowRes.json()).toEqual({ error: 'registration_closed' });
    });

    it('at the cap, an existing account can still log in and add a second passkey', async () => {
        const app = setup(true, 2);
        const jar = createCookieJar();
        const postWithJar = jarPost(app, jar);

        // Register the one account this test exercises, one below the cap of 2.
        const authenticator = createSoftAuthenticator({ rpId: config.rpId, origin: config.origin });
        const optionsRes = await postWithJar('/api/auth/register/options');
        expect(optionsRes.status).toBe(200);
        const { options } = (await optionsRes.json()) as { options: { challenge: string } };
        const regResponse = authenticator.register({ challenge: options.challenge });
        const verifyRes = await postWithJar('/api/auth/register/verify', regResponse);
        expect(verifyRes.status).toBe(200);
        const { accountId } = (await verifyRes.json()) as { accountId: string };

        // A second account (seeded directly) brings the service to the cap.
        seedAccounts(1);
        const closedRes = await post(app, '/api/auth/register/options', {});
        expect(closedRes.status).toBe(403);
        expect(await closedRes.json()).toEqual({ error: 'registration_closed' });

        // The existing account can still log out and log back in at the cap.
        const logoutRes = await postWithJar('/api/auth/logout');
        expect(logoutRes.status).toBe(204);
        const loginOptionsRes = await postWithJar('/api/auth/login/options');
        expect(loginOptionsRes.status).toBe(200);
        const { options: loginOptions } = (await loginOptionsRes.json()) as {
            options: { challenge: string };
        };
        const authResponse = authenticator.authenticate({
            challenge: loginOptions.challenge,
            userHandle: accountId,
        });
        const loginVerifyRes = await postWithJar('/api/auth/login/verify', authResponse);
        expect(loginVerifyRes.status).toBe(200);
        expect(await loginVerifyRes.json()).toEqual({ accountId });

        // And can still add a second passkey to its own account at the cap.
        const secondAuthenticator = createSoftAuthenticator({
            rpId: config.rpId,
            origin: config.origin,
        });
        const passkeyOptionsRes = await postWithJar('/api/auth/passkeys/options');
        expect(passkeyOptionsRes.status).toBe(200);
        const { options: passkeyOptions } = (await passkeyOptionsRes.json()) as {
            options: { challenge: string };
        };
        const passkeyResponse = secondAuthenticator.register({
            challenge: passkeyOptions.challenge,
        });
        const passkeyVerifyRes = await postWithJar('/api/auth/passkeys/verify', passkeyResponse);
        expect(passkeyVerifyRes.status).toBe(200);
    });
});
