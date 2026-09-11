import { afterEach, describe, expect, it } from 'vitest';
import { createWebAuthnConfig, type WebAuthnConfig } from '../../src/auth/config.js';
import {
    claimRecoveryCode,
    confirmRecoveryCode,
    enrollRecoveryCode,
    RECOVERY_SESSION_TTL_MS,
    readLiveRecoverySession,
    startRecoveryEnrollPasskey,
    verifyRecoveryEnrollPasskey,
} from '../../src/auth/recovery.js';
import { hasEnrolledRecoveryMaterial } from '../../src/auth/recovery-material.js';
import { startRegistration, verifyRegistration } from '../../src/auth/registration.js';
import { issueSession, readSession } from '../../src/auth/session.js';
import { createSoftAuthenticator, type SoftAuthenticator } from '../helpers/soft-authenticator.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

const CONFIG: WebAuthnConfig = createWebAuthnConfig({
    rpId: 'localhost',
    rpName: 'Ensemble Test',
    origin: 'http://localhost:5173',
});

async function registerFreshCredential(
    testDb: TestDatabase,
    authenticator: SoftAuthenticator,
): Promise<{ accountId: string; credentialId: string }> {
    const { options, ceremonyToken } = await startRegistration(testDb.db, CONFIG);
    const response = authenticator.register({ challenge: options.challenge });
    const result = await verifyRegistration(testDb.db, CONFIG, { ceremonyToken, response });
    if (!result.ok) {
        throw new Error(`setup registration failed: ${result.reason}`);
    }
    return { accountId: result.accountId, credentialId: result.credentialId };
}

/** Mints a fresh (passkey-created), STANDARD session directly, bypassing HTTP. */
function issueTestSession(
    testDb: TestDatabase,
    accountId: string,
    credentialId: string,
    now: number = Date.now(),
): string {
    return issueSession(testDb.db, accountId, now, undefined, credentialId).sessionId;
}

function rawRecoveryCodeRow(
    testDb: TestDatabase,
    recoveryCodeId: string,
): {
    id: string;
    account_id: string;
    code_hash: string;
    created_at: number;
    consumed_at: number | null;
    confirmed_at: number | null;
    claimed_at: number | null;
} {
    return testDb.db
        .prepare('SELECT * FROM recovery_codes WHERE id = ?')
        .get(recoveryCodeId) as unknown as {
        id: string;
        account_id: string;
        code_hash: string;
        created_at: number;
        consumed_at: number | null;
        confirmed_at: number | null;
        claimed_at: number | null;
    };
}

function credentialCount(testDb: TestDatabase, accountId: string): number {
    return (
        testDb.db
            .prepare('SELECT COUNT(*) AS n FROM credentials WHERE account_id = ?')
            .get(accountId) as unknown as { n: number }
    ).n;
}

/** Enrolls AND confirms a fresh recovery code for `accountId`, returning the raw code. */
function enrollAndConfirm(
    testDb: TestDatabase,
    accountId: string,
    sessionId: string,
    now: number,
): { code: string; recoveryCodeId: string } {
    const enrolled = enrollRecoveryCode(testDb.db, accountId, sessionId, now);
    if (!enrolled.ok) {
        throw new Error(`setup enroll failed: ${enrolled.reason}`);
    }
    const confirmed = confirmRecoveryCode(testDb.db, accountId, sessionId, enrolled.code, now);
    if (!confirmed.ok) {
        throw new Error(`setup confirm failed: ${confirmed.reason}`);
    }
    return { code: enrolled.code, recoveryCodeId: enrolled.recoveryCodeId };
}

/** Mints a live RECOVERY session directly, mirroring what `POST /api/auth/recovery/claim`'s HTTP
 * route does after a successful `claimRecoveryCode` — bypasses HTTP for a unit test that only
 * needs an already-resolved recovery `sessionId`. */
