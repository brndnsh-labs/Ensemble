import { afterEach, describe, expect, it } from 'vitest';
import { createWebAuthnConfig, type WebAuthnConfig } from '../../src/auth/config.js';
import { startLogin, verifyLogin } from '../../src/auth/login.js';
import {
    listPasskeys,
    revokePasskey,
    startAddPasskey,
    verifyAddPasskey,
} from '../../src/auth/passkeys.js';
import { startRegistration, verifyRegistration } from '../../src/auth/registration.js';
import { issueSession } from '../../src/auth/session.js';
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

/** Mints a fresh (passkey-created) session directly, bypassing HTTP — a unit test exercising
 * `startAddPasskey`/`verifyAddPasskey`/`revokePasskey` only needs an already-resolved
 * `sessionId`, the same contract the HTTP layer provides after its own `readSession` call. */
function issueTestSession(
    testDb: TestDatabase,
    accountId: string,
    credentialId: string,
    now: number = Date.now(),
): string {
    return issueSession(testDb.db, accountId, now, undefined, credentialId).sessionId;
}

function insertRecoveryCode(
    testDb: TestDatabase,
    accountId: string,
    consumedAt: number | null,
    // #1191 decision 5: hasEnrolledRecoveryMaterial now ALSO requires confirmed_at IS NOT NULL —
    // defaults to confirmed (0) so every pre-#1191 caller here keeps testing "usable recovery
    // material" rather than accidentally exercising the new confirmed-gate.
    confirmedAt: number | null = 0,
): void {
    testDb.db
        .prepare(
            'INSERT INTO recovery_codes (id, account_id, code_hash, created_at, consumed_at, confirmed_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(`code-${Math.random()}`, accountId, 'hash', 0, consumedAt, confirmedAt);
}

function credentialCount(testDb: TestDatabase, accountId: string): number {
    return (
        testDb.db
            .prepare('SELECT COUNT(*) AS n FROM credentials WHERE account_id = ?')
            .get(accountId) as unknown as { n: number }
    ).n;
}

async function enrollSecondPasskey(
    testDb: TestDatabase,
    accountId: string,
    sessionId: string,
    authenticator: SoftAuthenticator = createSoftAuthenticator({
        rpId: CONFIG.rpId,
        origin: CONFIG.origin,
    }),
): Promise<{ credentialId: string; authenticator: SoftAuthenticator }> {
    const started = await startAddPasskey(testDb.db, CONFIG, { accountId, sessionId });
    if (!started.ok) {
        throw new Error(`setup add-passkey options failed: ${started.reason}`);
    }
    const response = authenticator.register({ challenge: started.options.challenge });
    const result = await verifyAddPasskey(testDb.db, CONFIG, {
        ceremonyToken: started.ceremonyToken,
        sessionId,
        accountId,
        response,
    });
    if (!result.ok) {
        throw new Error(`setup add-passkey verify failed: ${result.reason}`);
    }
    return { credentialId: result.credentialId, authenticator };
}

describe('startAddPasskey / verifyAddPasskey (#1190 decision 4)', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('a stale (non-fresh) session is refused at OPTIONS time, before any ceremony starts', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const now = 10_000_000;
        // Created well outside the 10-minute freshness window.
        const staleSessionId = issueTestSession(
            testDb,
            accountId,
            credentialId,
            now - 20 * 60 * 1000,
        );

        const result = await startAddPasskey(
            testDb.db,
            CONFIG,
            { accountId, sessionId: staleSessionId },
            now,
        );
        expect(result).toEqual({ ok: false, reason: 'fresh_auth_required' });
    });

    it("a fresh session succeeds: excludeCredentials lists the existing credential (and never another account's, mutation target: account scope on the query), options include the same user handle", async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);

        // A second, unrelated account with its OWN credential -- dropping the account_id scope
        // on excludeCredentials's query would silently include this credential too, and the
        // exact-array assertion below would catch it.
        const otherAuthenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        await registerFreshCredential(testDb, otherAuthenticator);

        const result = await startAddPasskey(testDb.db, CONFIG, { accountId, sessionId });
        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.options.excludeCredentials?.map((c) => c.id)).toEqual([credentialId]);
        expect(result.options.user.id).toBe(accountId);
        expect(result.options.authenticatorSelection?.residentKey).toBe('required');
    });

    it('enrolls a genuinely second credential; the account can then log in with EITHER passkey', async () => {
        testDb = createTestDatabase();
        const firstAuthenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const { accountId, credentialId: firstCredentialId } = await registerFreshCredential(
            testDb,
            firstAuthenticator,
        );
        const sessionId = issueTestSession(testDb, accountId, firstCredentialId);

        const { credentialId: secondCredentialId, authenticator: secondAuthenticator } =
            await enrollSecondPasskey(testDb, accountId, sessionId);
        expect(secondCredentialId).not.toBe(firstCredentialId);
        expect(credentialCount(testDb, accountId)).toBe(2);

        // Login with the FIRST passkey.
        const login1 = await startLogin(testDb.db, CONFIG);
        const response1 = firstAuthenticator.authenticate({
            challenge: login1.options.challenge,
            userHandle: accountId,
        });
        const result1 = await verifyLogin(testDb.db, CONFIG, {
            ceremonyToken: login1.ceremonyToken,
            response: response1,
        });
        expect(result1).toEqual({ ok: true, accountId, credentialId: firstCredentialId });

        // Login with the SECOND passkey.
        const login2 = await startLogin(testDb.db, CONFIG);
        const response2 = secondAuthenticator.authenticate({
            challenge: login2.options.challenge,
            userHandle: accountId,
        });
        const result2 = await verifyLogin(testDb.db, CONFIG, {
            ceremonyToken: login2.ceremonyToken,
            response: response2,
        });
        expect(result2).toEqual({ ok: true, accountId, credentialId: secondCredentialId });
    });

    it('session-id binding: a ceremony started under session A cannot be committed under session B (mutation target)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionA = issueTestSession(testDb, accountId, credentialId);
        const sessionB = issueTestSession(testDb, accountId, credentialId);

        const started = await startAddPasskey(testDb.db, CONFIG, {
            accountId,
            sessionId: sessionA,
        });
        if (!started.ok) {
            throw new Error('unexpected');
        }
        const newAuthenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const response = newAuthenticator.register({ challenge: started.options.challenge });

        const result = await verifyAddPasskey(testDb.db, CONFIG, {
            ceremonyToken: started.ceremonyToken,
            sessionId: sessionB, // NOT the bound session
            accountId,
            response,
        });
        expect(result).toEqual({ ok: false, reason: 'session_mismatch' });
        expect(credentialCount(testDb, accountId)).toBe(1);
    });

    it('account binding: a ceremony started under account A cannot be committed under account B (mutation target)', async () => {
        testDb = createTestDatabase();
        const authenticatorA = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const { accountId: accountA, credentialId: credentialA } = await registerFreshCredential(
            testDb,
            authenticatorA,
        );
        const authenticatorB = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const { accountId: accountB, credentialId: credentialB } = await registerFreshCredential(
            testDb,
            authenticatorB,
        );
        const sessionA = issueTestSession(testDb, accountA, credentialA);
        const sessionB = issueTestSession(testDb, accountB, credentialB);

        const started = await startAddPasskey(testDb.db, CONFIG, {
            accountId: accountA,
            sessionId: sessionA,
        });
        if (!started.ok) {
            throw new Error('unexpected');
        }
        const newAuthenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const response = newAuthenticator.register({ challenge: started.options.challenge });

        const crossSession = await verifyAddPasskey(testDb.db, CONFIG, {
            ceremonyToken: started.ceremonyToken,
            sessionId: sessionB, // B's own otherwise-valid, fresh session
            accountId: accountB,
            response,
        });
        expect(crossSession).toEqual({ ok: false, reason: 'session_mismatch' });
        expect(credentialCount(testDb, accountA)).toBe(1);
        expect(credentialCount(testDb, accountB)).toBe(1);
        // Nothing landed on either account under the crafted credential id.
        const row = testDb.db
            .prepare('SELECT id FROM credentials WHERE id = ?')
            .get(newAuthenticator.credentialId);
        expect(row).toBeUndefined();
    });

    it('account binding is checked independently of session-id binding (mutation target: account check alone dropped)', async () => {
        // The session-id check alone cannot prove the account check still runs — two DIFFERENT
        // sessions never share an id, so a session-id mismatch always fires first regardless of
        // whether the account clause is even evaluated. To isolate the account-only clause, this
        // presents the CORRECT (bound) session id, but claims a DIFFERENT accountId than the one
        // that session actually belongs to -- exactly the shape a caller that wired session
        // resolution and account resolution independently (rather than from one `readSession`
        // call) could produce.
        testDb = createTestDatabase();
        const authenticatorA = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const { accountId: accountA, credentialId: credentialA } = await registerFreshCredential(
            testDb,
            authenticatorA,
        );
        const authenticatorB = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const { accountId: accountB } = await registerFreshCredential(testDb, authenticatorB);
        const sessionA = issueTestSession(testDb, accountA, credentialA);

        const started = await startAddPasskey(testDb.db, CONFIG, {
            accountId: accountA,
            sessionId: sessionA,
        });
        if (!started.ok) {
            throw new Error('unexpected');
        }
        const newAuthenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const response = newAuthenticator.register({ challenge: started.options.challenge });

        const result = await verifyAddPasskey(testDb.db, CONFIG, {
            ceremonyToken: started.ceremonyToken,
            sessionId: sessionA, // the CORRECT, bound session id
            accountId: accountB, // but a DIFFERENT account than sessionA belongs to
            response,
        });
        expect(result).toEqual({ ok: false, reason: 'session_mismatch' });
        // Only accountA's original credential; nothing new landed on either account (accountB's
        // count of 1 is its own genuine registration credential, unrelated to this attempt).
        expect(credentialCount(testDb, accountA)).toBe(1);
        expect(credentialCount(testDb, accountB)).toBe(1);
    });

    it('re-enrolling an already-registered authenticator on the SAME account is a clean no-op (decision 5)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        // A registration ceremony always embeds sign_count 0 in its authData, so re-registering
        // the SAME key pair deterministically re-derives the SAME public key bytes and counter
        // 0 -- an overwrite-instead-of-no-op bug would be invisible against that starting state
        // (the "after" value would coincidentally equal the "before" value either way). Bumping
        // sign_count here, simulating real logins since registration, is what actually makes an
        // overwrite observably WRONG: a real no-op leaves this nonzero value untouched, while an
        // overwrite resets it back to the fresh ceremony's embedded 0.
        testDb.db
            .prepare('UPDATE credentials SET sign_count = ? WHERE id = ?')
            .run(7, credentialId);
        const before = testDb.db
            .prepare('SELECT public_key, sign_count FROM credentials WHERE id = ?')
            .get(credentialId) as unknown as { public_key: Buffer; sign_count: number };
        expect(before.sign_count).toBe(7);

        const sessionId = issueTestSession(testDb, accountId, credentialId);
        const started = await startAddPasskey(testDb.db, CONFIG, { accountId, sessionId });
        if (!started.ok) {
            throw new Error('unexpected');
        }
        // Same authenticator/credential id registers again, against excludeCredentials it should
        // normally be refused by a real browser for — this simulates one that ignores it.
        const response = authenticator.register({ challenge: started.options.challenge });
        const result = await verifyAddPasskey(testDb.db, CONFIG, {
            ceremonyToken: started.ceremonyToken,
            sessionId,
            accountId,
            response,
        });
        expect(result).toEqual({ ok: true, credentialId, alreadyRegistered: true });

        const after = testDb.db
            .prepare('SELECT public_key, sign_count FROM credentials WHERE id = ?')
            .get(credentialId) as unknown as { public_key: Buffer; sign_count: number };
        expect(Buffer.from(after.public_key).equals(Buffer.from(before.public_key))).toBe(true);
        expect(after.sign_count).toBe(before.sign_count);
        expect(credentialCount(testDb, accountId)).toBe(1);
    });

    it('the SAME authenticator already registered on a DIFFERENT account is credential_exists, never a takeover (decision 5)', async () => {
        testDb = createTestDatabase();
        const sharedAuthenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const { accountId: accountA } = await registerFreshCredential(testDb, sharedAuthenticator);

        const otherAuthenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const { accountId: accountB, credentialId: credentialB } = await registerFreshCredential(
            testDb,
            otherAuthenticator,
        );
        const sessionB = issueTestSession(testDb, accountB, credentialB);

        const started = await startAddPasskey(testDb.db, CONFIG, {
            accountId: accountB,
            sessionId: sessionB,
        });
        if (!started.ok) {
            throw new Error('unexpected');
        }
        // accountB's ceremony, but presenting accountA's authenticator/credential.
        const response = sharedAuthenticator.register({ challenge: started.options.challenge });
        const result = await verifyAddPasskey(testDb.db, CONFIG, {
            ceremonyToken: started.ceremonyToken,
            sessionId: sessionB,
            accountId: accountB,
            response,
        });
        expect(result).toEqual({ ok: false, reason: 'credential_exists' });

        // Still owned by A, untouched.
        const row = testDb.db
            .prepare('SELECT account_id FROM credentials WHERE id = ?')
            .get(sharedAuthenticator.credentialId) as unknown as { account_id: string };
        expect(row.account_id).toBe(accountA);
        expect(credentialCount(testDb, accountB)).toBe(1);
    });

    it('the fresh check is re-verified at COMMIT time too — a session that goes stale mid-ceremony fails there', async () => {
        // Both startAddPasskey and verifyAddPasskey take an injectable `now` (defaulting to
        // Date.now()) precisely so a caller CAN drive this with a fake clock — but this
        // particular test doesn't need to, and using REAL timestamps throughout keeps it simple:
        // an injected past `now` for startAddPasskey without also threading the SAME value into
        // verifyAddPasskey would make the challenge look already-expired against the real clock,
        // masking the freshness re-check this test targets.
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);

        const started = await startAddPasskey(testDb.db, CONFIG, { accountId, sessionId });
        if (!started.ok) {
            throw new Error('unexpected');
        }
        const newAuthenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const response = newAuthenticator.register({ challenge: started.options.challenge });

        // Session goes stale (revoked) between options and verify, e.g. logout in another tab.
        testDb.db
            .prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?')
            .run(Date.now(), sessionId);

        const result = await verifyAddPasskey(testDb.db, CONFIG, {
            ceremonyToken: started.ceremonyToken,
            sessionId,
            accountId,
            response,
        });
        expect(result).toEqual({ ok: false, reason: 'fresh_auth_required' });
        expect(credentialCount(testDb, accountId)).toBe(1);
    });

    it('forced race: a session revoked WHILE verifyAddPasskey awaits the library verify is still caught (mutation target: fresh re-check moved before the await)', async () => {
        // Mirrors login.test.ts's P2-3a forced-counter-race pattern: call the async function
        // WITHOUT awaiting it (it runs synchronously through the shape guard, claim, and binding
        // check, then suspends at `await verifyRegistrationResponse(...)`), mutate the DB
        // synchronously, THEN await. This proves the freshness re-check that actually runs (after
        // the await, inside the commit transaction) observes a staleness introduced DURING that
        // await -- the exact race a re-check moved to BEFORE the await would miss entirely.
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);

        const started = await startAddPasskey(testDb.db, CONFIG, { accountId, sessionId });
        if (!started.ok) {
            throw new Error('unexpected');
        }
        const newAuthenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const response = newAuthenticator.register({ challenge: started.options.challenge });

        const pending = verifyAddPasskey(testDb.db, CONFIG, {
            ceremonyToken: started.ceremonyToken,
            sessionId,
            accountId,
            response,
        });
        // Forced mid-flight write: the session goes stale (revoked) while `pending` is suspended
        // inside the library's async verify call.
        testDb.db
            .prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?')
            .run(Date.now(), sessionId);

        const result = await pending;
        expect(result).toEqual({ ok: false, reason: 'fresh_auth_required' });
        expect(credentialCount(testDb, accountId)).toBe(1);
    });

    it('rejects a response whose top-level id does not match the id decoded from the attestation object (mutation target)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);

        const started = await startAddPasskey(testDb.db, CONFIG, { accountId, sessionId });
        if (!started.ok) {
            throw new Error('unexpected');
        }
        const newAuthenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const base = newAuthenticator.register({ challenge: started.options.challenge });
        // Attacker-chosen top-level id/rawId, disagreeing with the id embedded in the (still
        // correctly signed/attested) attestation object.
        const tampered = { ...base, id: 'AAAA', rawId: 'AAAA' };

        const result = await verifyAddPasskey(testDb.db, CONFIG, {
            ceremonyToken: started.ceremonyToken,
            sessionId,
            accountId,
            response: tampered,
        });
        expect(result).toEqual({ ok: false, reason: 'verification_failed' });

        // Nothing was stored under either id, and the original credential is untouched.
        const byFakeId = testDb.db.prepare('SELECT id FROM credentials WHERE id = ?').get('AAAA');
        expect(byFakeId).toBeUndefined();
        expect(credentialCount(testDb, accountId)).toBe(1);
        const original = testDb.db
            .prepare('SELECT id FROM credentials WHERE id = ?')
            .get(credentialId);
        expect(original).toBeDefined();
    });

    it('an add_passkey ceremony token is rejected by registration/verify (ceremony-type separation, mutation target: add_passkey typed as registration)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);

        const started = await startAddPasskey(testDb.db, CONFIG, { accountId, sessionId });
        if (!started.ok) {
            throw new Error('unexpected');
        }
        const newAuthenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const response = newAuthenticator.register({ challenge: started.options.challenge });

        const result = await verifyRegistration(testDb.db, CONFIG, {
            ceremonyToken: started.ceremonyToken,
            response,
        });
        expect(result).toEqual({ ok: false, reason: 'ceremony_type_mismatch' });
        expect(credentialCount(testDb, accountId)).toBe(1);
    });

    it('a registration ceremony token is rejected by passkeys/verify (ceremony-type separation)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);

        const { options, ceremonyToken } = await startRegistration(testDb.db, CONFIG);
        const newAuthenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const response = newAuthenticator.register({ challenge: options.challenge });

        const result = await verifyAddPasskey(testDb.db, CONFIG, {
            ceremonyToken,
            sessionId,
            accountId,
            response,
        });
        expect(result).toEqual({ ok: false, reason: 'ceremony_type_mismatch' });
        expect(credentialCount(testDb, accountId)).toBe(1);
    });
});

