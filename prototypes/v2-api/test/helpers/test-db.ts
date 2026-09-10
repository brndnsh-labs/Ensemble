import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../../src/db/connection.js';
import { runMigrations } from '../../src/db/migrate.js';

// WAL mode has no effect on an in-memory (`:memory:`) database — SQLite
// keeps those in `memory` journal mode regardless — so a disposable-database
// harness that wants to prove real WAL behavior must use a real temp file.
const REAL_MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));

/** Every table this service's migrations create, in dependency order for truncation. */
export const ALL_TABLES = [
    'recovery_codes',
    'sessions',
    'challenges',
    'credentials',
    'accounts',
] as const;

export interface TestDatabase {
    db: DatabaseSync;
    /** Absolute path to the on-disk database file (and its -wal/-shm siblings). */
    path: string;
    /** Closes the connection and removes the temp directory, including WAL/SHM sidecars. */
    cleanup: () => void;
}

/**
 * Creates a fresh on-disk SQLite database in a temp directory, opens it with
 * this service's real pragmas, and runs the real migrations against it — a
 * disposable database per test, never a mocked schema. Each test gets its
 * own temp directory, so parallel test files never collide on one file.
 */
export function createTestDatabase(migrationsDir: string = REAL_MIGRATIONS_DIR): TestDatabase {
    const dir = mkdtempSync(join(tmpdir(), 'ensemble-v2-api-test-'));
    const path = join(dir, 'test.db');
    const db = openDatabase(path);
    runMigrations(db, migrationsDir);

    return {
        db,
        path,
        cleanup: () => {
            db.close();
            rmSync(dir, { recursive: true, force: true });
        },
    };
}

/**
 * Deletes every row from every known table, for suites that share one
 * database across several tests for speed instead of opening a fresh one
 * per test. Does not touch the `_migrations` bookkeeping table.
 */
export function resetDatabase(db: DatabaseSync): void {
    for (const table of ALL_TABLES) {
        db.exec(`DELETE FROM ${table}`);
    }
}
