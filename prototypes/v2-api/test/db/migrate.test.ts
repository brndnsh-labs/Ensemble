import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/db/connection.js';
import { runMigrations } from '../../src/db/migrate.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

const HAPPY_FIXTURES_DIR = fileURLToPath(new URL('../fixtures/migrations-happy', import.meta.url));
const FAILING_FIXTURES_DIR = fileURLToPath(
    new URL('../fixtures/migrations-failing', import.meta.url),
);
const PARTIAL_FIXTURES_DIR = fileURLToPath(
    new URL('../fixtures/migrations-partial', import.meta.url),
);

/** Copies a fixture migrations dir into a fresh temp dir so tests never mutate the checked-in fixtures. */
function copyFixtures(sourceDir: string): { dir: string; cleanup: () => void } {
    const dir = mkdtempSync(join(tmpdir(), 'ensemble-v2-api-migrations-'));
    cpSync(sourceDir, dir, { recursive: true });
    return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('runMigrations', () => {
    let testDb: TestDatabase | undefined;
    let fixturesCleanup: (() => void) | undefined;

    afterEach(() => {
        testDb?.cleanup();
        testDb = undefined;
        fixturesCleanup?.();
        fixturesCleanup = undefined;
    });

    it('applies the real migrations in the app migrations/ directory against a fresh database', () => {
        testDb = createTestDatabase();
        const tables = testDb.db
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            .all() as unknown as { name: string }[];
        const tableNames = tables.map((t) => t.name).sort();

        expect(tableNames).toEqual(
            [
                '_migrations',
                'accounts',
                'challenges',
                'credentials',
                'recovery_codes',
                'sessions',
            ].sort(),
        );
    });

    it('is idempotent: applying the same migrations twice is a no-op the second time', () => {
        const fixtures = copyFixtures(HAPPY_FIXTURES_DIR);
        fixturesCleanup = fixtures.cleanup;
        const fixturesDir = fixtures.dir;
        testDb = createTestDatabase(fixturesDir);

        const first = runMigrations(testDb.db, fixturesDir);
        expect(first.applied).toEqual([]); // createTestDatabase already applied them once.

        const second = runMigrations(testDb.db, fixturesDir);
        expect(second.applied).toEqual([]);

        // No duplicate rows, no error, schema still intact.
        const migrationRows = testDb.db
            .prepare('SELECT filename FROM _migrations ORDER BY filename')
            .all() as unknown as { filename: string }[];
        expect(migrationRows.map((r) => r.filename)).toEqual(['0001_a.sql', '0002_b.sql']);
    });

    it('applies only the newly added file when one migration already ran', () => {
        const fixtures = copyFixtures(HAPPY_FIXTURES_DIR);
        fixturesCleanup = fixtures.cleanup;
        const fixturesDir = fixtures.dir;
        const dir = mkdtempSync(join(tmpdir(), 'ensemble-v2-api-migrations-db-'));
        const dbPath = join(dir, 'db.sqlite');
        const db = openDatabase(dbPath);

        try {
            // Apply only the first file to start.
            const onlyFirst = mkdtempSync(join(tmpdir(), 'ensemble-v2-api-only-first-'));
            writeFileSync(
                join(onlyFirst, '0001_a.sql'),
                readFileSync(join(fixturesDir, '0001_a.sql'), 'utf8'),
            );
            const first = runMigrations(db, onlyFirst);
            expect(first.applied).toEqual(['0001_a.sql']);
            rmSync(onlyFirst, { recursive: true, force: true });

            // Now point at both files — only the second should apply.
            const second = runMigrations(db, fixturesDir);
            expect(second.applied).toEqual(['0002_b.sql']);

            const third = runMigrations(db, fixturesDir);
            expect(third.applied).toEqual([]);
        } finally {
            db.close();
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('rejects a previously-applied file whose content changed instead of silently reapplying it', () => {
        const fixtures = copyFixtures(HAPPY_FIXTURES_DIR);
        fixturesCleanup = fixtures.cleanup;
        const fixturesDir = fixtures.dir;
        testDb = createTestDatabase(fixturesDir);

        // Mutate the already-applied file on disk.
        writeFileSync(
            join(fixturesDir, '0001_a.sql'),
            '-- tampered\nCREATE TABLE nope (id TEXT);\n',
        );

        const db = testDb.db;
        expect(() => runMigrations(db, fixturesDir)).toThrow(/different hash/);
    });

    it('rolls back a deliberately-failing migration and leaves the database unmarked and re-runnable', () => {
        const fixtures = copyFixtures(FAILING_FIXTURES_DIR);
        fixturesCleanup = fixtures.cleanup;
        const fixturesDir = fixtures.dir;
        const dir = mkdtempSync(join(tmpdir(), 'ensemble-v2-api-failing-db-'));
        const dbPath = join(dir, 'db.sqlite');
        const db = openDatabase(dbPath);

        try {
            expect(() => runMigrations(db, fixturesDir)).toThrow();

            // The good first migration committed and is marked applied...
            const migrationRows = db
                .prepare('SELECT filename FROM _migrations ORDER BY filename')
                .all() as unknown as { filename: string }[];
            expect(migrationRows.map((r) => r.filename)).toEqual(['0001_ok.sql']);

            // ...but the broken second migration left NO trace: not marked applied,
            // and its table was never created (the transaction rolled back).
            const tables = db
                .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
                .all() as unknown as { name: string }[];
            expect(tables.map((t) => t.name)).not.toContain('broken_table');

            // Fix the broken file in place and prove the migration set is re-runnable.
            writeFileSync(
                join(fixturesDir, '0002_broken.sql'),
                'CREATE TABLE broken_table (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);\n',
            );
            const retry = runMigrations(db, fixturesDir);
            expect(retry.applied).toEqual(['0002_broken.sql']);

            const tablesAfterFix = db
                .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
                .all() as unknown as { name: string }[];
            expect(tablesAfterFix.map((t) => t.name)).toContain('broken_table');
        } finally {
            db.close();
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('rolls back an earlier statement in the SAME migration file that already succeeded before a later statement failed', () => {
        // sqlite3_exec (node:sqlite's DatabaseSync.exec) runs in autocommit
        // mode by default: without an explicit transaction wrapping the
        // whole file, an earlier statement that already succeeded stays
        // committed even though a later statement in the same exec() call
        // throws. This is the exact gap withTransaction exists to close, and
        // the "0002_broken.sql leaves no trace" test above can't catch it —
        // that fixture fails at SQL *parse* time, before anything executes.
        // This fixture fails at *runtime* (duplicate CREATE TABLE), after
        // its first statement already ran.
        const fixtures = copyFixtures(PARTIAL_FIXTURES_DIR);
        fixturesCleanup = fixtures.cleanup;
        const fixturesDir = fixtures.dir;
        const dir = mkdtempSync(join(tmpdir(), 'ensemble-v2-api-partial-db-'));
        const dbPath = join(dir, 'db.sqlite');
        const db = openDatabase(dbPath);

        try {
            expect(() => runMigrations(db, fixturesDir)).toThrow();

            // The first CREATE TABLE succeeded before the second one threw —
            // without transaction wrapping it would still be committed here.
            const tables = db
                .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
                .all() as unknown as { name: string }[];
            expect(tables.map((t) => t.name)).not.toContain('partial_check');

            const migrationRows = db.prepare('SELECT filename FROM _migrations').all();
            expect(migrationRows).toEqual([]);

            // Fix the file down to one statement and prove it's re-runnable.
            writeFileSync(
                join(fixturesDir, '0001_partial.sql'),
                'CREATE TABLE partial_check (id TEXT PRIMARY KEY);\n',
            );
            const retry = runMigrations(db, fixturesDir);
            expect(retry.applied).toEqual(['0001_partial.sql']);
        } finally {
            db.close();
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('applies migrations in filename-sorted order even when the directory listing is unsorted', () => {
        const fixtures = copyFixtures(HAPPY_FIXTURES_DIR);
        fixturesCleanup = fixtures.cleanup;
        const fixturesDir = fixtures.dir;
        const dir = mkdtempSync(join(tmpdir(), 'ensemble-v2-api-order-db-'));
        const dbPath = join(dir, 'db.sqlite');
        const db = openDatabase(dbPath);

        try {
            // 0002_b.sql references widgets (created by 0001_a.sql) via a foreign
            // key, so if the runner ever applied files out of order this would
            // fail with "no such table: widgets" instead of succeeding.
            const result = runMigrations(db, fixturesDir);
            expect(result.applied).toEqual(['0001_a.sql', '0002_b.sql']);
        } finally {
            db.close();
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
