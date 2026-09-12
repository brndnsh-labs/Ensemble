import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebAuthnConfig, type WebAuthnConfig } from '../../src/auth/config.js';
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

const LOCAL_CONFIG: WebAuthnConfig = createWebAuthnConfig({
    rpId: 'localhost',
    rpName: 'Ensemble Test',
    origin: 'http://localhost:5173',
});
const LOCAL_URL = 'http://localhost:5173';

interface Ctx {
    testDb: TestDatabase;
    app: ReturnType<typeof createApp>;
    jar: ReturnType<typeof createCookieJar>;
    urlBase: string;
    config: WebAuthnConfig;
}

function setUp(config: WebAuthnConfig, urlBase: string): Ctx {
    const testDb = createTestDatabase();
    const app = createApp({ db: testDb.db, config });
    return { testDb, app, jar: createCookieJar(), urlBase, config };
}

async function postJson(ctx: Ctx, path: string, body?: unknown): Promise<Response> {
    // A real HTTP request cannot carry a body without a Content-Length or Transfer-Encoding
    // header — that is exactly the HTTP framing an in-memory `app.request()` Request object does
    // NOT reproduce on its own (fetch's Request never surfaces a computed Content-Length via
    // `.headers`). Setting it explicitly here is what makes this test traffic realistic instead
    // of accidentally bypassing `requestHasBody`'s Content-Length/Transfer-Encoding check.
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

/**
 * Raw request body + headers, including an accurate Content-Length — see `postJson`'s comment
 * for why this must be set by hand for `app.request()` traffic to behave like a real request.
 */
function rawJsonBody(
    rawBody: string,
    extraHeaders: Record<string, string> = {},
): { body: string; headers: Record<string, string> } {
    return {
        body: rawBody,
        headers: {
            'content-type': 'application/json',
            'content-length': String(Buffer.byteLength(rawBody, 'utf8')),
            ...extraHeaders,
        },
    };
}

/**
 * Registers a brand-new discoverable passkey and completes the ceremony over `ctx`'s jar. Named
 * for what it actually does — registration only, no subsequent login — after a review finding
 * that its old name (`registerAndLogin`) promised a login step it never performed. Returns the
 * authenticator too, so a caller that wants to exercise a SEPARATE login ceremony against the
 * same credential (P2-2's two-jar test, P2-5's fixation-on-login test) doesn't have to
 * reconstruct one with matching `rpId`/`origin`.
 */
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

describe('full flow (app.request(), real soft authenticator)', () => {
    let ctx: Ctx;

    afterEach(() => {
        ctx?.testDb.cleanup();
    });

    it('register -> read session -> logout -> read session (401) -> login -> revoke others', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const authenticator = createSoftAuthenticator({
            rpId: HTTPS_CONFIG.rpId,
            origin: HTTPS_CONFIG.origin,
        });

        // 1. register
        const optionsRes = await postJson(ctx, '/api/auth/register/options');
        expect(optionsRes.status).toBe(200);
        const { options } = (await optionsRes.json()) as { options: { challenge: string } };
        const regResponse = authenticator.register({ challenge: options.challenge });
        const verifyRes = await postJson(ctx, '/api/auth/register/verify', regResponse);
        expect(verifyRes.status).toBe(200);
        const { accountId } = (await verifyRes.json()) as { accountId: string };
        expect(typeof accountId).toBe('string');
        expect(ctx.jar.get('__Host-ensemble_session')).toBeDefined();
        expect(ctx.jar.get('__Host-ensemble_ceremony')).toBeUndefined(); // cleared on verify

        // 2. read session
        const sessionRes = await get(ctx, '/api/auth/session');
        expect(sessionRes.status).toBe(200);
        expect(await sessionRes.json()).toEqual({ accountId });

        // 3. logout
        const logoutRes = await postJson(ctx, '/api/auth/logout');
        expect(logoutRes.status).toBe(204);
        expect(ctx.jar.get('__Host-ensemble_session')).toBeUndefined();

        // 4. read session again -> 401
        const afterLogout = await get(ctx, '/api/auth/session');
        expect(afterLogout.status).toBe(401);
        expect(await afterLogout.json()).toEqual({ error: 'unauthenticated' });

        // 5. login
        const loginOptionsRes = await postJson(ctx, '/api/auth/login/options');
        expect(loginOptionsRes.status).toBe(200);
        const { options: loginOptions } = (await loginOptionsRes.json()) as {
            options: { challenge: string };
        };
        const authResponse = authenticator.authenticate({
            challenge: loginOptions.challenge,
            userHandle: accountId,
        });
        const loginVerifyRes = await postJson(ctx, '/api/auth/login/verify', authResponse);
        expect(loginVerifyRes.status).toBe(200);
        expect(await loginVerifyRes.json()).toEqual({ accountId });

        const afterLogin = await get(ctx, '/api/auth/session');
        expect(afterLogin.status).toBe(200);

        // 6. revoke-others (only one session exists, so 0 revoked but still 204)
        const revokeRes = await postJson(ctx, '/api/auth/sessions/revoke-others');
        expect(revokeRes.status).toBe(204);
        const stillIn = await get(ctx, '/api/auth/session');
        expect(stillIn.status).toBe(200);
    });

    it('sets exact Set-Cookie attributes for the ceremony and session cookies under an https config', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const optionsRes = await postJson(ctx, '/api/auth/register/options');
        const ceremonySetCookies = optionsRes.headers.getSetCookie();
        expect(ceremonySetCookies).toHaveLength(1);
        const ceremonyCookie = ceremonySetCookies[0] as string;
        expect(ceremonyCookie).toMatch(
            /^__Host-ensemble_ceremony=[A-Za-z0-9_-]{43}; Max-Age=300; Path=\/; HttpOnly; Secure; SameSite=Strict$/,
        );

        const authenticator = createSoftAuthenticator({
            rpId: HTTPS_CONFIG.rpId,
            origin: HTTPS_CONFIG.origin,
        });
        const { options } = (await optionsRes.json()) as { options: { challenge: string } };
        const response = authenticator.register({ challenge: options.challenge });
        const verifyRes = await postJson(ctx, '/api/auth/register/verify', response);
        expect(verifyRes.status).toBe(200);

        const verifySetCookies = verifyRes.headers.getSetCookie();
        const clearedCeremony = verifySetCookies.find((c) =>
            c.startsWith('__Host-ensemble_ceremony='),
        );
        expect(clearedCeremony).toMatch(/Max-Age=0/);
        const sessionCookie = verifySetCookies.find((c) =>
            c.startsWith('__Host-ensemble_session='),
        );
        expect(sessionCookie).toBeDefined();
        // Exact string (P2-4): the token portion is matched loosely (43 base64url characters),
        // everything else — attribute set, order and values — matched exactly. 2592000 seconds
        // is exactly 30 days (SESSION_TTL_MS).
        expect(sessionCookie).toMatch(
            /^__Host-ensemble_session=[A-Za-z0-9_-]{43}; Max-Age=2592000; Path=\/; HttpOnly; Secure; SameSite=Strict$/,
        );
    });

    it('sets exact Set-Cookie attributes under an http://localhost config, and the full flow runs there too (R7 guard)', async () => {
        ctx = setUp(LOCAL_CONFIG, LOCAL_URL);
        const optionsRes = await postJson(ctx, '/api/auth/register/options');
        const ceremonySetCookies = optionsRes.headers.getSetCookie();
        expect(ceremonySetCookies).toHaveLength(1);
        const ceremonyCookie = ceremonySetCookies[0] as string;
        expect(ceremonyCookie).toMatch(
            /^ensemble_ceremony=[A-Za-z0-9_-]{43}; Max-Age=300; Path=\/; HttpOnly; SameSite=Strict$/,
        );

        const authenticator = createSoftAuthenticator({
            rpId: LOCAL_CONFIG.rpId,
            origin: LOCAL_CONFIG.origin,
        });
        const { options } = (await optionsRes.json()) as { options: { challenge: string } };
        const response = authenticator.register({ challenge: options.challenge });
        const verifyRes = await postJson(ctx, '/api/auth/register/verify', response);
        expect(verifyRes.status).toBe(200);
        const { accountId } = (await verifyRes.json()) as { accountId: string };

        const verifySetCookies = verifyRes.headers.getSetCookie();
        const sessionCookie = verifySetCookies.find((c) => c.startsWith('ensemble_session='));
        expect(sessionCookie).toBeDefined();
        expect(sessionCookie).toMatch(
            /^ensemble_session=[A-Za-z0-9_-]{43}; Max-Age=2592000; Path=\/; HttpOnly; SameSite=Strict$/,
        );

        // The full flow, end to end, under the localhost config — R7's mutant (localhost reads
        // the __Host- prefixed name) would break this: the cookie the jar is holding is
        // unprefixed, so a read that only looks for the prefixed name would 401 here.
        const sessionRes = await get(ctx, '/api/auth/session');
        expect(sessionRes.status).toBe(200);
        expect(await sessionRes.json()).toEqual({ accountId });
        const logoutRes = await postJson(ctx, '/api/auth/logout');
        expect(logoutRes.status).toBe(204);
        const afterLogout = await get(ctx, '/api/auth/session');
        expect(afterLogout.status).toBe(401);
    });

    it('destroys any pending pre-auth session and issues a fresh one at successful register/verify (fixation defense)', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const { accountId: firstAccount } = await registerNewAccount(ctx);
        // A full `name=value` Cookie header, not just the bare token value — a bare value would
        // make every lookup below fail to find the cookie at all (401 for the wrong reason,
        // regardless of whether revocation actually ran).
        const firstSessionCookieHeader = `__Host-ensemble_session=${ctx.jar.get('__Host-ensemble_session')}`;
        const firstSessionRes = await get(ctx, '/api/auth/session');
        expect(firstSessionRes.status).toBe(200);

        // Register a second, unrelated account WHILE the first session cookie is still being
        // sent (e.g. "signing into a different account while signed in").
        const secondAuthenticator = createSoftAuthenticator({
            rpId: HTTPS_CONFIG.rpId,
            origin: HTTPS_CONFIG.origin,
        });
        const optionsRes = await postJson(ctx, '/api/auth/register/options');
        const { options } = (await optionsRes.json()) as { options: { challenge: string } };
        const regResponse = secondAuthenticator.register({ challenge: options.challenge });
        const verifyRes = await postJson(ctx, '/api/auth/register/verify', regResponse);
        expect(verifyRes.status).toBe(200);
        const { accountId: secondAccount } = (await verifyRes.json()) as { accountId: string };
        expect(secondAccount).not.toBe(firstAccount);

        // The old identifier is dead: presenting the ORIGINAL cookie directly (bypassing the
        // jar, which has already moved on to the new cookie) must now be rejected.
        const staleRes = await ctx.app.request(`${HTTPS_URL}/api/auth/session`, {
            headers: { cookie: firstSessionCookieHeader },
        });
        expect(staleRes.status).toBe(401);

        // The jar now holds the fresh session, bound to the second account.
        const freshRes = await get(ctx, '/api/auth/session');
        expect(freshRes.status).toBe(200);
        expect(await freshRes.json()).toEqual({ accountId: secondAccount });
    });

    it('fixation defense also fires on login/verify, not only register/verify (P2-5, R9 guard)', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const { accountId, authenticator } = await registerNewAccount(ctx);
        const firstSessionCookieHeader = `__Host-ensemble_session=${ctx.jar.get('__Host-ensemble_session')}`;
        expect((await get(ctx, '/api/auth/session')).status).toBe(200);

        // Log back into the SAME account WHILE the jar still carries the first session's cookie
        // — this is exactly the flow #1189's decision 4 names ("signing into a different account
        // while signed in"), exercised on the login path instead of registration. A mutant that
        // shares the helper only with register/verify (or duplicates it and forgets the call on
        // login/verify) leaves the old session alive here.
        const loginOptionsRes = await postJson(ctx, '/api/auth/login/options');
        const { options } = (await loginOptionsRes.json()) as { options: { challenge: string } };
        const authResponse = authenticator.authenticate({
            challenge: options.challenge,
            userHandle: accountId,
        });
        const loginVerifyRes = await postJson(ctx, '/api/auth/login/verify', authResponse);
        expect(loginVerifyRes.status).toBe(200);

        const staleRes = await ctx.app.request(`${HTTPS_URL}/api/auth/session`, {
            headers: { cookie: firstSessionCookieHeader },
        });
        expect(staleRes.status).toBe(401);
        expect((await get(ctx, '/api/auth/session')).status).toBe(200);
    });
});

