import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
    generateRegistrationOptions,
    type PublicKeyCredentialCreationOptionsJSON,
    type RegistrationResponseJSON,
    verifyRegistrationResponse,
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
import { encodeTransports, isDuplicateCredentialIdError } from './credential-row.js';
import { isMalformedCeremonyRequest } from './request-guard.js';

/** There are no usernames (decision 11) — every registration gets this label unless overridden. */
const DEFAULT_LABEL = 'Ensemble';
/** A "bounded caller label" per decision 11 — generous, but not unbounded. */
const MAX_LABEL_LENGTH = 64;

export interface StartRegistrationInput {
    /**
     * Optional caller-supplied display label. Must be non-empty and at most
     * `MAX_LABEL_LENGTH` characters when provided; omit it to use the default. Safari/iCloud
     * Keychain rejects `navigator.credentials.create()` outright on an empty display name, so
     * this never resolves to `''`.
     */
    label?: string;
}

export interface StartRegistrationResult {
    options: PublicKeyCredentialCreationOptionsJSON;
    /** Opaque ceremony token the caller must present back to `verifyRegistration`. */
    ceremonyToken: string;
}

function resolveLabel(label: string | undefined): string {
    if (label === undefined) {
        return DEFAULT_LABEL;
    }
    const trimmed = label.trim();
    if (trimmed.length === 0) {
        throw new Error('label must not be empty when provided');
    }
    if (trimmed.length > MAX_LABEL_LENGTH) {
        throw new Error(
            `label must be at most ${MAX_LABEL_LENGTH} characters, got ${trimmed.length}`,
        );
    }
    return trimmed;
}

/**
 * Generates `navigator.credentials.create()` options for a new discoverable passkey and mints
 * the ceremony token/challenge row backing it.
 *
 * Mints the pending account id here (decision 6): 32 random bytes, base64url-encoded, stored
 * as the challenge row's `account_id` (nullable, no foreign key — this account does not exist
 * yet) and passed to the library as the raw WebAuthn `userID`. `verifyRegistration` reads it
 * back off the claimed challenge row and uses it as the real account id on successful commit.
 */
export async function startRegistration(
    db: DatabaseSync,
    config: WebAuthnConfig,
    input: StartRegistrationInput = {},
): Promise<StartRegistrationResult> {
    const now = Date.now();
    sweepExpiredChallenges(db, now);

    const label = resolveLabel(input.label);
    const userIdBytes = randomBytes(32);
    const accountId = userIdBytes.toString('base64url');

    const options = await generateRegistrationOptions({
        rpName: config.rpName,
        rpID: config.rpId,
        userID: userIdBytes,
        userName: label,
        userDisplayName: label,
        attestationType: 'none',
        authenticatorSelection: {
            residentKey: 'required',
            userVerification: 'required',
        },
        // Keep the library default (EdDSA/ES256/RS256): restricting to ES256 would break
        // Windows Hello, which uses RS256, and Edge on Windows is a target device.
    });

    const { token, hash } = generateCeremonyToken();
    insertChallenge(db, {
        id: randomBytes(16).toString('base64url'),
        accountId,
        challenge: options.challenge,
        type: 'registration',
        createdAt: now,
        expiresAt: now + CHALLENGE_TTL_MS,
        ceremonyHash: hash,
    });

    return { options, ceremonyToken: token };
}

export interface VerifyRegistrationInput {
    ceremonyToken: string;
    response: RegistrationResponseJSON;
}

export type RegistrationFailureReason =
    | 'malformed_request'
    | 'ceremony_not_found'
    | 'ceremony_expired'
    | 'ceremony_type_mismatch'
    | 'verification_failed'
    | 'credential_exists';

export type RegistrationResult =
    | { ok: true; accountId: string; credentialId: string }
    | { ok: false; reason: RegistrationFailureReason };

/**
 * Verifies a completed registration ceremony and, on success, commits a new account and its
 * first credential in one transaction. Never issues a session (that is #1189).
 *
 * The challenge claim (`claimChallenge`) is the very first statement this function executes —
 * synchronous, before any `await` — so it is atomic under concurrent presentations of the same
 * ceremony token. Do not reorder anything above it.
 */
export async function verifyRegistration(
    db: DatabaseSync,
    config: WebAuthnConfig,
    input: VerifyRegistrationInput,
): Promise<RegistrationResult> {
    // Shape guard first (P2-6): synchronous, touches nothing, and runs before the claim below —
    // a malformed request must NOT consume the ceremony token. A well-formed retry with the
    // same token still finds the challenge waiting.
    if (isMalformedCeremonyRequest(input)) {
        return { ok: false, reason: 'malformed_request' };
    }

    const now = Date.now();

    // Must be the first statement to touch the database in this function, before any `await`
    // — see claimChallenge's doc comment for why.
    const claim = claimChallenge(db, hashCeremonyToken(input.ceremonyToken), 'registration', now);
    if (!claim.ok) {
        return { ok: false, reason: claim.reason };
    }

    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
        verification = await verifyRegistrationResponse({
            response: input.response,
            expectedChallenge: claim.row.challenge,
            expectedOrigin: config.origin,
            // Explicit at this call site even though the library treats it as optional here —
            // omitting it silently disables the RP ID check entirely (measured against v14.0.1;
            // see the orchestrator's decision comment on #1188). Never omit this.
            expectedRPID: config.rpId,
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

    const accountId = claim.row.account_id;
    if (accountId === null) {
        // Unreachable in practice: startRegistration always sets account_id for a
        // 'registration'-typed row. Fail closed rather than insert a credential with a null owner.
        return { ok: false, reason: 'verification_failed' };
    }

    const { credential } = verification.registrationInfo;

    // Cross-check the top-level response id against the id the library actually decoded out of
    // the attestation object's authenticator data. They should always agree; requiring it
    // explicitly closes off a response crafted with a mismatched top-level id/rawId (e.g. both
    // set to an attacker-chosen "AAAA") from being accepted and stored under the wrong id.
    if (credential.id !== input.response.id) {
        return { ok: false, reason: 'verification_failed' };
    }

    try {
        withTransaction(db, () => {
            db.prepare('INSERT INTO accounts (id, created_at) VALUES (?, ?)').run(accountId, now);
            db.prepare(
                `INSERT INTO credentials
                    (id, account_id, public_key, sign_count, transports, created_at, last_used_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ).run(
                credential.id,
                accountId,
                Buffer.from(credential.publicKey),
                credential.counter,
                encodeTransports(credential.transports),
                now,
                null,
            );
        });
    } catch (error) {
        if (isDuplicateCredentialIdError(error)) {
            return { ok: false, reason: 'credential_exists' };
        }
        throw error;
    }

    return { ok: true, accountId, credentialId: credential.id };
}
