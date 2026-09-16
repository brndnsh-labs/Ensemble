import type { DatabaseSync } from 'node:sqlite';

/**
 * `node:sqlite`'s `DatabaseSync` has no `db.transaction(fn)` helper (verified:
 * `db.transaction` is `undefined` and the prototype exposes no such method,
 * unlike `better-sqlite3`). Every multi-statement write must be wrapped by
 * hand with this helper instead of raw `exec('BEGIN')`/`exec('COMMIT')` calls.
 *
 * On a thrown exception `fn` rolls back and the error rethrows unchanged.
 * There is no structural guard against an unwrapped multi-statement mutation
 * elsewhere in this codebase — that's a review rule, not something this
 * function can enforce for you.
 *
 * A leaked open transaction (e.g. calling this again on a handle that never
 * committed/rolled back) makes the next `BEGIN` throw
 * `cannot start a transaction within a transaction` rather than silently
 * nesting — that failure is intentional and should not be swallowed.
 */
export interface TransactionOptions {
    /**
     * `BEGIN IMMEDIATE`: take the write lock up front. Required for any read-then-decide-then-
     * write transaction (#1202's `commitSave`): a deferred transaction that reads under WAL and
     * then upgrades to a write fails with `SQLITE_BUSY_SNAPSHOT` immediately — `busy_timeout`
     * does NOT apply to a snapshot upgrade — the moment a second writer (a maintenance script,
     * a migration against a live container) touches the file. Single-process today, so this is
     * a no-op in practice; it is the correct default for that shape regardless.
     */
    immediate?: boolean;
}

export function withTransaction<T>(
    db: DatabaseSync,
    fn: () => T,
    { immediate = false }: TransactionOptions = {},
): T {
    db.exec(immediate ? 'BEGIN IMMEDIATE' : 'BEGIN');
    try {
        const result = fn();
        db.exec('COMMIT');
        return result;
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
}
