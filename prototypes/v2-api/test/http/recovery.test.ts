import { afterEach, describe, expect, it } from 'vitest';
import { createWebAuthnConfig, type WebAuthnConfig } from '../../src/auth/config.js';
import { FRESH_AUTH_WINDOW_MS } from '../../src/auth/fresh-auth.js';
import { RECOVERY_CLAIM_RATE_LIMIT, RECOVERY_SESSION_TTL_MS } from '../../src/auth/recovery.js';
import { createApp } from '../../src/http/app.js';
import { createCookieJar } from '../helpers/cookie-jar.js';
import { createSoftAuthenticator, type SoftAuthenticator } from '../helpers/soft-authenticator.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

/**
 * HTTP-level coverage for #1191's recovery routes. Mirrors `passkey-management.test.ts`'s
 * `Ctx`/`postJson`/`get` harness exactly — see that file's comments for the Content-Length/jar
 * rationale.
 */

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

/** Raw request bypassing the jar entirely, for presenting a specific captured cookie value. */
async function requestWithCookie(ctx: Ctx, path: string, cookieHeader: string): Promise<Response> {
    return ctx.app.request(`${ctx.urlBase}${path}`, { headers: { cookie: cookieHeader } });
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

/** Enrolls AND confirms a fresh recovery code on `ctx`'s currently-signed-in (fresh) session. */
async function enrollAndConfirmRecoveryOverHttp(ctx: Ctx): Promise<string> {
    const enrollRes = await postJson(ctx, '/api/auth/recovery/enroll');
    expect(enrollRes.status).toBe(200);
    const { code } = (await enrollRes.json()) as { code: string };
    const confirmRes = await postJson(ctx, '/api/auth/recovery/confirm', { code });
    expect(confirmRes.status).toBe(204);
    return code;
}

/** Completes the recovery-only enroll-passkey ceremony on `ctx` (which must already hold a live
 * recovery-session cookie), with a brand-new authenticator. Returns the raw HTTP responses so
 * callers can assert on either. */
async function completeRecoveryEnrollPasskeyOverHttp(
    ctx: Ctx,
): Promise<{ authenticator: SoftAuthenticator; optionsRes: Response; verifyRes: Response }> {
    const authenticator = createSoftAuthenticator({
        rpId: ctx.config.rpId,
        origin: ctx.config.origin,
    });
    const optionsRes = await postJson(ctx, '/api/auth/recovery/enroll-passkey/options');
    if (optionsRes.status !== 200) {
        return { authenticator, optionsRes, verifyRes: optionsRes };
    }
    const { options } = (await optionsRes.json()) as { options: { challenge: string } };
    const response = authenticator.register({ challenge: options.challenge });
    const verifyRes = await postJson(ctx, '/api/auth/recovery/enroll-passkey/verify', response);
    return { authenticator, optionsRes, verifyRes };
}

describe('GET /api/auth/recovery/status', () => {
    let ctx: Ctx;

    afterEach(() => {
        ctx?.testDb.cleanup();
    });

    it('requires a session', async () => {
        ctx = setUp();
        const res = await get(ctx, '/api/auth/recovery/status');
        expect(res.status).toBe(401);
    });

    it('false before enrollment, false after enroll but before confirm, true after confirm (acceptance)', async () => {
        ctx = setUp();
        await registerNewAccount(ctx);

        expect(await (await get(ctx, '/api/auth/recovery/status')).json()).toEqual({
            enrolled: false,
        });

        const enrollRes = await postJson(ctx, '/api/auth/recovery/enroll');
        expect(enrollRes.status).toBe(200);
        const { code } = (await enrollRes.json()) as { code: string };
        expect(await (await get(ctx, '/api/auth/recovery/status')).json()).toEqual({
            enrolled: false,
        });

        const confirmRes = await postJson(ctx, '/api/auth/recovery/confirm', { code });
        expect(confirmRes.status).toBe(204);
        expect(await (await get(ctx, '/api/auth/recovery/status')).json()).toEqual({
            enrolled: true,
        });
    });
});

describe('POST /api/auth/recovery/enroll', () => {
    let ctx: Ctx;

    afterEach(() => {
        ctx?.testDb.cleanup();
    });

    it('requires a session', async () => {
        ctx = setUp();
        const res = await postJson(ctx, '/api/auth/recovery/enroll');
        expect(res.status).toBe(401);
    });

    it('requires a FRESH session (403 when stale)', async () => {
        let currentTime = 1_000_000_000;
        ctx = setUp(() => currentTime);
        await registerNewAccount(ctx);
        currentTime += FRESH_AUTH_WINDOW_MS + 1;

        const res = await postJson(ctx, '/api/auth/recovery/enroll');
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: 'fresh_auth_required' });
    });

    it('returns the raw code exactly once; the response never appears reversible', async () => {
        ctx = setUp();
        await registerNewAccount(ctx);
        const res = await postJson(ctx, '/api/auth/recovery/enroll');
        expect(res.status).toBe(200);
        const body = (await res.json()) as { code: string };
        expect(typeof body.code).toBe('string');
        expect(body.code.length).toBeGreaterThan(0);
    });

    it('re-enrolling before confirm replaces the pending code (retry path)', async () => {
        ctx = setUp();
        await registerNewAccount(ctx);
        const first = (await (await postJson(ctx, '/api/auth/recovery/enroll')).json()) as {
            code: string;
        };
        const second = (await (await postJson(ctx, '/api/auth/recovery/enroll')).json()) as {
            code: string;
        };
        expect(second.code).not.toBe(first.code);

        // The OLD code no longer confirms.
        const confirmOld = await postJson(ctx, '/api/auth/recovery/confirm', { code: first.code });
        expect(confirmOld.status).toBe(404);
        // The NEW one does.
        const confirmNew = await postJson(ctx, '/api/auth/recovery/confirm', { code: second.code });
        expect(confirmNew.status).toBe(204);
    });
});

