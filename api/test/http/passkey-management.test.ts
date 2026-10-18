import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createWebAuthnConfig, type WebAuthnConfig } from '../../src/auth/config.js';
import { FRESH_AUTH_WINDOW_MS } from '../../src/auth/fresh-auth.js';
import { createApp } from '../../src/http/app.js';
import { createCookieJar } from '../helpers/cookie-jar.js';
import { createSoftAuthenticator, type SoftAuthenticator } from '../helpers/soft-authenticator.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

const HTTPS_CONFIG: WebAuthnConfig = createWebAuthnConfig({
    rpId: 'ensembletest.brndn.zip',
    rpName: 'Ensemble Test',
    origin: 'https://ensembletest.brndn.zip',
});
const HTTPS_URL = 'https://ensembletest.brndn.zip';

interface Ctx {
    testDb: TestDatabase;
    app: ReturnType<typeof createApp>;
    jar: ReturnType<typeof createCookieJar>;
    urlBase: string;
    config: WebAuthnConfig;
}

function setUp(now?: () => number): Ctx {
    const testDb = createTestDatabase();
    const app = createApp({ db: testDb.db, config: HTTPS_CONFIG, now });
    return { testDb, app, jar: createCookieJar(), urlBase: HTTPS_URL, config: HTTPS_CONFIG };
}

async function postJson(ctx: Ctx, path: string, body?: unknown): Promise<Response> {
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    const res = await ctx.app.request(`${ctx.urlBase}${path}`, {
        method: 'POST',
        headers: {
            origin: ctx.config.origin,
            'content-type': 'application/json',
            ...(serialized !== undefined
                ? { 'content-length': String(Buffer.byteLength(serialized, 'utf8')) }
                : {}),
            ...(ctx.jar.header() !== undefined ? { cookie: ctx.jar.header() as string } : {}),
        },
        body: serialized,
    });
    ctx.jar.ingest(res);
    return res;
}

async function get(ctx: Ctx, path: string): Promise<Response> {
    const res = await ctx.app.request(`${ctx.urlBase}${path}`, {
        headers: ctx.jar.header() !== undefined ? { cookie: ctx.jar.header() as string } : {},
    });
    ctx.jar.ingest(res);
    return res;
}

async function registerNewAccount(
    ctx: Ctx,
): Promise<{ accountId: string; credentialId: string; authenticator: SoftAuthenticator }> {
    const authenticator = createSoftAuthenticator({
        rpId: ctx.config.rpId,
        origin: ctx.config.origin,
    });
    const optionsRes = await postJson(ctx, '/api/auth/register/options', { label: 'My Device' });
    expect(optionsRes.status).toBe(200);
    const { options } = (await optionsRes.json()) as { options: { challenge: string } };
    const response = authenticator.register({ challenge: options.challenge });
    const verifyRes = await postJson(ctx, '/api/auth/register/verify', response);
    expect(verifyRes.status).toBe(200);
    const { accountId } = (await verifyRes.json()) as { accountId: string };
    return { accountId, credentialId: authenticator.credentialId, authenticator };
}

/** Enrolls a NEW passkey on `ctx`'s currently-signed-in account over the real HTTP endpoints. */
async function addPasskeyOverHttp(
    ctx: Ctx,
): Promise<{ credentialId: string; authenticator: SoftAuthenticator; response: Response }> {
    const authenticator = createSoftAuthenticator({
        rpId: ctx.config.rpId,
        origin: ctx.config.origin,
    });
    const optionsRes = await postJson(ctx, '/api/auth/passkeys/options');
    if (optionsRes.status !== 200) {
        return { credentialId: '', authenticator, response: optionsRes };
    }
    const { options } = (await optionsRes.json()) as { options: { challenge: string } };
    const regResponse = authenticator.register({ challenge: options.challenge });
    const verifyRes = await postJson(ctx, '/api/auth/passkeys/verify', regResponse);
    return { credentialId: authenticator.credentialId, authenticator, response: verifyRes };
}

/** Steps `ctx`'s current session up via a full reauth ceremony, using `authenticator`. */
async function reauthOverHttp(
    ctx: Ctx,
    authenticator: SoftAuthenticator,
    accountId: string,
): Promise<Response> {
    const optionsRes = await postJson(ctx, '/api/auth/reauth/options');
    expect(optionsRes.status).toBe(200);
    const { options } = (await optionsRes.json()) as { options: { challenge: string } };
    const response = authenticator.authenticate({
        challenge: options.challenge,
        userHandle: accountId,
    });
    return postJson(ctx, '/api/auth/reauth/verify', response);
}

