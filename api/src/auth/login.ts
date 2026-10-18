import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
    type AuthenticationResponseJSON,
    generateAuthenticationOptions,
    type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import { verifyAssertionAndCommitCounter } from './assertion-commit.js';
import {
    CHALLENGE_TTL_MS,
    claimChallenge,
    generateCeremonyToken,
    hashCeremonyToken,
    insertChallenge,
    sweepExpiredChallenges,
} from './challenges.js';
import type { WebAuthnConfig } from './config.js';
import type { CredentialRow } from './credential-row.js';
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
        sessionId: null,
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

    // Shared with reauth (#1190 decision 3) — see assertion-commit.ts's doc comment. This is the
    // exact verify-and-commit sequence #1188 shipped, only moved so a second ceremony can reuse
    // it instead of copying it.
    const commit = await verifyAssertionAndCommitCounter(
        db,
        config,
        credentialRow,
        input.response,
        claim.row.challenge,
        now,
    );
    if (!commit.ok) {
        return { ok: false, reason: commit.reason };
    }

    return {
        ok: true,
        accountId: credentialRow.account_id,
        credentialId: credentialRow.id,
    };
}