describe('revokePasskey (#1190 decision 6)', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('a stale session is refused (fresh_auth_required), for both an existing and a nonexistent id', async () => {
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

        const existing = revokePasskey(testDb.db, accountId, staleSessionId, credentialId, now);
        expect(existing).toEqual({ ok: false, reason: 'fresh_auth_required' });

        const nonexistent = revokePasskey(testDb.db, accountId, staleSessionId, 'no-such-id', now);
        expect(nonexistent).toEqual({ ok: false, reason: 'fresh_auth_required' });
        expect(credentialCount(testDb, accountId)).toBe(1);
    });

    it('another account credential and a nonexistent id return an IDENTICAL not_found, no side effects', async () => {
        testDb = createTestDatabase();
        const authenticatorA = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const { accountId: accountA, credentialId: credentialA } = await registerFreshCredential(
            testDb,
            authenticatorA,
        );
        const authenticatorB = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const { accountId: accountB, credentialId: credentialB } = await registerFreshCredential(
            testDb,
            authenticatorB,
        );
        // Give B a second credential so the last-credential guard doesn't confound this test.
        const sessionB = issueTestSession(testDb, accountB, credentialB);
        await enrollSecondPasskey(testDb, accountB, sessionB);

        // Account A attempts to revoke B's credential using A's OWN fresh session — ownership,
        // not session validity, is what's under test here.
        const sessionA = issueTestSession(testDb, accountA, credentialA);
        const crossAccount = revokePasskey(testDb.db, accountA, sessionA, credentialB, Date.now());
        const nonexistent = revokePasskey(testDb.db, accountA, sessionA, 'no-such-id', Date.now());
        expect(crossAccount).toEqual({ ok: false, reason: 'not_found' });
        expect(nonexistent).toEqual({ ok: false, reason: 'not_found' });

        // B's credential and B's sessions are completely untouched.
        expect(credentialCount(testDb, accountB)).toBe(2);
        const bRow = testDb.db
            .prepare('SELECT revoked_at FROM sessions WHERE id = ?')
            .get(sessionB) as unknown as { revoked_at: number | null };
        expect(bRow.revoked_at).toBeNull();
    });

    it('last credential WITHOUT recovery material -> 409 last_credential, credential still exists (mutation target: COUNT account scope)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);

        // A second account with TWO credentials of its own -- dropping the account_id scope on
        // the last-credential COUNT would make the guard see 3 credentials total instead of 1,
        // never triggering `n <= 1` and letting this account's sole credential be revoked
        // without recovery material.
        const otherAuthenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const { accountId: otherAccountId, credentialId: otherFirstCredentialId } =
            await registerFreshCredential(testDb, otherAuthenticator);
        const otherSessionId = issueTestSession(testDb, otherAccountId, otherFirstCredentialId);
        await enrollSecondPasskey(testDb, otherAccountId, otherSessionId);

        const result = revokePasskey(testDb.db, accountId, sessionId, credentialId, Date.now());
        expect(result).toEqual({ ok: false, reason: 'last_credential' });
        expect(credentialCount(testDb, accountId)).toBe(1);
    });

    it('last credential WITH an unconsumed recovery code -> revoke succeeds (mutation target)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        insertRecoveryCode(testDb, accountId, null);
        const sessionId = issueTestSession(testDb, accountId, credentialId);

        const result = revokePasskey(testDb.db, accountId, sessionId, credentialId, Date.now());
        expect(result.ok).toBe(true);
        expect(credentialCount(testDb, accountId)).toBe(0);
    });

    it('last credential with only a CONSUMED recovery code -> still 409 (mutation target: recovery check AND COUNT account scope)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        insertRecoveryCode(testDb, accountId, 5000);
        const sessionId = issueTestSession(testDb, accountId, credentialId);

        // A second account with TWO credentials of its own -- see the identically-shaped guard
        // above for why an unscoped COUNT would defeat this test.
        const otherAuthenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const { accountId: otherAccountId, credentialId: otherFirstCredentialId } =
            await registerFreshCredential(testDb, otherAuthenticator);
        const otherSessionId = issueTestSession(testDb, otherAccountId, otherFirstCredentialId);
        await enrollSecondPasskey(testDb, otherAccountId, otherSessionId);

        const result = revokePasskey(testDb.db, accountId, sessionId, credentialId, Date.now());
        expect(result).toEqual({ ok: false, reason: 'last_credential' });
        expect(credentialCount(testDb, accountId)).toBe(1);
    });

    it('count <= 1 guard: revoking one of TWO credentials never triggers last_credential, recovery or not', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId: firstCredentialId } = await registerFreshCredential(
            testDb,
            authenticator,
        );
        const sessionId = issueTestSession(testDb, accountId, firstCredentialId);
        const { credentialId: secondCredentialId } = await enrollSecondPasskey(
            testDb,
            accountId,
            sessionId,
        );

        const result = revokePasskey(
            testDb.db,
            accountId,
            sessionId,
            firstCredentialId,
            Date.now(),
        );
        expect(result.ok).toBe(true);
        expect(credentialCount(testDb, accountId)).toBe(1);
        const remaining = testDb.db.prepare('SELECT id FROM credentials').get() as unknown as {
            id: string;
        };
        expect(remaining.id).toBe(secondCredentialId);
    });

    it('revokes every session the credential created; a session from a DIFFERENT credential survives', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId: credentialX } = await registerFreshCredential(
            testDb,
            authenticator,
        );
        const sessionForOptions = issueTestSession(testDb, accountId, credentialX);
        const { credentialId: credentialY } = await enrollSecondPasskey(
            testDb,
            accountId,
            sessionForOptions,
        );

        // Two sessions created by credential X ("two jars logged in with X"), one by credential Y.
        const jarX1 = issueSession(
            testDb.db,
            accountId,
            Date.now(),
            undefined,
            credentialX,
        ).sessionId;
        const jarX2 = issueSession(
            testDb.db,
            accountId,
            Date.now(),
            undefined,
            credentialX,
        ).sessionId;
        const jarY = issueSession(
            testDb.db,
            accountId,
            Date.now(),
            undefined,
            credentialY,
        ).sessionId;

        const result = revokePasskey(
            testDb.db,
            accountId,
            sessionForOptions,
            credentialX,
            Date.now(),
        );
        expect(result.ok).toBe(true);

        const rows = testDb.db
            .prepare('SELECT id, revoked_at FROM sessions WHERE id IN (?, ?, ?)')
            .all(jarX1, jarX2, jarY) as unknown as { id: string; revoked_at: number | null }[];
        const byId = new Map(rows.map((r) => [r.id, r.revoked_at]));
        expect(byId.get(jarX1)).not.toBeNull();
        expect(byId.get(jarX2)).not.toBeNull();
        expect(byId.get(jarY)).toBeNull();
    });

    it('session revocation is scoped by account_id too, independent of credential_id (mutation target)', async () => {
        // credential_id alone already narrows to sessions created by ONE specific credential,
        // which in every session `issueSession` ever mints is also consistent with that
        // session's own account_id -- so a normal test can't isolate the account_id clause the
        // same way it can't isolate reauth/add-passkey's account-only binding clause. Nothing in
        // the schema enforces sessions.account_id matching sessions.credential_id's OWNING
        // account, though (see revokePasskey's doc comment: "doesn't rely on that"), so this
        // constructs the data-integrity-violating row directly to prove the account_id clause is
        // independently load-bearing, not merely redundant with credential_id.
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId: accountA, credentialId: credentialX } = await registerFreshCredential(
            testDb,
            authenticator,
        );
        const sessionA = issueTestSession(testDb, accountA, credentialX);
        await enrollSecondPasskey(testDb, accountA, sessionA); // so the last-credential guard passes

        const authenticatorB = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const { accountId: accountB } = await registerFreshCredential(testDb, authenticatorB);

        // A session row that claims credential_id = X (owned by account A) but account_id =
        // accountB (a REAL account, to satisfy the accounts FK) -- a shape `issueSession` never
        // produces on its own, but the schema permits it.
        testDb.db
            .prepare(
                'INSERT INTO sessions (id, account_id, created_at, expires_at, token_hash, credential_id) VALUES (?, ?, ?, ?, ?, ?)',
            )
            .run('rogue-session', accountB, 0, Date.now() + 1_000_000, 'rogue-hash', credentialX);

        revokePasskey(testDb.db, accountA, sessionA, credentialX, Date.now());

        const rogue = testDb.db
            .prepare('SELECT revoked_at FROM sessions WHERE id = ?')
            .get('rogue-session') as unknown as { revoked_at: number | null };
        // Untouched: its account_id does not match accountA, even though its credential_id does.
        expect(rogue.revoked_at).toBeNull();
    });

    it('signedOut is true when the CURRENT session was created by the revoked credential', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId: credentialX } = await registerFreshCredential(
            testDb,
            authenticator,
        );
        const currentSession = issueTestSession(testDb, accountId, credentialX);
        await enrollSecondPasskey(testDb, accountId, currentSession);

        const result = revokePasskey(testDb.db, accountId, currentSession, credentialX, Date.now());
        expect(result).toEqual({ ok: true, signedOut: true });
    });

    it('signedOut is false when the CURRENT session was created by a DIFFERENT credential', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId: credentialX } = await registerFreshCredential(
            testDb,
            authenticator,
        );
        const optionsSession = issueTestSession(testDb, accountId, credentialX);
        const { credentialId: credentialY } = await enrollSecondPasskey(
            testDb,
            accountId,
            optionsSession,
        );
        const currentSession = issueSession(
            testDb.db,
            accountId,
            Date.now(),
            undefined,
            credentialY,
        ).sessionId;

        const result = revokePasskey(testDb.db, accountId, currentSession, credentialX, Date.now());
        expect(result).toEqual({ ok: true, signedOut: false });
    });

    it('forced race: a login in flight against a credential that gets revoked mid-verify is rejected, no session issued', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId: credentialX } = await registerFreshCredential(
            testDb,
            authenticator,
        );
        const revokerSession = issueTestSession(testDb, accountId, credentialX);
        // A second credential so the last-credential guard doesn't block the revoke.
        await enrollSecondPasskey(testDb, accountId, revokerSession);

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const response = authenticator.authenticate({
            challenge: options.challenge,
            userHandle: accountId,
        });

        // Start the login verify WITHOUT awaiting it yet.
        const pending = verifyLogin(testDb.db, CONFIG, { ceremonyToken, response });
        // Synchronously revoke the credential this login is authenticating with, before the
        // pending verify's commit transaction re-reads it.
        const revokeResult = revokePasskey(
            testDb.db,
            accountId,
            revokerSession,
            credentialX,
            Date.now(),
        );
        expect(revokeResult.ok).toBe(true);

        const loginResult = await pending;
        expect(loginResult).toEqual({ ok: false, reason: 'credential_not_found' });
    });
});