function issueRecoverySession(
    testDb: TestDatabase,
    accountId: string,
    recoveryCodeId: string,
    now: number,
): string {
    return issueSession(
        testDb.db,
        accountId,
        now,
        RECOVERY_SESSION_TTL_MS,
        null,
        'recovery',
        recoveryCodeId,
    ).sessionId;
}

describe('enrollRecoveryCode (#1191 decisions 1-3)', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('a stale (non-fresh) session is refused, no row is inserted', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const now = 10_000_000;
        const staleSessionId = issueTestSession(
            testDb,
            accountId,
            credentialId,
            now - 20 * 60 * 1000,
        );

        const result = enrollRecoveryCode(testDb.db, accountId, staleSessionId, now);
        expect(result).toEqual({ ok: false, reason: 'fresh_auth_required' });
        const row = testDb.db
            .prepare('SELECT COUNT(*) AS n FROM recovery_codes WHERE account_id = ?')
            .get(accountId) as unknown as { n: number };
        expect(row.n).toBe(0);
    });

    it('stores only a SHA-256 hash of the code — the raw code never appears in the row (acceptance: verifier not reversible)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);

        const result = enrollRecoveryCode(testDb.db, accountId, sessionId, Date.now());
        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        const row = rawRecoveryCodeRow(testDb, result.recoveryCodeId);
        // The raw code must not appear anywhere in the persisted row.
        expect(JSON.stringify(row)).not.toContain(result.code);
        expect(row.code_hash).not.toBe(result.code);
        expect(row.confirmed_at).toBeNull();
        expect(row.consumed_at).toBeNull();
        expect(row.claimed_at).toBeNull();
    });

    it('replaces a prior UNCONFIRMED row on re-enroll (retry path for an interrupted download)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);

        const first = enrollRecoveryCode(testDb.db, accountId, sessionId, Date.now());
        const second = enrollRecoveryCode(testDb.db, accountId, sessionId, Date.now());
        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        if (!first.ok || !second.ok) {
            return;
        }
        expect(second.recoveryCodeId).not.toBe(first.recoveryCodeId);
        expect(rawRecoveryCodeRow(testDb, first.recoveryCodeId)).toBeUndefined();
        const rows = testDb.db
            .prepare('SELECT COUNT(*) AS n FROM recovery_codes WHERE account_id = ?')
            .get(accountId) as unknown as { n: number };
        expect(rows.n).toBe(1);
    });

    it('replaces a prior CONFIRMED, unconsumed row on re-enroll (decision 3: rotation)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);
        const { recoveryCodeId: firstId } = enrollAndConfirm(
            testDb,
            accountId,
            sessionId,
            Date.now(),
        );
        expect(hasEnrolledRecoveryMaterial(testDb.db, accountId)).toBe(true);

        const second = enrollRecoveryCode(testDb.db, accountId, sessionId, Date.now());
        expect(second.ok).toBe(true);
        if (!second.ok) {
            return;
        }
        expect(rawRecoveryCodeRow(testDb, firstId)).toBeUndefined();
        // The rotated-out code is gone; the account is temporarily unprotected until the NEW
        // code is confirmed (disclosed trade-off, decision 3).
        expect(hasEnrolledRecoveryMaterial(testDb.db, accountId)).toBe(false);
    });

    it('does NOT touch a CONSUMED row on re-enroll — dead history is left alone', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);
        const { recoveryCodeId: consumedId } = enrollAndConfirm(
            testDb,
            accountId,
            sessionId,
            Date.now(),
        );
        testDb.db
            .prepare('UPDATE recovery_codes SET consumed_at = ? WHERE id = ?')
            .run(Date.now(), consumedId);

        const result = enrollRecoveryCode(testDb.db, accountId, sessionId, Date.now());
        expect(result.ok).toBe(true);
        // Both rows now present: the old consumed one, untouched, and the new unconfirmed one.
        const rows = testDb.db
            .prepare('SELECT id, consumed_at FROM recovery_codes WHERE account_id = ? ORDER BY id')
            .all(accountId) as unknown as { id: string; consumed_at: number | null }[];
        expect(rows).toHaveLength(2);
        const consumedRow = rows.find((r) => r.id === consumedId);
        expect(consumedRow?.consumed_at).not.toBeNull();
    });
});

