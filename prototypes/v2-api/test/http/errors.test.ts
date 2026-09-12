import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type {
    AddPasskeyFailureReason,
    ConfirmRecoveryCodeFailureReason,
    EnrollRecoveryCodeFailureReason,
    LoginFailureReason,
    ReauthFailureReason,
    RecoveryEnrollPasskeyFailureReason,
    RegistrationFailureReason,
    RevokePasskeyFailureReason,
} from '../../src/auth/index.js';
import {
    ceremonyFailureResponse,
    recoveryActionFailureResponse,
    revokePasskeyFailureResponse,
} from '../../src/http/errors.js';

/**
 * Exhaustive table test for the collapsed-failure mapping (#1189 decision 14, P2-6 review
 * finding; extended by #1190 decision 9). `ceremonyFailureResponse`'s `reason` parameter is
 * typed as the union of all four ceremonies' failure reasons (not `string`) specifically so this
 * table's `satisfies Record<...>` fails to compile the moment ANY of them gains a new member
 * without a corresponding row here — there is no way to add a new failure reason and forget this
 * file.
 *
 * `malformed_request` is the one reason that is a client-shape problem, not an authentication
 * outcome, so it alone gets 400. `fresh_auth_required` (add-passkey only) is the one reason that
 * reflects a session that's valid but not recent enough, so it alone gets 403. Every other
 * reason — including #1190's `session_mismatch` — collapses to the identical
 * `401 authentication_failed` — a probing client must not be able to tell "credential does not
 * exist" from "wrong signature" from "counter regression" from "wrong session bound" apart.
 */

type AnyCeremonyFailureReason =
    | RegistrationFailureReason
    | LoginFailureReason
    | ReauthFailureReason
    | AddPasskeyFailureReason
    | RecoveryEnrollPasskeyFailureReason;

const EXPECTED = {
    malformed_request: { status: 400, error: 'malformed_request' },
    credential_limit: { status: 409, error: 'credential_limit' },
    ceremony_not_found: { status: 401, error: 'authentication_failed' },
    ceremony_expired: { status: 401, error: 'authentication_failed' },
    ceremony_type_mismatch: { status: 401, error: 'authentication_failed' },
    verification_failed: { status: 401, error: 'authentication_failed' },
    credential_exists: { status: 401, error: 'authentication_failed' },
    credential_not_found: { status: 401, error: 'authentication_failed' },
    user_handle_missing: { status: 401, error: 'authentication_failed' },
    user_handle_mismatch: { status: 401, error: 'authentication_failed' },
    account_not_found: { status: 401, error: 'authentication_failed' },
    counter_regression: { status: 401, error: 'authentication_failed' },
    session_mismatch: { status: 401, error: 'authentication_failed' },
    fresh_auth_required: { status: 403, error: 'fresh_auth_required' },
    // #1191: recovery-enroll-passkey's three own reasons — none get fresh_auth_required's 403;
    // a recovery session's liveness is a different concept from a standard session's freshness.
    recovery_session_invalid: { status: 401, error: 'authentication_failed' },
    recovery_code_not_found: { status: 401, error: 'authentication_failed' },
} satisfies Record<AnyCeremonyFailureReason, { status: number; error: string }>;

