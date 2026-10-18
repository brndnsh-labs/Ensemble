import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
    generateRegistrationOptions,
    type PublicKeyCredentialCreationOptionsJSON,
    type RegistrationResponseJSON,
    verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { withTransaction } from '../db/transaction.js';
import {
    CHALLENGE_TTL_MS,
    claimChallenge,
    generateCeremonyToken,
    hashCeremonyToken,
    insertChallenge,
    sweepExpiredChallenges,
} from './challenges.js';
import type { WebAuthnConfig } from './config.js';
import { encodeTransports } from './credential-row.js';
import { isFreshlyAuthenticated } from './fresh-auth.js';
import type { RateLimiterOptions } from './rate-limit.js';
import { isMalformedCeremonyRequest } from './request-guard.js';

/**
 * Enroll, claim and atomically consume single-use recovery codes (#1191 design doc). This is the
 * only account-recovery mechanism this service has: no email reset, no operator override. A
 * valid code authorizes a short-lived, recovery-ONLY session (`sessions.purpose = 'recovery'`,
 * migration 0005) that can do nothing but enroll one new passkey — never chart access, never any
 * other sensitive operation, and it does NOT satisfy `isFreshlyAuthenticated` (that predicate's
 * `credential_id IS NOT NULL` clause fails safe against it by construction).
 */

/**
 * `randomBytes(32).toString('base64url')` — identical shape to `session.ts`'s session token and
 * `challenges.ts`'s ceremony token (43 chars, 256 bits) (decision 1). No friendlier
 * human-typo-tolerant alphabet: there is no delivery/display UI in this story's scope, and
 * inventing a display format now would be speculative.
 */
export const RECOVERY_CODE_BYTES = 32;

/**
 * 10 minutes (decision 7) — doing double duty as both the recovery-only session's absolute
 * lifetime and `claimRecoveryCode`'s claim-lock reclaim window. Matches `fresh-auth.ts`'s
 * `FRESH_AUTH_WINDOW_MS` in magnitude for the same reason: both bound how long a
 * highly-privileged, narrow-purpose state may sit unused before it must be re-established.
 */
export const RECOVERY_SESSION_TTL_MS = 10 * 60 * 1000;

/**
 * 10 attempts per 10-minute sliding window, keyed by source IP (decision 10). Applied to
 * `POST /api/auth/recovery/claim` in `src/http/app.ts`, BEFORE any database lookup — a
 * rate-limited caller learns nothing about the code's validity, only that they are rate-limited.
 */
export const RECOVERY_CLAIM_RATE_LIMIT: RateLimiterOptions = {
    max: 10,
    windowMs: 10 * 60 * 1000,
};

function hashRecoveryCode(code: string): string {
    // Fast hash (SHA-256, no salt/stretching) is correct here — same rationale as
    // `session.ts`'s `hashToken`: the code already carries 256 bits of entropy from
    // `randomBytes`, so there is nothing for a slow KDF to protect against.
    return createHash('sha256').update(code, 'utf8').digest('hex');
}

// --- Enrollment / confirmation --------------------------------------------------------------

export type EnrollRecoveryCodeFailureReason = 'fresh_auth_required';

export type EnrollRecoveryCodeResult =
    | { ok: true; recoveryCodeId: string; code: string }
    | { ok: false; reason: EnrollRecoveryCodeFailureReason };

class EnrollRecoveryCodeAbort extends Error {
    constructor(readonly reason: EnrollRecoveryCodeFailureReason) {
        super(reason);
    }
}

/**
 * Enrolls (or replaces) `accountId`'s recovery code, returning the raw code exactly ONCE — the
 * caller must show/offer it for download now; it can never be retrieved again, only the SHA-256
 * hash is stored (decision 1).
 *
 * Fresh-auth-gated (decision 3), same gate as add-passkey: a stolen or borrowed logged-in
 * session must not be able to mint a fresh recovery code as a quieter path to takeover than
 * enrolling an attacker passkey directly.
 *
 * At most one LIVE (not-yet-consumed) recovery-code row per account (decision 2): before
 * inserting the new row, this deletes any existing row for the account with `consumed_at IS
 * NULL` — covering BOTH an abandoned unconfirmed enrollment (decision 2's "never a pile of stale
 * unconfirmed rows") and a confirmed-but-still-unconsumed code (decision 3's "rotating the code
 * is a legitimate account action... the old confirmed code becomes unusable the moment the new
 * unconfirmed one is inserted"). A CONSUMED row is deliberately left alone — it is already dead
 * history, not live material, and re-enrollment after a completed recovery must not disturb it.
 * This doubles as the retry path for an interrupted download or a never-confirmed rotation:
 * calling enroll again simply replaces the pending code.
 *
 * One transaction: the fresh-auth re-check and the delete-then-insert must observe the same
 * database state, matching `revokePasskey`'s discipline of checking freshness as transaction
 * step 1.
 */
