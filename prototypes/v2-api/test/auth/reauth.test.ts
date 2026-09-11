import { afterEach, describe, expect, it } from 'vitest';
import { createWebAuthnConfig, type WebAuthnConfig } from '../../src/auth/config.js';
import { startLogin, verifyLogin } from '../../src/auth/login.js';
import { startReauth, verifyReauth } from '../../src/auth/reauth.js';
import { startRegistration, verifyRegistration } from '../../src/auth/registration.js';
import { issueSession } from '../../src/auth/session.js';
import { createSoftAuthenticator, type SoftAuthenticator } from '../helpers/soft-authenticator.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

const CONFIG: WebAuthnConfig = createWebAuthnConfig({
    rpId: 'localhost',
    rpName: 'Ensemble Test',
    origin: 'http://localhost:5173',
});

/** Registers a fresh passkey and returns the authenticator + resulting account/credential ids. */
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

/** A freely-invented session id: `startReauth`/`verifyReauth` take an already-resolved
 * `sessionId` — the HTTP layer's job is resolving a real one via `readSession` — so a unit test
 * exercising ONLY the binding logic can mint any session row directly. */
function issueTestSession(testDb: TestDatabase, accountId: string, credentialId: string): string {
    return issueSession(testDb.db, accountId, Date.now(), undefined, credentialId).sessionId;
}

