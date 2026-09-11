import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
    issueSession,
    readSession,
    revokeOtherSessions,
    revokeSession,
    SESSION_TTL_MS,
} from '../../src/auth/session.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

interface RawSessionRow {
    id: string;
    account_id: string;
    created_at: number;
    expires_at: number;
    revoked_at: number | null;
    token_hash: string;
}

function insertAccount(testDb: TestDatabase, id: string, createdAt = 0): void {
    testDb.db.prepare('INSERT INTO accounts (id, created_at) VALUES (?, ?)').run(id, createdAt);
}

function rawSessionRow(testDb: TestDatabase, sessionId: string): RawSessionRow {
    return testDb.db
        .prepare('SELECT * FROM sessions WHERE id = ?')
        .get(sessionId) as unknown as RawSessionRow;
}

function totalChanges(testDb: TestDatabase): number {
    return (testDb.db.prepare('SELECT total_changes() AS n').get() as unknown as { n: number }).n;
}

describe('session lifetime', () => {
    it('SESSION_TTL_MS is exactly 30 days, absolute (decision 2)', () => {
        expect(SESSION_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    });
});

describe('issueSession', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('stores only the SHA-256 hash of the token, never the raw token (acceptance)', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        const now = 1_000_000;

        const { token, sessionId, expiresAt } = issueSession(testDb.db, 'acc-1', now);

        const row = rawSessionRow(testDb, sessionId);
        expect(row.token_hash).toBe(createHash('sha256').update(token, 'utf8').digest('hex'));
        // The stored row has no column at all holding the raw token — every text-valued column
        // on the row must differ from it.
        expect(row.token_hash).not.toBe(token);
        expect(row.id).not.toBe(token);
        expect(expiresAt - now).toBe(SESSION_TTL_MS);
        expect(row.expires_at).toBe(expiresAt);
        expect(row.account_id).toBe('acc-1');
        expect(row.revoked_at).toBeNull();
    });

    it('mints a session resolvable by readSession with the returned token', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        const now = 1_000_000;

        const issued = issueSession(testDb.db, 'acc-1', now);
        const claims = readSession(testDb.db, issued.token, now);

        expect(claims).toEqual({
            sessionId: issued.sessionId,
            accountId: 'acc-1',
            expiresAt: issued.expiresAt,
            // #1190: not passed to this 3-argument issueSession call, so defaults to null.
            credentialId: null,
        });
    });

    it('records credentialId when passed, and readSession returns it (#1190 decision 7)', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        testDb.db
            .prepare(
                'INSERT INTO credentials (id, account_id, public_key, sign_count, created_at) VALUES (?, ?, ?, ?, ?)',
            )
            .run('cred-1', 'acc-1', Buffer.from('x'), 0, 0);
        const now = 1_000_000;

        const issued = issueSession(testDb.db, 'acc-1', now, SESSION_TTL_MS, 'cred-1');
        const row = rawSessionRow(testDb, issued.sessionId) as RawSessionRow & {
            credential_id: string | null;
        };
        expect(row.credential_id).toBe('cred-1');

        const claims = readSession(testDb.db, issued.token, now);
        expect(claims?.credentialId).toBe('cred-1');
    });

    it('issues a distinct token and sessionId on every call', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        const now = 1_000_000;

        const a = issueSession(testDb.db, 'acc-1', now);
        const b = issueSession(testDb.db, 'acc-1', now);

        expect(a.token).not.toBe(b.token);
        expect(a.sessionId).not.toBe(b.sessionId);
    });

    it('opportunistically sweeps sessions past expires_at, leaving live ones', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        const now = 1_000_000;
        const expired = issueSession(testDb.db, 'acc-1', now - SESSION_TTL_MS - 1);
        const live = issueSession(testDb.db, 'acc-1', now);

        // A third call at `now` triggers the sweep at its top, before minting its own row.
        issueSession(testDb.db, 'acc-1', now);

        expect(rawSessionRow(testDb, expired.sessionId)).toBeUndefined();
        expect(rawSessionRow(testDb, live.sessionId)).toBeDefined();
    });
});