describe('enroll and login with either passkey (acceptance)', () => {
    let ctx: Ctx;

    afterEach(() => {
        ctx?.testDb.cleanup();
    });

    it('an owner enrolls a second passkey, then logs in with EITHER passkey over HTTP', async () => {
        ctx = setUp();
        const { accountId, authenticator: firstAuthenticator } = await registerNewAccount(ctx);

        const {
            credentialId: secondCredentialId,
            authenticator: secondAuthenticator,
            response,
        } = await addPasskeyOverHttp(ctx);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            credentialId: secondCredentialId,
            alreadyRegistered: false,
        });

        // Log out, then log in with the FIRST passkey.
        await postJson(ctx, '/api/auth/logout');
        const loginOpts1 = await postJson(ctx, '/api/auth/login/options');
        const { options: opts1 } = (await loginOpts1.json()) as { options: { challenge: string } };
        const authResp1 = firstAuthenticator.authenticate({
            challenge: opts1.challenge,
            userHandle: accountId,
        });
        const loginVerify1 = await postJson(ctx, '/api/auth/login/verify', authResp1);
        expect(loginVerify1.status).toBe(200);
        expect(await loginVerify1.json()).toEqual({ accountId });

        // Log out, then log in with the SECOND passkey.
        await postJson(ctx, '/api/auth/logout');
        const loginOpts2 = await postJson(ctx, '/api/auth/login/options');
        const { options: opts2 } = (await loginOpts2.json()) as { options: { challenge: string } };
        const authResp2 = secondAuthenticator.authenticate({
            challenge: opts2.challenge,
            userHandle: accountId,
        });
        const loginVerify2 = await postJson(ctx, '/api/auth/login/verify', authResp2);
        expect(loginVerify2.status).toBe(200);
        expect(await loginVerify2.json()).toEqual({ accountId });
    });

    it('re-enrolling an already-registered authenticator over HTTP is a clean no-op', async () => {
        ctx = setUp();
        const { authenticator } = await registerNewAccount(ctx);

        const optionsRes = await postJson(ctx, '/api/auth/passkeys/options');
        expect(optionsRes.status).toBe(200);
        const { options } = (await optionsRes.json()) as { options: { challenge: string } };
        const response = authenticator.register({ challenge: options.challenge });
        const verifyRes = await postJson(ctx, '/api/auth/passkeys/verify', response);
        expect(verifyRes.status).toBe(200);
        expect(await verifyRes.json()).toEqual({
            credentialId: authenticator.credentialId,
            alreadyRegistered: true,
        });
    });
});