describe('ceremonyFailureResponse (collapsed error table, exhaustive over both unions)', () => {
    for (const [reason, expected] of Object.entries(EXPECTED)) {
        it(`${reason} -> ${expected.status} {"error":"${expected.error}"}`, async () => {
            const app = new Hono();
            app.get('/probe', (c) =>
                ceremonyFailureResponse(c, reason as AnyCeremonyFailureReason),
            );
            const res = await app.request('/probe');
            expect(res.status).toBe(expected.status);
            expect(await res.json()).toEqual({ error: expected.error });
        });
    }

    it('R8 guard: never leaks the specific reason for ceremony_expired, counter_regression or verification_failed', async () => {
        const leakProne: AnyCeremonyFailureReason[] = [
            'ceremony_expired',
            'counter_regression',
            'verification_failed',
        ];
        const app = new Hono();
        app.get('/probe/:reason', (c) =>
            ceremonyFailureResponse(c, c.req.param('reason') as AnyCeremonyFailureReason),
        );
        for (const reason of leakProne) {
            const res = await app.request(`/probe/${reason}`);
            const body = await res.json();
            expect(body).toEqual({ error: 'authentication_failed' });
            expect(JSON.stringify(body)).not.toContain(reason);
        }
    });

    it('never leaks session_mismatch either (same anti-probing stance as R8)', async () => {
        const app = new Hono();
        app.get('/probe', (c) => ceremonyFailureResponse(c, 'session_mismatch'));
        const res = await app.request('/probe');
        const body = await res.json();
        expect(body).toEqual({ error: 'authentication_failed' });
        expect(JSON.stringify(body)).not.toContain('session_mismatch');
    });
});

/**
 * `revokePasskey`'s failure reasons (#1190 decision 6) are not a ceremony at all — no
 * `ceremonyToken`/challenge is involved — so `revokePasskeyFailureResponse` gets its own
 * exhaustive table rather than being folded into `EXPECTED` above. `satisfies
 * Record<RevokePasskeyFailureReason, ...>` gives the same "cannot add a member and forget this
 * file" guarantee.
 */
const REVOKE_EXPECTED = {
    fresh_auth_required: { status: 403, error: 'fresh_auth_required' },
    not_found: { status: 404, error: 'not_found' },
    last_credential: { status: 409, error: 'last_credential' },
} satisfies Record<RevokePasskeyFailureReason, { status: number; error: string }>;

describe('revokePasskeyFailureResponse (exhaustive)', () => {
    for (const [reason, expected] of Object.entries(REVOKE_EXPECTED)) {
        it(`${reason} -> ${expected.status} {"error":"${expected.error}"}`, async () => {
            const app = new Hono();
            app.get('/probe', (c) =>
                revokePasskeyFailureResponse(c, reason as RevokePasskeyFailureReason),
            );
            const res = await app.request('/probe');
            expect(res.status).toBe(expected.status);
            expect(await res.json()).toEqual({ error: expected.error });
        });
    }

    it('not_found and a foreign-credential attempt are indistinguishable at this mapping too', async () => {
        // revokePasskey itself collapses "doesn't exist" and "belongs to another account" to
        // the same reason before this function ever sees it (src/auth/passkeys.ts) — this just
        // confirms the HTTP mapping doesn't reintroduce a distinction at this layer.
        const app = new Hono();
        app.get('/probe', (c) => revokePasskeyFailureResponse(c, 'not_found'));
        const res = await app.request('/probe');
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'not_found' });
    });
});

/**
 * `enrollRecoveryCode`/`confirmRecoveryCode`'s failure reasons (#1191 decisions 3-4) — neither is
 * a ceremony, so `recoveryActionFailureResponse` gets its own exhaustive table, same precedent as
 * `revokePasskeyFailureResponse` above.
 */
const RECOVERY_ACTION_EXPECTED = {
    fresh_auth_required: { status: 403, error: 'fresh_auth_required' },
    not_found: { status: 404, error: 'not_found' },
} satisfies Record<
    EnrollRecoveryCodeFailureReason | ConfirmRecoveryCodeFailureReason,
    { status: number; error: string }
>;

describe('recoveryActionFailureResponse (exhaustive)', () => {
    for (const [reason, expected] of Object.entries(RECOVERY_ACTION_EXPECTED)) {
        it(`${reason} -> ${expected.status} {"error":"${expected.error}"}`, async () => {
            const app = new Hono();
            app.get('/probe', (c) =>
                recoveryActionFailureResponse(
                    c,
                    reason as EnrollRecoveryCodeFailureReason | ConfirmRecoveryCodeFailureReason,
                ),
            );
            const res = await app.request('/probe');
            expect(res.status).toBe(expected.status);
            expect(await res.json()).toEqual({ error: expected.error });
        });
    }
});
