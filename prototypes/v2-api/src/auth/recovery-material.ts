import type { DatabaseSync } from 'node:sqlite';

/**
 * Whether `accountId` has at least one usable recovery code enrolled (#1190 orchestrator
 * decision 6, step 3; tightened by #1191 decision 5). Owned by #1191 in full — recovery-code
 * enrollment/claim/consumption lands there — but `revokePasskey`'s last-credential guard needs
 * this predicate, so this is the one place that answers this question: `revokePasskey` must
 * never grow its own inline recovery check.
 *
 * BOTH clauses are load-bearing, not incidental:
 *  - `consumed_at IS NULL` — an already-used recovery code is not usable recovery material;
 *    dropping this would let an account with only spent codes revoke its last passkey into
 *    permanent lockout.
 *  - `confirmed_at IS NOT NULL` — an enrolled-but-never-confirmed code has never been proven to
 *    actually be in the user's possession (#1191 decision 4's `confirmRecoveryCode` is the only
 *    thing that sets this). An account that started enrollment, crashed or abandoned it before
 *    confirming, and then tries to revoke its last passkey must still be blocked — dropping this
 *    clause would let a never-proven-possessed code silently stand in as a safety net.
 */
export function hasEnrolledRecoveryMaterial(db: DatabaseSync, accountId: string): boolean {
    const row = db
        .prepare(
            `SELECT 1 FROM recovery_codes
             WHERE account_id = ? AND consumed_at IS NULL AND confirmed_at IS NOT NULL
             LIMIT 1`,
        )
        .get(accountId);

    return row !== undefined;
}
