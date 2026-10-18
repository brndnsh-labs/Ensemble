import { afterEach, describe, expect, it } from 'vitest';
import { hasEnrolledRecoveryMaterial } from '../../src/auth/recovery-material.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

function insertAccount(testDb: TestDatabase, id: string): void {
    testDb.db.prepare('INSERT INTO accounts (id, created_at) VALUES (?, ?)').run(id, 0);
}

function insertRecoveryCode(
    testDb: TestDatabase,
    id: string,
    accountId: string,
    consumedAt: number | null,
    // #1191 decision 5: hasEnrolledRecoveryMaterial now ALSO requires confirmed_at IS NOT NULL —
    // every pre-existing "usable material" case in this file must confirm its row explicitly, or
    // it would exercise the NEW confirmed-gate instead of the thing it's actually testing.
    confirmedAt: number | null = 0,
): void {
    testDb.db
        .prepare(
            'INSERT INTO recovery_codes (id, account_id, code_hash, created_at, consumed_at, confirmed_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(id, accountId, `hash-${id}`, 0, consumedAt, confirmedAt);
}

describe('hasEnrolledRecoveryMaterial', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('false when the account has no recovery_codes rows at all', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');

        expect(hasEnrolledRecoveryMaterial(testDb.db, 'acc-1')).toBe(false);
    });

    it('true when at least one unconsumed, CONFIRMED row exists', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        insertRecoveryCode(testDb, 'code-1', 'acc-1', null);

        expect(hasEnrolledRecoveryMaterial(testDb.db, 'acc-1')).toBe(true);
    });

    it('false when every row for the account is consumed (mutation target: consumed_at IS NULL dropped)', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        insertRecoveryCode(testDb, 'code-1', 'acc-1', 5000);

        expect(hasEnrolledRecoveryMaterial(testDb.db, 'acc-1')).toBe(false);
    });

    it('false when the only unconsumed row is UNCONFIRMED (#1191 decision 5, mutation target 4: confirmed_at IS NOT NULL dropped)', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        // Unconsumed, but never confirmed — enrollment was started and abandoned before the
        // account holder proved they kept the code.
        insertRecoveryCode(testDb, 'code-1', 'acc-1', null, null);

        expect(hasEnrolledRecoveryMaterial(testDb.db, 'acc-1')).toBe(false);
    });

    it('true when at least one of several rows is unconsumed and confirmed, even if others are spent or unconfirmed', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        insertRecoveryCode(testDb, 'code-1', 'acc-1', 5000);
        insertRecoveryCode(testDb, 'code-2', 'acc-1', null, null); // unconfirmed, doesn't count
        insertRecoveryCode(testDb, 'code-3', 'acc-1', null); // confirmed (default), counts

        expect(hasEnrolledRecoveryMaterial(testDb.db, 'acc-1')).toBe(true);
    });

    it('does not see another account unconsumed codes (account scope)', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        insertAccount(testDb, 'acc-2');
        insertRecoveryCode(testDb, 'code-1', 'acc-2', null);

        expect(hasEnrolledRecoveryMaterial(testDb.db, 'acc-1')).toBe(false);
        expect(hasEnrolledRecoveryMaterial(testDb.db, 'acc-2')).toBe(true);
    });
});