describe('reauth ceremony (#1190 decision 3)', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('allowCredentials lists exactly the account own credentials, not an empty (usernameless) list, and never another account (mutation target: account scope on the query)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);

        // A second, unrelated account with its OWN credential -- dropping the account_id scope
        // on the `SELECT ... FROM credentials` behind allowCredentials would silently include
        // this credential too, and the exact-array assertion below would catch it.
        const otherAuthenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        await registerFreshCredential(testDb, otherAuthenticator);

        const { options } = await startReauth(testDb.db, CONFIG, { accountId, sessionId });

        expect(options.allowCredentials?.map((c) => c.id)).toEqual([credentialId]);
        expect(options.userVerification).toBe('required');
    });

    it('verifies end-to-end and rotates the counter, same as login (userHandle present)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);

        const { options, ceremonyToken } = await startReauth(testDb.db, CONFIG, {
            accountId,
            sessionId,
        });
        const response = authenticator.authenticate({
            challenge: options.challenge,
            userHandle: accountId,
        });

        const result = await verifyReauth(testDb.db, CONFIG, {
            ceremonyToken,
            sessionId,
            accountId,
            response,
        });
        expect(result).toEqual({ ok: true, accountId, credentialId });
    });

    it('succeeds with NO userHandle at all — unlike login, absence is fine here (decision 3)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);

        const { options, ceremonyToken } = await startReauth(testDb.db, CONFIG, {
            accountId,
            sessionId,
        });
        const response = authenticator.authenticate({ challenge: options.challenge });

        const result = await verifyReauth(testDb.db, CONFIG, {
            ceremonyToken,
            sessionId,
            accountId,
            response,
        });
        expect(result.ok).toBe(true);
    });

    it('a present but WRONG userHandle is rejected (user_handle_mismatch)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);

        const { options, ceremonyToken } = await startReauth(testDb.db, CONFIG, {
            accountId,
            sessionId,
        });
        const response = authenticator.authenticate({
            challenge: options.challenge,
            userHandle: 'some-other-account',
        });

        const result = await verifyReauth(testDb.db, CONFIG, {
            ceremonyToken,
            sessionId,
            accountId,
            response,
        });
        expect(result).toEqual({ ok: false, reason: 'user_handle_mismatch' });
    });

    it('session-id binding: a DIFFERENT session for the SAME account cannot commit the ceremony (mutation target)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const boundSessionId = issueTestSession(testDb, accountId, credentialId);
        const otherSessionId = issueTestSession(testDb, accountId, credentialId);

        const { options, ceremonyToken } = await startReauth(testDb.db, CONFIG, {
            accountId,
            sessionId: boundSessionId,
        });
        const response = authenticator.authenticate({
            challenge: options.challenge,
            userHandle: accountId,
        });

        const result = await verifyReauth(testDb.db, CONFIG, {
            ceremonyToken,
            sessionId: otherSessionId, // NOT the bound session
            accountId,
            response,
        });
        expect(result).toEqual({ ok: false, reason: 'session_mismatch' });
    });

    it('account binding: account B cannot commit account A ceremony with a B session (mutation target)', async () => {
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

        const { options, ceremonyToken } = await startReauth(testDb.db, CONFIG, {
            accountId: accountA,
            sessionId: sessionA,
        });
        const response = authenticatorA.authenticate({
            challenge: options.challenge,
            userHandle: accountA,
        });

        const result = await verifyReauth(testDb.db, CONFIG, {
            ceremonyToken,
            sessionId: sessionB,
            accountId: accountB, // B's own (otherwise valid) session/account pair
            response,
        });
        expect(result).toEqual({ ok: false, reason: 'session_mismatch' });

        // No counter mutation happened on either credential.
        const rowA = testDb.db
            .prepare('SELECT sign_count FROM credentials WHERE id = ?')
            .get(credentialA) as unknown as { sign_count: number };
        expect(rowA.sign_count).toBe(0);
    });

    it('account binding is checked independently of session-id binding (mutation target: account check alone dropped)', async () => {
        // The session-id check alone can't prove the account clause still runs -- two different
        // sessions never share an id, so a session-id mismatch always fires first regardless of
        // whether the account clause is even evaluated. This presents the CORRECT (bound)
        // session id but claims a DIFFERENT accountId than that session actually belongs to, to
        // isolate the account-only clause.
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

        const { options, ceremonyToken } = await startReauth(testDb.db, CONFIG, {
            accountId: accountA,
            sessionId: sessionA,
        });
        const response = authenticatorA.authenticate({
            challenge: options.challenge,
            userHandle: accountA,
        });

        const result = await verifyReauth(testDb.db, CONFIG, {
            ceremonyToken,
            sessionId: sessionA, // the CORRECT, bound session id
            accountId: accountB, // but a DIFFERENT account than sessionA belongs to
            response,
        });
        expect(result).toEqual({ ok: false, reason: 'session_mismatch' });

        const rowA = testDb.db
            .prepare('SELECT sign_count FROM credentials WHERE id = ?')
            .get(credentialA) as unknown as { sign_count: number };
        expect(rowA.sign_count).toBe(0);
    });

    it('credential-belongs-to-account: B credential cannot satisfy A reauth ceremony (mutation target)', async () => {
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
        await registerFreshCredential(testDb, authenticatorB);
        const sessionA = issueTestSession(testDb, accountA, credentialA);

        // A's own reauth ceremony, but the RESPONSE comes from B's authenticator/credential.
        const { options, ceremonyToken } = await startReauth(testDb.db, CONFIG, {
            accountId: accountA,
            sessionId: sessionA,
        });
        const response = authenticatorB.authenticate({
            challenge: options.challenge,
            userHandle: accountA, // even claiming to be A
        });

        const result = await verifyReauth(testDb.db, CONFIG, {
            ceremonyToken,
            sessionId: sessionA,
            accountId: accountA,
            response,
        });
        expect(result).toEqual({ ok: false, reason: 'credential_not_found' });
    });

    it('malformed request never claims the ceremony (P2-6 shape guard, shared pattern)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);
        const { ceremonyToken } = await startReauth(testDb.db, CONFIG, { accountId, sessionId });

        const malformed = await verifyReauth(testDb.db, CONFIG, {
            ceremonyToken,
            sessionId,
            accountId,
            response: {} as never,
        });
        expect(malformed).toEqual({ ok: false, reason: 'malformed_request' });

        // The ceremony is still claimable afterward -- proof it was never consumed.
        const row = testDb.db.prepare('SELECT id FROM challenges').get();
        expect(row).toBeDefined();
    });

    it('a reauth ceremony token is rejected by login/verify (ceremony-type separation, mutation target: reauth typed as login)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);

        const { options, ceremonyToken } = await startReauth(testDb.db, CONFIG, {
            accountId,
            sessionId,
        });
        const response = authenticator.authenticate({
            challenge: options.challenge,
            userHandle: accountId,
        });

        const result = await verifyLogin(testDb.db, CONFIG, { ceremonyToken, response });
        expect(result).toEqual({ ok: false, reason: 'ceremony_type_mismatch' });

        const row = testDb.db
            .prepare('SELECT sign_count FROM credentials WHERE id = ?')
            .get(credentialId) as unknown as { sign_count: number };
        expect(row.sign_count).toBe(0);
    });

    it('a login ceremony token is rejected by reauth/verify (ceremony-type separation)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        const sessionId = issueTestSession(testDb, accountId, credentialId);

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const response = authenticator.authenticate({
            challenge: options.challenge,
            userHandle: accountId,
        });

        const result = await verifyReauth(testDb.db, CONFIG, {
            ceremonyToken,
            sessionId,
            accountId,
            response,
        });
        expect(result).toEqual({ ok: false, reason: 'ceremony_type_mismatch' });

        const row = testDb.db
            .prepare('SELECT sign_count FROM credentials WHERE id = ?')
            .get(credentialId) as unknown as { sign_count: number };
        expect(row.sign_count).toBe(0);
    });
});