export function enrollRecoveryCode(
    db: DatabaseSync,
    accountId: string,
    sessionId: string,
    now: number,
): EnrollRecoveryCodeResult {
    try {
        return withTransaction(db, () => {
            if (!isFreshlyAuthenticated(db, sessionId, accountId, now)) {
                throw new EnrollRecoveryCodeAbort('fresh_auth_required');
            }

            // Decision 2/3: replace any existing LIVE (unconsumed) row for this account, whether
            // still-unconfirmed or confirmed-but-unclaimed. A consumed row is left untouched.
            db.prepare(
                'DELETE FROM recovery_codes WHERE account_id = ? AND consumed_at IS NULL',
            ).run(accountId);

            const code = randomBytes(RECOVERY_CODE_BYTES).toString('base64url');
            const recoveryCodeId = randomBytes(16).toString('base64url');
            db.prepare(
                `INSERT INTO recovery_codes (id, account_id, code_hash, created_at, consumed_at)
                 VALUES (?, ?, ?, ?, NULL)`,
            ).run(recoveryCodeId, accountId, hashRecoveryCode(code), now);

            return { ok: true, recoveryCodeId, code } as const;
        });
    } catch (error) {
        if (error instanceof EnrollRecoveryCodeAbort) {
            return { ok: false, reason: error.reason };
        }
        throw error;
    }
}

export type ConfirmRecoveryCodeFailureReason = 'fresh_auth_required' | 'not_found';

export type ConfirmRecoveryCodeResult =
    | { ok: true }
    | { ok: false; reason: ConfirmRecoveryCodeFailureReason };

class ConfirmRecoveryCodeAbort extends Error {
    constructor(readonly reason: ConfirmRecoveryCodeFailureReason) {
        super(reason);
    }
}

/**
 * Proves the account holder actually kept the code, not merely that they clicked through
 * enrollment (decision 4). Fresh-auth-gated — same rationale as enroll: this typically happens
 * seconds later, in the same authenticated flow, and there is no reason to weaken the gate for a
 * strictly MORE sensitive step (this is what flips `hasEnrolledRecoveryMaterial` to `true`).
 *
 * `not_found` (never a distinct "wrong code" reason) covers both "no pending code at all" and
 * "the presented code doesn't match the pending one" — this is not an oracle risk the way
 * login/claim are (decision 4): the caller already authenticated as THIS specific account, so
 * "the code you typed doesn't match what I have pending for you" reveals nothing about any other
 * account or code.
 */
export function confirmRecoveryCode(
    db: DatabaseSync,
    accountId: string,
    sessionId: string,
    code: string,
    now: number,
): ConfirmRecoveryCodeResult {
    try {
        return withTransaction(db, () => {
            if (!isFreshlyAuthenticated(db, sessionId, accountId, now)) {
                throw new ConfirmRecoveryCodeAbort('fresh_auth_required');
            }

            const info = db
                .prepare(
                    `UPDATE recovery_codes SET confirmed_at = ?
                     WHERE account_id = ? AND code_hash = ? AND confirmed_at IS NULL
                       AND consumed_at IS NULL`,
                )
                .run(now, accountId, hashRecoveryCode(code));
            if (Number(info.changes) !== 1) {
                throw new ConfirmRecoveryCodeAbort('not_found');
            }

            return { ok: true } as const;
        });
    } catch (error) {
        if (error instanceof ConfirmRecoveryCodeAbort) {
            return { ok: false, reason: error.reason };
        }
        throw error;
    }
}

// --- Claim (public, pre-authentication) ------------------------------------------------------

export type ClaimRecoveryCodeResult =
    | { ok: true; accountId: string; recoveryCodeId: string }
    | { ok: false };

