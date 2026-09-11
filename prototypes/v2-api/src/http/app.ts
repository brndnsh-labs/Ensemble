import type { DatabaseSync } from 'node:sqlite';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
    claimRecoveryCode,
    confirmRecoveryCode,
    createRateLimiter,
    enrollRecoveryCode,
    hasEnrolledRecoveryMaterial,
    issueSession,
    listPasskeys,
    RECOVERY_CLAIM_RATE_LIMIT,
    RECOVERY_SESSION_TTL_MS,
    readSession,
    revokeOtherSessions,
    revokePasskey,
    revokeSession,
    SESSION_TTL_MS,
    type SessionClaims,
    type StartAddPasskeyResult,
    type StartRecoveryEnrollPasskeyResult,
    startAddPasskey,
    startLogin,
    startReauth,
    startRecoveryEnrollPasskey,
    startRegistration,
    verifyAddPasskey,
    verifyLogin,
    verifyReauth,
    verifyRecoveryEnrollPasskey,
    verifyRegistration,
    type WebAuthnConfig,
} from '../auth/index.js';
import { jsonOnlyGuard, requestHasBody } from './content-type.js';
import {
    clearCeremonyCookie,
    clearSessionCookie,
    getCeremonyToken,
    getSessionToken,
    setCeremonyCookie,
    setSessionCookie,
} from './cookies.js';
import {
    ceremonyFailureResponse,
    recoveryActionFailureResponse,
    revokePasskeyFailureResponse,
    sendError,
} from './errors.js';
import { securityHeaders } from './headers.js';
import { sameOriginGuard } from './same-origin.js';

/**
 * The HTTP layer (#1189 ratified amendment + orchestrator decisions 7-14). Builds a Hono app
 * from an injected `{ db, config }` — no module-level state anywhere in this file or the modules
 * it imports. `src/server.ts` is the only file that reads `process.env`; everything here takes
 * its environment as arguments.
 */

/**
 * 64 KB (decision 11). `attestationType: 'none'` (set in `startRegistration`) keeps real
 * responses to a few KB; this leaves headroom for authenticators that still send attestation
 * certificates without opening the door to an oversized payload.
 */
const BODY_LIMIT_BYTES = 64 * 1024;

export interface CreateAppOptions {
    db: DatabaseSync;
    config: WebAuthnConfig;
    /** Injectable clock. Every route reads time through this — defaults to the wall clock. */
    now?: () => number;
    /**
     * Session lifetime override, defaulting to `SESSION_TTL_MS` (30 days). Lets a test mint a
     * short-lived session and advance `now` past it, instead of driving the clock 30 days
     * forward to exercise expiry over HTTP.
     */
    sessionTtlMs?: number;
    /**
     * Name of a request header carrying the real client IP for the recovery-claim rate limiter
     * (#1191 adversarial-review P1 finding). Undefined by default: the limiter then keys on the
     * raw socket address via `getConnInfo`, which is only correct when NOTHING proxies to this
     * service.
     *
     * Setting this (e.g. `'cf-connecting-ip'`) is a claim that the immediate hop in front of this
     * process strips/overwrites that header for every external caller and only ever forwards its
     * own verified value. This module does not verify that — it can't, because this standalone
     * prototype has no fixed deployment topology yet, unlike `same-origin.ts`'s Caddy note or
     * `headers.ts`'s Cloudflare note, which describe the MAIN app's already-live front door, not
     * this service's. The deployer configuring `server.ts` is responsible for confirming the
     * header is actually trustworthy in whatever sits in front of this process before setting it.
     *
     * Trusting an unverified header is strictly worse than the raw-socket fallback — it lets an
     * external caller pick their own rate-limit bucket at will, rather than merely sharing one
     * bucket with every other caller behind the same proxy (the bug this option exists to fix).
     * If this service is ever deployed behind a single shared proxy/tunnel hop (the case the
     * review flagged: every caller's socket address collapses to the proxy's own address, so 1
     * request/minute from anyone denies recovery to everyone), this MUST be set to that proxy's
     * verified client-IP header before going live — leaving it unset in that topology is a
     * denial-of-recovery vector, not merely an imprecise rate limit.
     */
    recoveryClaimRateLimitIpHeader?: string;
}