describe('stale-session refusal and reauth recovery', () => {
    let ctx: Ctx;

    afterEach(() => {
        ctx?.testDb.cleanup();
    });

    it('a valid but stale session is refused at passkeys/options, passkeys/verify and passkeys/revoke, each 403; reauth then makes it succeed', async () => {
        let currentTime = 1_000_000_000;
        ctx = setUp(() => currentTime);
        const { accountId, credentialId, authenticator } = await registerNewAccount(ctx);

        // Advance well past the freshness window without doing anything else -- the session
        // itself is still perfectly VALID (30-day TTL), just no longer FRESH.
        currentTime += FRESH_AUTH_WINDOW_MS + 1;

        const staleOptions = await postJson(ctx, '/api/auth/passkeys/options');
        expect(staleOptions.status).toBe(403);
        expect(await staleOptions.json()).toEqual({ error: 'fresh_auth_required' });

        const staleRevoke = await postJson(ctx, '/api/auth/passkeys/revoke', { credentialId });
        expect(staleRevoke.status).toBe(403);
        expect(await staleRevoke.json()).toEqual({ error: 'fresh_auth_required' });

        // passkeys/verify refused because the session went stale BETWEEN options and verify:
        // step up via reauth to legitimately pass options, then age the session row directly so
        // it goes stale before the verify response is presented. Ageing the SESSION row (not the
        // shared clock) is deliberate: advancing `currentTime` again would also push the
        // still-pending 5-minute challenge past its OWN expiry, which would fail the request for
        // an unrelated reason (`ceremony_expired`) before ever reaching the freshness re-check
        // this test targets.
        const reauthRes = await reauthOverHttp(ctx, authenticator, accountId);
        expect(reauthRes.status).toBe(200);
        const freshOptions = await postJson(ctx, '/api/auth/passkeys/options');
        expect(freshOptions.status).toBe(200);
        const { options } = (await freshOptions.json()) as { options: { challenge: string } };
        const newAuthenticator = createSoftAuthenticator({
            rpId: ctx.config.rpId,
            origin: ctx.config.origin,
        });
        const regResponse = newAuthenticator.register({ challenge: options.challenge });

        ctx.testDb.db
            .prepare('UPDATE sessions SET created_at = ? WHERE revoked_at IS NULL')
            .run(currentTime - FRESH_AUTH_WINDOW_MS - 1);
        const staleVerify = await postJson(ctx, '/api/auth/passkeys/verify', regResponse);
        expect(staleVerify.status).toBe(403);
        expect(await staleVerify.json()).toEqual({ error: 'fresh_auth_required' });

        // Step up via reauth -- the SAME session-holder becomes fresh again.
        const reauthRes2 = await reauthOverHttp(ctx, authenticator, accountId);
        expect(reauthRes2.status).toBe(200);
        expect(await reauthRes2.json()).toEqual({ accountId });

        const nowFreshOptions = await postJson(ctx, '/api/auth/passkeys/options');
        expect(nowFreshOptions.status).toBe(200);
    });

    it('window boundary, bracketed exactly with the injected clock: created_at = now-window is fresh, now-window-1 is not', async () => {
        let currentTime = 2_000_000_000;
        ctx = setUp(() => currentTime);
        await registerNewAccount(ctx);
        const createdAt = currentTime;

        currentTime = createdAt + FRESH_AUTH_WINDOW_MS;
        const atBoundary = await postJson(ctx, '/api/auth/passkeys/options');
        expect(atBoundary.status).toBe(200);

        currentTime = createdAt + FRESH_AUTH_WINDOW_MS + 1;
        const pastBoundary = await postJson(ctx, '/api/auth/passkeys/options');
        expect(pastBoundary.status).toBe(403);
    });

    it('add-passkey ceremony started under account A cannot be committed with account B session (cross-account binding, HTTP)', async () => {
        ctx = setUp();
        const { accountId: accountA } = await registerNewAccount(ctx);
        const optionsRes = await postJson(ctx, '/api/auth/passkeys/options');
        expect(optionsRes.status).toBe(200);
        const { options } = (await optionsRes.json()) as { options: { challenge: string } };
        const newAuthenticator = createSoftAuthenticator({
            rpId: ctx.config.rpId,
            origin: ctx.config.origin,
        });
        const response = newAuthenticator.register({ challenge: options.challenge });

        // A SECOND jar registers its own (account B) session, then swaps cookies with the first
        // jar to present B's session against A's pending ceremony.
        const jarB = createCookieJar();
        const ctxB: Ctx = { ...ctx, jar: jarB };
        const { accountId: accountB } = await registerNewAccount(ctxB);
        expect(accountB).not.toBe(accountA);

        const crossAccountVerify = await ctx.app.request(`${HTTPS_URL}/api/auth/passkeys/verify`, {
            method: 'POST',
            headers: {
                origin: HTTPS_CONFIG.origin,
                'content-type': 'application/json',
                'content-length': String(Buffer.byteLength(JSON.stringify(response), 'utf8')),
                cookie: jarB.header() as string, // B's session, not A's
            },
            body: JSON.stringify(response),
        });
        expect(crossAccountVerify.status).toBe(401);
        expect(await crossAccountVerify.json()).toEqual({ error: 'authentication_failed' });

        // Nothing landed on either account.
        const row = ctx.testDb.db
            .prepare('SELECT id FROM credentials WHERE id = ?')
            .get(newAuthenticator.credentialId);
        expect(row).toBeUndefined();
    });
});

