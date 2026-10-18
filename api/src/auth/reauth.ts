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
import { type CredentialRow, decodeTransports } from './credential-row.js';
import { isMalformedCeremonyRequest } from './request-guard.js';

/**
 * Step-up re-authentication (#1190 orchestrator decision 3). `POST /api/auth/reauth/options`
 * requires an already-valid session (checked at the HTTP layer, `src/http/app.ts` — this module
 * never parses a raw session token); its ONLY purpose is turning that session fresh again, so
 * unlike `passkeys.ts`'s add/revoke it deliberately does NOT itself require freshness anywhere.
 */
export interface StartReauthInput {
    accountId: string;
    /** The presented session's own id — bound into the challenge row so verify can require the
     * SAME session comes back, not merely a valid one for the same account. */
    sessionId: string;
}

export interface StartReauthResult {
    options: PublicKeyCredentialRequestOptionsJSON;
    /** Opaque ceremony token the caller must present back to `verifyReauth`. */
    ceremonyToken: string;
}

/**
 * Unlike `login.ts`'s usernameless `startLogin` (`allowCredentials: []`), reauth already knows
 * the account — `allowCredentials` is populated with exactly this account's own credentials so
 * the browser only offers THIS account's passkeys, never a discoverable picker across accounts.
 *
 * `now` is an injectable clock (default `Date.now()`), matching `startAddPasskey`/
 * `verifyAddPasskey` rather than `login.ts`/`registration.ts`'s always-real-clock convention.
 * Without this, `sweepExpiredChallenges` reads the REAL clock even when a test drives the app
 * through an injected fake one — sweeping (and thereby destroying) a challenge minted moments
 * earlier under a fake `now` in the past, a latent flake in exactly the tests that need to
 * inject time to exercise the fresh-auth window.
 */
export async function startReauth(
    db: DatabaseSync,
    config: WebAuthnConfig,
    input: StartReauthInput,
    now: number = Date.now(),
): Promise<StartReauthResult> {
    sweepExpiredChallenges(db, now);

    const credentialRows = db
        .prepare('SELECT id, transports FROM credentials WHERE account_id = ?')
        .all(input.accountId) as unknown as { id: string; transports: string | null }[];

    const options = await generateAuthenticationOptions({
        rpID: config.rpId,
        userVerification: 'required',
        allowCredentials: credentialRows.map((row) => ({
            id: row.id,
            transports: decodeTransports(row.transports),
        })),
    });

    const { token, hash } = generateCeremonyToken();
    insertChallenge(db, {
        id: randomBytes(16).toString('base64url'),
        accountId: input.accountId,
        sessionId: input.sessionId,
        challenge: options.challenge,
        type: 'reauth',
        createdAt: now,
        expiresAt: now + CHALLENGE_TTL_MS,
        ceremonyHash: hash,
    });

    return { options, ceremonyToken: token };
}

export interface VerifyReauthInput {
    ceremonyToken: string;
    /** The presented session's resolved id/account — the HTTP layer must already have called
     * `readSession` and refused (401) before reaching here; this is what gets checked against
     * the ceremony's bound `session_id`/`account_id`. */
    sessionId: string;
    accountId: string;
    response: AuthenticationResponseJSON;
}

export type ReauthFailureReason =
    | 'malformed_request'
    | 'ceremony_not_found'
    | 'ceremony_expired'
    | 'ceremony_type_mismatch'
    | 'session_mismatch'
    | 'credential_not_found'
    | 'user_handle_mismatch'
    | 'verification_failed'
    | 'account_not_found'
    | 'counter_regression';

export type ReauthResult =
    | { ok: true; accountId: string; credentialId: string }
    | { ok: false; reason: ReauthFailureReason };

/**
 * Verifies a completed reauth ceremony. On success, does NOT itself rotate the session — that is
 * `src/http/app.ts`'s `finishAuthentication`, called by the route with the returned
 * `accountId`/`credentialId` (decision 3: "the step-up is a privilege change, so the token is
 * renewed rather than a flag being stamped on the old row").
 */
export async function verifyReauth(
    db: DatabaseSync,
    config: WebAuthnConfig,
    input: VerifyReauthInput,
    now: number = Date.now(),
): Promise<ReauthResult> {
    // Shape guard first, synchronous, before the claim below — a malformed request must NOT
    // consume the ceremony token.
    if (isMalformedCeremonyRequest(input)) {
        return { ok: false, reason: 'malformed_request' };
    }

    // Must be the first statement to touch the database in this function, before any `await` —
    // see claimChallenge's doc comment for why.
    const claim = claimChallenge(db, hashCeremonyToken(input.ceremonyToken), 'reauth', now);
    if (!claim.ok) {
        return { ok: false, reason: claim.reason };
    }

    // Session/account binding (decision 3, mutation target): a reauth ceremony started for
    // account A's session must not be committable by account B's session — even a fresh one,
    // and even the SAME account presenting a DIFFERENT (stale-swapped) session. Both clauses are
    // independently required; dropping either one reopens exactly the cross-account/cross-device
    // substitution this binding exists to close.
    if (claim.row.session_id !== input.sessionId || claim.row.account_id !== input.accountId) {
        return { ok: false, reason: 'session_mismatch' };
    }

    const credentialRow = db
        .prepare('SELECT * FROM credentials WHERE id = ?')
        .get(input.response.id) as unknown as CredentialRow | undefined;
    if (!credentialRow) {
        return { ok: false, reason: 'credential_not_found' };
    }

    // Credential-belongs-to-account check (mutation target): `allowCredentials` at options time
    // only ever named this account's own credentials, but nothing on the wire stops a crafted
    // response naming a foreign credential id — re-verify server-side rather than trust the
    // options list. Reuses `credential_not_found` rather than a distinct reason: an account-owned
    // lookup miss and a foreign-credential attempt must look identical to the caller (decision 9
    // anti-probing stance), and both already collapse to the same 401 at the HTTP boundary.
    if (credentialRow.account_id !== input.accountId) {
        return { ok: false, reason: 'credential_not_found' };
    }

    // userHandle, when present, must match — but unlike login, absence is fine here. Per
    // WebAuthn L3 §7.2 step 6, userHandle is only REQUIRED when the user wasn't identified
    // before the ceremony began; reauth's `allowCredentials` is always non-empty, so the
    // authenticator is free to omit it.
    const userHandle = input.response.response.userHandle;
    if (
        userHandle !== undefined &&
        userHandle !== null &&
        userHandle !== '' &&
        userHandle !== credentialRow.account_id
    ) {
        return { ok: false, reason: 'user_handle_mismatch' };
    }

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

    return { ok: true, accountId: credentialRow.account_id, credentialId: credentialRow.id };
}
