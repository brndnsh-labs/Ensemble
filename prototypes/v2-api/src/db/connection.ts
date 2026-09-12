import { DatabaseSync } from 'node:sqlite';

/**
 * Opens a `node:sqlite` connection and sets the three pragmas this service
 * depends on. All three are load-bearing and must be set explicitly at open
 * — see prototypes/v2/CLAUDE.md's "Connection module" section for the
 * verified rationale/measurements behind each one:
 *
 * - `journal_mode = WAL`: required for the WAL-safe `backup` path landing in
 *   a later stage. Note this has no effect on an in-memory (`:memory:`)
 *   database — SQLite keeps those in `memory` journal mode regardless, which
 *   is why the test harness always uses a real temp file, never `:memory:`.
 * - `busy_timeout`: `node:sqlite` defaults this to 0, so any contention
 *   (a backup script, a concurrent migration) would otherwise surface as an
 *   immediate hard error instead of a bounded wait.
 * - `foreign_keys = ON`: already the `node:sqlite` default (unlike
 *   `better-sqlite3`, where it's off), but set explicitly for readability —
 *   don't read that as "someone might have disabled it" defensiveness.
 */
export interface OpenDatabaseOptions {
    /** Milliseconds SQLite will wait for a lock before raising SQLITE_BUSY. */
    busyTimeoutMs?: number;
}

const DEFAULT_BUSY_TIMEOUT_MS = 5000;

export function openDatabase(path: string, options: OpenDatabaseOptions = {}): DatabaseSync {
    const db = new DatabaseSync(path);
    const busyTimeoutMs = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
    if (!Number.isInteger(busyTimeoutMs) || busyTimeoutMs < 0) {
        throw new Error(`busyTimeoutMs must be a non-negative integer, got ${busyTimeoutMs}`);
    }

    db.exec('PRAGMA journal_mode = WAL');
    // PRAGMA does not accept bound parameters for its value in node:sqlite's
    // exec(); the integer is validated above, so this is not string-built
    // from untrusted input.
    db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    db.exec('PRAGMA foreign_keys = ON');

    return db;
}