/**
 * Atomically claims a recovery code by its hash — the single-statement `UPDATE ... RETURNING *`
 * discipline `challenges.ts`'s `claimChallenge` already documents for `node:sqlite`'s
 * synchronous, single-threaded execution: two concurrent claims on the same hash can never both
 * match this `UPDATE`, because there is no way for a second call's statement to run until the
 * first one (and the whole synchronous JS turn it's part of) completes. This is what makes "two
 * simultaneous recovery attempts produce exactly one restricted session" true without a lock
 * table (decision 6).
 *
 * Must be the ONLY database access this function performs, and every caller must invoke it as
 * the first statement in its flow, before anything else touches the database — mirroring
 * `claimChallenge`'s own discipline. Splitting this into a `SELECT` then a separate `UPDATE`
 * reintroduces exactly the TOCTOU race this function exists to prevent — do not do that, even
 * "temporarily."
 *
 * The `WHERE` clause requires ALL of:
 *  - `confirmed_at IS NOT NULL` — an unconfirmed code (never proven possessed) must never be
 *    claimable.
 *  - `consumed_at IS NULL` — a spent code must never be claimable again.
 *  - `claimed_at IS NULL OR claimed_at <= now - RECOVERY_SESSION_TTL_MS` — the self-expiring
 *    claim lock: a code that is either never claimed, or was claimed long enough ago that its
 *    recovery session (and the ceremony it authorized) must already be dead, is reclaimable. If
 *    a claimed code's enrollment never completes, the SAME window that expires the recovery-only
 *    session it minted also makes the code reclaimable — no separate sweep or unclaim step.
 *
 * Returns only `{ ok: true, accountId, recoveryCodeId } | { ok: false }` — deliberately no
 * failure reason at all (decision 6/9): the HTTP route collapses every failure (code doesn't
 * exist, wrong hash, unconfirmed, already consumed, already claimed and still locked) to the
 * SAME `401 authentication_failed`, so there is nothing for this layer to usefully distinguish.
 */
export function claimRecoveryCode(
    db: DatabaseSync,
    code: string,
    now: number,
): ClaimRecoveryCodeResult {
    const row = db
        .prepare(
            `UPDATE recovery_codes
             SET claimed_at = ?
             WHERE code_hash = ?
               AND confirmed_at IS NOT NULL
               AND consumed_at IS NULL
               AND (claimed_at IS NULL OR claimed_at <= ?)
             RETURNING id, account_id`,
        )
        .get(now, hashRecoveryCode(code), now - RECOVERY_SESSION_TTL_MS) as unknown as
        | { id: string; account_id: string }
        | undefined;

    if (!row) {
        return { ok: false };
    }
    return { ok: true, accountId: row.account_id, recoveryCodeId: row.id };
}

// --- Recovery-session liveness (mirrors isFreshlyAuthenticated's shape) ----------------------

/**
 * Whether the recovery session `sessionId` (bound to `accountId`) is still live and usable to
 * complete a recovery enrollment — one `SELECT`, mirroring `isFreshlyAuthenticated`'s shape and
 * fail-safe posture exactly. Requires ALL of:
 *  - the session belongs to `accountId` (never trust a session id alone)
 *  - `purpose = 'recovery'` — a standard session can never satisfy this, no matter how it got here
 *  - `revoked_at IS NULL` and `expires_at > now` — an already-revoked or expired recovery session
 *    must not be able to complete enrollment even if the ceremony itself is still mid-flight
 *    (mutation target 10)
 *  - `recovery_code_id IS NOT NULL` — fails safe the same way `isFreshlyAuthenticated`'s
 *    `credential_id IS NOT NULL` clause does: a row that is somehow `purpose = 'recovery'` with
 *    no bound code can never be treated as live.
 *
 * Returns the session's own `recovery_code_id` so `verifyRecoveryEnrollPasskey`'s commit
 * transaction can target the EXACT code row to consume, with no separate lookup or assumption
 * that only one claimed row can exist per account.
 */
export function readLiveRecoverySession(
    db: DatabaseSync,
    sessionId: string,
    accountId: string,
    now: number,
): { recoveryCodeId: string } | null {
    const row = db
        .prepare(
            `SELECT recovery_code_id FROM sessions
             WHERE id = ?
               AND account_id = ?
               AND purpose = 'recovery'
               AND revoked_at IS NULL
               AND expires_at > ?
               AND recovery_code_id IS NOT NULL
             LIMIT 1`,
        )
        .get(sessionId, accountId, now) as unknown as
        | { recovery_code_id: string | null }
        | undefined;

    if (!row || row.recovery_code_id === null) {
        return null;
    }
    return { recoveryCodeId: row.recovery_code_id };
}

// --- Recovery-enroll-passkey ceremony (mirrors passkeys.ts's add-passkey pair) ---------------

export interface StartRecoveryEnrollPasskeyInput {
    accountId: string;
    sessionId: string;
    label?: string;
}

export type StartRecoveryEnrollPasskeyResult =
    | { ok: true; options: PublicKeyCredentialCreationOptionsJSON; ceremonyToken: string }
    | { ok: false; reason: 'recovery_session_invalid' };