describe('logout revokes the session (P2-1)', () => {
    let ctx: Ctx;

    afterEach(() => {
        ctx?.testDb.cleanup();
    });

    it('replaying the pre-logout cookie afterward gets 401, and revoked_at is set on the row (R1 guard)', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        await registerNewAccount(ctx);
        // Captured BEFORE logout — a full "name=value" Cookie header.
        const preLogoutCookieHeader = ctx.jar.header() as string;

        const logoutRes = await postJson(ctx, '/api/auth/logout');
        expect(logoutRes.status).toBe(204);

        const row = ctx.testDb.db.prepare('SELECT revoked_at FROM sessions').get() as unknown as {
            revoked_at: number | null;
        };
        expect(row.revoked_at).not.toBeNull();

        const replay = await ctx.app.request(`${HTTPS_URL}/api/auth/session`, {
            headers: { cookie: preLogoutCookieHeader },
        });
        expect(replay.status).toBe(401);
    });
});

describe('revoke-others across two devices of the same account (P2-2)', () => {
    let ctx: Ctx;

    afterEach(() => {
        ctx?.testDb.cleanup();
    });

    it('jar B (a second device, same account) is signed out; jar A stays signed in (R2 guard)', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const { accountId, authenticator } = await registerNewAccount(ctx); // jar A's session

        // Jar B: a second device logs into the SAME account via a fresh login ceremony, using
        // the same physical passkey.
        const jarB = createCookieJar();
        const ctxB: Ctx = { ...ctx, jar: jarB };
        const loginOptionsRes = await postJson(ctxB, '/api/auth/login/options');
        const { options } = (await loginOptionsRes.json()) as { options: { challenge: string } };
        const authResponse = authenticator.authenticate({
            challenge: options.challenge,
            userHandle: accountId,
        });
        const loginVerifyRes = await postJson(ctxB, '/api/auth/login/verify', authResponse);
        expect(loginVerifyRes.status).toBe(200);

        expect((await get(ctx, '/api/auth/session')).status).toBe(200);
        expect((await get(ctxB, '/api/auth/session')).status).toBe(200);

        const revokeRes = await postJson(ctx, '/api/auth/sessions/revoke-others');
        expect(revokeRes.status).toBe(204);

        expect((await get(ctxB, '/api/auth/session')).status).toBe(401);
        expect((await get(ctx, '/api/auth/session')).status).toBe(200);
    });
});

