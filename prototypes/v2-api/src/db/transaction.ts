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
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
    db.exec('BEGIN');
    try {
        const result = fn();
        db.exec('COMMIT');
        return result;
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
}
