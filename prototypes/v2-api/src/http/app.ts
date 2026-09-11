import type { DatabaseSync } from 'node:sqlite';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
    issueSession,
    readSession,
    revokeOtherSessions,
    revokeSession,
    SESSION_TTL_MS,
    startLogin,
    startRegistration,
    verifyLogin,
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
import { ceremonyFailureResponse, sendError } from './errors.js';
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
}: CreateAppOptions): Hono {
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
     */
    function finishAuthentication(c: Context, accountId: string): void {
        const nowMs = now();
        const presentedToken = getSessionToken(c, config);
        if (presentedToken !== undefined) {
            const claims = readSession(db, presentedToken, nowMs);
            if (claims !== null) {
                revokeSession(db, claims.sessionId, claims.accountId, nowMs);
            }
        }
        const issued = issueSession(db, accountId, nowMs, sessionTtlMs);
        setSessionCookie(c, config, issued.token, sessionTtlMs);
    }

    app.post('/api/auth/register/options', async (c) => {
        const parsed = await parseJsonBody(c);
        if (!parsed.ok) {
            return sendError(c, 400, 'malformed_request');
        }
        let label: string | undefined;
        if (parsed.value !== undefined) {
            // `typeof [] === 'object'` too, so Array.isArray must be checked explicitly — a JSON
            // array body would otherwise pass this guard, read `.label` as `undefined` off the
            // array, and silently succeed with the default label.
            if (
                parsed.value === null ||
                typeof parsed.value !== 'object' ||
                Array.isArray(parsed.value)
            ) {
                return sendError(c, 400, 'malformed_request');
            }
            const rawLabel = (parsed.value as Record<string, unknown>).label;
            if (rawLabel !== undefined && typeof rawLabel !== 'string') {
                return sendError(c, 400, 'malformed_request');
            }
            label = rawLabel;
        }

        try {
            const { options, ceremonyToken } = await startRegistration(db, config, { label });
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

        finishAuthentication(c, result.accountId);
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

        finishAuthentication(c, result.accountId);
        return c.json({ accountId: result.accountId });
    });

    app.get('/api/auth/session', (c) => {
        const token = getSessionToken(c, config);
        if (token === undefined) {
            return sendError(c, 401, 'unauthenticated');
        }
        const claims = readSession(db, token, now());
        if (claims === null) {
            return sendError(c, 401, 'unauthenticated');
        }
        return c.json({ accountId: claims.accountId });
    });

    app.post('/api/auth/logout', (c) => {
        // Idempotent (decision 8): revoking a session that is missing, already revoked, or
        // expired is a silent no-op in the session library, so this never has to branch on
        // whether one was actually there.
        const token = getSessionToken(c, config);
        if (token !== undefined) {
            const claims = readSession(db, token, now());
            if (claims !== null) {
                revokeSession(db, claims.sessionId, claims.accountId, now());
            }
        }
        clearSessionCookie(c, config);
        return c.body(null, 204);
    });

    app.post('/api/auth/sessions/revoke-others', (c) => {
        const token = getSessionToken(c, config);
        if (token === undefined) {
            return sendError(c, 401, 'unauthenticated');
        }
        const claims = readSession(db, token, now());
        if (claims === null) {
            return sendError(c, 401, 'unauthenticated');
        }
        revokeOtherSessions(db, claims.accountId, claims.sessionId, now());
        return c.body(null, 204);
    });

    return app;
}
