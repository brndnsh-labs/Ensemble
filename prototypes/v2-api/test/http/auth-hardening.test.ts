import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import { createWebAuthnConfig } from '../../src/auth/config.js';
import { MAX_PASSKEYS } from '../../src/auth/passkeys.js';
import { recordSecurityEvent } from '../../src/auth/security-events.js';
import { assertAccountDeletionCoverage } from '../../src/db/account-deletion-registry.js';
import { createApp } from '../../src/http/app.js';
import { AUTH_POLICIES, validAuthBody } from '../../src/http/auth-policy.js';
import { createClientIdentity } from '../../src/http/client-identity.js';
import { createCookieJar } from '../helpers/cookie-jar.js';
import { createSoftAuthenticator } from '../helpers/soft-authenticator.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

const config = createWebAuthnConfig({
    rpId: 'localhost',
    rpName: 'Test',
    origin: 'http://localhost',
});
const secret = 'test-only-pseudonymous-identity-secret';
let testDb: TestDatabase;
let cleanup: (() => void) | undefined;
afterEach(() => {
    cleanup?.();
    cleanup = undefined;
});

function setup() {
    testDb = createTestDatabase();
    cleanup = testDb.cleanup;
    return createApp({ db: testDb.db, config, clientIdentity: { secret } });
}
async function request(
    app: ReturnType<typeof createApp>,
    route: string,
    body?: unknown,
    cookie?: string,
) {
    const [method, path] = route.split(' ');
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    return app.request(`${config.origin}${path}`, {
        method,
        headers: {
            origin: config.origin,
            'content-type': 'application/json',
            ...(serialized === undefined
                ? {}
                : { 'content-length': String(Buffer.byteLength(serialized)) }),
            ...(cookie === undefined ? {} : { cookie }),
        },
        body: serialized,
    });
}