describe('confirmRecoveryCode (#1191 decision 4)', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('a stale session is refused', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const now = 10_000_000;
        const freshSessionId = issueTestSession(testDb, accountId, credentialId, now);
        const enrolled = enrollRecoveryCode(testDb.db, accountId, freshSessionId, now);
        if (!enrolled.ok) {
            throw new Error('unexpected');
        }
        const staleSessionId = issueTestSession(
            testDb,
            accountId,
            credentialId,
            now - 20 * 60 * 1000,
        );

        const result = confirmRecoveryCode(
            testDb.db,
            accountId,
            staleSessionId,
            enrolled.code,
            now,
        );
        expect(result).toEqual({ ok: false, reason: 'fresh_auth_required' });
    });

    it('a matching code confirms; hasEnrolledRecoveryMaterial only flips to true AFTER confirmation (acceptance: not reported protected until confirmed)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);

        const enrolled = enrollRecoveryCode(testDb.db, accountId, sessionId, Date.now());
        if (!enrolled.ok) {
            throw new Error('unexpected');
        }
        expect(hasEnrolledRecoveryMaterial(testDb.db, accountId)).toBe(false);

        const result = confirmRecoveryCode(
            testDb.db,
            accountId,
            sessionId,
            enrolled.code,
            Date.now(),
        );
        expect(result).toEqual({ ok: true });
        expect(hasEnrolledRecoveryMaterial(testDb.db, accountId)).toBe(true);
    });

    it('a wrong code is not_found and does not confirm', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);
        enrollRecoveryCode(testDb.db, accountId, sessionId, Date.now());

        const result = confirmRecoveryCode(
            testDb.db,
            accountId,
            sessionId,
            'not-the-real-code',
            Date.now(),
        );
        expect(result).toEqual({ ok: false, reason: 'not_found' });
        expect(hasEnrolledRecoveryMaterial(testDb.db, accountId)).toBe(false);
    });

    it('no pending code at all is not_found', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);

        const result = confirmRecoveryCode(testDb.db, accountId, sessionId, 'anything', Date.now());
        expect(result).toEqual({ ok: false, reason: 'not_found' });
    });

    it('re-confirming an already-confirmed code is not_found (confirmed_at IS NULL required)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);
        const { code } = enrollAndConfirm(testDb, accountId, sessionId, Date.now());

        const result = confirmRecoveryCode(testDb.db, accountId, sessionId, code, Date.now());
        expect(result).toEqual({ ok: false, reason: 'not_found' });
    });

    it('never echoes the code in its result', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);
        const enrolled = enrollRecoveryCode(testDb.db, accountId, sessionId, Date.now());
        if (!enrolled.ok) {
            throw new Error('unexpected');
        }

        const result = confirmRecoveryCode(
            testDb.db,
            accountId,
            sessionId,
            enrolled.code,
            Date.now(),
        );
        expect(JSON.stringify(result)).not.toContain(enrolled.code);
    });
});