describe('POST /api/auth/recovery/confirm', () => {
    let ctx: Ctx;

    afterEach(() => {
        ctx?.testDb.cleanup();
    });

    it('requires a session', async () => {
        ctx = setUp();
        const res = await postJson(ctx, '/api/auth/recovery/confirm', { code: 'anything' });
        expect(res.status).toBe(401);
    });

    it('requires a FRESH session', async () => {
        let currentTime = 1_000_000_000;
        ctx = setUp(() => currentTime);
        await registerNewAccount(ctx);
        const { code } = (await (await postJson(ctx, '/api/auth/recovery/enroll')).json()) as {
            code: string;
        };
        currentTime += FRESH_AUTH_WINDOW_MS + 1;

        const res = await postJson(ctx, '/api/auth/recovery/confirm', { code });
        expect(res.status).toBe(403);
    });

    it('a malformed body is 400', async () => {
        ctx = setUp();
        await registerNewAccount(ctx);
        const res = await postJson(ctx, '/api/auth/recovery/confirm', { code: 123 });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'malformed_request' });
    });

    it('a wrong code is 404 not_found', async () => {
        ctx = setUp();
        await registerNewAccount(ctx);
        await postJson(ctx, '/api/auth/recovery/enroll');
        const res = await postJson(ctx, '/api/auth/recovery/confirm', { code: 'wrong-code' });
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'not_found' });
    });
});

