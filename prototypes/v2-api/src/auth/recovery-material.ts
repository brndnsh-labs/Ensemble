import type { DatabaseSync } from 'node:sqlite';

/**
 * Whether `accountId` has at least one usable recovery code enrolled (#1190 orchestrator
 * decision 6, step 3). Owned by #1191 in full — recovery-code enrollment/claim/consumption
 * lands there — but `revokePasskey`'s last-credential guard needs this predicate NOW, before
 * that story exists, so this is the narrow slice #1190 needs: "at least one unconsumed
 * `recovery_codes` row." #1191 may tighten this later (e.g. to a confirmed-enrollment flag), but
 * it is the one place that answers this question — `revokePasskey` must never grow its own
 * inline recovery check.
 *
 * `consumed_at IS NULL` is load-bearing, not incidental: an already-used recovery code is not
 * usable recovery material, and dropping this clause would let an account with only spent codes
 * revoke its last passkey into permanent lockout.
 */
export function hasEnrolledRecoveryMaterial(db: DatabaseSync, accountId: string): boolean {
    const row = db
        .prepare(
            `SELECT 1 FROM recovery_codes
             WHERE account_id = ? AND consumed_at IS NULL
             LIMIT 1`,
        )
        .get(accountId);

    return row !== undefined;
}
