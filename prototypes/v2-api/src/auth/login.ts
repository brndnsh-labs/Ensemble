import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
    type AuthenticationResponseJSON,
    generateAuthenticationOptions,
    type PublicKeyCredentialRequestOptionsJSON,
    verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { withTransaction } from '../db/transaction.js';
import {
    CHALLENGE_TTL_MS,
    claimChallenge,
    generateCeremonyToken,
    hashCeremonyToken,
    insertChallenge,
    sweepExpiredChallenges,
} from './challenges.js';
import type { WebAuthnConfig } from './config.js';
import { type CredentialRow, decodeTransports } from './credential-row.js';
import { isMalformedCeremonyRequest } from './request-guard.js';

export interface StartLoginResult {
    options: PublicKeyCredentialRequestOptionsJSON;
    /** Opaque ceremony token the caller must present back to `verifyLogin`. */
    ceremonyToken: string;
}

/**
 * Generates `navigator.credentials.get()` options for a usernameless login. `allowCredentials`
 * is deliberately empty — that is what makes the flow discoverable/usernameless: the browser
 * prompts with every resident credential it holds for this RP rather than the caller naming one
 * up front.
 */
export async function startLogin(
    db: DatabaseSync,
    config: WebAuthnConfig,
): Promise<StartLoginResult> {
    const now = Date.now();
    sweepExpiredChallenges(db, now);

    const options = await generateAuthenticationOptions({
        rpID: config.rpId,
        userVerification: 'required',
        allowCredentials: [],
    });

    const { token, hash } = generateCeremonyToken();
    insertChallenge(db, {
        id: randomBytes(16).toString('base64url'),
        // No account is known yet — this is exactly what usernameless login means.
        accountId: null,
        challenge: options.challenge,
        type: 'login',
        createdAt: now,
        expiresAt: now + CHALLENGE_TTL_MS,
        ceremonyHash: hash,
    });

    return { options, ceremonyToken: token };
}

export interface VerifyLoginInput {
    ceremonyToken: string;
    response: AuthenticationResponseJSON;
}

export type LoginFailureReason =
    | 'malformed_request'
    | 'ceremony_not_found'
    | 'ceremony_expired'
    | 'ceremony_type_mismatch'
    | 'credential_not_found'
    | 'user_handle_missing'
    | 'user_handle_mismatch'
    | 'verification_failed'
    | 'account_not_found'
    | 'counter_regression';

export type LoginResult =
    | { ok: true; accountId: string; credentialId: string }
    | { ok: false; reason: LoginFailureReason };

class CommitAbort extends Error {
    constructor(readonly reason: LoginFailureReason) {
        super(reason);
    }
}

/**
 * Verifies a completed login ceremony and, on success, persists the rotated signature counter.
 * Never issues a session (that is #1189) — the return value is only `{ accountId, credentialId }`.
 *
 * The challenge claim (`claimChallenge`) is the very first statement this function executes —
 * synchronous, before any `await` — so it is atomic under concurrent presentations of the same
 * ceremony token. Do not reorder anything above it.
 */
export async function verifyLogin(
    db: DatabaseSync,
    config: WebAuthnConfig,
    input: VerifyLoginInput,
): Promise<LoginResult> {
    // Shape guard first (P2-6): synchronous, touches nothing, and runs before the claim below —
    // a malformed request must NOT consume the ceremony token. A well-formed retry with the
    // same token still finds the challenge waiting.
    if (isMalformedCeremonyRequest(input)) {
        return { ok: false, reason: 'malformed_request' };
    }

    const now = Date.now();

    // Must be the first statement to touch the database in this function, before any `await`
    // — see claimChallenge's doc comment for why.
    const claim = claimChallenge(db, hashCeremonyToken(input.ceremonyToken), 'login', now);
    if (!claim.ok) {
        return { ok: false, reason: claim.reason };
    }

    const credentialRow = db
        .prepare('SELECT * FROM credentials WHERE id = ?')
        .get(input.response.id) as unknown as CredentialRow | undefined;
    if (!credentialRow) {
        return { ok: false, reason: 'credential_not_found' };
    }

    // Credential-substitution guard, corrected from the original decision 6 (P3): login here is
    // always discoverable (`allowCredentials: []`, decision 10), and per WebAuthn L3 §7.2 step
    // 6, `userHandle` is REQUIRED whenever the user wasn't identified before the ceremony began
    // — which is always true for this flow. `undefined`, `null` and `''` are all "absent" and
    // rejected identically as `user_handle_missing`; a *present* handle naming a different
    // account is the separate `user_handle_mismatch` case.
    const userHandle = input.response.response.userHandle;
    if (userHandle === undefined || userHandle === null || userHandle === '') {
        return { ok: false, reason: 'user_handle_missing' };
    }
    if (userHandle !== credentialRow.account_id) {
        return { ok: false, reason: 'user_handle_mismatch' };
    }

    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
        verification = await verifyAuthenticationResponse({
            response: input.response,
            expectedChallenge: claim.row.challenge,
            expectedOrigin: config.origin,
            expectedRPID: config.rpId,
            credential: {
                id: credentialRow.id,
                publicKey: new Uint8Array(credentialRow.public_key),
                counter: credentialRow.sign_count,
                transports: decodeTransports(credentialRow.transports),
            },
            // Explicit even though `true` is also the library default: never rely on the
            // default happening to match policy. Ensemble requires user verification.
            requireUserVerification: true,
        });
    } catch {
        return { ok: false, reason: 'verification_failed' };
    }

    if (!verification.verified) {
        return { ok: false, reason: 'verification_failed' };
    }

    const newCounter = verification.authenticationInfo.newCounter;

    try {
        return withTransaction(db, () => {
            // Re-check account and credential state at commit time (issue body), not just at
            // the pre-verify lookup above — a concurrent revoke/delete between the lookup and
            // this point must not silently commit a stale write.
            const account = db
                .prepare('SELECT id FROM accounts WHERE id = ?')
                .get(credentialRow.account_id);
            if (!account) {
                throw new CommitAbort('account_not_found');
            }
            const freshCredential = db
                .prepare('SELECT sign_count FROM credentials WHERE id = ?')
                .get(credentialRow.id) as { sign_count: number } | undefined;
            if (!freshCredential) {
                throw new CommitAbort('credential_not_found');
            }

            // Monotonic counter under concurrency (decision 9). Synced passkeys always report
            // counter 0 (measured: 0 -> 0 verifies) — a naive "must strictly increase" check
            // would lock out every iCloud/Google-synced passkey, so 0 -> 0 is the one allowed
            // exception. Zero rows changed means a counter regression: a racing login already
            // committed a counter this one has already passed, or a cloned authenticator.
            const info = db
                .prepare(
                    `UPDATE credentials SET sign_count = ?, last_used_at = ?
                     WHERE id = ? AND (sign_count < ? OR (? = 0 AND sign_count = 0))`,
                )
                .run(newCounter, now, credentialRow.id, newCounter, newCounter);
            if (info.changes === 0) {
                throw new CommitAbort('counter_regression');
            }

            return {
                ok: true,
                accountId: credentialRow.account_id,
                credentialId: credentialRow.id,
            } as const;
        });
    } catch (error) {
        if (error instanceof CommitAbort) {
            return { ok: false, reason: error.reason };
        }
        throw error;
    }
}