describe('cookie prefix is enforced, not merely set (P2-3)', () => {
    let ctx: Ctx;

    afterEach(() => {
        ctx?.testDb.cleanup();
    });

    it('an unprefixed session cookie is rejected under the https config (R3 guard)', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        await registerNewAccount(ctx);
        const realToken = ctx.jar.get('__Host-ensemble_session');
        const res = await ctx.app.request(`${HTTPS_URL}/api/auth/session`, {
            headers: { cookie: `ensemble_session=${realToken}` },
        });
        expect(res.status).toBe(401);
    });

    it('a __Secure- prefixed session cookie is rejected under the https config (R3 guard)', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        await registerNewAccount(ctx);
        const realToken = ctx.jar.get('__Host-ensemble_session');
        const res = await ctx.app.request(`${HTTPS_URL}/api/auth/session`, {
            headers: { cookie: `__Secure-ensemble_session=${realToken}` },
        });
        expect(res.status).toBe(401);
    });

    it('an unprefixed ceremony cookie is rejected on verify (R4 guard)', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const authenticator = createSoftAuthenticator({
            rpId: HTTPS_CONFIG.rpId,
            origin: HTTPS_CONFIG.origin,
        });
        const optionsRes = await postJson(ctx, '/api/auth/register/options');
        const { options } = (await optionsRes.json()) as { options: { challenge: string } };
        const realCeremonyToken = ctx.jar.get('__Host-ensemble_ceremony');
        const response = authenticator.register({ challenge: options.challenge });
        const rawBody = JSON.stringify(response);

        const res = await ctx.app.request(`${HTTPS_URL}/api/auth/register/verify`, {
            method: 'POST',
            ...rawJsonBody(rawBody, {
                origin: HTTPS_CONFIG.origin,
                cookie: `ensemble_ceremony=${realCeremonyToken}`,
            }),
        });
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: 'authentication_failed' });
    });
});

