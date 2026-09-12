import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { afterEach, describe, expect, it } from 'vitest';
import { generateCeremonyToken, insertChallenge } from '../../src/auth/challenges.js';
import { createWebAuthnConfig, type WebAuthnConfig } from '../../src/auth/config.js';
import type { CredentialRow } from '../../src/auth/credential-row.js';
import { startLogin, verifyLogin } from '../../src/auth/login.js';
import { startRegistration, verifyRegistration } from '../../src/auth/registration.js';
import { createSoftAuthenticator, type SoftAuthenticator } from '../helpers/soft-authenticator.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

const CONFIG: WebAuthnConfig = createWebAuthnConfig({
    rpId: 'localhost',
    rpName: 'Ensemble Test',
    origin: 'http://localhost:5173',
});

function expireAllChallenges(testDb: TestDatabase): void {
    testDb.db.exec('UPDATE challenges SET expires_at = 0');
}

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

/** Flags sit at byte offset 32 of authenticatorData, immediately after the 32-byte rpIdHash. */
const FLAGS_OFFSET = 32;
const UV_FLAG = 0x04;

/**
 * *Sets* the UV (user-verified) bit in an authenticatorData buffer after it was signed,
 * simulating an attacker upgrading an unverified assertion on the wire.
 *
 * The direction matters. Clearing UV on a verified assertion would be rejected by the library's
 * UV check before the signature is ever examined, so that test would prove nothing about
 * signature verification (an earlier version of this test did exactly that and survived every
 * mutation). Setting the bit on an assertion signed *without* UV passes the UV check, so the
 * only thing left to reject it is the signature mismatch.
 */
function setUvBitAfterSigning(authenticatorDataB64: string): string {
    const mutated = new Uint8Array(isoBase64URL.toBuffer(authenticatorDataB64));
    mutated[FLAGS_OFFSET] |= UV_FLAG;
    return isoBase64URL.fromBuffer(mutated);
}

