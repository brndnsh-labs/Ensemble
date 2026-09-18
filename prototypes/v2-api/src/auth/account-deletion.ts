import type { DatabaseSync } from 'node:sqlite';
import { ACCOUNT_DELETION_WIPED } from '../db/account-deletion-registry.js';
import { withTransaction } from '../db/transaction.js';
import { isFreshlyAuthenticated } from './fresh-auth.js';
import { recordSecurityEvent } from './security-events.js';

/**
 * Deleting an account (#1271) — the way out the accounts contract requires before accounts ship.
 *
 * ONE transaction, in this exact order:
 *
 *  1. **Fresh check first, inside the transaction.** The same discipline `revokePasskey` and
 *     `enrollRecoveryCode` follow: freshness is checked at the point of the write, so the read that
 *     authorizes the wipe and the wipe itself see the same database state. A stale-but-valid
 *     session gets `403 fresh_auth_required` and the client's one step-up retry
 *     (`withFreshAuth` in `prototypes/v2/lib/account/passkeys.ts`) re-proves the passkey. A
 *     borrowed signed-in tab cannot silently destroy somebody's songbook.
 *  2. **The wipe, walking `ACCOUNT_DELETION_WIPED`.** Never a table list written out here: the
 *     registry is the single statement of what account deletion touches, and its drift guard
 *     (`assertAccountDeletionCoverage`) fails on any table nobody classified. Every statement is
 *     owner-scoped by the registry's own column, so no other account is reachable from here.
 *  3. **Register the deleted identity**, as one metadata-only `account_deleted` security event —
 *     the account id and a timestamp, no credential, no chart, no request data. Step 2 has just
 *     emptied this account's audit history, so this row is the only trace the service keeps, and
 *     it is written inside the transaction: a rolled-back deletion leaves no record claiming it
 *     happened.
 *
 * **What refuses the disconnected device is absence, not a flag.** After this commits there is no
 * session row, no credential row and no account row, so every authenticated route answers
 * `401 unauthenticated` (`readSession` finds nothing, and its `JOIN accounts` is a second reason
 * it would find nothing), a queued Save from another context is refused rather than recreating a
 * document, and a login ceremony with the old passkey fails `credential_not_found`. That is also
 * why this is not an account-level tombstone that outlives the data: the SAME authenticator must
 * be able to register a brand-new account afterwards — its credential id is free again because the
 * row holding it is gone — and nothing here may stand in the way of that.
 *
 * Backups are explicitly out of scope: nightly snapshots age out on their own schedule, which the
 * client copy discloses rather than promising an instant erasure this function cannot deliver.
 */

export type DeleteAccountFailureReason = 'fresh_auth_required';

export type DeleteAccountResult = { ok: true } | { ok: false; reason: DeleteAccountFailureReason };

export function deleteAccount(
    db: DatabaseSync,
    accountId: string,
    sessionId: string,
    now: number,
): DeleteAccountResult {
    return withTransaction(
        db,
        () => {
            if (!isFreshlyAuthenticated(db, sessionId, accountId, now)) {
                return { ok: false, reason: 'fresh_auth_required' } as const;
            }
            for (const { table, column } of ACCOUNT_DELETION_WIPED) {
                // Table/column come from the frozen registry above, never from a request — the
                // only interpolated values in this service's SQL, and deliberately so: a bind
                // parameter cannot name a table, and the alternative is nine hand-written
                // statements that can drift from the coverage guard.
                db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(accountId);
            }
            recordSecurityEvent(db, { event: 'account_deleted', accountId }, now);
            return { ok: true } as const;
        },
        { immediate: true },
    );
}