/**
 * Mirrors `startAddPasskey` (`passkeys.ts`): re-checks the recovery session is live BEFORE
 * minting a challenge, so a session that expired between claim and this call is rejected here
 * rather than only failing at the end of a whole ceremony. `excludeCredentials` is deliberately
 * empty — unlike add-passkey, a completed recovery deletes every existing credential on the
 * account (decision 12 step 5), so there is nothing on this account left to exclude, and a
 * device-loss recovery is exactly the scenario where the old credential is presumed gone anyway.
 */
export async function startRecoveryEnrollPasskey(
    db: DatabaseSync,
    config: WebAuthnConfig,
    input: StartRecoveryEnrollPasskeyInput,
    now: number = Date.now(),
): Promise<StartRecoveryEnrollPasskeyResult> {
    if (readLiveRecoverySession(db, input.sessionId, input.accountId, now) === null) {
        return { ok: false, reason: 'recovery_session_invalid' };
    }

    sweepExpiredChallenges(db, now);

    const label = resolveRecoveryLabel(input.label);
    const options = await generateRegistrationOptions({
        rpName: config.rpName,
        rpID: config.rpId,
        userID: Buffer.from(input.accountId, 'base64url'),
        userName: label,
        userDisplayName: label,
        attestationType: 'none',
        excludeCredentials: [],
        authenticatorSelection: {
            residentKey: 'required',
            userVerification: 'required',
        },
    });

    const { token, hash } = generateCeremonyToken();
    insertChallenge(db, {
        id: randomBytes(16).toString('base64url'),
        accountId: input.accountId,
        sessionId: input.sessionId,
        challenge: options.challenge,
        type: 'recovery_enroll',
        createdAt: now,
        expiresAt: now + CHALLENGE_TTL_MS,
        ceremonyHash: hash,
    });

    return { ok: true, options, ceremonyToken: token };
}

const DEFAULT_RECOVERY_LABEL = 'Ensemble';
const MAX_RECOVERY_LABEL_LENGTH = 64;

/** Same bounded-label contract as `registration.ts`'s `resolveLabel`, duplicated narrowly rather
 * than imported — that function lives in a module this one has no other reason to depend on, and
 * the contract (non-empty, <= 64 chars, trimmed) is small enough that sharing it isn't worth a
 * cross-module coupling for a single ceremony's default label. */
function resolveRecoveryLabel(label: string | undefined): string {
    if (label === undefined) {
        return DEFAULT_RECOVERY_LABEL;
    }
    const trimmed = label.trim();
    if (trimmed.length === 0) {
        throw new Error('label must not be empty when provided');
    }
    if (trimmed.length > MAX_RECOVERY_LABEL_LENGTH) {
        throw new Error(
            `label must be at most ${MAX_RECOVERY_LABEL_LENGTH} characters, got ${trimmed.length}`,
        );
    }
    return trimmed;
}

export interface VerifyRecoveryEnrollPasskeyInput {
    ceremonyToken: string;
    sessionId: string;
    accountId: string;
    response: RegistrationResponseJSON;
}

export type RecoveryEnrollPasskeyFailureReason =
    | 'malformed_request'
    | 'ceremony_not_found'
    | 'ceremony_expired'
    | 'ceremony_type_mismatch'
    | 'session_mismatch'
    | 'verification_failed'
    | 'recovery_session_invalid'
    | 'account_not_found'
    | 'recovery_code_not_found';

export type VerifyRecoveryEnrollPasskeyResult =
    | { ok: true; accountId: string; credentialId: string }
    | { ok: false; reason: RecoveryEnrollPasskeyFailureReason };

class RecoveryEnrollPasskeyAbort extends Error {
    constructor(readonly reason: RecoveryEnrollPasskeyFailureReason) {
        super(reason);
    }
}