describe('listPasskeys (#1190 decision 8)', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('returns only the owner credentials, with the current flag correct and no key material', async () => {
        testDb = createTestDatabase();
        const authenticatorA = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const { accountId: accountA, credentialId: credentialA1 } = await registerFreshCredential(
            testDb,
            authenticatorA,
        );
        const sessionA = issueTestSession(testDb, accountA, credentialA1);
        const { credentialId: credentialA2 } = await enrollSecondPasskey(
            testDb,
            accountA,
            sessionA,
        );

        const authenticatorB = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        await registerFreshCredential(testDb, authenticatorB);

        const passkeys = listPasskeys(testDb.db, accountA, credentialA2);
        expect(passkeys.map((p) => p.id).sort()).toEqual([credentialA1, credentialA2].sort());
        const current = passkeys.find((p) => p.id === credentialA2);
        const notCurrent = passkeys.find((p) => p.id === credentialA1);
        expect(current?.current).toBe(true);
        expect(notCurrent?.current).toBe(false);

        for (const p of passkeys) {
            expect(p).not.toHaveProperty('publicKey');
            expect(p).not.toHaveProperty('public_key');
            expect(p).not.toHaveProperty('signCount');
            expect(p).not.toHaveProperty('sign_count');
        }
    });

    it('current is false for every credential when currentCredentialId is null', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId } = await registerFreshCredential(testDb, authenticator);

        const passkeys = listPasskeys(testDb.db, accountId, null);
        expect(passkeys.every((p) => p.current === false)).toBe(true);
    });
});