describe('ceremony failure collapse (every reason except malformed_request -> 401)', () => {
    let ctx: Ctx;

    afterEach(() => {
        ctx?.testDb.cleanup();
    });

    it('an unknown credential id (credential_not_found) collapses to 401 authentication_failed', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const authenticator = createSoftAuthenticator({
            rpId: HTTPS_CONFIG.rpId,
            origin: HTTPS_CONFIG.origin,
        });
        const optionsRes = await postJson(ctx, '/api/auth/login/options');
        const { options } = (await optionsRes.json()) as { options: { challenge: string } };
        // No registration ever happened, so this credential id is unknown -> credential_not_found.
        const authResponse = authenticator.authenticate({
            challenge: options.challenge,
            userHandle: 'nonexistent-account',
        });
        const res = await postJson(ctx, '/api/auth/login/verify', authResponse);
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: 'authentication_failed' });
    });

    it('a wrong userHandle (user_handle_mismatch) collapses to 401 authentication_failed', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const { accountId } = await registerNewAccount(ctx);
        void accountId;
        const authenticator = createSoftAuthenticator({
            rpId: HTTPS_CONFIG.rpId,
            origin: HTTPS_CONFIG.origin,
            credentialId: undefined,
        });
        // Re-register under a fresh authenticator so we know its credential id is real, then
        // present the WRONG userHandle for it.
        const optionsRes = await postJson(ctx, '/api/auth/register/options');
        const { options: regOptions } = (await optionsRes.json()) as {
            options: { challenge: string };
        };
        const regResponse = authenticator.register({ challenge: regOptions.challenge });
        const regVerify = await postJson(ctx, '/api/auth/register/verify', regResponse);
        expect(regVerify.status).toBe(200);

        const loginOptionsRes = await postJson(ctx, '/api/auth/login/options');
        const { options: loginOptions } = (await loginOptionsRes.json()) as {
            options: { challenge: string };
        };
        const authResponse = authenticator.authenticate({
            challenge: loginOptions.challenge,
            userHandle: 'not-the-real-account-id',
        });
        const res = await postJson(ctx, '/api/auth/login/verify', authResponse);
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: 'authentication_failed' });
    });

    it('a login response with no userHandle at all (user_handle_missing) collapses to 401', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const { authenticator } = await registerNewAccount(ctx);
        const loginOptionsRes = await postJson(ctx, '/api/auth/login/options');
        const { options } = (await loginOptionsRes.json()) as { options: { challenge: string } };
        // No userHandle at all -- discoverable login REQUIRES one per WebAuthn L3 7.2 step 6.
        const authResponse = authenticator.authenticate({ challenge: options.challenge });
        const res = await postJson(ctx, '/api/auth/login/verify', authResponse);
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: 'authentication_failed' });
    });

    it('a tampered ceremony response (wrong recorded origin) collapses via verification_failed', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const { accountId, authenticator } = await registerNewAccount(ctx);
        const loginOptionsRes = await postJson(ctx, '/api/auth/login/options');
        const { options } = (await loginOptionsRes.json()) as { options: { challenge: string } };
        // The real HTTP request's Origin header stays correct (so the same-origin guard passes)
        // — the authenticator signs a DIFFERENT origin into clientDataJSON, which is what
        // verifyAuthenticationResponse itself checks and rejects.
        const authResponse = authenticator.authenticate({
            challenge: options.challenge,
            userHandle: accountId,
            origin: 'https://not-the-configured-origin.example',
        });
        const res = await postJson(ctx, '/api/auth/login/verify', authResponse);
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: 'authentication_failed' });
    });

    it('a ceremony_not_found (no ceremony cookie presented at all) collapses to 401', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        // No cookie at all presented to verify -> ceremony_not_found -> still 401. (This used to
        // be mislabelled "an expired ceremony" — it never actually exercises expiry. See the
        // genuinely-expired test below for that.)
        const rawBody = JSON.stringify({
            id: 'x',
            rawId: 'x',
            type: 'public-key',
            response: { clientDataJSON: 'x', authenticatorData: 'x', signature: 'x' },
            clientExtensionResults: {},
        });
        const res = await ctx.app.request(`${HTTPS_URL}/api/auth/login/verify`, {
            method: 'POST',
            ...rawJsonBody(rawBody, { origin: HTTPS_CONFIG.origin }),
        });
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: 'authentication_failed' });
    });

    it('a genuinely expired ceremony (past the 5-minute TTL) collapses to 401 (ceremony_expired)', async () => {
        // The ceremony library reads Date.now() internally (challenges.ts), not the app's
        // injectable `now` — advancing the real clock via fake timers is the only way to make a
        // still-present challenge row actually expire, rather than accidentally re-testing
        // ceremony_not_found under a misleading title (the bug this test replaces).
        //
        // This must use a REAL, registered credential and the REAL account's userHandle: an
        // earlier version of this test used an unregistered authenticator and a made-up
        // userHandle, so it actually exercised `credential_not_found`, not expiry at all — a
        // mutant that removed the expiry check entirely still got 401 (for that unrelated
        // reason) and the test never noticed (N17). Registering happens on the REAL clock,
        // before fake timers are enabled, so its own awaits aren't at risk of a fake-timer stall.
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const { accountId, authenticator } = await registerNewAccount(ctx);

        vi.useFakeTimers();
        try {
            const optionsRes = await postJson(ctx, '/api/auth/login/options');
            expect(optionsRes.status).toBe(200);
            const { options } = (await optionsRes.json()) as { options: { challenge: string } };

            vi.advanceTimersByTime(5 * 60 * 1000 + 1); // past CHALLENGE_TTL_MS

            const authResponse = authenticator.authenticate({
                challenge: options.challenge,
                userHandle: accountId,
            });
            const res = await postJson(ctx, '/api/auth/login/verify', authResponse);
            expect(res.status).toBe(401);
            expect(await res.json()).toEqual({ error: 'authentication_failed' });
        } finally {
            vi.useRealTimers();
        }
    });

    it('a malformed request body maps to 400, not 401 or 500', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const res = await ctx.app.request(`${HTTPS_URL}/api/auth/login/verify`, {
            method: 'POST',
            ...rawJsonBody('not valid json{{{', { origin: HTTPS_CONFIG.origin }),
        });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'malformed_request' });
    });

    it('a well-shaped but incomplete response body maps to 400 via the library shape guard', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const rawBody = JSON.stringify({ notAResponse: true });
        const res = await ctx.app.request(`${HTTPS_URL}/api/auth/login/verify`, {
            method: 'POST',
            ...rawJsonBody(rawBody, { origin: HTTPS_CONFIG.origin }),
        });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'malformed_request' });
    });

    it('registering the same credential twice collapses credential_exists to 401', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const authenticator = createSoftAuthenticator({
            rpId: HTTPS_CONFIG.rpId,
            origin: HTTPS_CONFIG.origin,
        });

        const firstOptions = await postJson(ctx, '/api/auth/register/options');
        const { options: opts1 } = (await firstOptions.json()) as {
            options: { challenge: string };
        };
        const firstResponse = authenticator.register({ challenge: opts1.challenge });
        const firstVerify = await postJson(ctx, '/api/auth/register/verify', firstResponse);
        expect(firstVerify.status).toBe(200);

        // Same authenticator/credential id, a fresh ceremony — the library detects the
        // credential-id collision and returns 'credential_exists'.
        const secondOptions = await postJson(ctx, '/api/auth/register/options');
        const { options: opts2 } = (await secondOptions.json()) as {
            options: { challenge: string };
        };
        const secondResponse = authenticator.register({ challenge: opts2.challenge });
        const secondVerify = await postJson(ctx, '/api/auth/register/verify', secondResponse);
        expect(secondVerify.status).toBe(401);
        expect(await secondVerify.json()).toEqual({ error: 'authentication_failed' });
    });

    it('a FAILED register/verify still clears the ceremony cookie (R10 guard)', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const optionsRes = await postJson(ctx, '/api/auth/register/options');
        expect(optionsRes.status).toBe(200);
        // Well-shaped enough to pass the library's shallow shape guard (id/rawId are strings,
        // response is an object) and reach — and fail inside — the real WebAuthn verify call.
        const rawBody = JSON.stringify({
            id: 'x',
            rawId: 'x',
            response: { clientDataJSON: 'not-real-base64url', attestationObject: 'also-not-real' },
            type: 'public-key',
            clientExtensionResults: {},
        });
        const res = await ctx.app.request(`${HTTPS_URL}/api/auth/register/verify`, {
            method: 'POST',
            ...rawJsonBody(rawBody, {
                origin: HTTPS_CONFIG.origin,
                cookie: ctx.jar.header() as string,
            }),
        });
        expect(res.status).toBe(401);
        const setCookies = res.headers.getSetCookie();
        const ceremonyCookie = setCookies.find((c) => c.startsWith('__Host-ensemble_ceremony='));
        expect(ceremonyCookie).toBeDefined();
        expect(ceremonyCookie).toMatch(/Max-Age=0/);
    });

    it('a FAILED login/verify also clears the ceremony cookie (R10a guard)', async () => {
        // The register/verify test above doesn't exercise this sibling route at all — a mutant
        // that clears the cookie only in register/verify's handler (or only on success in
        // login/verify) would survive it.
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const optionsRes = await postJson(ctx, '/api/auth/login/options');
        expect(optionsRes.status).toBe(200);
        const rawBody = JSON.stringify({
            id: 'x',
            rawId: 'x',
            response: {
                clientDataJSON: 'not-real-base64url',
                authenticatorData: 'also-not-real',
                signature: 'also-not-real',
            },
            type: 'public-key',
            clientExtensionResults: {},
        });
        const res = await ctx.app.request(`${HTTPS_URL}/api/auth/login/verify`, {
            method: 'POST',
            ...rawJsonBody(rawBody, {
                origin: HTTPS_CONFIG.origin,
                cookie: ctx.jar.header() as string,
            }),
        });
        expect(res.status).toBe(401);
        const setCookies = res.headers.getSetCookie();
        const ceremonyCookie = setCookies.find((c) => c.startsWith('__Host-ensemble_ceremony='));
        expect(ceremonyCookie).toBeDefined();
        expect(ceremonyCookie).toMatch(/Max-Age=0/);
    });

    it('rejects a JSON array body on register/options', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const res = await ctx.app.request(`${HTTPS_URL}/api/auth/register/options`, {
            method: 'POST',
            ...rawJsonBody('[]', { origin: HTTPS_CONFIG.origin }),
        });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'malformed_request' });
    });
});