describe('claimRecoveryCode (#1191 decision 6)', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('an UNCONFIRMED code is not claimable (mutation target 3)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);
        const enrolled = enrollRecoveryCode(testDb.db, accountId, sessionId, Date.now());
        if (!enrolled.ok) {
            throw new Error('unexpected');
        }

        const result = claimRecoveryCode(testDb.db, enrolled.code, Date.now());
        expect(result).toEqual({ ok: false });
    });

    it('a confirmed, unclaimed code claims successfully', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);
        const { code, recoveryCodeId } = enrollAndConfirm(testDb, accountId, sessionId, Date.now());

        const result = claimRecoveryCode(testDb.db, code, Date.now());
        expect(result).toEqual({ ok: true, accountId, recoveryCodeId });
        const row = rawRecoveryCodeRow(testDb, recoveryCodeId);
        expect(row.claimed_at).not.toBeNull();
    });

    it('never echoes the code in its result', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);
        const { code } = enrollAndConfirm(testDb, accountId, sessionId, Date.now());

        const result = claimRecoveryCode(testDb.db, code, Date.now());
        expect(JSON.stringify(result)).not.toContain(code);
    });

    it('a wrong/unknown code returns { ok: false }, no distinct reason', async () => {
        testDb = createTestDatabase();
        const result = claimRecoveryCode(testDb.db, 'totally-unknown-code', Date.now());
        expect(result).toEqual({ ok: false });
        expect(Object.keys(result)).toEqual(['ok']);
    });

    it('a CONSUMED code cannot be claimed again (reuse rejected)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);
        const { code, recoveryCodeId } = enrollAndConfirm(testDb, accountId, sessionId, Date.now());
        testDb.db
            .prepare('UPDATE recovery_codes SET consumed_at = ? WHERE id = ?')
            .run(Date.now(), recoveryCodeId);

        const result = claimRecoveryCode(testDb.db, code, Date.now());
        expect(result).toEqual({ ok: false });
    });

    it('issues exactly ONE prepared statement (mutation target 5: a SELECT-then-UPDATE split is invisible to the same-tick concurrent-claim test below, since two SEQUENTIAL JS calls never interleave regardless of how many statements each one issues — this is the guard that actually pins the single-statement discipline)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);
        const { code } = enrollAndConfirm(testDb, accountId, sessionId, Date.now());

        const originalPrepare = testDb.db.prepare.bind(testDb.db);
        const statements: string[] = [];
        testDb.db.prepare = ((sql: string) => {
            statements.push(sql);
            return originalPrepare(sql);
        }) as typeof testDb.db.prepare;

        try {
            const result = claimRecoveryCode(testDb.db, code, Date.now());
            expect(result.ok).toBe(true);
        } finally {
            testDb.db.prepare = originalPrepare;
        }

        expect(statements).toHaveLength(1);
        expect(statements[0]).toMatch(/^\s*UPDATE recovery_codes\b/i);
        expect(statements[0]).toMatch(/RETURNING/i);
    });

    it('same-tick concurrent claim: two calls at the SAME now -> exactly one succeeds (decision 6)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);
        const { code } = enrollAndConfirm(testDb, accountId, sessionId, Date.now());
        const now = 5_000_000;

        // node:sqlite is synchronous and single-threaded — these two calls are sequential JS
        // statements, exactly mirroring the guarantee claimRecoveryCode's doc comment describes
        // for genuinely concurrent HTTP requests racing on the same code.
        const first = claimRecoveryCode(testDb.db, code, now);
        const second = claimRecoveryCode(testDb.db, code, now);
        const results = [first.ok, second.ok].sort();
        expect(results).toEqual([false, true]);
    });

    it('claim-lock staleness/reclaim: reclaimable at now = claimedAt + TTL, still locked at TTL - 1 (mutation target 2)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);
        const { code } = enrollAndConfirm(testDb, accountId, sessionId, Date.now());
        const claimedAt = 1_000_000;

        const first = claimRecoveryCode(testDb.db, code, claimedAt);
        expect(first.ok).toBe(true);

        // Still within the window: a second claim is still locked out.
        const stillLocked = claimRecoveryCode(
            testDb.db,
            code,
            claimedAt + RECOVERY_SESSION_TTL_MS - 1,
        );
        expect(stillLocked).toEqual({ ok: false });

        // Exactly at the boundary: reclaimable (the abandoned enrollment's recovery session, and
        // the ceremony it authorized, must already be dead by now).
        const reclaimed = claimRecoveryCode(testDb.db, code, claimedAt + RECOVERY_SESSION_TTL_MS);
        expect(reclaimed.ok).toBe(true);
    });
});

