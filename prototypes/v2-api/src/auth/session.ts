import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

/**
 * Session issuance and lookup (#1189 orchestrator decisions 1-4). A session token is a
 * high-entropy random value returned to the caller once, at issuance; only its SHA-256 hex
 * digest is ever stored, in `sessions.token_hash` (migration 0003, unique index). A stolen
 * database must not yield a usable session token. `sessions.id` is a separate random identifier
 * so that revoking one session never needs its raw token.
 *
 * A fast hash (SHA-256, no salt/stretching) is correct here — unlike a password, the token
 * already carries 256 bits of entropy, so there is nothing for a slow KDF to protect against.
 * Every lookup hashes the presented token before touching the database, so there is no code path
 * that compares against a raw stored value and no timing oracle on it either.
 *
 * Lifetime is 30 days, **absolute** — no sliding renewal. The contract forbids writes on the
 * session-read path (`readSession` below performs none), and a sliding-expiry scheme would need
 * one on every read to bump `expires_at`. After 30 days a client re-authenticates via one-tap
 * passkey login; local songs are unaffected.
 *
 * Fixation defense (decision 4) is deliberately NOT implemented here: it is an HTTP-flow
 * responsibility (clear the ceremony cookie, revoke any session presented on the request, issue
 * a fresh one) composed out of `revokeSession` + `issueSession` in `src/http/`, not a single
 * library call — see that module for the full sequence.
 */

/** 30 days, absolute (decision 2). No sliding renewal — see module doc comment. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const TOKEN_BYTES = 32;
/**
 * `randomBytes(32).toString('base64url')` always produces exactly this many characters (no
 * padding in base64url) — verified empirically against the installed Node runtime. `readSession`
 * rejects any presented token of a different length before it is ever hashed or looked up.
 */
const TOKEN_LENGTH = 43;

/** Row shape as returned by `issueSession`. */
export interface IssuedSession {
    /** Returned to the caller for the session cookie. Never persisted — only its hash is. */
    token: string;
    sessionId: string;
    expiresAt: number;
}

/** The claims a live, non-revoked, non-expired session resolves to. */
export interface SessionClaims {
    sessionId: string;
    accountId: string;
    expiresAt: number;
    /**
     * The credential whose ceremony created this session (#1190 migration 0004), or `null` for
     * a session that wasn't — today that's only a session minted by a 3-argument `issueSession`
     * call in a test; #1191's recovery session (`purpose: 'recovery'` below) is the production
     * case. This is what lets a caller (e.g. `listPasskeys`'s `current` flag) know "did THIS
     * credential create the session I'm looking at" without a second query, and it's the same
     * column `isFreshlyAuthenticated` (fresh-auth.ts) requires `IS NOT NULL` on — though that
     * function does its own independent read rather than trusting this one, see its doc comment.
     */
    credentialId: string | null;
    /**
     * `'standard'` for every session minted by register/login/reauth/passkey-add, `'recovery'`
     * only for a session minted by a successful recovery-code claim (#1191 migration 0005). This
     * is the enforcement mechanism for "a recovery code authorizes enrolling a passkey and
     * nothing else" — `src/http/app.ts`'s `requireSession` refuses `'recovery'` outright, and
     * `requireRecoverySession` is the sole route that accepts it. Never derive this from
     * `credentialId === null` instead — a `'standard'` session predating #1190's `credential_id`
     * column (or minted by a 3-argument test call) would look identical to a recovery session
     * under that inference, and the two must never be confused.
     */
    purpose: 'standard' | 'recovery';
}

function hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Opportunistic expired-row sweep, mirroring `challenges.ts`'s `sweepExpiredChallenges` — cheap
 * and adequate in place of a cron, run at the top of the one write path (`issueSession`). Never
 * called from `readSession`, which must perform zero writes.
 */
function sweepExpiredSessions(db: DatabaseSync, now: number): void {
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
}