describe('revocation (owner scope, last-credential guard, session cascade)', () => {
    let ctx: Ctx;

    afterEach(() => {
        ctx?.testDb.cleanup();
    });

    it('revoking another account credential and a nonexistent id return identical 404s; the other account is untouched', async () => {
        ctx = setUp();
        const { credentialId: credentialA } = await registerNewAccount(ctx);

        const jarB = createCookieJar();
        const ctxB: Ctx = { ...ctx, jar: jarB };
        await registerNewAccount(ctxB);
        // Give B a second credential so B's own last-credential guard can't interfere.
        await addPasskeyOverHttp(ctxB);

        const foreign = await postJson(ctxB, '/api/auth/passkeys/revoke', {
            credentialId: credentialA,
        });
        const nonexistent = await postJson(ctxB, '/api/auth/passkeys/revoke', {
            credentialId: 'no-such-id',
        });
        expect(foreign.status).toBe(404);
        expect(nonexistent.status).toBe(404);
        expect(await foreign.json()).toEqual({ error: 'not_found' });
        expect(await nonexistent.json()).toEqual({ error: 'not_found' });

        // Account A's credential still there and A's session still works.
        const stillA = await get(ctx, '/api/auth/session');
        expect(stillA.status).toBe(200);
    });

    it('a stale session probing revoke gets 403 for both an existing and a nonexistent id (no probing signal)', async () => {
        let currentTime = 3_000_000_000;
        ctx = setUp(() => currentTime);
        const { credentialId } = await registerNewAccount(ctx);
        currentTime += FRESH_AUTH_WINDOW_MS + 1;

        const existing = await postJson(ctx, '/api/auth/passkeys/revoke', { credentialId });
        const nonexistent = await postJson(ctx, '/api/auth/passkeys/revoke', {
            credentialId: 'no-such-id',
        });
        expect(existing.status).toBe(403);
        expect(nonexistent.status).toBe(403);
        expect(await existing.json()).toEqual({ error: 'fresh_auth_required' });
        expect(await nonexistent.json()).toEqual({ error: 'fresh_auth_required' });
    });

    it('revoking the last credential without recovery material -> 409, credential still exists (mutation target: COUNT account scope)', async () => {
        ctx = setUp();
        const { accountId, credentialId } = await registerNewAccount(ctx);

        // A second account with TWO credentials of its own, over HTTP -- dropping the
        // account_id scope on the last-credential COUNT would count these too, never
        // triggering the guard for account A's sole credential.
        const jarB = createCookieJar();
        const ctxB: Ctx = { ...ctx, jar: jarB };
        await registerNewAccount(ctxB);
        await addPasskeyOverHttp(ctxB);

        const res = await postJson(ctx, '/api/auth/passkeys/revoke', { credentialId });
        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({ error: 'last_credential' });

        const row = ctx.testDb.db
            .prepare('SELECT id FROM credentials WHERE id = ?')
            .get(credentialId);
        expect(row).toBeDefined();
        const rows = ctx.testDb.db
            .prepare('SELECT id FROM credentials WHERE account_id = ?')
            .all(accountId);
        expect(rows).toHaveLength(1);
    });

    it('revoking the last credential WITH an unconsumed recovery code succeeds; with only a consumed one it is still 409', async () => {
        ctx = setUp();
        const { accountId, credentialId } = await registerNewAccount(ctx);
        ctx.testDb.db
            .prepare(
                'INSERT INTO recovery_codes (id, account_id, code_hash, created_at, consumed_at) VALUES (?, ?, ?, ?, ?)',
            )
            .run('consumed-code', accountId, 'hash-consumed', 0, 5000);

        const stillBlocked = await postJson(ctx, '/api/auth/passkeys/revoke', { credentialId });
        expect(stillBlocked.status).toBe(409);

        ctx.testDb.db
            .prepare(
                'INSERT INTO recovery_codes (id, account_id, code_hash, created_at, consumed_at, confirmed_at) VALUES (?, ?, ?, ?, ?, ?)',
            )
            .run('live-code', accountId, 'hash-live', 0, null, 0);

        const succeeds = await postJson(ctx, '/api/auth/passkeys/revoke', { credentialId });
        expect(succeeds.status).toBe(200);
        expect(await succeeds.json()).toEqual({ signedOut: true });
    });

    it('revoking a credential revokes every session it created; a session from another credential survives', async () => {
        ctx = setUp();
        const { credentialId: credentialX, authenticator: authenticatorX } =
            await registerNewAccount(ctx);
        const { credentialId: credentialY, authenticator: authenticatorY } =
            await addPasskeyOverHttp(ctx);
        const accountId = (
            (await (await get(ctx, '/api/auth/session')).json()) as { accountId: string }
        ).accountId;

        // Two more jars log in with credential X.
        const jarX1 = createCookieJar();
        const ctxX1: Ctx = { ...ctx, jar: jarX1 };
        const loginOptsX1 = await postJson(ctxX1, '/api/auth/login/options');
        const { options: optsX1 } = (await loginOptsX1.json()) as {
            options: { challenge: string };
        };
        const authX1 = authenticatorX.authenticate({
            challenge: optsX1.challenge,
            userHandle: accountId,
        });
        expect((await postJson(ctxX1, '/api/auth/login/verify', authX1)).status).toBe(200);

        const jarX2 = createCookieJar();
        const ctxX2: Ctx = { ...ctx, jar: jarX2 };
        const loginOptsX2 = await postJson(ctxX2, '/api/auth/login/options');
        const { options: optsX2 } = (await loginOptsX2.json()) as {
            options: { challenge: string };
        };
        const authX2 = authenticatorX.authenticate({
            challenge: optsX2.challenge,
            userHandle: accountId,
        });
        expect((await postJson(ctxX2, '/api/auth/login/verify', authX2)).status).toBe(200);

        // One jar logs in with credential Y.
        const jarY = createCookieJar();
        const ctxY: Ctx = { ...ctx, jar: jarY };
        const loginOptsY = await postJson(ctxY, '/api/auth/login/options');
        const { options: optsY } = (await loginOptsY.json()) as { options: { challenge: string } };
        const authY = authenticatorY.authenticate({
            challenge: optsY.challenge,
            userHandle: accountId,
        });
        expect((await postJson(ctxY, '/api/auth/login/verify', authY)).status).toBe(200);

        // Original jar (ctx, created via credential X at registration) revokes credential X.
        const revokeRes = await postJson(ctx, '/api/auth/passkeys/revoke', {
            credentialId: credentialX,
        });
        expect(revokeRes.status).toBe(200);
        const { signedOut } = (await revokeRes.json()) as { signedOut: boolean };
        expect(signedOut).toBe(true);
        // The session cookie was cleared on the revoking jar.
        expect(ctx.jar.get('__Host-ensemble_session')).toBeUndefined();

        expect((await get(ctxX1, '/api/auth/session')).status).toBe(401);
        expect((await get(ctxX2, '/api/auth/session')).status).toBe(401);
        expect((await get(ctxY, '/api/auth/session')).status).toBe(200);
        void credentialY;
    });
});

