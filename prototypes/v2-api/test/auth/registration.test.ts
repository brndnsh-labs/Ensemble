import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { afterEach, describe, expect, it } from 'vitest';
import { hashCeremonyToken } from '../../src/auth/challenges.js';
import { createWebAuthnConfig, type WebAuthnConfig } from '../../src/auth/config.js';
import type { CredentialRow } from '../../src/auth/credential-row.js';
import { startRegistration, verifyRegistration } from '../../src/auth/registration.js';
import { createSoftAuthenticator } from '../helpers/soft-authenticator.js';
import { createTestDatabase, type TestDatabase } from '../helpers/test-db.js';

const CONFIG: WebAuthnConfig = createWebAuthnConfig({
    rpId: 'localhost',
    rpName: 'Ensemble Test',
    origin: 'http://localhost:5173',
});

function expireAllChallenges(testDb: TestDatabase): void {
    testDb.db.exec('UPDATE challenges SET expires_at = 0');
}

describe('registration ceremony (#1188)', () => {
    let testDb: TestDatabase;

    afterEach(() => {
        testDb?.cleanup();
    });

    it('registers a new discoverable passkey end-to-end against the real verify path', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });

        const { options, ceremonyToken } = await startRegistration(testDb.db, CONFIG);
        expect(options.authenticatorSelection?.residentKey).toBe('required');
        expect(options.authenticatorSelection?.userVerification).toBe('required');

        const response = authenticator.register({ challenge: options.challenge });
        const result = await verifyRegistration(testDb.db, CONFIG, { ceremonyToken, response });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            throw new Error('unreachable');
        }
        expect(result.accountId).toBeTruthy();
        expect(result.credentialId).toBe(authenticator.credentialId);
        // No session is issued by this story (that is #1189) — the success shape is exactly
        // { ok, accountId, credentialId }, nothing more.
        expect(Object.keys(result).sort()).toEqual(['accountId', 'credentialId', 'ok']);

        const accountRow = testDb.db
            .prepare('SELECT id FROM accounts WHERE id = ?')
            .get(result.accountId);
        expect(accountRow).toBeTruthy();

        const credentialRow = testDb.db
            .prepare('SELECT * FROM credentials WHERE id = ?')
            .get(result.credentialId) as unknown as CredentialRow;
        expect(credentialRow.account_id).toBe(result.accountId);
        expect(credentialRow.sign_count).toBe(0);
        expect(JSON.parse(credentialRow.transports ?? '[]')).toEqual(['internal']);
    });

    it('rejects a response scoped to the wrong origin, through the real verify path', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });

        const { options, ceremonyToken } = await startRegistration(testDb.db, CONFIG);
        const response = authenticator.register({
            challenge: options.challenge,
            origin: 'https://evil.example',
        });
        const result = await verifyRegistration(testDb.db, CONFIG, { ceremonyToken, response });

        expect(result).toEqual({ ok: false, reason: 'verification_failed' });
    });

    it('rejects a response scoped to the wrong RP ID, through the real verify path', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });

        const { options, ceremonyToken } = await startRegistration(testDb.db, CONFIG);
        const response = authenticator.register({
            challenge: options.challenge,
            rpId: 'evil.example',
        });
        const result = await verifyRegistration(testDb.db, CONFIG, { ceremonyToken, response });

        expect(result).toEqual({ ok: false, reason: 'verification_failed' });
    });

    it('rejects a response with a mismatched challenge, through the real verify path', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });

        const { ceremonyToken } = await startRegistration(testDb.db, CONFIG);
        const response = authenticator.register({ challenge: 'not-the-real-challenge' });
        const result = await verifyRegistration(testDb.db, CONFIG, { ceremonyToken, response });

        expect(result).toEqual({ ok: false, reason: 'verification_failed' });
    });

    it('rejects an authenticator response lacking the UV flag, through the real verify path', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });

        const { options, ceremonyToken } = await startRegistration(testDb.db, CONFIG);
        const response = authenticator.register({
            challenge: options.challenge,
            userVerified: false,
        });
        const result = await verifyRegistration(testDb.db, CONFIG, { ceremonyToken, response });

        expect(result).toEqual({ ok: false, reason: 'verification_failed' });
    });

    it('rejects a claim against an expired challenge', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });

        const { options, ceremonyToken } = await startRegistration(testDb.db, CONFIG);
        expireAllChallenges(testDb);
        const response = authenticator.register({ challenge: options.challenge });
        const result = await verifyRegistration(testDb.db, CONFIG, { ceremonyToken, response });

        expect(result).toEqual({ ok: false, reason: 'ceremony_expired' });
    });

    it('cannot claim a challenge a second time (replay)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });

        const { options, ceremonyToken } = await startRegistration(testDb.db, CONFIG);
        const response = authenticator.register({ challenge: options.challenge });

        const first = await verifyRegistration(testDb.db, CONFIG, { ceremonyToken, response });
        expect(first.ok).toBe(true);

        const second = await verifyRegistration(testDb.db, CONFIG, { ceremonyToken, response });
        expect(second).toEqual({ ok: false, reason: 'ceremony_not_found' });
    });

    it('lets exactly one of two concurrent claims of the same ceremony token succeed', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });

        const { options, ceremonyToken } = await startRegistration(testDb.db, CONFIG);
        const response = authenticator.register({ challenge: options.challenge });

        const [a, b] = await Promise.all([
            verifyRegistration(testDb.db, CONFIG, { ceremonyToken, response }),
            verifyRegistration(testDb.db, CONFIG, { ceremonyToken, response }),
        ]);

        const outcomes = [a, b];
        const successes = outcomes.filter((r) => r.ok);
        const failures = outcomes.filter((r) => !r.ok);
        expect(successes).toHaveLength(1);
        expect(failures).toHaveLength(1);
        expect(failures[0]).toEqual({ ok: false, reason: 'ceremony_not_found' });

        // Not a corrupt row: exactly one account and one credential exist afterward.
        const accountCount = testDb.db
            .prepare('SELECT COUNT(*) AS n FROM accounts')
            .get() as unknown as {
            n: number;
        };
        expect(accountCount.n).toBe(1);
    });

    it('rejects (and consumes) a ceremony token minted for login', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });

        // Mint a *login*-typed token directly against the challenges table to simulate one
        // presented to the registration endpoint.
        const now = Date.now();
        const { generateCeremonyToken, insertChallenge } = await import(
            '../../src/auth/challenges.js'
        );
        const { token, hash } = generateCeremonyToken();
        insertChallenge(testDb.db, {
            id: 'login-ceremony',
            accountId: null,
            sessionId: null,
            challenge: 'irrelevant-challenge',
            type: 'login',
            createdAt: now,
            expiresAt: now + 60_000,
            ceremonyHash: hash,
        });

        const response = authenticator.register({ challenge: 'irrelevant-challenge' });
        const result = await verifyRegistration(testDb.db, CONFIG, {
            ceremonyToken: token,
            response,
        });
        expect(result).toEqual({ ok: false, reason: 'ceremony_type_mismatch' });

        // The failed attempt already consumed the row — a second try gets nothing to claim.
        const secondAttempt = await verifyRegistration(testDb.db, CONFIG, {
            ceremonyToken: token,
            response,
        });
        expect(secondAttempt).toEqual({ ok: false, reason: 'ceremony_not_found' });
    });

    it('maps a duplicate credential id to a clean credential_exists failure', async () => {
        testDb = createTestDatabase();
        const fixedCredentialId = new Uint8Array(16).fill(7);
        const authenticator = createSoftAuthenticator({
            rpId: CONFIG.rpId,
            origin: CONFIG.origin,
            credentialId: fixedCredentialId,
        });

        const first = await startRegistration(testDb.db, CONFIG);
        const firstResponse = authenticator.register({ challenge: first.options.challenge });
        const firstResult = await verifyRegistration(testDb.db, CONFIG, {
            ceremonyToken: first.ceremonyToken,
            response: firstResponse,
        });
        expect(firstResult.ok).toBe(true);

        const second = await startRegistration(testDb.db, CONFIG);
        const secondResponse = authenticator.register({ challenge: second.options.challenge });
        const secondResult = await verifyRegistration(testDb.db, CONFIG, {
            ceremonyToken: second.ceremonyToken,
            response: secondResponse,
        });
        expect(secondResult).toEqual({ ok: false, reason: 'credential_exists' });

        // Only the first account/credential landed.
        const accountCount = testDb.db
            .prepare('SELECT COUNT(*) AS n FROM accounts')
            .get() as unknown as {
            n: number;
        };
        expect(accountCount.n).toBe(1);
    });

    it('accepts a caller-supplied label as the display name', async () => {
        testDb = createTestDatabase();
        const { options } = await startRegistration(testDb.db, CONFIG, { label: 'My iPhone' });
        expect(options.user.displayName).toBe('My iPhone');
        expect(options.user.name).toBe('My iPhone');
    });

    it('defaults the label to "Ensemble" when none is given', async () => {
        testDb = createTestDatabase();
        const { options } = await startRegistration(testDb.db, CONFIG);
        expect(options.user.displayName).toBe('Ensemble');
    });

    it('rejects an explicitly empty label rather than resolving to an empty display name', async () => {
        testDb = createTestDatabase();
        await expect(startRegistration(testDb.db, CONFIG, { label: '   ' })).rejects.toThrow();
    });

    it('rejects a label over the bounded length', async () => {
        testDb = createTestDatabase();
        await expect(
            startRegistration(testDb.db, CONFIG, { label: 'x'.repeat(65) }),
        ).rejects.toThrow();
    });

    it('sanity-checks that the ceremony token is not the raw challenge (hash stored, not the token)', async () => {
        testDb = createTestDatabase();
        const { ceremonyToken } = await startRegistration(testDb.db, CONFIG);
        const row = testDb.db
            .prepare('SELECT ceremony_hash FROM challenges WHERE ceremony_hash = ?')
            .get(hashCeremonyToken(ceremonyToken));
        expect(row).toBeTruthy();
        const rawTokenRow = testDb.db
            .prepare('SELECT ceremony_hash FROM challenges WHERE ceremony_hash = ?')
            .get(ceremonyToken);
        expect(rawTokenRow).toBeUndefined();
    });

    it('rejects a response whose top-level id does not match the id decoded from the attestation object', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });

        const { options, ceremonyToken } = await startRegistration(testDb.db, CONFIG);
        const base = authenticator.register({ challenge: options.challenge });
        // Attacker-chosen top-level id/rawId, disagreeing with the id embedded in the (still
        // correctly signed/attested) attestation object.
        const tampered: RegistrationResponseJSON = { ...base, id: 'AAAA', rawId: 'AAAA' };

        const result = await verifyRegistration(testDb.db, CONFIG, {
            ceremonyToken,
            response: tampered,
        });
        expect(result).toEqual({ ok: false, reason: 'verification_failed' });

        // Nothing was stored under either id.
        const byRealId = testDb.db
            .prepare('SELECT id FROM credentials WHERE id = ?')
            .get(authenticator.credentialId);
        const byFakeId = testDb.db.prepare('SELECT id FROM credentials WHERE id = ?').get('AAAA');
        expect(byRealId).toBeUndefined();
        expect(byFakeId).toBeUndefined();
    });

    // --- P2-1: a failed verification still consumes the challenge ------------------------------

    it('does not leave the challenge claimable after a failed verification (consume-on-failure)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });

        const { options, ceremonyToken } = await startRegistration(testDb.db, CONFIG);
        const badResponse = authenticator.register({
            challenge: options.challenge,
            origin: 'https://evil.example',
        });
        const failed = await verifyRegistration(testDb.db, CONFIG, {
            ceremonyToken,
            response: badResponse,
        });
        expect(failed).toEqual({ ok: false, reason: 'verification_failed' });

        // Present the SAME token again with a fully valid response — the row must already be
        // gone, regardless of the fact that the first presentation failed verification.
        const goodResponse = authenticator.register({ challenge: options.challenge });
        const retried = await verifyRegistration(testDb.db, CONFIG, {
            ceremonyToken,
            response: goodResponse,
        });
        expect(retried).toEqual({ ok: false, reason: 'ceremony_not_found' });
    });

    // --- P2-2: ceremony-token binding -----------------------------------------------------------
    // Two independent scenarios (not sequential reuse of the same pair — claiming one already
    // consumes it) so the exposure doesn't depend on which of the two live rows a broken
    // "claim any outstanding challenge of the same type" implementation happens to pick.

    it('rejects a registration response signed for a different, still-live ceremony (token binding)', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });

        // Scenario 1: A minted first, B second. Present B's token with a response actually
        // valid for A's (older) challenge.
        const a1 = await startRegistration(testDb.db, CONFIG);
        const b1 = await startRegistration(testDb.db, CONFIG);
        const cross1 = authenticator.register({ challenge: a1.options.challenge });
        const result1 = await verifyRegistration(testDb.db, CONFIG, {
            ceremonyToken: b1.ceremonyToken,
            response: cross1,
        });
        expect(result1).toEqual({ ok: false, reason: 'verification_failed' });

        // Scenario 2: same shape, but present A's token with a response valid for B's (newer)
        // challenge — covers a hypothetical "grab the newest" implementation too.
        const a2 = await startRegistration(testDb.db, CONFIG);
        const b2 = await startRegistration(testDb.db, CONFIG);
        const cross2 = authenticator.register({ challenge: b2.options.challenge });
        const result2 = await verifyRegistration(testDb.db, CONFIG, {
            ceremonyToken: a2.ceremonyToken,
            response: cross2,
        });
        expect(result2).toEqual({ ok: false, reason: 'verification_failed' });
    });

    // --- P2-6: malformed input returns a typed failure, never throws ---------------------------

    it('rejects response: null as malformed_request', async () => {
        testDb = createTestDatabase();
        const { ceremonyToken } = await startRegistration(testDb.db, CONFIG);
        const result = await verifyRegistration(testDb.db, CONFIG, {
            ceremonyToken,
            response: null as unknown as RegistrationResponseJSON,
        });
        expect(result).toEqual({ ok: false, reason: 'malformed_request' });
    });

    it('rejects a response missing the nested response object as malformed_request', async () => {
        testDb = createTestDatabase();
        const { ceremonyToken } = await startRegistration(testDb.db, CONFIG);
        const malformed = { id: 'x', rawId: 'x', type: 'public-key', clientExtensionResults: {} };
        const result = await verifyRegistration(testDb.db, CONFIG, {
            ceremonyToken,
            response: malformed as unknown as RegistrationResponseJSON,
        });
        expect(result).toEqual({ ok: false, reason: 'malformed_request' });
    });

    it('rejects a non-string ceremonyToken as malformed_request', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { options } = await startRegistration(testDb.db, CONFIG);
        const response = authenticator.register({ challenge: options.challenge });
        const result = await verifyRegistration(testDb.db, CONFIG, {
            ceremonyToken: 12345 as unknown as string,
            response,
        });
        expect(result).toEqual({ ok: false, reason: 'malformed_request' });
    });

    it('rejects response.id as an array as malformed_request', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { options, ceremonyToken } = await startRegistration(testDb.db, CONFIG);
        const base = authenticator.register({ challenge: options.challenge });
        const malformed = { ...base, id: [] as unknown as string };
        const result = await verifyRegistration(testDb.db, CONFIG, {
            ceremonyToken,
            response: malformed as unknown as RegistrationResponseJSON,
        });
        expect(result).toEqual({ ok: false, reason: 'malformed_request' });
    });

    it('rejects a non-string rawId as malformed_request without consuming the challenge', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { options, ceremonyToken } = await startRegistration(testDb.db, CONFIG);
        const base = authenticator.register({ challenge: options.challenge });
        const malformed = { ...base, rawId: {} as unknown as string };
        const result = await verifyRegistration(testDb.db, CONFIG, {
            ceremonyToken,
            response: malformed as unknown as RegistrationResponseJSON,
        });
        expect(result).toEqual({ ok: false, reason: 'malformed_request' });

        // Without the rawId guard the library rejects this as verification_failed AFTER the
        // claim; the well-formed retry below proves the guard ran first.
        const retry = await verifyRegistration(testDb.db, CONFIG, {
            ceremonyToken,
            response: base,
        });
        expect(retry.ok).toBe(true);
    });

    it('stores [] for a non-array transports value instead of throwing after the claim', async () => {
        // Assigned like every other test so the suite's afterEach closes a live database rather
        // than re-closing the previous test's. Each value below still gets its own database.
        testDb = createTestDatabase();
        for (const transports of ['usb', {}, 7, true]) {
            const local = createTestDatabase();
            try {
                const authenticator = createSoftAuthenticator({
                    rpId: CONFIG.rpId,
                    origin: CONFIG.origin,
                });
                const { options, ceremonyToken } = await startRegistration(local.db, CONFIG);
                const base = authenticator.register({ challenge: options.challenge });
                const response = {
                    ...base,
                    response: { ...base.response, transports },
                } as unknown as RegistrationResponseJSON;

                const result = await verifyRegistration(local.db, CONFIG, {
                    ceremonyToken,
                    response,
                });
                expect(result.ok, `transports=${JSON.stringify(transports)}`).toBe(true);
                if (!result.ok) {
                    continue;
                }
                const row = local.db
                    .prepare('SELECT transports FROM credentials WHERE id = ?')
                    .get(result.credentialId) as unknown as Pick<CredentialRow, 'transports'>;
                expect(row.transports).toBe('[]');
            } finally {
                local.cleanup();
            }
        }
    });

    it('rejects response.id as an object (node:sqlite named-parameter trap) as malformed_request', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });
        const { options, ceremonyToken } = await startRegistration(testDb.db, CONFIG);
        const base = authenticator.register({ challenge: options.challenge });
        const malformed = { ...base, id: {} as unknown as string };
        const result = await verifyRegistration(testDb.db, CONFIG, {
            ceremonyToken,
            response: malformed as unknown as RegistrationResponseJSON,
        });
        expect(result).toEqual({ ok: false, reason: 'malformed_request' });
    });

    it('does not consume the challenge when the request is malformed', async () => {
        testDb = createTestDatabase();
        const authenticator = createSoftAuthenticator({ rpId: CONFIG.rpId, origin: CONFIG.origin });

        const { options, ceremonyToken } = await startRegistration(testDb.db, CONFIG);
        const malformedResult = await verifyRegistration(testDb.db, CONFIG, {
            ceremonyToken,
            response: null as unknown as RegistrationResponseJSON,
        });
        expect(malformedResult).toEqual({ ok: false, reason: 'malformed_request' });

        // The SAME token, now with a well-formed, fully valid response, still succeeds — the
        // malformed attempt above never touched the database, let alone consumed the row.
        const validResponse = authenticator.register({ challenge: options.challenge });
        const result = await verifyRegistration(testDb.db, CONFIG, {
            ceremonyToken,
            response: validResponse,
        });
        expect(result.ok).toBe(true);
    });
});
