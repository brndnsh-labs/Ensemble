import type { DatabaseSync } from 'node:sqlite';

/** One wiped table, and the column naming the account whose rows go. */
export interface AccountDeletionStep {
    table: string;
    /** `owner_id` for the document store, `account_id` elsewhere, `id` for `accounts` itself. */
    column: string;
}

/**
 * The wipe order `deleteAccount` (`src/auth/account-deletion.ts`, #1271) walks, in ONE
 * transaction. It is a list of (table, column) pairs rather than bare table names precisely so
 * that the deletion route cannot re-list the schema for itself: this registry is the single
 * statement of what account deletion touches, and `assertAccountDeletionCoverage` below fails the
 * moment a table exists that this list (plus `ACCOUNT_DELETION_RETAINED`) does not classify.
 *
 * Order is children-before-parents because `foreign_keys=ON` (`src/db/connection.ts`): `accounts`
 * is last, and every table referencing it precedes it. Within that constraint:
 *
 *  - #1201 document store: receipts and tombstones reference the owner, not the document, so
 *    order among the three is free; all three go before `accounts` like every other child.
 *  - `sessions` precedes `credentials` and `recovery_codes`: `sessions.credential_id`
 *    (`ON DELETE SET NULL`) and `sessions.recovery_code_id` both point at rows deleted after it.
 *  - `auth_security_events` and `challenges` carry no foreign key at all; they are wiped here
 *    because they are account-scoped, not because SQLite would stop us.
 *
 * `auth_security_events` is the one table deletion both empties and then writes to: the wipe
 * removes this account's entire audit history, and `deleteAccount` then records ONE metadata-only
 * `account_deleted` event — the registration of the deleted identity, an id and a timestamp and
 * nothing else. That row is deliberately inside the transaction, so a rolled-back deletion leaves
 * no claim that it happened.
 */
export const ACCOUNT_DELETION_WIPED: readonly AccountDeletionStep[] = Object.freeze([
    { table: 'receipts', column: 'owner_id' },
    { table: 'tombstones', column: 'owner_id' },
    { table: 'documents', column: 'owner_id' },
    { table: 'auth_security_events', column: 'account_id' },
    { table: 'challenges', column: 'account_id' },
    { table: 'sessions', column: 'account_id' },
    { table: 'recovery_codes', column: 'account_id' },
    { table: 'credentials', column: 'account_id' },
    { table: 'accounts', column: 'id' },
]);
/** Every non-wiped table needs a reason. This classifies global tables too, catching naming drift. */
const ACCOUNT_DELETION_RETAINED = {
    _migrations: 'Global migration checksums; contains no account data.',
} as const;

export function assertAccountDeletionCoverage(db: DatabaseSync): void {
    const actual = db
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[];
    const classified = [
        ...ACCOUNT_DELETION_WIPED.map((step) => step.table),
        ...Object.keys(ACCOUNT_DELETION_RETAINED),
    ];
    if (
        new Set(classified).size !== classified.length ||
        actual.some(({ name }) => !classified.includes(name)) ||
        classified.some((name) => !actual.some((row) => row.name === name))
    ) {
        throw new Error('Account deletion registry does not classify every table exactly once');
    }
}
