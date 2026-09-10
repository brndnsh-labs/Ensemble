import { afterEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

describe('schema (migrations/0001_init.sql)', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('creates an explicit index on every foreign-key-shaped column used in a WHERE', () => {
        testDb = createTestDatabase();
        const indexes = testDb.db
            .prepare("SELECT name, tbl_name FROM sqlite_master WHERE type = 'index'")
            .all() as unknown as { name: string; tbl_name: string }[];
        const indexNames = indexes.map((i) => i.name);

        expect(indexNames).toContain('idx_credentials_account_id');
        expect(indexNames).toContain('idx_challenges_account_id');
        expect(indexNames).toContain('idx_sessions_account_id');
        expect(indexNames).toContain('idx_recovery_codes_account_id');
    });

    it('rows come back null-prototype, not plain objects (node:sqlite behavior, not a mock)', () => {
        testDb = createTestDatabase();
        testDb.db.exec("INSERT INTO accounts (id, created_at) VALUES ('acc-1', 1000)");
        const row = testDb.db.prepare('SELECT * FROM accounts WHERE id = ?').get('acc-1');

        expect(row).toBeDefined();
        expect(Object.getPrototypeOf(row)).toBeNull();
        // The exact footgun CLAUDE.md documents for null-prototype lookup tables,
        // arriving here from row shape instead: this must NOT pass.
        expect((row as { constructor?: unknown }).constructor).toBeUndefined();
    });

    it('allows a challenge row with a null account_id (predates any account, and has no FK to violate)', () => {
        testDb = createTestDatabase();
        expect(() =>
            testDb.db.exec(
                'INSERT INTO challenges (id, account_id, challenge, type, created_at, expires_at) ' +
                    "VALUES ('challenge-1', NULL, 'nonce', 'registration', 1000, 2000)",
            ),
        ).not.toThrow();

        const row = testDb.db
            .prepare('SELECT account_id FROM challenges WHERE id = ?')
            .get('challenge-1');
        expect((row as { account_id: unknown }).account_id).toBeNull();
    });

    it('enforces the account_id foreign key on credentials (foreign_keys=ON is not just reported, it is live)', () => {
        testDb = createTestDatabase();
        expect(() =>
            testDb.db.exec(
                'INSERT INTO credentials (id, account_id, public_key, sign_count, created_at) ' +
                    "VALUES ('cred-1', 'does-not-exist', x'00', 0, 1000)",
            ),
        ).toThrow();
    });

    it('accepts a credential once its owning account exists', () => {
        testDb = createTestDatabase();
        testDb.db.exec("INSERT INTO accounts (id, created_at) VALUES ('acc-1', 1000)");
        expect(() =>
            testDb.db.exec(
                'INSERT INTO credentials (id, account_id, public_key, sign_count, created_at) ' +
                    "VALUES ('cred-1', 'acc-1', x'00', 0, 1000)",
            ),
        ).not.toThrow();
    });
});