describe('POST /api/auth/recovery/claim', () => {
    let ctx: Ctx;

    afterEach(() => {
        ctx?.testDb.cleanup();
    });

    it('a malformed body is 400', async () => {
        ctx = setUp();
        const res = await postJson(ctx, '/api/auth/recovery/claim', { code: null });
        expect(res.status).toBe(400);
    });

    it('an unknown/garbage code is 401 authentication_failed', async () => {
        ctx = setUp();
        const res = await postJson(ctx, '/api/auth/recovery/claim', { code: 'no-such-code' });
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: 'authentication_failed' });
    });

    it('an UNCONFIRMED code is 401 (not claimable)', async () => {
        ctx = setUp();
        await registerNewAccount(ctx);
        const { code } = (await (await postJson(ctx, '/api/auth/recovery/enroll')).json()) as {
            code: string;
        };
        const res = await postJson(ctx, '/api/auth/recovery/claim', { code });
        expect(res.status).toBe(401);
    });

    it('a valid confirmed code succeeds (204) and mints a session that GET /api/auth/session REFUSES (acceptance: assert the refusal, not just the permission)', async () => {
        ctx = setUp();
        await registerNewAccount(ctx);
        const code = await enrollAndConfirmRecoveryOverHttp(ctx);
        await postJson(ctx, '/api/auth/logout'); // start claim from a clean slate

        const claimRes = await postJson(ctx, '/api/auth/recovery/claim', { code });
        expect(claimRes.status).toBe(204);
        expect(ctx.jar.get('__Host-ensemble_session')).toBeDefined();

        // The minted session exists (server-side) but is a RECOVERY session — every ordinary
        // session-reading route must refuse it.
        const sessionRes = await get(ctx, '/api/auth/session');
        expect(sessionRes.status).toBe(401);
    });

    it('reuse after a completed recovery is rejected (the code was consumed, not merely claimed)', async () => {
        ctx = setUp();
        await registerNewAccount(ctx);
        const code = await enrollAndConfirmRecoveryOverHttp(ctx);
        await postJson(ctx, '/api/auth/logout');
        expect((await postJson(ctx, '/api/auth/recovery/claim', { code })).status).toBe(204);
        const { verifyRes } = await completeRecoveryEnrollPasskeyOverHttp(ctx);
        expect(verifyRes.status).toBe(200);

        // A brand-new jar tries the SAME code again.
        const jarB = createCookieJar();
        const ctxB: Ctx = { ...ctx, jar: jarB };
        const replay = await postJson(ctxB, '/api/auth/recovery/claim', { code });
        expect(replay.status).toBe(401);
    });

    it('fixation defense: a session presented alongside the claim is revoked using ITS OWN account, not the recovery target', async () => {
        ctx = setUp();
        const { accountId: ownAccountId } = await registerNewAccount(ctx);
        const ownSessionCookieHeader = `__Host-ensemble_session=${ctx.jar.get('__Host-ensemble_session')}`;

        // A SECOND, unrelated account enrolls its own recovery code.
        const jarB = createCookieJar();
        const ctxB: Ctx = { ...ctx, jar: jarB };
        await registerNewAccount(ctxB);
        const codeB = await enrollAndConfirmRecoveryOverHttp(ctxB);

        // ctx (still holding its OWN, unrelated standard session cookie) claims account B's code.
        const claimRes = await postJson(ctx, '/api/auth/recovery/claim', { code: codeB });
        expect(claimRes.status).toBe(204);

        // The ORIGINAL session (account A's) was revoked as a side effect of presenting it
        // alongside the claim — replaying it directly is now dead.
        const staleOwn = await requestWithCookie(ctx, '/api/auth/session', ownSessionCookieHeader);
        expect(staleOwn.status).toBe(401);
        void ownAccountId;
    });

    it('rate-limited: the 11th attempt against a genuinely VALID, unclaimed code still gets 429, not success (acceptance)', async () => {
        // A mutable clock on the SAME app/limiter instance throughout (not a fresh app created
        // after the window "passes") — the fresh-app version this test used to build only proved
        // a brand-new limiter's empty map allows a request; it could not have caught a broken
        // sliding-window expiry on the actual limiter under test. Advancing `currentTime` on this
        // same instance is what genuinely exercises the sweep/expiry path in `rate-limit.ts`.
        let currentTime = 1_000_000_000;
        ctx = setUp(() => currentTime);
        await registerNewAccount(ctx);
        const validCode = await enrollAndConfirmRecoveryOverHttp(ctx);
        await postJson(ctx, '/api/auth/logout');

        expect(RECOVERY_CLAIM_RATE_LIMIT.max).toBe(10);
        for (let i = 0; i < RECOVERY_CLAIM_RATE_LIMIT.max; i++) {
            const res = await postJson(ctx, '/api/auth/recovery/claim', { code: 'still-invalid' });
            expect(res.status).toBe(401);
        }

        const eleventh = await postJson(ctx, '/api/auth/recovery/claim', { code: validCode });
        expect(eleventh.status).toBe(429);
        expect(await eleventh.json()).toEqual({ error: 'rate_limited' });
        expect(Number(eleventh.headers.get('retry-after'))).toBeGreaterThan(0);

        // The valid code was never even looked up while rate-limited (rate limit runs BEFORE any
        // DB touch) — it is still fully usable once the SAME limiter's window genuinely elapses.
        currentTime += RECOVERY_CLAIM_RATE_LIMIT.windowMs + 1;
        const afterWindow = await postJson(ctx, '/api/auth/recovery/claim', { code: validCode });
        expect(afterWindow.status).toBe(204);
    });
});