type JsonBodyResult = { ok: true; value: unknown } | { ok: false };

async function parseJsonBody(c: Context): Promise<JsonBodyResult> {
    if (!requestHasBody(c)) {
        return { ok: true, value: undefined };
    }
    try {
        return { ok: true, value: await c.req.json() };
    } catch {
        return { ok: false };
    }
}

export function createApp({
    db,
    config,
    now = () => Date.now(),
    sessionTtlMs = SESSION_TTL_MS,
    recoveryClaimRateLimitIpHeader,
}: CreateAppOptions): Hono {
    /**
     * Caller key for the recovery-claim rate limiter (#1191 decision 10, tightened by
     * adversarial-review P1). Prefers `recoveryClaimRateLimitIpHeader` when the caller configured
     * one — see that option's doc comment for why this app never guesses a header to trust on its
     * own. Falls back to the remote socket address via `@hono/node-server`'s `getConnInfo`,
     * wrapped in a try/catch: `getConnInfo` reads `c.env.incoming.socket`, which only the real
     * `@hono/node-server` request listener populates (verified against the installed
     * `@hono/node-server@2.1.1` — `getRequestListener` passes `{ incoming, outgoing }` as `env`).
     * Hono's own `app.request()` test helper leaves `c.env` empty unless a test passes a matching
     * third `Env` argument, which would otherwise throw here. Final fallback is one shared
     * `'unknown'` bucket — a missing address still rate-limits (just not per-caller) instead of
     * taking the endpoint down.
     */
    function recoveryClaimRateLimitKey(c: Context): string {
        if (recoveryClaimRateLimitIpHeader !== undefined) {
            const headerValue = c.req.header(recoveryClaimRateLimitIpHeader);
            if (headerValue !== undefined && headerValue.trim().length > 0) {
                return headerValue.trim();
            }
        }
        try {
            return getConnInfo(c).remote.address ?? 'unknown';
        } catch {
            return 'unknown';
        }
    }

    const app = new Hono();

    // Registration order matters: each `app.use` wraps everything registered after it, so
    // `securityHeaders` (which runs its own logic AFTER `next()`) must be first to guarantee its
    // headers land on every outcome below, including a same-origin 403, a body-limit 413, a
    // route's own 400/401, `app.notFound`'s 404 and `app.onError`'s 500 — verified against the
    // installed hono@4.13.7 with a real probe, not assumed from docs. See headers.ts.
    //
    // Registered on '*', not '/api/*': this service serves nothing else, but headers must land
    // on every response this process ever sends — including a 404 for a path outside /api (a
    // typo'd route, a scanner probe) — not only the ones this app happens to route.
    app.use('*', securityHeaders());
    // Same-origin and JSON-only run BEFORE bodyLimit deliberately: neither guard reads the
    // request body, so a cross-origin or wrong-content-type request carrying an oversized body
    // is rejected on headers alone, without ever buffering or streaming that body through
    // bodyLimit. Reordering these relative to each other is safe for the same reason bodyLimit
    // being last is safe: none of the three inspect the same input.
    //
    // Our own same-origin check (decision 9) — never hono/csrf. Every unsafe method under
    // /api/*, including the ceremony endpoints, so login CSRF (silently signing a victim into an
    // attacker's account) is blocked too. Scoped to /api/* (not '*') so it still runs ahead of
    // app.notFound for any unmatched /api/* path — ANY unsafe method to an unknown /api/* route
    // gets 403 from this guard, never a 404, because Hono resolves path-scoped middleware before
    // route dispatch decides there is no handler.
    app.use('/api/*', sameOriginGuard(config));
    app.use('/api/*', jsonOnlyGuard());
    app.use(
        '/api/*',
        bodyLimit({
            maxSize: BODY_LIMIT_BYTES,
            onError: (c) => sendError(c, 413, 'payload_too_large'),
        }),
    );

    app.notFound((c) => sendError(c, 404, 'not_found'));
    // `_err` is intentionally unused — Hono's onError signature requires the param, and no
    // failure reason or stack is ever surfaced to the response (decision 14: no library
    // messages, ever). Recording it internally belongs to #1192, not this story.
    app.onError((_err, c) => sendError(c, 500, 'internal_error'));

    /**
     * Fixation defense (decision 4): on every successful ceremony verify, revoke any session
     * presented on THIS SAME request (e.g. signing into a different account while signed in)
     * before minting the fresh one. `revokeSession` is owner-scoped, so the old session's own
     * `accountId` off `readSession` — not the newly-authenticated one — is what authorizes its
     * revocation.
     *
     * `credentialId` (#1190 decision 7) is recorded on the freshly-minted session so
     * `isFreshlyAuthenticated` can later tell this was a real passkey ceremony, not merely a
     * valid session. Every caller — register/verify, login/verify, and #1190's reauth/verify —
     * passes the credential id its own successful verify returned; none of them may pass `null`.
     */
    function finishAuthentication(c: Context, accountId: string, credentialId: string): void {
        const nowMs = now();
        const presentedToken = getSessionToken(c, config);
        if (presentedToken !== undefined) {
            const claims = readSession(db, presentedToken, nowMs);
            if (claims !== null) {
                revokeSession(db, claims.sessionId, claims.accountId, nowMs);
            }
        }
        const issued = issueSession(db, accountId, nowMs, sessionTtlMs, credentialId);
        setSessionCookie(c, config, issued.token, sessionTtlMs);
    }

    /**
     * Shared by register/options and #1190's passkeys/options: parses an optional `{ label? }`
     * JSON body, returning `undefined` when no body was sent at all (so the caller falls back to
     * `resolveLabel`'s own default) or a `sendError` `Response` the route must return as-is on
     * any shape problem.
     */
    async function parseOptionalLabel(
        c: Context,
    ): Promise<{ ok: true; label: string | undefined } | { ok: false; response: Response }> {
        const parsed = await parseJsonBody(c);
        if (!parsed.ok) {
            return { ok: false, response: sendError(c, 400, 'malformed_request') };
        }
        if (parsed.value === undefined) {
            return { ok: true, label: undefined };
        }
        // `typeof [] === 'object'` too, so Array.isArray must be checked explicitly — a JSON
        // array body would otherwise pass this guard, read `.label` as `undefined` off the
        // array, and silently succeed with the default label.
        if (
            parsed.value === null ||
            typeof parsed.value !== 'object' ||
            Array.isArray(parsed.value)
        ) {
            return { ok: false, response: sendError(c, 400, 'malformed_request') };
        }
        const rawLabel = (parsed.value as Record<string, unknown>).label;
        if (rawLabel !== undefined && typeof rawLabel !== 'string') {
            return { ok: false, response: sendError(c, 400, 'malformed_request') };
        }
        return { ok: true, label: rawLabel };
    }

    app.post('/api/auth/register/options', async (c) => {
        const parsedLabel = await parseOptionalLabel(c);
        if (!parsedLabel.ok) {
            return parsedLabel.response;
        }

        try {
            const { options, ceremonyToken } = await startRegistration(db, config, {
                label: parsedLabel.label,
            });
            setCeremonyCookie(c, config, ceremonyToken);
            return c.json({ options });
        } catch {
            // startRegistration synchronously throws a plain Error for an invalid label (empty
            // when provided, or over its max length) — a client-input-shape problem, not a
            // server bug, so it maps to 400 like any other malformed request.
            return sendError(c, 400, 'malformed_request');
        }
    });

    app.post('/api/auth/register/verify', async (c) => {
        const ceremonyToken = getCeremonyToken(c, config) ?? '';
        // Every verify clears the ceremony cookie, success or failure (decision 13) — it is
        // single-use. Cleared unconditionally, before the outcome is even known.
        clearCeremonyCookie(c, config);

        const parsed = await parseJsonBody(c);
        if (!parsed.ok) {
            return sendError(c, 400, 'malformed_request');
        }

        const result = await verifyRegistration(db, config, {
            ceremonyToken,
            response: parsed.value as RegistrationResponseJSON,
        });
        if (!result.ok) {
            return ceremonyFailureResponse(c, result.reason);
        }

        finishAuthentication(c, result.accountId, result.credentialId);
        return c.json({ accountId: result.accountId });
    });

    app.post('/api/auth/login/options', async (c) => {
        // startLogin takes no additional input (decision 8) — any body sent is simply ignored.
        const { options, ceremonyToken } = await startLogin(db, config);
        setCeremonyCookie(c, config, ceremonyToken);
        return c.json({ options });
    });

    app.post('/api/auth/login/verify', async (c) => {
        const ceremonyToken = getCeremonyToken(c, config) ?? '';
        clearCeremonyCookie(c, config);

        const parsed = await parseJsonBody(c);
        if (!parsed.ok) {
            return sendError(c, 400, 'malformed_request');
        }

        const result = await verifyLogin(db, config, {
            ceremonyToken,
            response: parsed.value as AuthenticationResponseJSON,
        });
        if (!result.ok) {
            return ceremonyFailureResponse(c, result.reason);
        }

        finishAuthentication(c, result.accountId, result.credentialId);
        return c.json({ accountId: result.accountId });
    });

    // `requireSession`/`requireRecoverySession` are `function` declarations (hoisted within this
    // closure), so the routes below — registered textually before either definition — can call
    // them freely; only requests dispatched AFTER `createApp()` has fully returned ever invoke a
    // route handler.

    app.get('/api/auth/session', (c) => {
        const session = requireSession(c);
        if (!session.ok) {
            return session.response;
        }
        return c.json({ accountId: session.claims.accountId });
    });

    app.post('/api/auth/logout', (c) => {
        // Idempotent for a missing, already-revoked, or expired session (decision 8, #1189) —
        // this predates #1191 and is exercised by same-origin.test.ts/content-type.test.ts, which
        // call logout with NO session cookie at all and require 204; that contract is preserved
        // here exactly. A plain `requireSession(c)` call would 401 on a missing token, which
        // would break that pre-existing, unrelated-to-recovery contract. So logout resolves
        // claims the same way `requireSession` does, but only turns that into a hard refusal
        // (`401`) for the ONE new case #1191 requires: a LIVE recovery-purpose session must never
        // be treated as "logged in enough to clear a session" — a recovery session can do nothing
        // but the two enroll-passkey routes, full stop. Every other missing/invalid case stays
        // the pre-existing silent no-op.
        const nowMs = now();
        const token = getSessionToken(c, config);
        if (token !== undefined) {
            const claims = readSession(db, token, nowMs);
            if (claims !== null) {
                if (claims.purpose === 'recovery') {
                    return sendError(c, 401, 'unauthenticated');
                }
                revokeSession(db, claims.sessionId, claims.accountId, nowMs);
            }
        }
        clearSessionCookie(c, config);
        return c.body(null, 204);
    });

    app.post('/api/auth/sessions/revoke-others', (c) => {
        const session = requireSession(c);
        if (!session.ok) {
            return session.response;
        }
        revokeOtherSessions(db, session.claims.accountId, session.claims.sessionId, now());
        return c.body(null, 204);
    });

    /**
     * Shared by every #1190 route below and `/api/auth/session`/`/api/auth/sessions/revoke-others`
     * above: resolves the presented session cookie, returning either the live claims or the
     * `401 unauthenticated` `Response` the caller must return as-is. `passkeys/options` and
     * `passkeys/verify` additionally require FRESHNESS, checked separately (inside
     * `startAddPasskey`/`verifyAddPasskey` themselves, not here), because a valid-but-stale
     * session is a distinct failure (`403 fresh_auth_required`), not `401`.
     *
     * `claims.purpose === 'recovery'` is refused identically to a missing/invalid token (#1191
     * decision 9, "Session gating changes") — this is the enforcement point for "a recovery
     * session can do nothing but enroll a passkey." Every route in this file that gates on
     * `requireSession` inherits this refusal automatically; only `requireRecoverySession` below
     * (used exclusively by the two `recovery/enroll-passkey/*` routes) accepts a recovery session.
     */
    function requireSession(
        c: Context,
    ): { ok: true; claims: SessionClaims } | { ok: false; response: Response } {
        const token = getSessionToken(c, config);
        if (token === undefined) {
            return { ok: false, response: sendError(c, 401, 'unauthenticated') };
        }
        const claims = readSession(db, token, now());
        if (claims === null || claims.purpose === 'recovery') {
            return { ok: false, response: sendError(c, 401, 'unauthenticated') };
        }
        return { ok: true, claims };
    }

    /**
     * The inverse of `requireSession` (#1191): requires `claims.purpose === 'recovery'`, refusing
     * a `'standard'` session identically to a missing/invalid one. Used ONLY by the two
     * `recovery/enroll-passkey/*` routes — everything else in this file must keep using
     * `requireSession`, never this function.
     */
    function requireRecoverySession(
        c: Context,
    ): { ok: true; claims: SessionClaims } | { ok: false; response: Response } {
        const token = getSessionToken(c, config);
        if (token === undefined) {
            return { ok: false, response: sendError(c, 401, 'unauthenticated') };
        }
        const claims = readSession(db, token, now());
        if (claims === null || claims.purpose !== 'recovery') {
            return { ok: false, response: sendError(c, 401, 'unauthenticated') };
        }
        return { ok: true, claims };
    }

    // --- #1190: passkey management and step-up re-authentication -----------------------------

    app.get('/api/auth/passkeys', (c) => {
        const session = requireSession(c);
        if (!session.ok) {
            return session.response;
        }
        const passkeys = listPasskeys(db, session.claims.accountId, session.claims.credentialId);
        return c.json({ passkeys });
    });

    app.post('/api/auth/passkeys/options', async (c) => {
        const session = requireSession(c);
        if (!session.ok) {
            return session.response;
        }
        const parsedLabel = await parseOptionalLabel(c);
        if (!parsedLabel.ok) {
            return parsedLabel.response;
        }

        let result: StartAddPasskeyResult;
        try {
            result = await startAddPasskey(
                db,
                config,
                {
                    accountId: session.claims.accountId,
                    sessionId: session.claims.sessionId,
                    label: parsedLabel.label,
                },
                now(),
            );
        } catch {
            // Same invalid-label-throws-synchronously contract as startRegistration (see
            // register/options above).
            return sendError(c, 400, 'malformed_request');
        }
        if (!result.ok) {
            return ceremonyFailureResponse(c, result.reason);
        }
        setCeremonyCookie(c, config, result.ceremonyToken);
        return c.json({ options: result.options });
    });

    app.post('/api/auth/passkeys/verify', async (c) => {
        const ceremonyToken = getCeremonyToken(c, config) ?? '';
        // Single-use, success or failure, same as every other verify route (decision 13).
        clearCeremonyCookie(c, config);

        const session = requireSession(c);
        if (!session.ok) {
            return session.response;
        }

        const parsed = await parseJsonBody(c);
        if (!parsed.ok) {
            return sendError(c, 400, 'malformed_request');
        }

        const result = await verifyAddPasskey(
            db,
            config,
            {
                ceremonyToken,
                sessionId: session.claims.sessionId,
                accountId: session.claims.accountId,
                response: parsed.value as RegistrationResponseJSON,
            },
            now(),
        );
        if (!result.ok) {
            return ceremonyFailureResponse(c, result.reason);
        }
        // Unlike register/verify and login/verify, this does NOT call finishAuthentication —
        // adding a passkey is not itself an authentication event, and the presented session is
        // left exactly as it was.
        return c.json({
            credentialId: result.credentialId,
            alreadyRegistered: result.alreadyRegistered,
        });
    });

    app.post('/api/auth/passkeys/revoke', async (c) => {
        const session = requireSession(c);
        if (!session.ok) {
            return session.response;
        }

        const parsed = await parseJsonBody(c);
        if (!parsed.ok) {
            return sendError(c, 400, 'malformed_request');
        }
        if (
            parsed.value === null ||
            typeof parsed.value !== 'object' ||
            Array.isArray(parsed.value)
        ) {
            return sendError(c, 400, 'malformed_request');
        }
        const credentialId = (parsed.value as Record<string, unknown>).credentialId;
        if (typeof credentialId !== 'string' || credentialId.length === 0) {
            return sendError(c, 400, 'malformed_request');
        }

        const result = revokePasskey(
            db,
            session.claims.accountId,
            session.claims.sessionId,
            credentialId,
            now(),
        );
        if (!result.ok) {
            return revokePasskeyFailureResponse(c, result.reason);
        }
        // The revoked credential may have been the one that created the CURRENT session — if so
        // it was just revoked server-side too, so the client-held cookie must be cleared here.
        if (result.signedOut) {
            clearSessionCookie(c, config);
        }
        return c.json({ signedOut: result.signedOut });
    });

    app.post('/api/auth/reauth/options', async (c) => {
        const session = requireSession(c);
        if (!session.ok) {
            return session.response;
        }
        const { options, ceremonyToken } = await startReauth(
            db,
            config,
            {
                accountId: session.claims.accountId,
                sessionId: session.claims.sessionId,
            },
            now(),
        );
        setCeremonyCookie(c, config, ceremonyToken);
        return c.json({ options });
    });

    app.post('/api/auth/reauth/verify', async (c) => {
        const ceremonyToken = getCeremonyToken(c, config) ?? '';
        clearCeremonyCookie(c, config);

        const session = requireSession(c);
        if (!session.ok) {
            return session.response;
        }

        const parsed = await parseJsonBody(c);
        if (!parsed.ok) {
            return sendError(c, 400, 'malformed_request');
        }

        const result = await verifyReauth(
            db,
            config,
            {
                ceremonyToken,
                sessionId: session.claims.sessionId,
                accountId: session.claims.accountId,
                response: parsed.value as AuthenticationResponseJSON,
            },
            now(),
        );
        if (!result.ok) {
            return ceremonyFailureResponse(c, result.reason);
        }

        // Step-up is a privilege change (decision 3): the token is renewed, not flagged in place.
        finishAuthentication(c, result.accountId, result.credentialId);
        return c.json({ accountId: result.accountId });
    });

    // --- #1191: recovery-code enrollment, claim, and recovery-only passkey enrollment --------

    /**
     * Factory-produced, closure-captured per `createApp()` call (#1191 decision 10) — never a
     * module-level singleton — matching every other piece of app state (`now`, `sessionTtlMs`)
     * and keeping tests isolated per app instance. See `rate-limit.ts`'s doc comment for the
     * single-container deployment assumption this relies on.
     */
    const checkRecoveryClaimRate = createRateLimiter(RECOVERY_CLAIM_RATE_LIMIT);

    app.get('/api/auth/recovery/status', (c) => {
        const session = requireSession(c);
        if (!session.ok) {
            return session.response;
        }
        return c.json({ enrolled: hasEnrolledRecoveryMaterial(db, session.claims.accountId) });
    });

    app.post('/api/auth/recovery/enroll', (c) => {
        const session = requireSession(c);
        if (!session.ok) {
            return session.response;
        }
        // Fresh-auth-gated INSIDE enrollRecoveryCode itself (decision 3), matching the
        // add-passkey/revoke-passkey precedent of checking freshness at the point of the write,
        // not only at the HTTP boundary.
        const result = enrollRecoveryCode(
            db,
            session.claims.accountId,
            session.claims.sessionId,
            now(),
        );
        if (!result.ok) {
            return recoveryActionFailureResponse(c, result.reason);
        }
        // The raw code is returned exactly ONCE, here — never logged, never stored, never
        // retrievable again (decision 1/11).
        return c.json({ code: result.code });
    });

    app.post('/api/auth/recovery/confirm', async (c) => {
        const session = requireSession(c);
        if (!session.ok) {
            return session.response;
        }
        const parsed = await parseJsonBody(c);
        if (!parsed.ok) {
            return sendError(c, 400, 'malformed_request');
        }
        if (
            parsed.value === null ||
            typeof parsed.value !== 'object' ||
            Array.isArray(parsed.value)
        ) {
            return sendError(c, 400, 'malformed_request');
        }
        const code = (parsed.value as Record<string, unknown>).code;
        if (typeof code !== 'string' || code.length === 0) {
            return sendError(c, 400, 'malformed_request');
        }

        const result = confirmRecoveryCode(
            db,
            session.claims.accountId,
            session.claims.sessionId,
            code,
            now(),
        );
        if (!result.ok) {
            return recoveryActionFailureResponse(c, result.reason);
        }
        return c.body(null, 204);
    });

    app.post('/api/auth/recovery/claim', async (c) => {
        // Rate limit FIRST, before any database lookup (decision 8/10, mutation target 9) — a
        // rate-limited caller learns nothing about the code's validity, only that they are
        // rate-limited.
        const nowMs = now();
        const limit = checkRecoveryClaimRate(recoveryClaimRateLimitKey(c), nowMs);
        if (!limit.allowed) {
            // `retryAfterMs` was computed but unused before this fix (adversarial-review P3) —
            // surface it as the standard header so a well-behaved caller backs off instead of
            // hammering the endpoint again immediately.
            c.header('Retry-After', String(Math.ceil(limit.retryAfterMs / 1000)));
            return sendError(c, 429, 'rate_limited');
        }

        const parsed = await parseJsonBody(c);
        if (!parsed.ok) {
            return sendError(c, 400, 'malformed_request');
        }
        if (
            parsed.value === null ||
            typeof parsed.value !== 'object' ||
            Array.isArray(parsed.value)
        ) {
            return sendError(c, 400, 'malformed_request');
        }
        const code = (parsed.value as Record<string, unknown>).code;
        if (typeof code !== 'string' || code.length === 0) {
            return sendError(c, 400, 'malformed_request');
        }

        // claimRecoveryCode's single UPDATE...RETURNING is the first (and only) database access
        // this branch performs before deciding success/failure — see its own doc comment.
        const claim = claimRecoveryCode(db, code, nowMs);
        if (!claim.ok) {
            // Every failure reason (code doesn't exist, wrong hash, unconfirmed, already
            // consumed, already claimed and still locked) collapses to the SAME 401 as every
            // ceremony failure (decision 8 step 2) — never a distinct code for any of these.
            return sendError(c, 401, 'authentication_failed');
        }

        // Fixation defense (decision 8 step 3), the SAME shape as finishAuthentication: revoke
        // any session presented on THIS request, using ITS OWN account_id from readSession — not
        // the recovery target's.
        const presentedToken = getSessionToken(c, config);
        if (presentedToken !== undefined) {
            const presentedClaims = readSession(db, presentedToken, nowMs);
            if (presentedClaims !== null) {
                revokeSession(db, presentedClaims.sessionId, presentedClaims.accountId, nowMs);
            }
        }
        const issued = issueSession(
            db,
            claim.accountId,
            nowMs,
            RECOVERY_SESSION_TTL_MS,
            null,
            'recovery',
            claim.recoveryCodeId,
        );
        setSessionCookie(c, config, issued.token, RECOVERY_SESSION_TTL_MS);
        // 204, no body — nothing left to disclose after the cookie is set (decision 8 step 3).
        return c.body(null, 204);
    });

    app.post('/api/auth/recovery/enroll-passkey/options', async (c) => {
        const session = requireRecoverySession(c);
        if (!session.ok) {
            return session.response;
        }
        const parsedLabel = await parseOptionalLabel(c);
        if (!parsedLabel.ok) {
            return parsedLabel.response;
        }

        let result: StartRecoveryEnrollPasskeyResult;
        try {
            result = await startRecoveryEnrollPasskey(
                db,
                config,
                {
                    accountId: session.claims.accountId,
                    sessionId: session.claims.sessionId,
                    label: parsedLabel.label,
                },
                now(),
            );
        } catch {
            return sendError(c, 400, 'malformed_request');
        }
        if (!result.ok) {
            return ceremonyFailureResponse(c, result.reason);
        }
        setCeremonyCookie(c, config, result.ceremonyToken);
        return c.json({ options: result.options });
    });

    app.post('/api/auth/recovery/enroll-passkey/verify', async (c) => {
        const ceremonyToken = getCeremonyToken(c, config) ?? '';
        clearCeremonyCookie(c, config);

        const session = requireRecoverySession(c);
        if (!session.ok) {
            return session.response;
        }

        const parsed = await parseJsonBody(c);
        if (!parsed.ok) {
            return sendError(c, 400, 'malformed_request');
        }

        const result = await verifyRecoveryEnrollPasskey(
            db,
            config,
            {
                ceremonyToken,
                sessionId: session.claims.sessionId,
                accountId: session.claims.accountId,
                response: parsed.value as RegistrationResponseJSON,
            },
            now(),
        );
        if (!result.ok) {
            return ceremonyFailureResponse(c, result.reason);
        }

        // Completing recovery genuinely IS a fresh authentication event (unlike ordinary
        // add-passkey, which deliberately does NOT call this) — mint a brand-new STANDARD
        // session bound to the new credential, immediately fresh (decision 12's closing note).
        finishAuthentication(c, result.accountId, result.credentialId);
        return c.json({ accountId: result.accountId });
    });

    return app;
}