describe('deny-by-default HTTP contracts', () => {
    it('registers a policy for every route, with no stale policy entries', () => {
        const app = setup();
        const routes = app.routes
            .filter((route) => route.method !== 'ALL')
            .map((route) => `${route.method} ${route.path}`)
            .sort();
        expect(routes).toEqual(Object.keys(AUTH_POLICIES).sort());
    });
    it.each(Object.entries(AUTH_POLICIES))(
        '%s rejects unexpected fields/query values before auth state changes',
        async (route) => {
            const app = setup();
            const res = route.startsWith('GET ')
                ? await request(app, `${route}?ownerId=attacker`)
                : await request(app, route, { ownerId: 'attacker' });
            expect(res.status).toBe(400);
            for (const table of [
                'accounts',
                'credentials',
                'challenges',
                'sessions',
                'recovery_codes',
            ]) {
                expect(testDb.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toMatchObject(
                    { n: 0 },
                );
            }
        },
    );
    it.each(Object.entries(AUTH_POLICIES))(
        '%s enforces its own rate threshold',
        async (route, policy) => {
            const app = setup();
            // Invalid shape is intentional: malformed traffic must spend the same finite budget.
            for (let i = 0; i < policy.max; i++) {
                expect((await request(app, route)).status).not.toBe(429);
            }
            const blocked = await request(app, route);
            expect(blocked.status).toBe(429);
            expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
            expect(await blocked.json()).toEqual({ error: 'rate_limited' });
            const independent =
                route === 'GET /api/auth/session'
                    ? 'GET /api/auth/passkeys'
                    : 'GET /api/auth/session';
            expect((await request(app, independent)).status).not.toBe(429);
        },
    );
    it('does not consume the challenge when count/field bounds reject an otherwise real response', async () => {
        const app = setup();
        const optionsRes = await request(app, 'POST /api/auth/register/options');
        const jar = createCookieJar();
        jar.ingest(optionsRes);
        const { options } = (await optionsRes.json()) as { options: { challenge: string } };
        const auth = createSoftAuthenticator({ rpId: config.rpId, origin: config.origin });
        const response = auth.register({ challenge: options.challenge });
        const invalid = structuredClone(response);
        invalid.response.transports = Array(9).fill('usb');
        const rejected = await request(
            app,
            'POST /api/auth/register/verify',
            invalid,
            jar.header(),
        );
        expect(rejected.status).toBe(400);
        expect(testDb.db.prepare('SELECT COUNT(*) AS n FROM challenges').get()).toMatchObject({
            n: 1,
        });
        expect(
            (await request(app, 'POST /api/auth/register/verify', response, jar.header())).status,
        ).toBe(200);
    });
    it('bounds nested extension counts/depth and credential/payload scalar lengths', () => {
        const auth = createSoftAuthenticator({ rpId: config.rpId, origin: config.origin });
        const valid = auth.register({ challenge: 'test' });
        expect(validAuthBody('registration', valid)).toBe(true);
        expect(validAuthBody('registration', { ...valid, id: 'a'.repeat(2049) })).toBe(false);
        expect(
            validAuthBody('registration', {
                ...valid,
                response: { ...valid.response, clientDataJSON: 'a'.repeat(8193) },
            }),
        ).toBe(false);
        expect(
            validAuthBody('registration', {
                ...valid,
                clientExtensionResults: Object.fromEntries(
                    Array.from({ length: 17 }, (_, i) => [String(i), true]),
                ),
            }),
        ).toBe(false);
        expect(
            validAuthBody('registration', {
                ...valid,
                clientExtensionResults: { a: { b: { c: { d: { e: true } } } } },
            }),
        ).toBe(false);
        expect(validAuthBody('code', { code: 'x'.repeat(129) })).toBe(false);
    });
});

describe('pseudonymous client identity', () => {
    function identityApp() {
        const identify = createClientIdentity({
            secret,
            header: 'x-ensemble-client-ip',
            trustedProxyAddresses: ['192.0.2.1'],
        });
        return new Hono().get('/', (c) => c.text(identify(c)));
    }
    async function key(
        app: ReturnType<typeof identityApp>,
        peer: string,
        header: string,
        xff = '203.0.113.1',
    ) {
        return (
            await app.request(
                'http://localhost/',
                { headers: { 'x-ensemble-client-ip': header, 'x-forwarded-for': xff } },
                { incoming: { socket: { remoteAddress: peer } } },
            )
        ).text();
    }
    it('trusts only an explicit immediate peer, ignores XFF, canonicalizes addresses and hashes keys', async () => {
        const app = identityApp();
        const a = await key(app, '192.0.2.1', '198.51.100.1');
        expect(a).toMatch(/^[a-f0-9]{64}$/);
        expect(a).not.toContain('198.51.100.1');
        expect(await key(app, '192.0.2.1', '198.51.100.1', 'attacker')).toBe(a);
        expect(await key(app, '::ffff:192.0.2.1', '::ffff:198.51.100.1')).toBe(a);
        expect(await key(app, '192.0.2.1', '198.51.100.2')).not.toBe(a);
        expect(await key(app, '192.0.2.2', '198.51.100.1')).toBe(
            await key(app, '192.0.2.2', '198.51.100.2'),
        );
        expect(await key(app, '192.0.2.1', '2001:db8::1')).toBe(
            await key(app, '192.0.2.1', '2001:0db8:0:0:0:0:0:1'),
        );
    });
    it('malformed/missing proxy identity shares a bucket and never throws for scoped IPv6', async () => {
        const app = identityApp();
        const unknown = await key(app, '192.0.2.1', '');
        for (const value of ['attacker', '198.51.100.1, 198.51.100.2', 'fe80::1%eth0']) {
            expect(await key(app, '192.0.2.1', value)).toBe(unknown);
        }
    });
});

describe('metadata audit and deletion coverage', () => {
    it('records only fixed metadata and swallows a failed audit insertion', async () => {
        const app = setup();
        const secretCode = 'private-recovery-code-DO-NOT-RECORD';
        expect(
            (await request(app, 'POST /api/auth/recovery/claim', { code: secretCode })).status,
        ).toBe(401);
        recordSecurityEvent(
            testDb.db,
            {
                event: 'auth_failure',
                code: secretCode,
                ...{
                    payload: secretCode,
                    message: secretCode,
                    cause: secretCode,
                    publicKey: secretCode,
                },
            },
            Date.now(),
        );
        const rows = testDb.db.prepare('SELECT * FROM auth_security_events').all();
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            event: 'auth_failure',
            error_name: 'AuthError',
            error_code: 'authentication_failed',
            cause: 'request_rejected',
        });
        expect(JSON.stringify(rows)).not.toContain(secretCode);
        testDb.db.exec(
            "CREATE TRIGGER deny_audit BEFORE INSERT ON auth_security_events BEGIN SELECT RAISE(FAIL, 'audit unavailable'); END",
        );
        expect(
            (await request(app, 'POST /api/auth/recovery/claim', { code: secretCode })).status,
        ).toBe(401);
        // Successful ceremonies still commit and return their cookie when audit storage fails.
        const opts = await request(app, 'POST /api/auth/register/options');
        const jar = createCookieJar();
        jar.ingest(opts);
        const { options } = (await opts.json()) as { options: { challenge: string } };
        const auth = createSoftAuthenticator({ rpId: config.rpId, origin: config.origin });
        expect(
            (
                await request(
                    app,
                    'POST /api/auth/register/verify',
                    auth.register({ challenge: options.challenge }),
                    jar.header(),
                )
            ).status,
        ).toBe(200);
    });
    it('classifies every real table, including no-FK challenges, and fails on schema drift', () => {
        setup();
        expect(() => assertAccountDeletionCoverage(testDb.db)).not.toThrow();
        testDb.db.exec('CREATE TABLE new_private_data (owner_id TEXT, content TEXT)');
        expect(() => assertAccountDeletionCoverage(testDb.db)).toThrow('exactly once');
    });
    it('records passkey add/revoke events with verified account ownership and checks the account count at commit', async () => {
        const app = setup();
        const jar = createCookieJar();
        const post = async (path: string, body?: unknown) => {
            const res = await request(app, `POST /api/auth/${path}`, body, jar.header());
            jar.ingest(res);
            return res;
        };
        const first = createSoftAuthenticator({ rpId: config.rpId, origin: config.origin });
        const opts = await post('register/options');
        const { options } = (await opts.json()) as { options: { challenge: string } };
        const registration = await post(
            'register/verify',
            first.register({ challenge: options.challenge }),
        );
        const { accountId } = (await registration.json()) as { accountId: string };
        const second = createSoftAuthenticator({ rpId: config.rpId, origin: config.origin });
        const add = await post('passkeys/options');
        const addOptions = (await add.json()) as { options: { challenge: string } };
        expect(
            (
                await post(
                    'passkeys/verify',
                    second.register({ challenge: addOptions.options.challenge }),
                )
            ).status,
        ).toBe(200);
        expect((await post('passkeys/revoke', { credentialId: second.credentialId })).status).toBe(
            200,
        );
        const events = testDb.db
            .prepare('SELECT event, account_id, credential_id FROM auth_security_events')
            .all();
        for (const event of [
            'passkey_added',
            'passkey_revoked',
            'sessions_revoked_by_credential_revoke',
        ]) {
            expect(events).toContainEqual({
                event,
                account_id: accountId,
                credential_id: second.credentialId,
            });
        }
        const beforeLimit = await post('passkeys/options');
        const beforeLimitOptions = (await beforeLimit.json()) as { options: { challenge: string } };
        for (let i = 1; i < MAX_PASSKEYS; i++) {
            testDb.db
                .prepare(
                    'INSERT INTO credentials (id, account_id, public_key, created_at) VALUES (?, ?, ?, ?)',
                )
                .run(`filler-${i}`, accountId, new Uint8Array([0]), Date.now());
        }
        expect(
            (
                await post(
                    'passkeys/verify',
                    second.register({ challenge: beforeLimitOptions.options.challenge }),
                )
            ).status,
        ).toBe(409);
        expect((await post('passkeys/options')).status).toBe(409);
        expect(
            testDb.db
                .prepare('SELECT COUNT(*) AS n FROM credentials WHERE account_id = ?')
                .get(accountId),
        ).toMatchObject({ n: MAX_PASSKEYS });
    });
});