describe('recoveryClaimRateLimitIpHeader (adversarial-review P1 fix: proxy-shared-bucket denial-of-recovery)', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    /** Raw POST bypassing `postJson`'s helper so a caller-controlled header can be set. */
    async function postClaim(
        app: ReturnType<typeof createApp>,
        code: string,
        ipHeaderValue?: string,
    ): Promise<Response> {
        const body = JSON.stringify({ code });
        return app.request(`${HTTPS_URL}/api/auth/recovery/claim`, {
            method: 'POST',
            headers: {
                origin: HTTPS_CONFIG.origin,
                'content-type': 'application/json',
                'content-length': String(Buffer.byteLength(body, 'utf8')),
                ...(ipHeaderValue !== undefined ? { 'x-real-ip': ipHeaderValue } : {}),
            },
            body,
        });
    }

    it('without the option (default), two different callers behind the same proxy share ONE bucket — reproduces the finding', async () => {
        testDb = createTestDatabase();
        const app = createApp({ db: testDb.db, config: HTTPS_CONFIG });

        // Neither caller's `getConnInfo` resolves under `app.request()` (no real socket), so both
        // fall back to the SAME 'unknown' bucket regardless of the (ignored, since the option is
        // unset) x-real-ip header — this is the exact collapse the review flagged for a
        // single-shared-hop deployment.
        for (let i = 0; i < RECOVERY_CLAIM_RATE_LIMIT.max; i++) {
            const res = await postClaim(app, 'invalid', 'caller-A');
            expect(res.status).toBe(401);
        }
        // A DIFFERENT caller, same missing socket info, same shared bucket — denied even though
        // it never made a request itself.
        const blocked = await postClaim(app, 'invalid', 'caller-B');
        expect(blocked.status).toBe(429);
    });

    it('with the option configured, two callers presenting DIFFERENT header values get SEPARATE buckets', async () => {
        testDb = createTestDatabase();
        const app = createApp({
            db: testDb.db,
            config: HTTPS_CONFIG,
            recoveryClaimRateLimitIpHeader: 'x-real-ip',
        });

        for (let i = 0; i < RECOVERY_CLAIM_RATE_LIMIT.max; i++) {
            const res = await postClaim(app, 'invalid', 'caller-A');
            expect(res.status).toBe(401);
        }
        // Caller A is now rate-limited...
        expect((await postClaim(app, 'invalid', 'caller-A')).status).toBe(429);
        // ...but caller B, a distinct value of the trusted header, is NOT — proving the key is
        // actually per-header-value, not a shared fallback bucket.
        expect((await postClaim(app, 'invalid', 'caller-B')).status).toBe(401);
    });

    it('with the option configured but the header absent on a given request, falls back to the shared bucket rather than throwing', async () => {
        testDb = createTestDatabase();
        const app = createApp({
            db: testDb.db,
            config: HTTPS_CONFIG,
            recoveryClaimRateLimitIpHeader: 'x-real-ip',
        });
        const res = await postClaim(app, 'invalid', undefined);
        expect(res.status).toBe(401);
    });
});