describe('concurrent verify (single-use ceremony claim)', () => {
    let ctx: Ctx;

    afterEach(() => {
        ctx?.testDb.cleanup();
    });

    it('exactly one of two concurrent verifies carrying the same ceremony cookie succeeds', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const authenticator = createSoftAuthenticator({
            rpId: HTTPS_CONFIG.rpId,
            origin: HTTPS_CONFIG.origin,
        });
        const optionsRes = await postJson(ctx, '/api/auth/register/options');
        const { options } = (await optionsRes.json()) as { options: { challenge: string } };
        const regResponse = authenticator.register({ challenge: options.challenge });
        const ceremonyCookie = ctx.jar.header() as string;
        const rawBody = JSON.stringify(regResponse);

        const fire = () =>
            ctx.app.request(`${HTTPS_URL}/api/auth/register/verify`, {
                method: 'POST',
                ...rawJsonBody(rawBody, { origin: HTTPS_CONFIG.origin, cookie: ceremonyCookie }),
            });

        const [a, b] = await Promise.all([fire(), fire()]);
        const statuses = [a.status, b.status].sort();
        // One succeeds (200); the other loses the atomic claim race (ceremony_not_found -> 401).
        expect(statuses).toEqual([200, 401]);
    });
});

describe('session revocation and cross-account isolation over HTTP', () => {
    let ctx: Ctx;

    afterEach(() => {
        ctx?.testDb.cleanup();
    });

    it('revoke-others requires a session', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const res = await postJson(ctx, '/api/auth/sessions/revoke-others');
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: 'unauthenticated' });
    });

    it('cross-account revocation is refused: another account session is untouched', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const { accountId: accountA } = await registerNewAccount(ctx);
        const sessionCookieA = ctx.jar.header() as string;

        // A second, independent browser/jar for account B.
        const jarB = createCookieJar();
        const ctxB: Ctx = { ...ctx, jar: jarB };
        const { accountId: accountB } = await registerNewAccount(ctxB);
        expect(accountB).not.toBe(accountA);

        // account B calls revoke-others using ITS OWN session — must not touch account A.
        const revokeRes = await postJson(ctxB, '/api/auth/sessions/revoke-others');
        expect(revokeRes.status).toBe(204);

        const stillA = await ctx.app.request(`${HTTPS_URL}/api/auth/session`, {
            headers: { cookie: sessionCookieA },
        });
        expect(stillA.status).toBe(200);
        expect(await stillA.json()).toEqual({ accountId: accountA });
    });

    it('an expired session (short sessionTtlMs, injected clock) is rejected', async () => {
        const testDb = createTestDatabase();
        let currentTime = 1_000_000;
        const app = createApp({
            db: testDb.db,
            config: HTTPS_CONFIG,
            now: () => currentTime,
            sessionTtlMs: 1000,
        });
        const jar = createCookieJar();
        const shortCtx: Ctx = { testDb, app, jar, urlBase: HTTPS_URL, config: HTTPS_CONFIG };
        ctx = shortCtx; // let the shared afterEach own cleanup, exactly once

        const { accountId } = await registerNewAccount(shortCtx);
        expect(typeof accountId).toBe('string');

        const beforeExpiry = await get(shortCtx, '/api/auth/session');
        expect(beforeExpiry.status).toBe(200);

        currentTime += 1001;
        const afterExpiry = await get(shortCtx, '/api/auth/session');
        expect(afterExpiry.status).toBe(401);
    });
});