describe('GET /api/auth/passkeys (list, decision 8)', () => {
    let ctx: Ctx;

    afterEach(() => {
        ctx?.testDb.cleanup();
    });

    it('requires a session (401 without one)', async () => {
        ctx = setUp();
        const res = await get(ctx, '/api/auth/passkeys');
        expect(res.status).toBe(401);
    });

    it('a merely-valid (not fresh) session is enough to list — listing is not a sensitive write', async () => {
        let currentTime = 4_000_000_000;
        ctx = setUp(() => currentTime);
        await registerNewAccount(ctx);
        currentTime += FRESH_AUTH_WINDOW_MS + 1;

        const res = await get(ctx, '/api/auth/passkeys');
        expect(res.status).toBe(200);
    });

    it('returns only the owner credentials with the current flag right and no key material', async () => {
        ctx = setUp();
        const { credentialId: firstCredentialId } = await registerNewAccount(ctx);
        const { credentialId: secondCredentialId } = await addPasskeyOverHttp(ctx);

        const jarB = createCookieJar();
        const ctxB: Ctx = { ...ctx, jar: jarB };
        await registerNewAccount(ctxB);

        const res = await get(ctx, '/api/auth/passkeys');
        expect(res.status).toBe(200);
        const { passkeys } = (await res.json()) as {
            passkeys: { id: string; current: boolean; createdAt: number }[];
        };
        expect(passkeys.map((p) => p.id).sort()).toEqual(
            [firstCredentialId, secondCredentialId].sort(),
        );
        // The session was created by registration (first credential); the second passkey's
        // enrollment never rotates the session.
        const current = passkeys.find((p) => p.id === firstCredentialId);
        expect(current?.current).toBe(true);
        for (const p of passkeys) {
            expect(JSON.stringify(p)).not.toMatch(/publicKey|public_key|signCount|sign_count/i);
        }
    });
});