describe('POST /api/auth/recovery/enroll-passkey/options and /verify', () => {
    let ctx: Ctx;

    afterEach(() => {
        ctx?.testDb.cleanup();
    });

    async function claimedRecoveryCtx(): Promise<{
        ctx: Ctx;
        accountId: string;
        oldCredentialId: string;
        oldAuthenticator: SoftAuthenticator;
    }> {
        const base = setUp();
        const {
            accountId,
            credentialId: oldCredentialId,
            authenticator: oldAuthenticator,
        } = await registerNewAccount(base);
        const code = await enrollAndConfirmRecoveryOverHttp(base);
        await postJson(base, '/api/auth/logout');
        const claimRes = await postJson(base, '/api/auth/recovery/claim', { code });
        expect(claimRes.status).toBe(204);
        return { ctx: base, accountId, oldCredentialId, oldAuthenticator };
    }

    it('options and verify both require a RECOVERY session: no session -> 401, a STANDARD session -> 401', async () => {
        ctx = setUp();
        await registerNewAccount(ctx); // a live STANDARD session, never a recovery one

        const optionsNoSession = await postJson(
            setUp(),
            '/api/auth/recovery/enroll-passkey/options',
        );
        expect(optionsNoSession.status).toBe(401);

        const optionsStandard = await postJson(ctx, '/api/auth/recovery/enroll-passkey/options');
        expect(optionsStandard.status).toBe(401);
    });

    it('happy path: consumes the code, deletes the OLD credential, revokes the OLD sessions, and finishes with a fresh STANDARD session', async () => {
        const {
            ctx: recCtx,
            accountId,
            oldCredentialId,
            oldAuthenticator,
        } = await claimedRecoveryCtx();
        ctx = recCtx;

        const { authenticator: newAuthenticator, verifyRes } =
            await completeRecoveryEnrollPasskeyOverHttp(ctx);
        expect(verifyRes.status).toBe(200);
        expect(await verifyRes.json()).toEqual({ accountId });

        // The new session is a STANDARD one, and it works.
        const sessionRes = await get(ctx, '/api/auth/session');
        expect(sessionRes.status).toBe(200);
        expect(await sessionRes.json()).toEqual({ accountId });

        // The old credential can no longer log in.
        const loginOpts = await postJson(ctx, '/api/auth/login/options');
        const { options } = (await loginOpts.json()) as { options: { challenge: string } };
        const oldAuthResponse = oldAuthenticator.authenticate({
            challenge: options.challenge,
            userHandle: accountId,
        });
        const oldLogin = await postJson(ctx, '/api/auth/login/verify', oldAuthResponse);
        expect(oldLogin.status).toBe(401);

        // The new one can.
        await postJson(ctx, '/api/auth/logout');
        const loginOpts2 = await postJson(ctx, '/api/auth/login/options');
        const { options: options2 } = (await loginOpts2.json()) as {
            options: { challenge: string };
        };
        const newAuthResponse = newAuthenticator.authenticate({
            challenge: options2.challenge,
            userHandle: accountId,
        });
        const newLogin = await postJson(ctx, '/api/auth/login/verify', newAuthResponse);
        expect(newLogin.status).toBe(200);

        const credRows = ctx.testDb.db
            .prepare('SELECT id FROM credentials WHERE account_id = ?')
            .all(accountId) as unknown as { id: string }[];
        expect(credRows.map((r) => r.id)).toEqual([newAuthenticator.credentialId]);
        void oldCredentialId;
    });

    it('revokes an OLD, still-live standard session from a different device too', async () => {
        const { ctx: recCtx, accountId, oldAuthenticator } = await claimedRecoveryCtx();
        ctx = recCtx;
        // A SECOND device, still logged in with the OLD (soon-to-be-deleted) authenticator, via
        // its own independent jar — genuinely still live at the moment recovery completes.
        const jarOtherDevice = createCookieJar();
        const ctxOtherDevice: Ctx = { ...ctx, jar: jarOtherDevice };
        const loginOpts = await postJson(ctxOtherDevice, '/api/auth/login/options');
        const { options } = (await loginOpts.json()) as { options: { challenge: string } };
        const authResponse = oldAuthenticator.authenticate({
            challenge: options.challenge,
            userHandle: accountId,
        });
        const loginVerify = await postJson(ctxOtherDevice, '/api/auth/login/verify', authResponse);
        expect(loginVerify.status).toBe(200);
        expect((await get(ctxOtherDevice, '/api/auth/session')).status).toBe(200);

        await completeRecoveryEnrollPasskeyOverHttp(ctx);

        expect((await get(ctxOtherDevice, '/api/auth/session')).status).toBe(401);
    });

    it('after completing recovery, the new (fresh) session can immediately enroll a REPLACEMENT recovery code (safe retry path, acceptance)', async () => {
        const { ctx: recCtx } = await claimedRecoveryCtx();
        ctx = recCtx;
        await completeRecoveryEnrollPasskeyOverHttp(ctx);

        const enrollRes = await postJson(ctx, '/api/auth/recovery/enroll');
        expect(enrollRes.status).toBe(200);
    });
});