describe('server-side authorization is DB-backed, not cookie-claimed', () => {
    let ctx: Ctx;

    afterEach(() => {
        ctx?.testDb.cleanup();
    });

    it('a session cookie carries no claims — a forged/garbage cookie value grants nothing', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const res = await ctx.app.request(`${HTTPS_URL}/api/auth/session`, {
            headers: { cookie: `__Host-ensemble_session=${'a'.repeat(43)}` },
        });
        expect(res.status).toBe(401);
    });
});

/**
 * An 80 KB (over the 64 KB limit) stream with no Content-Length, so `bodyLimit` could only size
 * it by draining. `highWaterMark: 0` stops the stream from pre-pulling a chunk at construction,
 * so the returned `pulls` counter reflects only REAL reads a downstream consumer triggered.
 */
function oversizedTrackedStream(): { stream: ReadableStream<Uint8Array>; pulls: () => number } {
    let pulls = 0;
    const chunk = new TextEncoder().encode('x'.repeat(40 * 1024));
    const stream = new ReadableStream(
        {
            pull(controller) {
                pulls += 1;
                controller.enqueue(chunk);
                if (pulls === 2) {
                    controller.close();
                }
            },
        },
        { highWaterMark: 0 },
    );
    return { stream, pulls: () => pulls };
}

