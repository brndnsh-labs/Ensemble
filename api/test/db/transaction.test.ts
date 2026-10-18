import { afterEach, describe, expect, it } from 'vitest';
import { withTransaction } from '../../src/db/transaction.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

describe('withTransaction', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('commits and returns the callback result on success', () => {
        testDb = createTestDatabase();
        const { db } = testDb;

        const result = withTransaction(db, () => {
            db.exec("INSERT INTO accounts (id, created_at) VALUES ('acc-1', 1000)");
            return 'committed';
        });

        expect(result).toBe('committed');
        const row = db.prepare('SELECT id FROM accounts WHERE id = ?').get('acc-1');
        expect(row).toBeTruthy();
    });

    it('rolls back every statement in the callback when it throws, not just the last one', () => {
        testDb = createTestDatabase();
        const { db } = testDb;

        // Seed a baseline row outside the transaction under test.
        withTransaction(db, () => {
            db.exec("INSERT INTO accounts (id, created_at) VALUES ('acc-seed', 1000)");
        });

        expect(() =>
            withTransaction(db, () => {
                // Two writes before the throw — both must roll back, proving this
                // isn't just "the last statement didn't happen."
                db.exec("INSERT INTO accounts (id, created_at) VALUES ('acc-2', 2000)");
                db.exec("INSERT INTO accounts (id, created_at) VALUES ('acc-3', 3000)");
                throw new Error('simulated failure mid-transaction');
            }),
        ).toThrow('simulated failure mid-transaction');

        const count = db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as unknown as {
            n: number;
        };
        // Only the pre-existing seed row survives; neither acc-2 nor acc-3 landed.
        expect(count.n).toBe(1);
        expect(db.prepare('SELECT id FROM accounts WHERE id = ?').get('acc-2')).toBeUndefined();
        expect(db.prepare('SELECT id FROM accounts WHERE id = ?').get('acc-3')).toBeUndefined();
    });

    it('leaves the handle usable for a subsequent transaction after a rollback', () => {
        testDb = createTestDatabase();
        const { db } = testDb;

        expect(() =>
            withTransaction(db, () => {
                db.exec("INSERT INTO accounts (id, created_at) VALUES ('acc-x', 1)");
                throw new Error('boom');
            }),
        ).toThrow('boom');

        // A leaked open transaction would make this next BEGIN throw
        // "cannot start a transaction within a transaction" — proving the
        // rollback actually closed the transaction rather than leaving it open.
        const result = withTransaction(db, () => {
            db.exec("INSERT INTO accounts (id, created_at) VALUES ('acc-y', 2)");
            return 'ok';
        });

        expect(result).toBe('ok');
        expect(db.prepare('SELECT id FROM accounts WHERE id = ?').get('acc-y')).toBeTruthy();
    });

    it('rethrows the original error object, not a wrapped one', () => {
        testDb = createTestDatabase();
        const { db } = testDb;
        class CustomError extends Error {}

        expect(() =>
            withTransaction(db, () => {
                throw new CustomError('specific failure');
            }),
        ).toThrow(CustomError);
    });
});
