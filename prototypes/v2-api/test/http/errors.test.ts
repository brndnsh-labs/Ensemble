import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { LoginFailureReason, RegistrationFailureReason } from '../../src/auth/index.js';
import { ceremonyFailureResponse } from '../../src/http/errors.js';

/**
 * Exhaustive table test for the collapsed-failure mapping (#1189 decision 14, P2-6 review
 * finding). `ceremonyFailureResponse`'s `reason` parameter is typed as
 * `RegistrationFailureReason | LoginFailureReason` (not `string`) specifically so this table's
 * `satisfies Record<...>` fails to compile the moment either union gains a new member without a
 * corresponding row here — there is no way to add a tenth failure reason and forget this file.
 *
 * `malformed_request` is the one reason that is a client-shape problem, not an authentication
 * outcome, so it alone gets 400. Every other reason collapses to the identical
 * `401 authentication_failed` — a probing client must not be able to tell "credential does not
 * exist" from "wrong signature" from "counter regression" apart.
 */

type AnyCeremonyFailureReason = RegistrationFailureReason | LoginFailureReason;

const EXPECTED = {
    malformed_request: { status: 400, error: 'malformed_request' },
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
});