/**
 * Verify order: shape guard -> claim (`recovery_enroll` type) -> binding check -> library verify
 * -> commit transaction. The commit transaction is decision 12's exact step order — the single
 * most load-bearing sequence in this story:
 *
 *  1. re-check the recovery session is still live — abort `recovery_session_invalid` if not.
 *  2. re-check the account still exists — abort `account_not_found` if not.
 *  3. consume the code (`UPDATE ... SET consumed_at = ? WHERE id = <the session's own
 *     recovery_code_id> AND account_id = ? AND consumed_at IS NULL`) — abort
 *     `recovery_code_not_found` if `changes !== 1`. Defense in depth: unreachable given
 *     `claimRecoveryCode`'s exclusive claim lock, but must fail closed, never silently succeed,
 *     if it is ever reached.
 *  4. revoke every live session on the account (this also revokes the recovery session ITSELF —
 *     no special-casing needed; `finishAuthentication`'s own "revoke the presented session" step,
 *     run afterward at the HTTP layer, becomes a harmless no-op).
 *  5. delete every existing credential on the account — a recovery is presumed total device
 *     loss; nothing about "which old credential" survives.
 *  6. insert the new credential (identical shape to `verifyAddPasskey`'s insert).
 *
 * Steps 4 and 5 MUST run before step 6's insert — reversing that order would let the
 * delete-all-credentials statement delete the credential just inserted for this very ceremony.
 *
 * `withTransaction` wraps all six steps as one `BEGIN`/`COMMIT`; any thrown abort rolls back
 * EVERYTHING, including step 3's `consumed_at` write. This is what makes "an interrupted or
 * failed enrollment leaves the code still usable" true: the code is only durably consumed if
 * steps 4-6 also commit. Do NOT move the code-consume write outside this transaction, before
 * `BEGIN`, or after `COMMIT` — that is the #1 mutation target this story's review will probe for.
 */
export async function verifyRecoveryEnrollPasskey(
    db: DatabaseSync,
    config: WebAuthnConfig,
    input: VerifyRecoveryEnrollPasskeyInput,
    now: number = Date.now(),
): Promise<VerifyRecoveryEnrollPasskeyResult> {
    if (isMalformedCeremonyRequest(input)) {
        return { ok: false, reason: 'malformed_request' };
    }

    // First DB touch, before any await — see claimChallenge's doc comment.
    const claim = claimChallenge(
        db,
        hashCeremonyToken(input.ceremonyToken),
        'recovery_enroll',
        now,
    );
    if (!claim.ok) {
        return { ok: false, reason: claim.reason };
    }

    if (claim.row.session_id !== input.sessionId || claim.row.account_id !== input.accountId) {
        return { ok: false, reason: 'session_mismatch' };
    }

    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
        verification = await verifyRegistrationResponse({
            response: input.response,
            expectedChallenge: claim.row.challenge,
            expectedOrigin: config.origin,
            expectedRPID: config.rpId,
            requireUserVerification: true,
        });
    } catch {
        return { ok: false, reason: 'verification_failed' };
    }

    if (!verification.verified) {
        return { ok: false, reason: 'verification_failed' };
    }

    const { credential } = verification.registrationInfo;

    if (credential.id !== input.response.id) {
        return { ok: false, reason: 'verification_failed' };
    }

    try {
        return withTransaction(db, () => {
            // Step 1 (decision 12, mutation target: re-check moved outside the transaction, or
            // skipped). The WebAuthn ceremony's real-world await is exactly the window this
            // session could go stale in.
            const live = readLiveRecoverySession(db, input.sessionId, input.accountId, now);
            if (live === null) {
                throw new RecoveryEnrollPasskeyAbort('recovery_session_invalid');
            }

            // Step 2.
            const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(input.accountId);
            if (!account) {
                throw new RecoveryEnrollPasskeyAbort('account_not_found');
            }

            // Step 3: consume the code THIS session was authorized to consume. Must run inside
            // this same transaction — see the function doc comment's mutation-target #1.
            const consumeInfo = db
                .prepare(
                    `UPDATE recovery_codes SET consumed_at = ?
                     WHERE id = ? AND account_id = ? AND consumed_at IS NULL`,
                )
                .run(now, live.recoveryCodeId, input.accountId);
            if (Number(consumeInfo.changes) !== 1) {
                throw new RecoveryEnrollPasskeyAbort('recovery_code_not_found');
            }

            // Step 4: revoke every live session on the account (including this recovery session).
            db.prepare(
                `UPDATE sessions SET revoked_at = ?
                 WHERE account_id = ? AND revoked_at IS NULL`,
            ).run(now, input.accountId);

            // Step 5: delete every existing credential — MUST run before step 6's insert.
            db.prepare('DELETE FROM credentials WHERE account_id = ?').run(input.accountId);

            // Step 6: insert the new credential (identical shape to verifyAddPasskey's insert).
            db.prepare(
                `INSERT INTO credentials
                    (id, account_id, public_key, sign_count, transports, created_at, last_used_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ).run(
                credential.id,
                input.accountId,
                Buffer.from(credential.publicKey),
                credential.counter,
                encodeTransports(credential.transports),
                now,
                null,
            );

            return { ok: true, accountId: input.accountId, credentialId: credential.id } as const;
        });
    } catch (error) {
        if (error instanceof RecoveryEnrollPasskeyAbort) {
            return { ok: false, reason: error.reason };
        }
        throw error;
    }
}
