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
    /** `409 last_credential` (#1264, worded per patch review P2-2): the server's real rule
     * (`revokePasskey` in `v2-api/src/auth/passkeys.ts`) is "refuse only when this would leave
     * the account with one credential AND zero confirmed, unconsumed recovery material" — one
     * passkey plus a confirmed recovery code is fine and the server allows removing it. The
     * account page's own courtesy note mirrors that exact rule (`passkeys.length === 1 &&
     * recoveryConfirmed === false`), not a plain "down to one" count, so this sentence has to
     * name BOTH missing pieces rather than implying passkey count alone is the reason. */
    lastPasskey:
        'This is your only passkey and there’s no recovery code — add one of them before ' +
        'removing it.',
    /** `InvalidStateError` from `startRegistration` (#1264 patch review P2-3): the platform
     * authenticator answering "Add a passkey" already holds this account's credential (WebAuthn's
     * `excludeCredentials` check), which the generic `failed` copy answers with "try a different
     * passkey" — useless advice when a different passkey is exactly what this device lacks. */
    passkeyOnThisDevice:
        'This device already has a passkey for your account. Add one from another device, ' +
        'a phone or a security key.',
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
        case 'last_credential':
            return { kind: 'error', message: ACCOUNT_MESSAGES.lastPasskey };
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

/**
 * The one sentence a preserved remote advance is said in (#1310).
 *
 * It is said in two places — the songbook row for that song, and the banner over the stand when it
 * is the chart that is open — and they must be the same words: a musician who sees a row marked one
 * way and then opens it to read something else has to work out whether they are the same fact. Each
 * surface keeps its own surrounding prose (the banner explains the choice, the row has no room to);
 * this is only the claim they share.
 *
 * "Newer" is a fact about the ACCOUNT's revision line, not about wall-clock time — the contract
 * forbids choosing a winner by timestamp, and nothing here does: it is newer because the account's
 * revision succeeded the one this device mirrors. The word "candidate" is deliberately absent, here
 * and everywhere a musician reads.
 */
export const REMOTE_UPDATE_MESSAGES = {
    marker: 'A newer version is in your account',
} as const;

/**
 * Why this device is holding an account songbook with nobody signed in (#1351 patch N1).
 *
 * `expired` is the live session that lapsed in THIS page load. `guest` is every other way of
 * arriving there — a reload after that, or a sign-out whose local clear failed. `deleted` is the
 * one this tab has to remember for itself: #1271 removed the account on the server and the clear
 * failed afterwards, so the songs are here and the account they belong to no longer exists.
 */
export type HeldAccountState = 'expired' | 'guest' | 'deleted';

/**
 * What the held-account banner says, and whether signing in is one of the answers (#1351 patch N1).
 *
 * A pure function of one state, in this file rather than in the shell, because the three sentences
 * are the whole point: ONE of them said in all three states is a lie in two of them.
 *
 * - `expired` keeps #1269's sentence exactly. A session that lapsed under a musician really can be
 *   picked back up, and "everything you saved is still on this device" is true and reassuring.
 * - `guest` cannot promise that. It is reached by a RELOAD (the session store has no memory of the
 *   lapse) and by a sign-out whose clear failed — and telling somebody who deliberately left to
 *   "sign in again to keep syncing" reads as though the sign-out did not happen. It states the fact
 *   instead and offers both answers, with "Sign in" rather than "Sign in again": this page load
 *   never saw a session.
 * - `deleted` offers NO sign-in at all. "Being told to 'sign in again' to an account that no longer
 *   exists is the one reading this must never produce" (`forgetDeletedAccount`), and a sign-in
 *   control for a deleted account is exactly that reading with a button attached. The only honest
 *   move left is to finish removing the songs, so that is the only one offered.
 */
export function heldAccountBanner(state: HeldAccountState): {
    sentence: string;
    /** The sign-in control's label, or null when signing in must not be offered. */
    signIn: string | null;
} {
    if (state === 'expired') {
        return {
            sentence:
                'Sign in again to keep syncing. Everything you saved is still on this device.',
            signIn: 'Sign in again',
        };
    }
    if (state === 'deleted') {
        return {
            sentence:
                'Your account was deleted, but its songs could not be removed from this device yet.',
            signIn: null,
        };
    }
    return {
        sentence:
            'This device still has an account songbook on it and nobody is signed in. Sign in to use it, or sign out on this device to remove it.',
        signIn: 'Sign in',
    };
}