/**
 * Mints a fresh session for `accountId`. Callers at the HTTP boundary are responsible for the
 * fixation defense (revoke-then-issue) around this call; this function only ever inserts.
 *
 * `ttlMs` is an optional override of `SESSION_TTL_MS`, additive to decision 3's settled 3-argument
 * shape rather than a change to it — every existing 3-argument call keeps its exact behavior.
 * It exists for `src/http/app.ts`'s `createApp({ sessionTtlMs })` factory option (decision 7),
 * which a test can use to mint short-lived sessions instead of driving an injected clock 30 days
 * forward to exercise expiry over HTTP.
 *
 * `credentialId` (#1190 decision 7) is additive in the same spirit: an optional 5th argument
 * defaulting to `null`, so every existing 3- and 4-argument call (the bulk of `session.test.ts`,
 * which is testing session lifetime/revocation mechanics that have nothing to do with which
 * credential created the session) keeps its exact behavior unchanged. The register, login and
 * reauth-verify HTTP routes are the callers that must now pass it — see `src/http/app.ts`'s
 * `finishAuthentication`. `isFreshlyAuthenticated` (fresh-auth.ts) is what actually depends on
 * this column being populated for a passkey-created session; a session mistakenly left at the
 * `null` default is simply never fresh, never wrongly-fresh — the failure mode is safe.
 *
 * `purpose`/`recoveryCodeId` (#1191 decision 9) are additive the same way: two more optional
 * trailing parameters after `credentialId`, defaulting to `'standard'`/`null` — every existing
 * 3-, 4- and 5-argument call keeps its exact behavior unchanged. Only `claimRecoveryCode`'s HTTP
 * route (`POST /api/auth/recovery/claim`) passes `'recovery'`, and only that same call site
 * passes a non-null `recoveryCodeId` — it is the id of the `recovery_codes` row THIS session is
 * authorized to consume via the recovery-enroll-passkey ceremony, per migration 0005.
 */
export function issueSession(
    db: DatabaseSync,
    accountId: string,
    now: number,
    ttlMs: number = SESSION_TTL_MS,
    credentialId: string | null = null,
    purpose: 'standard' | 'recovery' = 'standard',
    recoveryCodeId: string | null = null,
): IssuedSession {
    sweepExpiredSessions(db, now);

    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const sessionId = randomBytes(16).toString('base64url');
    const expiresAt = now + ttlMs;

    db.prepare(
        `INSERT INTO sessions
            (id, account_id, created_at, expires_at, revoked_at, token_hash, credential_id, purpose, recovery_code_id)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    ).run(
        sessionId,
        accountId,
        now,
        expiresAt,
        hashToken(token),
        credentialId,
        purpose,
        recoveryCodeId,
    );

    return { token, sessionId, expiresAt };
}

/**
 * Resolves a presented raw session token to its claims, or `null` if the token is malformed, not
 * found, revoked, expired, or its owning account no longer exists.
 *
 * **Performs zero writes.** One `SELECT` and nothing else — see `test/auth/session.test.ts`'s
 * `SELECT total_changes()` assertion. This is why expiry sweeping lives only in `issueSession`:
 * a read path must never need to write.
 */
export function readSession(db: DatabaseSync, token: unknown, now: number): SessionClaims | null {
    if (typeof token !== 'string' || token.length !== TOKEN_LENGTH) {
        return null;
    }

    const row = db
        .prepare(
            // The JOIN can't currently matter: `sessions.account_id` has no `ON DELETE CASCADE`,
            // so an account with live sessions cannot be deleted at all today (see #1188's
            // schema). If a future story adds account deletion, it must delete/revoke that
            // account's sessions FIRST, or this JOIN silently stops being redundant defense and
            // starts being load-bearing without anyone having verified it. Tracked on #1190/#1192.
            `SELECT s.id AS session_id, s.account_id AS account_id, s.expires_at AS expires_at,
                    s.credential_id AS credential_id, s.purpose AS purpose
             FROM sessions s
             JOIN accounts a ON a.id = s.account_id
             WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?`,
        )
        .get(hashToken(token), now) as unknown as
        | {
              session_id: string;
              account_id: string;
              expires_at: number;
              credential_id: string | null;
              purpose: 'standard' | 'recovery';
          }
        | undefined;

    if (!row) {
        return null;
    }

    return {
        sessionId: row.session_id,
        accountId: row.account_id,
        expiresAt: row.expires_at,
        credentialId: row.credential_id,
        purpose: row.purpose,
    };
}

/**
 * Revokes one session. Owner-scoped by construction: the `WHERE` clause requires the session to
 * belong to `accountId`, so presenting a foreign `accountId` changes nothing rather than throwing
 * — callers that need to know whether a revocation actually happened should re-read the session.
 * Idempotent: revoking an already-revoked (or nonexistent) session is a silent no-op.
 */
export function revokeSession(
    db: DatabaseSync,
    sessionId: string,
    accountId: string,
    now: number,
): void {
    db.prepare(
        `UPDATE sessions SET revoked_at = ?
         WHERE id = ? AND account_id = ? AND revoked_at IS NULL`,
    ).run(now, sessionId, accountId);
}

/**
 * Revokes every other live session on `accountId`, leaving `keepSessionId` untouched. Returns
 * the number of sessions revoked so callers (e.g. a "signed out N other devices" response) don't
 * need a second query.
 */
export function revokeOtherSessions(
    db: DatabaseSync,
    accountId: string,
    keepSessionId: string,
    now: number,
): number {
    const info = db
        .prepare(
            `UPDATE sessions SET revoked_at = ?
             WHERE account_id = ? AND id != ? AND revoked_at IS NULL`,
        )
        .run(now, accountId, keepSessionId);
    return Number(info.changes);
}
