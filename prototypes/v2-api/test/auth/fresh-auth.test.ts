import { afterEach, describe, expect, it } from 'vitest';
import { FRESH_AUTH_WINDOW_MS, isFreshlyAuthenticated } from '../../src/auth/fresh-auth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

/**
 * Unit tests for the ONE "freshly authenticated" predicate (#1190 decision 2). Every clause is
 * tested independently so a mutant dropping any single one of the five `AND`-ed conditions is
 * caught here, close to the source, rather than only surfacing as a confusing HTTP-level
 * failure. `db.exec`/raw `INSERT`s are used throughout instead of `issueSession`/real ceremonies
 * so each test can construct the EXACT row shape (including deliberately invalid ones, like a
 * `credential_id` pointing nowhere) the clause under test needs.
 */

function insertAccount(testDb: TestDatabase, id: string): void {
    testDb.db.prepare('INSERT INTO accounts (id, created_at) VALUES (?, ?)').run(id, 0);
}

function insertCredential(testDb: TestDatabase, id: string, accountId: string): void {
    testDb.db
        .prepare(
            'INSERT INTO credentials (id, account_id, public_key, sign_count, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(id, accountId, Buffer.from('x'), 0, 0);
}

interface SessionRowInput {
    id: string;
    accountId: string;
    createdAt: number;
    expiresAt: number;
    revokedAt: number | null;
    credentialId: string | null;
}

function insertSession(testDb: TestDatabase, row: SessionRowInput): void {
    testDb.db
        .prepare(
            `INSERT INTO sessions
                (id, account_id, created_at, expires_at, revoked_at, token_hash, credential_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
            row.id,
            row.accountId,
            row.createdAt,
            row.expiresAt,
            row.revokedAt,
            `hash-${row.id}`,
            row.credentialId,
        );
}

describe('isFreshlyAuthenticated', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('FRESH_AUTH_WINDOW_MS is exactly 10 minutes (decision 2)', () => {
        expect(FRESH_AUTH_WINDOW_MS).toBe(10 * 60 * 1000);
    });

    it('a brand-new passkey-created session is fresh', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        insertCredential(testDb, 'cred-1', 'acc-1');
        const now = 1_000_000;
        insertSession(testDb, {
            id: 's1',
            accountId: 'acc-1',
            createdAt: now,
            expiresAt: now + 30 * 24 * 60 * 60 * 1000,
            revokedAt: null,
            credentialId: 'cred-1',
        });

        expect(isFreshlyAuthenticated(testDb.db, 's1', 'acc-1', now)).toBe(true);
    });

    it('clause: wrong account_id fails, even for a session that is otherwise fresh (mutation target)', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        insertAccount(testDb, 'acc-2');
        insertCredential(testDb, 'cred-1', 'acc-1');
        const now = 1_000_000;
        insertSession(testDb, {
            id: 's1',
            accountId: 'acc-1',
            createdAt: now,
            expiresAt: now + 1000,
            revokedAt: null,
            credentialId: 'cred-1',
        });

        expect(isFreshlyAuthenticated(testDb.db, 's1', 'acc-2', now)).toBe(false);
        expect(isFreshlyAuthenticated(testDb.db, 's1', 'acc-1', now)).toBe(true);
    });

    it('clause: revoked_at IS NOT NULL fails even a brand-new session (mutation target)', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        insertCredential(testDb, 'cred-1', 'acc-1');
        const now = 1_000_000;
        insertSession(testDb, {
            id: 's1',
            accountId: 'acc-1',
            createdAt: now,
            expiresAt: now + 1000,
            revokedAt: now, // revoked the instant it was created
            credentialId: 'cred-1',
        });

        expect(isFreshlyAuthenticated(testDb.db, 's1', 'acc-1', now)).toBe(false);
    });

    it('clause: expires_at > now fails an expired session even inside the freshness window (mutation target)', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        insertCredential(testDb, 'cred-1', 'acc-1');
        const now = 1_000_000;
        insertSession(testDb, {
            id: 's1',
            accountId: 'acc-1',
            createdAt: now - 100,
            expiresAt: now - 1, // already expired, but created only 100ms ago
            revokedAt: null,
            credentialId: 'cred-1',
        });

        expect(isFreshlyAuthenticated(testDb.db, 's1', 'acc-1', now)).toBe(false);
    });

    it('clause: credential_id IS NULL is never fresh, even brand new (mutation target — #1191 recovery-session fail-safe)', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        const now = 1_000_000;
        insertSession(testDb, {
            id: 's1',
            accountId: 'acc-1',
            createdAt: now,
            expiresAt: now + 1000,
            revokedAt: null,
            credentialId: null,
        });

        expect(isFreshlyAuthenticated(testDb.db, 's1', 'acc-1', now)).toBe(false);
    });

    it('window boundary: created exactly FRESH_AUTH_WINDOW_MS ago is fresh (>=, not >) (mutation target)', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        insertCredential(testDb, 'cred-1', 'acc-1');
        const now = 10_000_000;
        insertSession(testDb, {
            id: 's1',
            accountId: 'acc-1',
            createdAt: now - FRESH_AUTH_WINDOW_MS,
            expiresAt: now + 1000,
            revokedAt: null,
            credentialId: 'cred-1',
        });

        expect(isFreshlyAuthenticated(testDb.db, 's1', 'acc-1', now)).toBe(true);
    });

    it('window boundary: created one millisecond before the window is NOT fresh (mutation target)', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        insertCredential(testDb, 'cred-1', 'acc-1');
        const now = 10_000_000;
        insertSession(testDb, {
            id: 's1',
            accountId: 'acc-1',
            createdAt: now - FRESH_AUTH_WINDOW_MS - 1,
            expiresAt: now + 1000,
            revokedAt: null,
            credentialId: 'cred-1',
        });

        expect(isFreshlyAuthenticated(testDb.db, 's1', 'acc-1', now)).toBe(false);
    });

    it('a nonexistent session id is not fresh', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        const now = 1_000_000;

        expect(isFreshlyAuthenticated(testDb.db, 'no-such-session', 'acc-1', now)).toBe(false);
    });
});