describe('registration- and login-created sessions record credential_id (#1190 decision 7)', () => {
    let ctx: Ctx;

    afterEach(() => {
        ctx?.testDb.cleanup();
    });

    it('the session row created at register/verify has credential_id set to the registered credential', async () => {
        ctx = setUp();
        const { credentialId } = await registerNewAccount(ctx);

        const row = ctx.testDb.db
            .prepare('SELECT credential_id FROM sessions')
            .get() as unknown as { credential_id: string | null };
        expect(row.credential_id).toBe(credentialId);
    });

    it('the session row created at login/verify has credential_id set to the credential used to log in', async () => {
        ctx = setUp();
        const { accountId, credentialId, authenticator } = await registerNewAccount(ctx);
        await postJson(ctx, '/api/auth/logout');

        const loginOpts = await postJson(ctx, '/api/auth/login/options');
        const { options } = (await loginOpts.json()) as { options: { challenge: string } };
        const response = authenticator.authenticate({
            challenge: options.challenge,
            userHandle: accountId,
        });
        const loginVerify = await postJson(ctx, '/api/auth/login/verify', response);
        expect(loginVerify.status).toBe(200);

        const rows = ctx.testDb.db
            .prepare('SELECT credential_id FROM sessions ORDER BY created_at DESC')
            .all() as unknown as { credential_id: string | null }[];
        expect(rows[0]?.credential_id).toBe(credentialId);
    });
});

describe('step-up rotation (#1190 decision 3, P2-2)', () => {
    let ctx: Ctx;

    afterEach(() => {
        ctx?.testDb.cleanup();
    });

    it('reauth with a DIFFERENT credential rotates the session: the old session dies, the new one carries the asserting credential, list shows it current, and revoking it ends the stepped-up session', async () => {
        let currentTime = 5_000_000_000;
        ctx = setUp(() => currentTime);
        const { accountId, credentialId: credentialX } = await registerNewAccount(ctx);
        const { credentialId: credentialY, authenticator: authenticatorY } =
            await addPasskeyOverHttp(ctx);
        const oldSessionToken = ctx.jar.get('__Host-ensemble_session') as string;

        currentTime += FRESH_AUTH_WINDOW_MS + 1; // the session is now stale, not merely valid

        const reauthRes = await reauthOverHttp(ctx, authenticatorY, accountId);
        expect(reauthRes.status).toBe(200);
        expect(await reauthRes.json()).toEqual({ accountId });

        const newSessionToken = ctx.jar.get('__Host-ensemble_session') as string;
        expect(newSessionToken).not.toBe(oldSessionToken);

        // R04: the OLD session cookie must now be dead (401), not merely superseded client-side.
        const staleCheck = await ctx.app.request(`${HTTPS_URL}/api/auth/session`, {
            headers: { cookie: `__Host-ensemble_session=${oldSessionToken}` },
        });
        expect(staleCheck.status).toBe(401);

        // R05: the NEW session row's credential_id is the ASSERTING credential (Y), not carried
        // over from the old session (X).
        const hash = createHash('sha256').update(newSessionToken, 'utf8').digest('hex');
        const row = ctx.testDb.db
            .prepare('SELECT credential_id FROM sessions WHERE token_hash = ?')
            .get(hash) as unknown as { credential_id: string | null };
        expect(row.credential_id).toBe(credentialY);

        // GET /api/auth/passkeys agrees: Y is current, X is not.
        const listRes = await get(ctx, '/api/auth/passkeys');
        expect(listRes.status).toBe(200);
        const { passkeys } = (await listRes.json()) as {
            passkeys: { id: string; current: boolean }[];
        };
        expect(passkeys.find((p) => p.id === credentialY)?.current).toBe(true);
        expect(passkeys.find((p) => p.id === credentialX)?.current).toBe(false);

        // Revoking Y (the stepped-up session is now fresh, since it was just created) ends the
        // stepped-up session — signedOut: true and the cookie is cleared.
        const revokeRes = await postJson(ctx, '/api/auth/passkeys/revoke', {
            credentialId: credentialY,
        });
        expect(revokeRes.status).toBe(200);
        expect(await revokeRes.json()).toEqual({ signedOut: true });

        const afterRevoke = await get(ctx, '/api/auth/session');
        expect(afterRevoke.status).toBe(401);
    });
});