describe('middleware order: same-origin/content-type guards run before bodyLimit (P3)', () => {
    let ctx: Ctx;

    afterEach(() => {
        ctx?.testDb.cleanup();
    });

    it('rejects a cross-origin request on Origin alone, never reading its (oversized) body', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const { stream, pulls } = oversizedTrackedStream();
        const res = await ctx.app.request(`${HTTPS_URL}/api/auth/register/verify`, {
            method: 'POST',
            headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
            body: stream,
            duplex: 'half',
        } as RequestInit);
        // bodyLimit first would drain the oversized stream and answer 413 before same-origin
        // ever ran; the guard first answers 403 on headers alone and never reads a byte.
        expect(res.status).toBe(403);
        expect(pulls()).toBe(0);
    });

    it('rejects a wrong-content-type request on headers alone, never reading its (oversized) body (N8 guard)', async () => {
        ctx = setUp(HTTPS_CONFIG, HTTPS_URL);
        const { stream, pulls } = oversizedTrackedStream();
        const res = await ctx.app.request(`${HTTPS_URL}/api/auth/register/verify`, {
            method: 'POST',
            // Valid Origin -- this isolates the content-type guard specifically, not same-origin.
            // Transfer-Encoding: chunked (no Content-Length) is what makes `requestHasBody`
            // recognize a body is present at all — without either header, the content-type
            // guard treats this as bodyless and skips straight to bodyLimit, which is a
            // different (also real) code path but not the one this test targets.
            headers: {
                origin: HTTPS_CONFIG.origin,
                'content-type': 'text/plain',
                'transfer-encoding': 'chunked',
            },
            body: stream,
            duplex: 'half',
        } as RequestInit);
        // If jsonOnlyGuard ran AFTER bodyLimit, bodyLimit would drain the oversized stream first
        // and answer 413 — the correct order answers 415 on the Content-Type header alone,
        // without reading a single byte of the body.
        expect(res.status).toBe(415);
        expect(pulls()).toBe(0);
    });
});
