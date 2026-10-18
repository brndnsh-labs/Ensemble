import { afterEach, describe, expect, it } from 'vitest';
import {
    decodeTransports,
    encodeTransports,
    isDuplicateCredentialIdError,
} from '../../src/auth/credential-row.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

describe('encodeTransports (transports allowlist and dedupe)', () => {
    it('keeps only values from the spec AuthenticatorTransport enum', () => {
        const stored = encodeTransports(['internal', 'bogus-transport', 'usb', '']);
        expect(JSON.parse(stored)).toEqual(['internal', 'usb']);
    });

    it('dedupes repeated values', () => {
        const stored = encodeTransports(['usb', 'usb', 'internal', 'usb']);
        expect(JSON.parse(stored)).toEqual(['usb', 'internal']);
    });

    it('stores all 7 spec values when every one is reported', () => {
        const stored = encodeTransports([
            'ble',
            'cable',
            'hybrid',
            'internal',
            'nfc',
            'smart-card',
            'usb',
        ]);
        expect(JSON.parse(stored)).toHaveLength(7);
    });

    it('stores at most 7 entries from a 5000-element adversarial array', () => {
        const huge = Array.from({ length: 5000 }, (_, i) => (i % 2 === 0 ? 'usb' : 'internal'));
        const stored = encodeTransports(huge);
        const parsed = JSON.parse(stored);
        expect(parsed.length).toBeLessThanOrEqual(7);
        expect(new Set(parsed).size).toBe(parsed.length);
        expect(stored.length).toBeLessThan(200);
    });

    it('stores an empty array for a non-array value instead of throwing', () => {
        for (const value of ['usb', {}, 7, true, null]) {
            expect(encodeTransports(value), JSON.stringify(value)).toBe('[]');
        }
    });

    it('drops non-string entries inside an array', () => {
        expect(JSON.parse(encodeTransports(['usb', 5, null, {}, 'internal']))).toEqual([
            'usb',
            'internal',
        ]);
    });

    it('stores an empty array for undefined or all-invalid input', () => {
        expect(encodeTransports(undefined)).toBe('[]');
        expect(encodeTransports(['not-real', 'also-not-real'])).toBe('[]');
    });

    it('round-trips through decodeTransports', () => {
        const stored = encodeTransports(['usb', 'internal']);
        expect(decodeTransports(stored)).toEqual(['usb', 'internal']);
    });
});

describe('isDuplicateCredentialIdError', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    function makeSqliteError(message: string, errcode: number): Error {
        const error = new Error(message) as Error & { code: string; errcode: number };
        error.code = 'ERR_SQLITE_ERROR';
        error.errcode = errcode;
        return error;
    }

    it('is true for the exact credentials.id primary-key collision shape', () => {
        expect(
            isDuplicateCredentialIdError(
                makeSqliteError('UNIQUE constraint failed: credentials.id', 1555),
            ),
        ).toBe(true);
    });

    it('is false for an accounts.id collision sharing the same errcode', () => {
        expect(
            isDuplicateCredentialIdError(
                makeSqliteError('UNIQUE constraint failed: accounts.id', 1555),
            ),
        ).toBe(false);
    });

    it('is false for a non-Error value', () => {
        expect(isDuplicateCredentialIdError('not an error')).toBe(false);
        expect(isDuplicateCredentialIdError(null)).toBe(false);
        expect(isDuplicateCredentialIdError(undefined)).toBe(false);
    });

    it('is false for an unrelated ERR_SQLITE_ERROR with a different errcode', () => {
        expect(
            isDuplicateCredentialIdError(
                makeSqliteError('NOT NULL constraint failed: credentials.public_key', 1299),
            ),
        ).toBe(false);
        expect(
            isDuplicateCredentialIdError(makeSqliteError('FOREIGN KEY constraint failed', 787)),
        ).toBe(false);
    });

    it('propagates a real NOT NULL violation from node:sqlite rather than mapping it to credential_exists', () => {
        testDb = createTestDatabase();
        testDb.db.exec("INSERT INTO accounts (id, created_at) VALUES ('acc-1', 1000)");
        let caught: unknown;
        try {
            // public_key is NOT NULL; omitting it triggers a real NOT NULL constraint error.
            testDb.db
                .prepare(
                    'INSERT INTO credentials (id, account_id, sign_count, created_at) VALUES (?, ?, ?, ?)',
                )
                .run('cred-1', 'acc-1', 0, 1000);
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(Error);
        expect(isDuplicateCredentialIdError(caught)).toBe(false);
    });

    it('propagates a real FOREIGN KEY violation from node:sqlite rather than mapping it to credential_exists', () => {
        testDb = createTestDatabase();
        let caught: unknown;
        try {
            testDb.db
                .prepare(
                    'INSERT INTO credentials (id, account_id, public_key, sign_count, created_at) VALUES (?, ?, ?, ?, ?)',
                )
                .run('cred-1', 'does-not-exist', Buffer.from('x'), 0, 1000);
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(Error);
        expect(isDuplicateCredentialIdError(caught)).toBe(false);
    });

    it('is true for a real credentials.id primary-key collision from node:sqlite', () => {
        testDb = createTestDatabase();
        testDb.db.exec("INSERT INTO accounts (id, created_at) VALUES ('acc-1', 1000)");
        testDb.db
            .prepare(
                'INSERT INTO credentials (id, account_id, public_key, sign_count, created_at) VALUES (?, ?, ?, ?, ?)',
            )
            .run('cred-1', 'acc-1', Buffer.from('x'), 0, 1000);
        let caught: unknown;
        try {
            testDb.db
                .prepare(
                    'INSERT INTO credentials (id, account_id, public_key, sign_count, created_at) VALUES (?, ?, ?, ?, ?)',
                )
                .run('cred-1', 'acc-1', Buffer.from('y'), 0, 2000);
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(Error);
        expect(isDuplicateCredentialIdError(caught)).toBe(true);
    });
});
