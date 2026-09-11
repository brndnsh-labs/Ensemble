import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

/**
 * Ceremony binding without a session (orchestrator decision 3/4). Generating registration or
 * login options mints a random 32-byte ceremony token, returned to the caller — the later HTTP
 * layer carries it in a short-lived HttpOnly pre-auth cookie (out of scope here). Only the
 * token's SHA-256 hex digest is stored in `challenges.ceremony_hash`; the raw token never
 * touches the database. Verification requires the token back and claims the row by its hash.
 */

/** Challenge rows expire 5 minutes after issuance (decision 12). */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type ChallengeType = 'registration' | 'login';

/** Row shape as returned by `claimChallenge`'s `DELETE ... RETURNING *`. */
export interface ChallengeRow {
    id: string;
    account_id: string | null;
    challenge: string;
    type: string;
    created_at: number;
    expires_at: number;
    ceremony_hash: string;
}

export interface NewChallenge {
    id: string;
    accountId: string | null;
    challenge: string;
    type: ChallengeType;
    createdAt: number;
    expiresAt: number;
    ceremonyHash: string;
}

/** A fresh, unguessable ceremony token plus the hash stored alongside its challenge row. */
export interface CeremonyToken {
    /** Returned to the caller. Never persisted. */
    token: string;
    /** SHA-256 hex digest of `token` — this is what `challenges.ceremony_hash` stores. */
    hash: string;
}

/** Mints a new 32-byte, base64url-encoded ceremony token and its stored hash. */
export function generateCeremonyToken(): CeremonyToken {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: hashCeremonyToken(token) };
}

export function hashCeremonyToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Opportunistic expired-row sweep (decision 12), run at the top of each options-generation
 * call. Cheap and adequate in place of a cron: this table only ever holds a few minutes' worth
 * of in-flight ceremonies.
 */
export function sweepExpiredChallenges(db: DatabaseSync, now: number): void {
    db.prepare('DELETE FROM challenges WHERE expires_at < ?').run(now);
}

export function insertChallenge(db: DatabaseSync, row: NewChallenge): void {
    db.prepare(
        `INSERT INTO challenges (id, account_id, challenge, type, created_at, expires_at, ceremony_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
        row.id,
        row.accountId,
        row.challenge,
        row.type,
        row.createdAt,
        row.expiresAt,
        row.ceremonyHash,
    );
}

export type ClaimFailureReason =
    | 'ceremony_not_found'
    | 'ceremony_expired'
    | 'ceremony_type_mismatch';

export type ClaimResult =
    | { ok: true; row: ChallengeRow }
    | { ok: false; reason: ClaimFailureReason };

/**
 * Atomically claims (consumes) a challenge row by its ceremony-token hash.
 *
 * This is the one `DELETE ... RETURNING *` prepared statement the design doc requires — it
 * must be the **only** database access this function performs before returning, and every
 * caller must invoke it as the first statement in its async verify function, before that
 * function's first `await`. `node:sqlite` is synchronous and single-threaded with no
 * interleaved statements, so two concurrent callers racing on the same hash can never both see
 * the row: only one `DELETE` matches, the other gets zero rows back. That guarantee would not
 * hold under an async driver — if this service ever migrates off `node:sqlite`, this comment
 * (and the "before the first await" discipline at every call site) needs to be re-verified, not
 * assumed to still be true.
 *
 * Splitting this into a `SELECT` followed by a separate `DELETE` reintroduces exactly the
 * TOCTOU race this function exists to prevent — do not do that, even "temporarily."
 *
 * Any mismatch (wrong type, or already expired) fails closed with the row already gone: a
 * failed or mismatched claim never gets a second try, by design. The caller restarts the
 * ceremony from scratch.
 */
export function claimChallenge(
    db: DatabaseSync,
    ceremonyHash: string,
    expectedType: ChallengeType,
    now: number,
): ClaimResult {
    const row = db
        .prepare('DELETE FROM challenges WHERE ceremony_hash = ? RETURNING *')
        .get(ceremonyHash) as unknown as ChallengeRow | undefined;

    if (!row) {
        return { ok: false, reason: 'ceremony_not_found' };
    }
    if (row.expires_at < now) {
        return { ok: false, reason: 'ceremony_expired' };
    }
    if (row.type !== expectedType) {
        return { ok: false, reason: 'ceremony_type_mismatch' };
    }
    return { ok: true, row };
}