describe('readSession', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('performs zero database writes (acceptance: SELECT total_changes() unchanged)', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        const now = 1_000_000;
        const { token } = issueSession(testDb.db, 'acc-1', now);

        const before = totalChanges(testDb);
        readSession(testDb.db, token, now);
        const after = totalChanges(testDb);

        expect(after).toBe(before);
    });

    it('performs zero writes on a miss too (unknown token)', () => {
        testDb = createTestDatabase();
        const before = totalChanges(testDb);
        readSession(testDb.db, 'x'.repeat(43), 1_000_000);
        const after = totalChanges(testDb);

        expect(after).toBe(before);
    });

    it('rejects a non-string token before hashing', () => {
        testDb = createTestDatabase();
        // `token` is typed `unknown` specifically so untrusted-input shapes like these are
        // ordinary calls to test, not type errors to suppress.
        expect(readSession(testDb.db, 12345, 1_000_000)).toBeNull();
        expect(readSession(testDb.db, null, 1_000_000)).toBeNull();
        expect(readSession(testDb.db, undefined, 1_000_000)).toBeNull();
    });

    it('rejects a wrong-length token before hashing', () => {
        testDb = createTestDatabase();
        expect(readSession(testDb.db, 'too-short', 1_000_000)).toBeNull();
        expect(readSession(testDb.db, 'x'.repeat(44), 1_000_000)).toBeNull();
        expect(readSession(testDb.db, '', 1_000_000)).toBeNull();
    });

    it('returns null for an unknown (never-issued) token of the right length', () => {
        testDb = createTestDatabase();
        expect(readSession(testDb.db, 'a'.repeat(43), 1_000_000)).toBeNull();
    });

    it('an expired session is rejected (uses injected now, not the wall clock)', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        const issuedAt = 1_000_000;
        const { token, expiresAt } = issueSession(testDb.db, 'acc-1', issuedAt);

        expect(readSession(testDb.db, token, expiresAt - 1)).not.toBeNull();
        expect(readSession(testDb.db, token, expiresAt)).toBeNull();
        expect(readSession(testDb.db, token, expiresAt + 1)).toBeNull();
    });

    it('a revoked session is rejected on the very next request', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        const now = 1_000_000;
        const { token, sessionId } = issueSession(testDb.db, 'acc-1', now);
        expect(readSession(testDb.db, token, now)).not.toBeNull();

        revokeSession(testDb.db, sessionId, 'acc-1', now);

        expect(readSession(testDb.db, token, now)).toBeNull();
    });
});

describe('revokeSession', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('is owner-scoped: cross-account revocation changes nothing', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        insertAccount(testDb, 'acc-2');
        const now = 1_000_000;
        const { token, sessionId } = issueSession(testDb.db, 'acc-1', now);

        revokeSession(testDb.db, sessionId, 'acc-2', now);

        expect(readSession(testDb.db, token, now)).not.toBeNull();
        expect(rawSessionRow(testDb, sessionId).revoked_at).toBeNull();
    });

    it('revoking one session leaves the account other sessions working', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        const now = 1_000_000;
        const a = issueSession(testDb.db, 'acc-1', now);
        const b = issueSession(testDb.db, 'acc-1', now);

        revokeSession(testDb.db, a.sessionId, 'acc-1', now);

        expect(readSession(testDb.db, a.token, now)).toBeNull();
        expect(readSession(testDb.db, b.token, now)).not.toBeNull();
    });

    it('is idempotent: revoking an already-revoked session is a silent no-op', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        const now = 1_000_000;
        const { sessionId } = issueSession(testDb.db, 'acc-1', now);

        expect(() => {
            revokeSession(testDb.db, sessionId, 'acc-1', now);
            revokeSession(testDb.db, sessionId, 'acc-1', now + 1);
        }).not.toThrow();
        // The first revocation's timestamp wins — a later idempotent call does not overwrite it.
        expect(rawSessionRow(testDb, sessionId).revoked_at).toBe(now);
    });

    it('revoking an unknown session id is a silent no-op', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        expect(() => revokeSession(testDb.db, 'does-not-exist', 'acc-1', 1_000_000)).not.toThrow();
    });
});

describe('revokeOtherSessions', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('leaves exactly the current session alive and returns the count revoked', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        const now = 1_000_000;
        const keep = issueSession(testDb.db, 'acc-1', now);
        const other1 = issueSession(testDb.db, 'acc-1', now);
        const other2 = issueSession(testDb.db, 'acc-1', now);

        const revokedCount = revokeOtherSessions(testDb.db, 'acc-1', keep.sessionId, now);

        expect(revokedCount).toBe(2);
        expect(readSession(testDb.db, keep.token, now)).not.toBeNull();
        expect(readSession(testDb.db, other1.token, now)).toBeNull();
        expect(readSession(testDb.db, other2.token, now)).toBeNull();
    });

    it('does not touch another account sessions', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        insertAccount(testDb, 'acc-2');
        const now = 1_000_000;
        const keep = issueSession(testDb.db, 'acc-1', now);
        const otherAccount = issueSession(testDb.db, 'acc-2', now);

        revokeOtherSessions(testDb.db, 'acc-1', keep.sessionId, now);

        expect(readSession(testDb.db, otherAccount.token, now)).not.toBeNull();
    });

    it('returns 0 and changes nothing when there are no other sessions', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        const now = 1_000_000;
        const keep = issueSession(testDb.db, 'acc-1', now);

        expect(revokeOtherSessions(testDb.db, 'acc-1', keep.sessionId, now)).toBe(0);
        expect(readSession(testDb.db, keep.token, now)).not.toBeNull();
    });

    it('already-revoked other sessions are not double-counted', () => {
        testDb = createTestDatabase();
        insertAccount(testDb, 'acc-1');
        const now = 1_000_000;
        const keep = issueSession(testDb.db, 'acc-1', now);
        const other = issueSession(testDb.db, 'acc-1', now);
        revokeSession(testDb.db, other.sessionId, 'acc-1', now);

        expect(revokeOtherSessions(testDb.db, 'acc-1', keep.sessionId, now)).toBe(0);
    });
});