describe('readLiveRecoverySession (mirrors isFreshlyAuthenticated, #1191)', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('returns the bound recoveryCodeId for a live recovery session', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);
        const { code, recoveryCodeId } = enrollAndConfirm(testDb, accountId, sessionId, Date.now());
        const claim = claimRecoveryCode(testDb.db, code, Date.now());
        if (!claim.ok) {
            throw new Error('unexpected');
        }
        const recoverySessionId = issueRecoverySession(
            testDb,
            claim.accountId,
            claim.recoveryCodeId,
            Date.now(),
        );

        const live = readLiveRecoverySession(testDb.db, recoverySessionId, accountId, Date.now());
        expect(live).toEqual({ recoveryCodeId });
    });

    it('null for a STANDARD-purpose session, even if id/account otherwise match (mutation target: purpose check dropped)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const standardSessionId = issueTestSession(testDb, accountId, credentialId);

        expect(
            readLiveRecoverySession(testDb.db, standardSessionId, accountId, Date.now()),
        ).toBeNull();
    });

    it('null for a REVOKED recovery session (mutation target 10)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);
        const { code } = enrollAndConfirm(testDb, accountId, sessionId, Date.now());
        const claim = claimRecoveryCode(testDb.db, code, Date.now());
        if (!claim.ok) {
            throw new Error('unexpected');
        }
        const recoverySessionId = issueRecoverySession(
            testDb,
            claim.accountId,
            claim.recoveryCodeId,
            Date.now(),
        );
        testDb.db
            .prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?')
            .run(Date.now(), recoverySessionId);

        expect(
            readLiveRecoverySession(testDb.db, recoverySessionId, accountId, Date.now()),
        ).toBeNull();
    });

    it('null for an EXPIRED recovery session (mutation target 10)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const now = 1_000_000;
        const sessionId = issueTestSession(testDb, accountId, credentialId, now);
        const { code } = enrollAndConfirm(testDb, accountId, sessionId, now);
        const claim = claimRecoveryCode(testDb.db, code, now);
        if (!claim.ok) {
            throw new Error('unexpected');
        }
        const recoverySessionId = issueRecoverySession(
            testDb,
            claim.accountId,
            claim.recoveryCodeId,
            now,
        );

        expect(
            readLiveRecoverySession(
                testDb.db,
                recoverySessionId,
                accountId,
                now + RECOVERY_SESSION_TTL_MS,
            ),
        ).toBeNull();
    });
});

