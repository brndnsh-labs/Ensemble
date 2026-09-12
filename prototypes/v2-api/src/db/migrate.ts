import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from './transaction.js';

/**
 * Hand-rolled, content-addressed migration runner. `node:sqlite` ships no
 * migration tooling, and the applier deliberately depends on nothing but
 * `node:fs`/`node:crypto`/`node:sqlite` — a sibling project's migrator broke
 * in production with MODULE_NOT_FOUND when its deploy artifact tree-shook
 * away the toolkit the applier depended on. Keep it that way: don't import a
 * migration-authoring toolkit into this file.
 */

interface AppliedMigrationRow {
    filename: string;
    hash: string;
}

export interface MigrationResult {
    /** Filenames applied during this call, in application order. Empty on a no-op run. */
    applied: string[];
}

function ensureMigrationsTable(db: DatabaseSync): void {
    // Infra bookkeeping, not domain data — filename is naturally unique and
    // app-provided, so it's the primary key rather than an AUTOINCREMENT
    // rowid, consistent with the "no AUTOINCREMENT" schema habit below.
    db.exec(`
        CREATE TABLE IF NOT EXISTS _migrations (
            filename TEXT PRIMARY KEY,
            hash TEXT NOT NULL,
            applied_at INTEGER NOT NULL
        )
    `);
}

function hashContents(sql: string): string {
    return createHash('sha256').update(sql, 'utf8').digest('hex');
}

function readAppliedMigrations(db: DatabaseSync): Map<string, string> {
    const rows = db
        .prepare('SELECT filename, hash FROM _migrations')
        .all() as unknown as AppliedMigrationRow[];
    return new Map(rows.map((row) => [row.filename, row.hash]));
}

function listMigrationFiles(migrationsDir: string): string[] {
    return readdirSync(migrationsDir)
        .filter((name) => name.endsWith('.sql'))
        .sort();
}

/**
 * Applies every `.sql` file in `migrationsDir` (sorted by filename) that
 * isn't already recorded in the `_migrations` bookkeeping table, in order.
 * Each file's statements plus its bookkeeping row are applied inside one
 * `withTransaction` call, so a mid-migration failure rolls back the schema
 * change AND leaves the file unmarked — the migration stays correctly
 * re-runnable rather than half-applied. Calling this again with nothing new
 * to apply is a no-op (`applied: []`).
 *
 * If a previously-applied file's content hash no longer matches what was
 * recorded, this throws rather than silently reapplying or ignoring the
 * drift — an already-applied migration must never be edited in place.
 */
export function runMigrations(db: DatabaseSync, migrationsDir: string): MigrationResult {
    ensureMigrationsTable(db);

    const applied = readAppliedMigrations(db);
    const files = listMigrationFiles(migrationsDir);
    const newlyApplied: string[] = [];

    for (const filename of files) {
        const contents = readFileSync(join(migrationsDir, filename), 'utf8');
        const hash = hashContents(contents);
        const appliedHash = applied.get(filename);

        if (appliedHash !== undefined) {
            if (appliedHash !== hash) {
                throw new Error(
                    `Migration "${filename}" was already applied with a different hash ` +
                        `(recorded ${appliedHash}, on disk ${hash}). Already-applied migrations ` +
                        'must never be edited; add a new migration file instead.',
                );
            }
            continue;
        }

        withTransaction(db, () => {
            db.exec(contents);
            db.prepare('INSERT INTO _migrations (filename, hash, applied_at) VALUES (?, ?, ?)').run(
                filename,
                hash,
                Date.now(),
            );
        });
        newlyApplied.push(filename);
    }

    return { applied: newlyApplied };
}
