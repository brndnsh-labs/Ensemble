/**
 * The one place an account failure becomes words a musician reads (#1262).
 *
 * Deliberately free of any `@simplewebauthn/browser` import so the mapping stays unit-testable
 * from the root Vitest suite (`tests/unit/songbook/account-messages.test.ts`) without pulling a
 * browser-only WebAuthn module — and, separately, so the root knip workspace never resolves that
 * dependency out of `prototypes/v2`'s manifest. `passkeys.ts` owns everything that needs it.
 *
 * Two rules this module exists to enforce:
 *
 * 1. **No raw server code or exception text ever reaches the DOM.** `ApiError` carries a code
 *    from a closed union and an HTTP status; both are diagnostic vocabulary, not copy. An
 *    unrecognized code falls through to one honest generic sentence rather than being printed.
 * 2. **A closed sign-up is not a failure.** `registration_closed` is the normal answer while prod
 *    registration is closed by policy or the #1272 account cap is full (the server returns the
 *    same code for both, on purpose, so a client cannot tell them apart) — it gets `notice`, and
 *    the UI renders that calmly instead of in error styling.
 */

import type { ApiError } from './api';

export type AccountFailure =
    /** The person dismissed the platform passkey prompt. Show nothing at all. */
    | { kind: 'cancelled' }
    /** Expected, non-alarming state — rendered calmly, not as an error. */
    | { kind: 'notice'; message: string }
    | { kind: 'error'; message: string };

export type AccountOutcome<T> = { ok: true; value: T } | { ok: false; failure: AccountFailure };

export const ACCOUNT_MESSAGES = {
    closed: 'New accounts aren’t open yet.',
    failed: 'That didn’t work. Try again, or use a different passkey.',
    rateLimited: 'Too many attempts — try again later.',
    network: 'Can’t reach the server. You can keep playing as a guest.',
    generic: 'Something went wrong. Try again in a moment.',
    // #1263 patch review P1: a code re-typed while its own claim lock is still held (up to ten
    // minutes after starting recovery, per `RECOVERY_SESSION_TTL_MS`) reads through this exact
    // same server code, which used to say only "already been used" — indistinguishable from a
    // truly spent code. Naming the lock, without naming the server's vocabulary for it, is the
    // fix: it tells someone who stopped mid-recovery that the SAME code will work again shortly.
    badCode:
        'That code isn’t right, or it’s already been used. If you started a recovery and ' +
        'stopped, wait ten minutes and try the same code again.',
} as const;

/**
 * `randomBytes(32).toString('base64url')` — the shape the server mints for every recovery code
 * (`RECOVERY_CODE_BYTES` in `v2-api/src/auth/recovery.ts`). Shared with the Playwright harness
 * (`checks/account-helpers.ts`) so both stay in lockstep, and used client-side (#1263 patch
 * review P3) to reject an obviously-wrong paste — e.g. the whole downloaded `.txt`, code plus
 * explanatory text — before it ever reaches the network as a doomed `recovery/claim` call.
 */
export const RECOVERY_CODE_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export function failureFromApi(error: ApiError): AccountFailure {
    if (error.kind === 'network') {
        return { kind: 'error', message: ACCOUNT_MESSAGES.network };
    }
    if (error.kind === 'unknown') {
        return { kind: 'error', message: ACCOUNT_MESSAGES.generic };
    }
    switch (error.code) {
        case 'registration_closed':
            return { kind: 'notice', message: ACCOUNT_MESSAGES.closed };
        case 'authentication_failed':
            return { kind: 'error', message: ACCOUNT_MESSAGES.failed };
        case 'rate_limited':
            return { kind: 'error', message: ACCOUNT_MESSAGES.rateLimited };
        default:
            // `unauthenticated`, `malformed_request`, `fresh_auth_required` (only ever reached
            // here after a step-up retry already failed), `not_found`, `internal_error` and every
            // code this client has no specific answer for. All actionable advice is the same:
            // try again. Naming the code would leak service vocabulary for no user benefit.
            return { kind: 'error', message: ACCOUNT_MESSAGES.generic };
    }
}

/**
 * The same mapping, for `POST /api/auth/recovery/claim` alone (#1263).
 *
 * That route collapses every way a claim can fail — the code doesn't exist, the hash doesn't
 * match, it was never confirmed, it was already spent, another attempt holds the claim lock — to
 * one `401 authentication_failed`, deliberately, so a caller learns nothing about which. The
 * generic `failed` copy for that code ("use a different passkey") would be nonsense here: there
 * is no passkey in this ceremony, only a typed code. So the one place the code IS the credential
 * gets the one sentence that fits, and the mapping stays in this module rather than becoming an
 * `if` in the dialog — the whole point of `messages.ts` is that copy lives in exactly one file.
 *
 * Everything else — rate limiting, an unreachable server, a code this client has never seen —
 * falls through to `failureFromApi` unchanged. It is deliberately NOT a "wrong code" answer for
 * any other status: a 429 must read as a 429, or someone retyping a perfectly good code would be
 * told it is wrong.
 */
export function failureFromClaim(error: ApiError): AccountFailure {
    if (error.kind === 'code' && error.code === 'authentication_failed') {
        return { kind: 'error', message: ACCOUNT_MESSAGES.badCode };
    }
    return failureFromApi(error);
}