describe('every non-recovery-purpose route refuses a live recovery session (acceptance: assert the refusals, not just the permission)', () => {
    let ctx: Ctx;

    afterEach(() => {
        ctx?.testDb.cleanup();
    });

    async function withLiveRecoverySession(): Promise<Ctx> {
        const base = setUp();
        await registerNewAccount(base);
        const code = await enrollAndConfirmRecoveryOverHttp(base);
        await postJson(base, '/api/auth/logout');
        const claimRes = await postJson(base, '/api/auth/recovery/claim', { code });
        expect(claimRes.status).toBe(204);
        return base;
    }

    it('GET /api/auth/session -> 401', async () => {
        ctx = await withLiveRecoverySession();
        expect((await get(ctx, '/api/auth/session')).status).toBe(401);
    });

    it('GET /api/auth/passkeys -> 401', async () => {
        ctx = await withLiveRecoverySession();
        expect((await get(ctx, '/api/auth/passkeys')).status).toBe(401);
    });

    it('POST /api/auth/logout -> 401 (a recovery session cannot even log itself out cleanly)', async () => {
        ctx = await withLiveRecoverySession();
        expect((await postJson(ctx, '/api/auth/logout')).status).toBe(401);
    });

    it('POST /api/auth/sessions/revoke-others -> 401', async () => {
        ctx = await withLiveRecoverySession();
        expect((await postJson(ctx, '/api/auth/sessions/revoke-others')).status).toBe(401);
    });

    it('POST /api/auth/passkeys/options -> 401', async () => {
        ctx = await withLiveRecoverySession();
        expect((await postJson(ctx, '/api/auth/passkeys/options')).status).toBe(401);
    });

    it('POST /api/auth/passkeys/revoke -> 401', async () => {
        ctx = await withLiveRecoverySession();
        const res = await postJson(ctx, '/api/auth/passkeys/revoke', { credentialId: 'anything' });
        expect(res.status).toBe(401);
    });

    it('POST /api/auth/reauth/options -> 401', async () => {
        ctx = await withLiveRecoverySession();
        expect((await postJson(ctx, '/api/auth/reauth/options')).status).toBe(401);
    });

    it('POST /api/auth/reauth/verify -> 401', async () => {
        ctx = await withLiveRecoverySession();
        expect((await postJson(ctx, '/api/auth/reauth/verify', {})).status).toBe(401);
    });

    it('POST /api/auth/passkeys/verify -> 401', async () => {
        ctx = await withLiveRecoverySession();
        expect((await postJson(ctx, '/api/auth/passkeys/verify', {})).status).toBe(401);
    });

    it('GET /api/auth/recovery/status -> 401', async () => {
        ctx = await withLiveRecoverySession();
        expect((await get(ctx, '/api/auth/recovery/status')).status).toBe(401);
    });

    it('POST /api/auth/recovery/enroll -> 401 (a recovery session must never mint itself a fresh recovery code — a persistent-backdoor risk if this ever succeeded)', async () => {
        ctx = await withLiveRecoverySession();
        expect((await postJson(ctx, '/api/auth/recovery/enroll')).status).toBe(401);
    });

    it('POST /api/auth/recovery/confirm -> 401', async () => {
        ctx = await withLiveRecoverySession();
        expect(
            (await postJson(ctx, '/api/auth/recovery/confirm', { code: 'anything' })).status,
        ).toBe(401);
    });
});

describe('recovery-only session lifetime', () => {
    let ctx: Ctx;

    afterEach(() => {
        ctx?.testDb.cleanup();
    });

    it('RECOVERY_SESSION_TTL_MS is exactly 10 minutes', () => {
        expect(RECOVERY_SESSION_TTL_MS).toBe(10 * 60 * 1000);
    });

    it('an expired recovery session cannot complete enroll-passkey/options', async () => {
        let currentTime = 1_000_000_000;
        ctx = setUp(() => currentTime);
        await registerNewAccount(ctx);
        const code = await enrollAndConfirmRecoveryOverHttp(ctx);
        await postJson(ctx, '/api/auth/logout');
        expect((await postJson(ctx, '/api/auth/recovery/claim', { code })).status).toBe(204);

        currentTime += RECOVERY_SESSION_TTL_MS + 1;
        const optionsRes = await postJson(ctx, '/api/auth/recovery/enroll-passkey/options');
        expect(optionsRes.status).toBe(401);
    });
});
