import { describe, expect, it } from 'vitest';
import type { ApiError, ApiErrorCode } from '../../../prototypes/v2/lib/account/api.js';
import {
    ACCOUNT_MESSAGES,
    failureFromApi,
    failureFromClaim,
} from '../../../prototypes/v2/lib/account/messages.js';

/**
 * The account error → copy mapping (#1262). The property that matters most is the LAST case: no
 * server code and no status ever reaches the DOM, whatever the server sends — including a code
 * this client has never heard of.
 */

const code = (value: ApiErrorCode, status = 400): ApiError => ({
    kind: 'code',
    code: value,
    status,
});

const EVERY_CODE: ApiErrorCode[] = [
    'malformed_request',
    'authentication_failed',
    'unauthenticated',
    'forbidden_origin',
    'payload_too_large',
    'unsupported_media_type',
    'not_found',
    'internal_error',
    'fresh_auth_required',
    'last_credential',
    'rate_limited',
    'credential_limit',
    'registration_closed',
    'operation_mismatch',
    'quota_exceeded',
];

describe('failureFromApi', () => {
    it('treats a closed sign-up as a notice, not an error', () => {
        expect(failureFromApi(code('registration_closed', 403))).toEqual({
            kind: 'notice',
            message: ACCOUNT_MESSAGES.closed,
        });
    });

    it('maps the three failures with their own advice', () => {
        expect(failureFromApi(code('authentication_failed', 401))).toEqual({
            kind: 'error',
            message: ACCOUNT_MESSAGES.failed,
        });
        expect(failureFromApi(code('rate_limited', 429))).toEqual({
            kind: 'error',
            message: ACCOUNT_MESSAGES.rateLimited,
        });
        expect(failureFromApi({ kind: 'network' })).toEqual({
            kind: 'error',
            message: ACCOUNT_MESSAGES.network,
        });
    });

    it('falls back to one generic sentence for everything else', () => {
        expect(failureFromApi(code('internal_error', 500))).toEqual({
            kind: 'error',
            message: ACCOUNT_MESSAGES.generic,
        });
        expect(failureFromApi({ kind: 'unknown', status: 502 })).toEqual({
            kind: 'error',
            message: ACCOUNT_MESSAGES.generic,
        });
        // A code added to the server after this client shipped.
        expect(failureFromApi(code('some_future_code' as ApiErrorCode))).toEqual({
            kind: 'error',
            message: ACCOUNT_MESSAGES.generic,
        });
    });

    it('never renders a server code or an HTTP status, for any error in the union', () => {
        const errors: ApiError[] = [
            { kind: 'network' },
            { kind: 'unknown', status: 418 },
            ...EVERY_CODE.map((value) => code(value, 418)),
        ];
        for (const error of errors) {
            const failure = failureFromApi(error);
            expect(failure.kind).not.toBe('cancelled');
            const message = failure.kind === 'cancelled' ? '' : failure.message;
            expect(message.length).toBeGreaterThan(0);
            expect(message).not.toContain('418');
            expect(message).not.toMatch(/_/);
        }
    });
});

/**
 * `POST /api/auth/recovery/claim`'s own mapping (#1263). The server collapses every way a claim
 * can fail — no such code, wrong hash, never confirmed, already spent, claim lock held — to one
 * `401 authentication_failed`, so that ONE code is the wrong-code answer here. Everything else
 * must keep its own meaning: telling someone their perfectly good code is wrong because the
 * server is rate limiting them is the failure mode this mapping exists to avoid.
 */
describe('failureFromClaim', () => {
    it('reads authentication_failed as a bad code, not as a bad passkey', () => {
        expect(failureFromClaim(code('authentication_failed', 401))).toEqual({
            kind: 'error',
            message: ACCOUNT_MESSAGES.badCode,
        });
        expect(ACCOUNT_MESSAGES.badCode).not.toBe(ACCOUNT_MESSAGES.failed);
    });

    it('leaves every other answer exactly as failureFromApi reads it', () => {
        const others: ApiError[] = [
            { kind: 'network' },
            { kind: 'unknown', status: 502 },
            ...EVERY_CODE.filter((value) => value !== 'authentication_failed').map((value) =>
                code(value, 400),
            ),
        ];
        for (const error of others) {
            expect(failureFromClaim(error)).toEqual(failureFromApi(error));
        }
        // The one that would be actively misleading if it were folded into "wrong code".
        expect(failureFromClaim(code('rate_limited', 429))).toEqual({
            kind: 'error',
            message: ACCOUNT_MESSAGES.rateLimited,
        });
    });

    it('never renders a server code or an HTTP status', () => {
        const errors: ApiError[] = [
            { kind: 'network' },
            { kind: 'unknown', status: 418 },
            ...EVERY_CODE.map((value) => code(value, 418)),
        ];
        for (const error of errors) {
            const failure = failureFromClaim(error);
            expect(failure.kind).not.toBe('cancelled');
            const message = failure.kind === 'cancelled' ? '' : failure.message;
            expect(message.length).toBeGreaterThan(0);
            expect(message).not.toContain('418');
            expect(message).not.toMatch(/_/);
        }
    });
});
