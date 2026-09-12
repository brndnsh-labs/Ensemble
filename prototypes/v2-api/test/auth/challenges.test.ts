import { afterEach, describe, expect, it } from 'vitest';
import {
    CHALLENGE_TTL_MS,
    generateCeremonyToken,
    insertChallenge,
    sweepExpiredChallenges,
} from '../../src/auth/challenges.js';
import { createWebAuthnConfig, type WebAuthnConfig } from '../../src/auth/config.js';
import { startLogin } from '../../src/auth/login.js';
import { startRegistration } from '../../src/auth/registration.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

const CONFIG: WebAuthnConfig = createWebAuthnConfig({
    rpId: 'localhost',
    rpName: 'Ensemble Test',
    origin: 'http://localhost:5173',
});

interface ChallengeCountRow {
    id: string;
}

describe('challenge TTL and expiry sweep (P2-5)', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('CHALLENGE_TTL_MS is exactly 5 minutes', () => {
        expect(CHALLENGE_TTL_MS).toBe(300_000);
    });

    it('startRegistration mints a challenge with an exact 5-minute TTL', async () => {
        testDb = createTestDatabase();
        const before = Date.now();
        await startRegistration(testDb.db, CONFIG);
        const after = Date.now();

        const row = testDb.db
            .prepare(
                'SELECT created_at, expires_at FROM challenges ORDER BY created_at DESC LIMIT 1',
            )
            .get() as unknown as { created_at: number; expires_at: number };
        expect(row.expires_at - row.created_at).toBe(300_000);
        expect(row.created_at).toBeGreaterThanOrEqual(before);
        expect(row.created_at).toBeLessThanOrEqual(after);
    });

    it('startLogin mints a challenge with an exact 5-minute TTL', async () => {
        testDb = createTestDatabase();
        await startLogin(testDb.db, CONFIG);

        const row = testDb.db
            .prepare(
                'SELECT created_at, expires_at FROM challenges ORDER BY created_at DESC LIMIT 1',
            )
            .get() as unknown as { created_at: number; expires_at: number };
        expect(row.expires_at - row.created_at).toBe(300_000);
    });

    it('sweepExpiredChallenges deletes only rows past their expiry, leaving live ones', () => {
        testDb = createTestDatabase();
        const now = 1_000_000;
        const expired = generateCeremonyToken();
        const live = generateCeremonyToken();
        insertChallenge(testDb.db, {
            id: 'expired-row',
            accountId: null,
            sessionId: null,
            challenge: 'c1',
            type: 'login',
            createdAt: now - 10,
            expiresAt: now - 1,
            ceremonyHash: expired.hash,
        });
        insertChallenge(testDb.db, {
            id: 'live-row',
            accountId: null,
            sessionId: null,
            challenge: 'c2',
            type: 'login',
            createdAt: now,
            expiresAt: now + 300_000,
            ceremonyHash: live.hash,
        });

        sweepExpiredChallenges(testDb.db, now);

        const remaining = testDb.db
            .prepare('SELECT id FROM challenges')
            .all() as unknown as ChallengeCountRow[];
        expect(remaining.map((r) => r.id)).toEqual(['live-row']);
    });

    it('starting a registration ceremony sweeps an already-expired row out of the table', async () => {
        testDb = createTestDatabase();
        const now = Date.now();
        const { hash } = generateCeremonyToken();
        insertChallenge(testDb.db, {
            id: 'stale-expired-row',
            accountId: null,
            sessionId: null,
            challenge: 'stale',
            type: 'registration',
            createdAt: now - 1_000_000,
            expiresAt: now - 1,
            ceremonyHash: hash,
        });

        await startRegistration(testDb.db, CONFIG);

        const stale = testDb.db
            .prepare('SELECT id FROM challenges WHERE id = ?')
            .get('stale-expired-row');
        expect(stale).toBeUndefined();
    });

    it('starting a login ceremony sweeps an already-expired row out of the table', async () => {
        testDb = createTestDatabase();
        const now = Date.now();
        const { hash } = generateCeremonyToken();
        insertChallenge(testDb.db, {
            id: 'stale-expired-row',
            accountId: null,
            sessionId: null,
            challenge: 'stale',
            type: 'login',
            createdAt: now - 1_000_000,
            expiresAt: now - 1,
            ceremonyHash: hash,
        });

        await startLogin(testDb.db, CONFIG);

        const stale = testDb.db
            .prepare('SELECT id FROM challenges WHERE id = ?')
            .get('stale-expired-row');
        expect(stale).toBeUndefined();
    });
});