describe('login ceremony (#1188)', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('starts a usernameless login with an empty allowCredentials list', async () => {
        testDb = createTestDatabase();
        const { options } = await startLogin(testDb.db, CONFIG);
        expect(options.allowCredentials).toEqual([]);
        expect(options.userVerification).toBe('required');
    });

    it('logs in end-to-end against the real verify path, persisting a synced 0 -> 0 counter', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const response = authenticator.authenticate({
            challenge: options.challenge,
            counter: 0,
            userHandle: accountId,
        });
        const result = await verifyLogin(testDb.db, CONFIG, { ceremonyToken, response });

        expect(result).toEqual({ ok: true, accountId, credentialId });
        // No session is issued by this story (that is #1189) — the success shape is exactly
        // { ok, accountId, credentialId }, nothing more.
        expect(Object.keys(result).sort()).toEqual(['accountId', 'credentialId', 'ok']);

        const credentialRow = testDb.db
            .prepare('SELECT * FROM credentials WHERE id = ?')
            .get(credentialId) as unknown as CredentialRow;
        expect(credentialRow.sign_count).toBe(0);
        expect(credentialRow.last_used_at).not.toBeNull();
    });

    // --- userHandle: required on every login (P3 correction to decision 6) --------------------
    // Login here is always discoverable (allowCredentials: []) and per WebAuthn L3 SS7.2 step 6
    // a userHandle is REQUIRED when the user wasn't identified before the ceremony began, which
    // is always true for this flow. undefined, null and '' are all "absent" and rejected
    // identically; a present-but-wrong handle is the separate user_handle_mismatch case below.

    it('rejects a login assertion with no userHandle at all (undefined)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        await registerFreshCredential(testDb, authenticator);

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const response = authenticator.authenticate({ challenge: options.challenge });
        expect(response.response.userHandle).toBeUndefined();

        const result = await verifyLogin(testDb.db, CONFIG, { ceremonyToken, response });
        expect(result).toEqual({ ok: false, reason: 'user_handle_missing' });
    });

    it('rejects a login assertion with userHandle: null', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        await registerFreshCredential(testDb, authenticator);

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const base = authenticator.authenticate({ challenge: options.challenge });
        const response: AuthenticationResponseJSON = {
            ...base,
            response: { ...base.response, userHandle: null as unknown as string },
        };

        const result = await verifyLogin(testDb.db, CONFIG, { ceremonyToken, response });
        expect(result).toEqual({ ok: false, reason: 'user_handle_missing' });
    });

    it('rejects a login assertion with userHandle: "" (empty string)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        await registerFreshCredential(testDb, authenticator);

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const response = authenticator.authenticate({
            challenge: options.challenge,
            userHandle: '',
        });

        const result = await verifyLogin(testDb.db, CONFIG, { ceremonyToken, response });
        expect(result).toEqual({ ok: false, reason: 'user_handle_missing' });
    });

    it('rejects an assertion whose userHandle names a different account (credential substitution)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        await registerFreshCredential(testDb, authenticator);

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const response = authenticator.authenticate({
            challenge: options.challenge,
            userHandle: 'someone-elses-account-id',
        });
        const result = await verifyLogin(testDb.db, CONFIG, { ceremonyToken, response });

        expect(result).toEqual({ ok: false, reason: 'user_handle_mismatch' });
    });

    // --- P1-1: forged signature is the ONLY signature gate ------------------------------------
    // verifyAuthenticationResponse RETURNS { verified: false } on a bad signature — it does not
    // throw. `if (!verification.verified)` is the sole guard; both cases below must exercise it
    // through the real verify path, not a mock.

    it('rejects an assertion signed by a different key pair than the one registered (forged signature)', async () => {
        testDb = createTestDatabase();
        const registeredAuthenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
        });
        const { accountId } = await registerFreshCredential(testDb, registeredAuthenticator);

        // Same credential id, but a freshly generated (different) key pair — simulates an
        // attacker who knows the credential id but not the private key.
        const forger = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
            credentialId: isoBase64URL.toBuffer(registeredAuthenticator.credentialId),
        });

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const response = forger.authenticate({
            challenge: options.challenge,
            userHandle: accountId,
        });
        const result = await verifyLogin(testDb.db, CONFIG, { ceremonyToken, response });

        expect(result).toEqual({ ok: false, reason: 'verification_failed' });
    });

    it('rejects an unverified assertion whose UV bit was set after signing', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId } = await registerFreshCredential(testDb, authenticator);

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const base = authenticator.authenticate({
            challenge: options.challenge,
            userHandle: accountId,
            userVerified: false,
        });
        // Precondition: the signed bytes really lack UV, so the tamper is an upgrade that must
        // reach the signature check — see setUvBitAfterSigning.
        expect(isoBase64URL.toBuffer(base.response.authenticatorData)[FLAGS_OFFSET] & UV_FLAG).toBe(
            0,
        );
        const tampered: AuthenticationResponseJSON = {
            ...base,
            response: {
                ...base.response,
                authenticatorData: setUvBitAfterSigning(base.response.authenticatorData),
            },
        };

        const result = await verifyLogin(testDb.db, CONFIG, { ceremonyToken, response: tampered });
        expect(result).toEqual({ ok: false, reason: 'verification_failed' });
    });

    it('returns malformed_request for a null input instead of throwing', async () => {
        testDb = createTestDatabase();
        const result = await verifyLogin(
            testDb.db,
            CONFIG,
            null as unknown as Parameters<typeof verifyLogin>[2],
        );
        expect(result).toEqual({ ok: false, reason: 'malformed_request' });
    });

    it('rejects a response scoped to the wrong origin, through the real verify path', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId } = await registerFreshCredential(testDb, authenticator);

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const response = authenticator.authenticate({
            challenge: options.challenge,
            origin: 'https://evil.example',
            userHandle: accountId,
        });
        const result = await verifyLogin(testDb.db, CONFIG, { ceremonyToken, response });

        expect(result).toEqual({ ok: false, reason: 'verification_failed' });
    });

    it('rejects a response scoped to the wrong RP ID, through the real verify path', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId } = await registerFreshCredential(testDb, authenticator);

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const response = authenticator.authenticate({
            challenge: options.challenge,
            rpId: 'evil.example',
            userHandle: accountId,
        });
        const result = await verifyLogin(testDb.db, CONFIG, { ceremonyToken, response });

        expect(result).toEqual({ ok: false, reason: 'verification_failed' });
    });

    it('rejects an authenticator response lacking the UV flag, through the real verify path', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId } = await registerFreshCredential(testDb, authenticator);

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const response = authenticator.authenticate({
            challenge: options.challenge,
            userVerified: false,
            userHandle: accountId,
        });
        const result = await verifyLogin(testDb.db, CONFIG, { ceremonyToken, response });

        expect(result).toEqual({ ok: false, reason: 'verification_failed' });
    });

    it('rejects a claim against an expired challenge', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId } = await registerFreshCredential(testDb, authenticator);

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        expireAllChallenges(testDb);
        const response = authenticator.authenticate({
            challenge: options.challenge,
            userHandle: accountId,
        });
        const result = await verifyLogin(testDb.db, CONFIG, { ceremonyToken, response });

        expect(result).toEqual({ ok: false, reason: 'ceremony_expired' });
    });

    it('cannot claim a login challenge a second time (replay)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId } = await registerFreshCredential(testDb, authenticator);

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const response = authenticator.authenticate({
            challenge: options.challenge,
            counter: 1,
            userHandle: accountId,
        });

        const first = await verifyLogin(testDb.db, CONFIG, { ceremonyToken, response });
        expect(first.ok).toBe(true);

        const second = await verifyLogin(testDb.db, CONFIG, { ceremonyToken, response });
        expect(second).toEqual({ ok: false, reason: 'ceremony_not_found' });
    });

    it('lets exactly one of two concurrent claims of the same ceremony token succeed', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId } = await registerFreshCredential(testDb, authenticator);

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const response = authenticator.authenticate({
            challenge: options.challenge,
            counter: 1,
            userHandle: accountId,
        });

        const [a, b] = await Promise.all([
            verifyLogin(testDb.db, CONFIG, { ceremonyToken, response }),
            verifyLogin(testDb.db, CONFIG, { ceremonyToken, response }),
        ]);

        const outcomes = [a, b];
        expect(outcomes.filter((r) => r.ok)).toHaveLength(1);
        const failure = outcomes.find((r) => !r.ok);
        expect(failure).toEqual({ ok: false, reason: 'ceremony_not_found' });
    });

    it('rejects (and consumes) a ceremony token minted for registration', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        await registerFreshCredential(testDb, authenticator);

        const now = Date.now();
        const { token, hash } = generateCeremonyToken();
        insertChallenge(testDb.db, {
            id: 'registration-ceremony',
            accountId: 'pending-account',
            sessionId: null,
            challenge: 'irrelevant-challenge',
            type: 'registration',
            createdAt: now,
            expiresAt: now + 60_000,
            ceremonyHash: hash,
        });

        const response = authenticator.authenticate({ challenge: 'irrelevant-challenge' });
        const result = await verifyLogin(testDb.db, CONFIG, { ceremonyToken: token, response });
        expect(result).toEqual({ ok: false, reason: 'ceremony_type_mismatch' });

        const secondAttempt = await verifyLogin(testDb.db, CONFIG, {
            ceremonyToken: token,
            response,
        });
        expect(secondAttempt).toEqual({ ok: false, reason: 'ceremony_not_found' });
    });

    it('rejects an assertion for a credential id that was never registered', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const response = authenticator.authenticate({ challenge: options.challenge });
        const result = await verifyLogin(testDb.db, CONFIG, { ceremonyToken, response });

        expect(result).toEqual({ ok: false, reason: 'credential_not_found' });
    });

    // --- P2-1: a failed verification still consumes the challenge -----------------------------

    it('does not leave the challenge claimable after a failed verification (consume-on-failure)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId } = await registerFreshCredential(testDb, authenticator);

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const badResponse = authenticator.authenticate({
            challenge: options.challenge,
            origin: 'https://evil.example',
            userHandle: accountId,
        });
        const failed = await verifyLogin(testDb.db, CONFIG, {
            ceremonyToken,
            response: badResponse,
        });
        expect(failed).toEqual({ ok: false, reason: 'verification_failed' });

        // Present the SAME token again with a fully valid response — the row must already be
        // gone, regardless of the fact that the first presentation failed verification.
        const goodResponse = authenticator.authenticate({
            challenge: options.challenge,
            userHandle: accountId,
        });
        const retried = await verifyLogin(testDb.db, CONFIG, {
            ceremonyToken,
            response: goodResponse,
        });
        expect(retried).toEqual({ ok: false, reason: 'ceremony_not_found' });
    });

    // --- P2-2: ceremony-token binding -----------------------------------------------------------
    // Two independent scenarios (not sequential reuse of the same pair — claiming one already
    // consumes it) so the exposure doesn't depend on which of the two live rows a broken
    // "claim any outstanding challenge of the same type" implementation happens to pick.

    it('rejects a login response signed for a different, still-live ceremony (token binding)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId } = await registerFreshCredential(testDb, authenticator);

        // Scenario 1: A minted first, B second. Present B's token with a response actually
        // valid for A's (older) challenge.
        const a1 = await startLogin(testDb.db, CONFIG);
        const b1 = await startLogin(testDb.db, CONFIG);
        const cross1 = authenticator.authenticate({
            challenge: a1.options.challenge,
            userHandle: accountId,
        });
        const result1 = await verifyLogin(testDb.db, CONFIG, {
            ceremonyToken: b1.ceremonyToken,
            response: cross1,
        });
        expect(result1).toEqual({ ok: false, reason: 'verification_failed' });

        // Scenario 2: same shape, but present A's token with a response valid for B's (newer)
        // challenge — covers a hypothetical "grab the newest" implementation too.
        const a2 = await startLogin(testDb.db, CONFIG);
        const b2 = await startLogin(testDb.db, CONFIG);
        const cross2 = authenticator.authenticate({
            challenge: b2.options.challenge,
            userHandle: accountId,
        });
        const result2 = await verifyLogin(testDb.db, CONFIG, {
            ceremonyToken: a2.ceremonyToken,
            response: cross2,
        });
        expect(result2).toEqual({ ok: false, reason: 'verification_failed' });
    });

    it('rejects a non-zero counter regression (caught by the library itself, pre-commit)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        testDb.db
            .prepare('UPDATE credentials SET sign_count = ? WHERE id = ?')
            .run(5, credentialId);

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const response = authenticator.authenticate({
            challenge: options.challenge,
            counter: 5,
            userHandle: accountId,
        });
        const result = await verifyLogin(testDb.db, CONFIG, { ceremonyToken, response });

        // `verifyAuthenticationResponse` itself throws when `counter <= credential.counter` and
        // either is non-zero ("Response counter value 5 was lower than expected 5") — that
        // throw is caught and mapped to 'verification_failed' before this module's own
        // 'counter_regression' commit-time guard is ever reached. The commit-time guard's own
        // failure reason is exercised by the forced-race test below, where the library's
        // per-request check already passed against a now-stale value and only the conditional
        // UPDATE at commit time can tell.
        expect(result).toEqual({ ok: false, reason: 'verification_failed' });

        const credentialRow = testDb.db
            .prepare('SELECT sign_count FROM credentials WHERE id = ?')
            .get(credentialId) as unknown as { sign_count: number };
        expect(credentialRow.sign_count).toBe(5);
    });

    it('accepts and persists a strictly increasing counter', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        testDb.db
            .prepare('UPDATE credentials SET sign_count = ? WHERE id = ?')
            .run(5, credentialId);

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const response = authenticator.authenticate({
            challenge: options.challenge,
            counter: 6,
            userHandle: accountId,
        });
        const result = await verifyLogin(testDb.db, CONFIG, { ceremonyToken, response });

        expect(result.ok).toBe(true);
        const credentialRow = testDb.db
            .prepare('SELECT sign_count FROM credentials WHERE id = ?')
            .get(credentialId) as unknown as { sign_count: number };
        expect(credentialRow.sign_count).toBe(6);
    });

    it('cannot both commit a counter the other concurrent login has already passed', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        testDb.db
            .prepare('UPDATE credentials SET sign_count = ? WHERE id = ?')
            .run(5, credentialId);

        const first = await startLogin(testDb.db, CONFIG);
        const second = await startLogin(testDb.db, CONFIG);
        const firstResponse = authenticator.authenticate({
            challenge: first.options.challenge,
            counter: 6,
            userHandle: accountId,
        });
        const secondResponse = authenticator.authenticate({
            challenge: second.options.challenge,
            counter: 6,
            userHandle: accountId,
        });

        const [a, b] = await Promise.all([
            verifyLogin(testDb.db, CONFIG, {
                ceremonyToken: first.ceremonyToken,
                response: firstResponse,
            }),
            verifyLogin(testDb.db, CONFIG, {
                ceremonyToken: second.ceremonyToken,
                response: secondResponse,
            }),
        ]);

        const outcomes = [a, b];
        expect(outcomes.filter((r) => r.ok)).toHaveLength(1);
        const failure = outcomes.find((r) => !r.ok);
        expect(failure).toEqual({ ok: false, reason: 'counter_regression' });

        const credentialRow = testDb.db
            .prepare('SELECT sign_count FROM credentials WHERE id = ?')
            .get(credentialId) as unknown as { sign_count: number };
        expect(credentialRow.sign_count).toBe(6);
    });

    // --- P2-3: commit-time guards, forced via a real await-gap (not Promise.all) ---------------
    // `verifyLogin(...)` is called but NOT awaited yet; while it's suspended at its internal
    // `await verifyAuthenticationResponse(...)`, the test synchronously mutates the database out
    // from under it, then awaits. Because JS suspends an async function at its first `await`
    // regardless of how long that awaited operation takes, the synchronous mutation below is
    // guaranteed to land before verifyLogin resumes — this is deterministic, not a timing race.

    it('P2-3a: a forced counter race at commit time returns counter_regression and does not reset the count', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);
        // Stored sign_count is 0 (fresh registration).

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const response = authenticator.authenticate({
            challenge: options.challenge,
            counter: 0,
            userHandle: accountId,
        });

        const pending = verifyLogin(testDb.db, CONFIG, { ceremonyToken, response });
        // Forced mid-flight write: a racing login (or admin action) already advanced the
        // counter to 3 while this one was suspended awaiting the library's async verify.
        testDb.db
            .prepare('UPDATE credentials SET sign_count = ? WHERE id = ?')
            .run(3, credentialId);

        const result = await pending;
        expect(result).toEqual({ ok: false, reason: 'counter_regression' });

        const row = testDb.db
            .prepare('SELECT sign_count FROM credentials WHERE id = ?')
            .get(credentialId) as unknown as { sign_count: number };
        expect(row.sign_count).toBe(3);
    });

    it('P2-3b: the account being deleted mid-flight returns account_not_found', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId } = await registerFreshCredential(testDb, authenticator);

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const response = authenticator.authenticate({
            challenge: options.challenge,
            counter: 0,
            userHandle: accountId,
        });

        const pending = verifyLogin(testDb.db, CONFIG, { ceremonyToken, response });
        // Forced mid-flight delete of only the account row (foreign_keys is toggled off just
        // for this statement so the still-present credential row doesn't block it — this
        // simulates an account-delete flow, not a schema violation).
        testDb.db.exec('PRAGMA foreign_keys = OFF');
        testDb.db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);
        testDb.db.exec('PRAGMA foreign_keys = ON');

        const result = await pending;
        expect(result).toEqual({ ok: false, reason: 'account_not_found' });
    });

    it('P2-3c: the credential being deleted mid-flight returns credential_not_found', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId, credentialId } = await registerFreshCredential(testDb, authenticator);

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const response = authenticator.authenticate({
            challenge: options.challenge,
            counter: 0,
            userHandle: accountId,
        });

        const pending = verifyLogin(testDb.db, CONFIG, { ceremonyToken, response });
        // Forced mid-flight delete of only the credential row — FK-safe (a child row can
        // always be removed) and leaves the account intact.
        testDb.db.prepare('DELETE FROM credentials WHERE id = ?').run(credentialId);

        const result = await pending;
        expect(result).toEqual({ ok: false, reason: 'credential_not_found' });
    });

    // --- P2-6: malformed input returns a typed failure, never throws ---------------------------

    it('rejects response: null as malformed_request', async () => {
        testDb = createTestDatabase();
        const { ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const result = await verifyLogin(testDb.db, CONFIG, {
            ceremonyToken,
            response: null as unknown as AuthenticationResponseJSON,
        });
        expect(result).toEqual({ ok: false, reason: 'malformed_request' });
    });

    it('rejects a response missing the nested response object as malformed_request', async () => {
        testDb = createTestDatabase();
        const { ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const malformed = { id: 'x', rawId: 'x', type: 'public-key', clientExtensionResults: {} };
        const result = await verifyLogin(testDb.db, CONFIG, {
            ceremonyToken,
            response: malformed as unknown as AuthenticationResponseJSON,
        });
        expect(result).toEqual({ ok: false, reason: 'malformed_request' });
    });

    it('rejects a non-string ceremonyToken as malformed_request', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { options } = await startLogin(testDb.db, CONFIG);
        const response = authenticator.authenticate({ challenge: options.challenge });
        const result = await verifyLogin(testDb.db, CONFIG, {
            ceremonyToken: 12345 as unknown as string,
            response,
        });
        expect(result).toEqual({ ok: false, reason: 'malformed_request' });
    });

    it('rejects response.id as an array as malformed_request', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const base = authenticator.authenticate({ challenge: options.challenge });
        const malformed = { ...base, id: [] as unknown as string };
        const result = await verifyLogin(testDb.db, CONFIG, {
            ceremonyToken,
            response: malformed as unknown as AuthenticationResponseJSON,
        });
        expect(result).toEqual({ ok: false, reason: 'malformed_request' });
    });

    it('rejects response.id as an object (node:sqlite named-parameter trap) as malformed_request', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const base = authenticator.authenticate({ challenge: options.challenge });
        const malformed = { ...base, id: {} as unknown as string };
        const result = await verifyLogin(testDb.db, CONFIG, {
            ceremonyToken,
            response: malformed as unknown as AuthenticationResponseJSON,
        });
        expect(result).toEqual({ ok: false, reason: 'malformed_request' });
    });

    it('does not consume the challenge when the request is malformed', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { accountId } = await registerFreshCredential(testDb, authenticator);

        const { options, ceremonyToken } = await startLogin(testDb.db, CONFIG);
        const malformedResult = await verifyLogin(testDb.db, CONFIG, {
            ceremonyToken,
            response: null as unknown as AuthenticationResponseJSON,
        });
        expect(malformedResult).toEqual({ ok: false, reason: 'malformed_request' });

        // The SAME token, now with a well-formed, fully valid response, still succeeds — the
        // malformed attempt above never touched the database, let alone consumed the row.
        const validResponse = authenticator.authenticate({
            challenge: options.challenge,
            userHandle: accountId,
        });
        const result = await verifyLogin(testDb.db, CONFIG, {
            ceremonyToken,
            response: validResponse,
        });
        expect(result.ok).toBe(true);
    });
});