describe('startRecoveryEnrollPasskey / verifyRecoveryEnrollPasskey (#1191 decision 12)', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    /** Full setup: register an account+credential, enroll+confirm a recovery code, claim it, and
     * mint the resulting recovery session — everything short of the enroll-passkey ceremony
     * itself. */
    async function setUpClaimedRecovery(now: number = Date.now()): Promise<{
        accountId: string;
        oldCredentialId: string;
        oldAuthenticator: SoftAuthenticator;
        oldStandardSessionId: string;
        recoverySessionId: string;
        recoveryCodeId: string;
        code: string;
    }> {
        const oldAuthenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const { accountId, credentialId: oldCredentialId } = await registerFreshCredential(
            testDb,
            oldAuthenticator,
        );
        const oldStandardSessionId = issueTestSession(testDb, accountId, oldCredentialId, now);
        const { code } = enrollAndConfirm(testDb, accountId, oldStandardSessionId, now);
        const claim = claimRecoveryCode(testDb.db, code, now);
        if (!claim.ok) {
            throw new Error('unexpected');
        }
        const recoverySessionId = issueRecoverySession(
            testDb,
            accountId,
            claim.recoveryCodeId,
            now,
        );
        return {
            accountId,
            code,
            oldCredentialId,
            oldAuthenticator,
            oldStandardSessionId,
            recoverySessionId,
            recoveryCodeId: claim.recoveryCodeId,
        };
    }

    it('startRecoveryEnrollPasskey rejects an invalid/stale recovery session before minting a challenge', async () => {
        testDb = createTestDatabase();
        const now = 1_000_000;
        const setup = await setUpClaimedRecovery(now);

        const result = await startRecoveryEnrollPasskey(
            testDb.db,
            CONFIG,
            { accountId: setup.accountId, sessionId: setup.recoverySessionId },
            now + RECOVERY_SESSION_TTL_MS, // past the recovery session's own TTL
        );
        expect(result).toEqual({ ok: false, reason: 'recovery_session_invalid' });
    });

    it('happy path: consumes the code, revokes EVERY session, deletes EVERY old credential, inserts the new one', async () => {
        testDb = createTestDatabase();
        const now = 1_000_000;
        const setup = await setUpClaimedRecovery(now);
        // A second, pre-existing standard session on a DIFFERENT device — must also die.
        const otherDeviceSessionId = issueTestSession(
            testDb,
            setup.accountId,
            setup.oldCredentialId,
            now,
        );

        const started = await startRecoveryEnrollPasskey(
            testDb.db,
            CONFIG,
            { accountId: setup.accountId, sessionId: setup.recoverySessionId },
            now,
        );
        expect(started.ok).toBe(true);
        if (!started.ok) {
            return;
        }
        const newAuthenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const response = newAuthenticator.register({ challenge: started.options.challenge });

        const result = await verifyRecoveryEnrollPasskey(
            testDb.db,
            CONFIG,
            {
                ceremonyToken: started.ceremonyToken,
                sessionId: setup.recoverySessionId,
                accountId: setup.accountId,
                response,
            },
            now,
        );
        expect(result).toEqual({
            ok: true,
            accountId: setup.accountId,
            credentialId: newAuthenticator.credentialId,
        });

        // Code consumed.
        const codeRow = rawRecoveryCodeRow(testDb, setup.recoveryCodeId);
        expect(codeRow.consumed_at).not.toBeNull();

        // Exactly one credential remains, and it is the NEW one.
        expect(credentialCount(testDb, setup.accountId)).toBe(1);
        const remaining = testDb.db.prepare('SELECT id FROM credentials').get() as unknown as {
            id: string;
        };
        expect(remaining.id).toBe(newAuthenticator.credentialId);

        // Every session on the account — including the recovery session itself and the
        // other-device standard session — is revoked.
        const sessionRows = testDb.db
            .prepare('SELECT id, revoked_at FROM sessions WHERE account_id = ?')
            .all(setup.accountId) as unknown as { id: string; revoked_at: number | null }[];
        expect(sessionRows.every((r) => r.revoked_at !== null)).toBe(true);
        expect(sessionRows.map((r) => r.id).sort()).toEqual(
            [setup.oldStandardSessionId, setup.recoverySessionId, otherDeviceSessionId].sort(),
        );
    });

    it('session/account binding: verify with the WRONG session or account is session_mismatch, nothing changes', async () => {
        testDb = createTestDatabase();
        const now = 1_000_000;
        const setup = await setUpClaimedRecovery(now);
        const started = await startRecoveryEnrollPasskey(
            testDb.db,
            CONFIG,
            { accountId: setup.accountId, sessionId: setup.recoverySessionId },
            now,
        );
        if (!started.ok) {
            throw new Error('unexpected');
        }
        const newAuthenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const response = newAuthenticator.register({ challenge: started.options.challenge });

        const result = await verifyRecoveryEnrollPasskey(
            testDb.db,
            CONFIG,
            {
                ceremonyToken: started.ceremonyToken,
                sessionId: 'not-the-bound-session',
                accountId: setup.accountId,
                response,
            },
            now,
        );
        expect(result).toEqual({ ok: false, reason: 'session_mismatch' });
        const codeRow = rawRecoveryCodeRow(testDb, setup.recoveryCodeId);
        expect(codeRow.consumed_at).toBeNull();
        expect(credentialCount(testDb, setup.accountId)).toBe(1);
    });

    it('interrupted at step 2 (account deleted mid-flight): account_not_found, code stays unconsumed, old credential/sessions untouched', async () => {
        testDb = createTestDatabase();
        const now = 1_000_000;
        const setup = await setUpClaimedRecovery(now);
        const started = await startRecoveryEnrollPasskey(
            testDb.db,
            CONFIG,
            { accountId: setup.accountId, sessionId: setup.recoverySessionId },
            now,
        );
        if (!started.ok) {
            throw new Error('unexpected');
        }
        const newAuthenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const response = newAuthenticator.register({ challenge: started.options.challenge });

        // Forced mid-flight account delete — same technique as login.test.ts's P2-3b: foreign_keys
        // toggled off just for this one statement so the still-present credential/session rows
        // don't block it (simulating an account-delete flow elsewhere, not a schema violation).
        testDb.db.exec('PRAGMA foreign_keys = OFF');
        testDb.db.prepare('DELETE FROM accounts WHERE id = ?').run(setup.accountId);
        testDb.db.exec('PRAGMA foreign_keys = ON');

        const result = await verifyRecoveryEnrollPasskey(
            testDb.db,
            CONFIG,
            {
                ceremonyToken: started.ceremonyToken,
                sessionId: setup.recoverySessionId,
                accountId: setup.accountId,
                response,
            },
            now,
        );
        expect(result).toEqual({ ok: false, reason: 'account_not_found' });

        // Nothing about the account's other state was touched: the code is still unconsumed, the
        // old credential still exists, and the old sessions are still live (not revoked).
        const codeRow = rawRecoveryCodeRow(testDb, setup.recoveryCodeId);
        expect(codeRow.consumed_at).toBeNull();
        const credentialRow = testDb.db
            .prepare('SELECT id FROM credentials WHERE id = ?')
            .get(setup.oldCredentialId);
        expect(credentialRow).toBeDefined();
        const sessionRow = testDb.db
            .prepare('SELECT revoked_at FROM sessions WHERE id = ?')
            .get(setup.oldStandardSessionId) as unknown as { revoked_at: number | null };
        expect(sessionRow.revoked_at).toBeNull();
        // No new credential landed under the crafted id either.
        const newRow = testDb.db
            .prepare('SELECT id FROM credentials WHERE id = ?')
            .get(newAuthenticator.credentialId);
        expect(newRow).toBeUndefined();
    });

    it('interrupted AFTER step 3 but BEFORE step 6 completes (credential id collision on insert): the whole transaction rolls back, INCLUDING the consumed_at write (#1 acceptance criterion, the single most important test in this file)', async () => {
        testDb = createTestDatabase();
        const now = 1_000_000;
        const setup = await setUpClaimedRecovery(now);
        const started = await startRecoveryEnrollPasskey(
            testDb.db,
            CONFIG,
            { accountId: setup.accountId, sessionId: setup.recoverySessionId },
            now,
        );
        if (!started.ok) {
            throw new Error('unexpected');
        }
        // A colliding credential id: a THIRD, unrelated account already owns a credential with
        // this exact id. `verifyRecoveryEnrollPasskey`'s final INSERT (step 6) will collide on
        // the credentials.id PRIMARY KEY — an uncaught ERR_SQLITE_ERROR, thrown from WITHIN the
        // transaction, after step 3's consume-code UPDATE has already run in that same,
        // not-yet-committed transaction. Inserted directly by raw SQL (not via a real registration
        // ceremony) so this test never calls `startRegistration`/`verifyRegistration` — both read
        // the REAL wall clock internally (registration.ts's own `const now = Date.now()`), and
        // calling either one AFTER minting the `recovery_enroll` challenge under this test's tiny
        // fake `now` would sweep-and-delete that just-inserted challenge row for real (its
        // `expires_at` is far in the past relative to the real clock), turning this into an
        // unrelated `ceremony_not_found` failure instead of the collision this test targets.
        const collidingBytes = new Uint8Array(16).fill(7);
        const newAuthenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
            credentialId: collidingBytes,
        });
        const thirdAccountId = 'third-account';
        testDb.db
            .prepare('INSERT INTO accounts (id, created_at) VALUES (?, ?)')
            .run(thirdAccountId, now);
        testDb.db
            .prepare(
                'INSERT INTO credentials (id, account_id, public_key, sign_count, created_at) VALUES (?, ?, ?, ?, ?)',
            )
            .run(newAuthenticator.credentialId, thirdAccountId, Buffer.from('x'), 0, now);

        const response = newAuthenticator.register({ challenge: started.options.challenge });

        await expect(
            verifyRecoveryEnrollPasskey(
                testDb.db,
                CONFIG,
                {
                    ceremonyToken: started.ceremonyToken,
                    sessionId: setup.recoverySessionId,
                    accountId: setup.accountId,
                    response,
                },
                now,
            ),
        ).rejects.toThrow();

        // The load-bearing assertion: the code consumed inside the now-rolled-back transaction
        // must be BACK to unconsumed — an implementation that committed step 3 outside (or
        // before/after) the transaction would fail this.
        const codeRow = rawRecoveryCodeRow(testDb, setup.recoveryCodeId);
        expect(codeRow.consumed_at).toBeNull();
        // The old credential and old sessions are untouched too — nothing partial landed.
        expect(credentialCount(testDb, setup.accountId)).toBe(1);
        const oldCredentialRow = testDb.db
            .prepare('SELECT account_id FROM credentials WHERE id = ?')
            .get(setup.oldCredentialId) as unknown as { account_id: string } | undefined;
        expect(oldCredentialRow?.account_id).toBe(setup.accountId);
        const sessionRow = testDb.db
            .prepare('SELECT revoked_at FROM sessions WHERE id = ?')
            .get(setup.oldStandardSessionId) as unknown as { revoked_at: number | null };
        expect(sessionRow.revoked_at).toBeNull();

        // The code is STILL usable: a fresh claim against it succeeds once the earlier claim's
        // lock window elapses (the entire point of the interrupted-enrollment guarantee — the
        // code itself was never consumed, only claimed, and that claim is what's expiring here).
        const reclaimed = claimRecoveryCode(testDb.db, setup.code, now + RECOVERY_SESSION_TTL_MS);
        expect(reclaimed).toEqual({
            ok: true,
            accountId: setup.accountId,
            recoveryCodeId: setup.recoveryCodeId,
        });
    });

    it('an add_passkey ceremony token is rejected by recovery enroll-passkey verify (ceremony-type separation)', async () => {
        testDb = createTestDatabase();
        const now = 1_000_000;
        const setup = await setUpClaimedRecovery(now);
        // Start an ordinary registration ceremony (a DIFFERENT type entirely) to get a
        // differently-typed, still well-formed ceremony token/challenge.
        const { options, ceremonyToken } = await startRegistration(testDb.db, CONFIG);
        const newAuthenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const response = newAuthenticator.register({ challenge: options.challenge });

        const result = await verifyRecoveryEnrollPasskey(
            testDb.db,
            CONFIG,
            {
                ceremonyToken,
                sessionId: setup.recoverySessionId,
                accountId: setup.accountId,
                response,
            },
            now,
        );
        expect(result).toEqual({ ok: false, reason: 'ceremony_type_mismatch' });
        expect(credentialCount(testDb, setup.accountId)).toBe(1);
    });
});

describe('the raw code never crosses into a readSession-visible or logged surface', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('a claimed recovery session carries no trace of the code in its resolvable claims', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);
        const { code } = enrollAndConfirm(testDb, accountId, sessionId, Date.now());
        const claim = claimRecoveryCode(testDb.db, code, Date.now());
        if (!claim.ok) {
            throw new Error('unexpected');
        }
        const issued = issueSession(
            testDb.db,
            claim.accountId,
            Date.now(),
            RECOVERY_SESSION_TTL_MS,
            null,
            'recovery',
            claim.recoveryCodeId,
        );
        const claims = readSession(testDb.db, issued.token, Date.now());
        expect(claims).not.toBeNull();
        expect(JSON.stringify(claims)).not.toContain(code);
    });
});
