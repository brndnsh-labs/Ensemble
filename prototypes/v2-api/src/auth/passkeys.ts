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
import { decodeTransports, encodeTransports } from './credential-row.js';
import { isFreshlyAuthenticated } from './fresh-auth.js';
import { hasEnrolledRecoveryMaterial } from './recovery-material.js';
import { resolveLabel } from './registration.js';
import { isMalformedCeremonyRequest } from './request-guard.js';

/** Generous per-account bound on list/allow/exclude arrays. Checked at commit under concurrency. */
export const MAX_PASSKEYS = 32;

/**
 * Adding a passkey (#1190 orchestrator decision 4). Bound to BOTH the authenticated owner and
 * the initiating session — a ceremony started under account A's session can never be committed
 * under account B's, even a fresh one.
 */
export interface StartAddPasskeyInput {
    accountId: string;
    sessionId: string;
    label?: string;
}

export type StartAddPasskeyResult =
    | { ok: true; options: PublicKeyCredentialCreationOptionsJSON; ceremonyToken: string }
    | { ok: false; reason: 'fresh_auth_required' | 'credential_limit' };

/**
 * Requires a FRESH session (checked here, not only at the HTTP layer) so a stale session gets
 * `fresh_auth_required` before any ceremony even starts — never mint a challenge only to fail it
 * at commit. `userID` is the account id decoded back to the raw bytes `startRegistration`
 * originally encoded (decision 4), so the new credential carries the SAME user handle and can
 * log this account in. `excludeCredentials` lists the account's existing credentials so the
 * browser itself refuses to re-register one already enrolled (decision 5 covers the case where
 * an authenticator ignores that).
 */
export async function startAddPasskey(
    db: DatabaseSync,
    config: WebAuthnConfig,
    input: StartAddPasskeyInput,
    now: number = Date.now(),
): Promise<StartAddPasskeyResult> {
    if (!isFreshlyAuthenticated(db, input.sessionId, input.accountId, now)) {
        return { ok: false, reason: 'fresh_auth_required' };
    }

    sweepExpiredChallenges(db, now);

    const label = resolveLabel(input.label);
    const credentialRows = db
        .prepare('SELECT id, transports FROM credentials WHERE account_id = ?')
        .all(input.accountId) as unknown as { id: string; transports: string | null }[];
    if (credentialRows.length >= MAX_PASSKEYS) {
        return { ok: false, reason: 'credential_limit' };
    }

    const options = await generateRegistrationOptions({
        rpName: config.rpName,
        rpID: config.rpId,
        userID: Buffer.from(input.accountId, 'base64url'),
        userName: label,
        userDisplayName: label,
        attestationType: 'none',
        excludeCredentials: credentialRows.map((row) => ({
            id: row.id,
            transports: decodeTransports(row.transports),
        })),
        authenticatorSelection: {
            residentKey: 'required',
            userVerification: 'required',
        },
    });

    const { token, hash } = generateCeremonyToken();
    insertChallenge(db, {
        id: randomBytes(16).toString('base64url'),
        accountId: input.accountId,
        sessionId: input.sessionId,
        challenge: options.challenge,
        type: 'add_passkey',
        createdAt: now,
        expiresAt: now + CHALLENGE_TTL_MS,
        ceremonyHash: hash,
    });

    return { ok: true, options, ceremonyToken: token };
}

export interface VerifyAddPasskeyInput {
    ceremonyToken: string;
    sessionId: string;
    accountId: string;
    response: RegistrationResponseJSON;
}

export type AddPasskeyFailureReason =
    | 'malformed_request'
    | 'ceremony_not_found'
    | 'ceremony_expired'
    | 'ceremony_type_mismatch'
    | 'session_mismatch'
    | 'verification_failed'
    | 'fresh_auth_required'
    | 'account_not_found'
    | 'credential_exists'
    | 'credential_limit';

export type AddPasskeyResult =
    | { ok: true; credentialId: string; alreadyRegistered: boolean }
    | { ok: false; reason: AddPasskeyFailureReason };

class AddPasskeyAbort extends Error {
    constructor(readonly reason: AddPasskeyFailureReason) {
        super(reason);
    }
}

/**
 * Verify order (decision 4, exact): shape guard -> claim -> binding check (presented session is
 * EXACTLY the bound session, for the bound account) -> library verify -> commit transaction
 * (fresh re-check, account-exists re-check, insert-or-no-op).
 *
 * `now` is an injectable clock (default `Date.now()`), matching `startAddPasskey` and
 * `revokePasskey` rather than `login.ts`/`registration.ts`'s always-real-clock convention —
 * deliberately, because this function's own commit-time `isFreshlyAuthenticated` re-check is a
 * genuine security gate a caller must be able to drive with a fake clock in a test (the HTTP
 * layer passes its own injected `now()` here), not merely a courtesy.
 */
export async function verifyAddPasskey(
    db: DatabaseSync,
    config: WebAuthnConfig,
    input: VerifyAddPasskeyInput,
    now: number = Date.now(),
): Promise<AddPasskeyResult> {
    if (isMalformedCeremonyRequest(input)) {
        return { ok: false, reason: 'malformed_request' };
    }

    // First DB touch, before any await — see claimChallenge's doc comment.
    const claim = claimChallenge(db, hashCeremonyToken(input.ceremonyToken), 'add_passkey', now);
    if (!claim.ok) {
        return { ok: false, reason: claim.reason };
    }

    // Binding check (decision 4, mutation target): a ceremony started under account A's session
    // can never be committed under account B's, even a fresh one for a totally legitimate B.
    if (claim.row.session_id !== input.sessionId || claim.row.account_id !== input.accountId) {
        return { ok: false, reason: 'session_mismatch' };
    }

    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
        verification = await verifyRegistrationResponse({
            response: input.response,
            expectedChallenge: claim.row.challenge,
            expectedOrigin: config.origin,
            // Explicit — omitting it silently disables the RP ID check entirely (measured
            // against the installed v14.0.1; see #1188's decision comment). Never omit this.
            expectedRPID: config.rpId,
            requireUserVerification: true,
        });
    } catch {
        return { ok: false, reason: 'verification_failed' };
    }

    if (!verification.verified) {
        return { ok: false, reason: 'verification_failed' };
    }

    const { credential } = verification.registrationInfo;

    // Cross-check the top-level response id against what the library actually decoded, same as
    // registration.ts — closes off a response crafted with a mismatched top-level id/rawId.
    if (credential.id !== input.response.id) {
        return { ok: false, reason: 'verification_failed' };
    }

    try {
        return withTransaction(db, () => {
            // Re-check fresh auth AND account existence at commit (decision 4), not just at
            // options time — the WebAuthn ceremony's real-world await (the user physically
            // touching a key) is exactly the window a session can go stale or an account can
            // vanish in.
            if (!isFreshlyAuthenticated(db, input.sessionId, input.accountId, now)) {
                throw new AddPasskeyAbort('fresh_auth_required');
            }
            const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(input.accountId);
            if (!account) {
                throw new AddPasskeyAbort('account_not_found');
            }

            const existing = db
                .prepare('SELECT account_id FROM credentials WHERE id = ?')
                .get(credential.id) as { account_id: string } | undefined;

            if (existing) {
                if (existing.account_id === input.accountId) {
                    // Already-registered no-op (decision 5): this authenticator ignored
                    // excludeCredentials once already (normally the browser refuses before the
                    // server is ever called) — treat a repeat as success, and change NOTHING:
                    // never overwrite the stored public key or counter.
                    return {
                        ok: true,
                        credentialId: credential.id,
                        alreadyRegistered: true,
                    } as const;
                }
                // Registered to a DIFFERENT account: a distinct failure, never a silent
                // overwrite, and it collapses to the same 401 as everything else at the HTTP
                // boundary (decision 9) — never reveal which account owns it.
                throw new AddPasskeyAbort('credential_exists');
            }

            const count = db
                .prepare('SELECT COUNT(*) AS n FROM credentials WHERE account_id = ?')
                .get(input.accountId) as { n: number };
            if (count.n >= MAX_PASSKEYS) {
                throw new AddPasskeyAbort('credential_limit');
            }

            db.prepare(
                `INSERT INTO credentials
                    (id, account_id, public_key, sign_count, transports, created_at, last_used_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ).run(
                credential.id,
                input.accountId,
                Buffer.from(credential.publicKey),
                credential.counter,
                encodeTransports(credential.transports),
                now,
                null,
            );

            return { ok: true, credentialId: credential.id, alreadyRegistered: false } as const;
        });
    } catch (error) {
        if (error instanceof AddPasskeyAbort) {
            return { ok: false, reason: error.reason };
        }
        throw error;
    }
}

export type RevokePasskeyFailureReason = 'fresh_auth_required' | 'not_found' | 'last_credential';

export type RevokePasskeyResult =
    | { ok: true; signedOut: boolean }
    | { ok: false; reason: RevokePasskeyFailureReason };

class RevokeAbort extends Error {
    constructor(readonly reason: RevokePasskeyFailureReason) {
        super(reason);
    }
}

/**
 * Revocation (decision 6). One synchronous transaction, in this EXACT order:
 *  1. fresh check — a stale session gets 403 whether or not the target exists, so it cannot be
 *     used to probe for credential ids.
 *  2. ownership check — a credential that doesn't exist, and one that belongs to another
 *     account, return an IDENTICAL 404, run the SAME query, and have no side effects.
 *  3. last-credential guard — refuse to leave the account with zero usable credentials AND zero
 *     recovery material.
 *  4. revoke every session THIS credential created — a lost device's passkey being revoked must
 *     end that device's sessions, not only block its future logins.
 *  5. delete, owner-scoped.
 *
 * Reports whether the CURRENT (presented) session was one of the ones revoked in step 4, so the
 * HTTP route knows to clear its cookie too.
 */
export function revokePasskey(
    db: DatabaseSync,
    accountId: string,
    sessionId: string,
    credentialId: string,
    now: number,
): RevokePasskeyResult {
    try {
        return withTransaction(db, () => {
            // Step 1, first and inside the transaction (decision 2): the freshness read and the
            // writes it authorizes see the same database state, and a stale caller is refused
            // before any credential lookup, so it learns nothing about whether credentialId exists.
            if (!isFreshlyAuthenticated(db, sessionId, accountId, now)) {
                throw new RevokeAbort('fresh_auth_required');
            }
            // Step 2: owner-scoped lookup. Same query, same non-existence result, whether the
            // credential id is entirely unknown or belongs to a different account — a caller
            // must never be able to tell those apart.
            const owned = db
                .prepare('SELECT id FROM credentials WHERE id = ? AND account_id = ?')
                .get(credentialId, accountId);
            if (!owned) {
                throw new RevokeAbort('not_found');
            }

            // Step 3: last-credential guard. `<= 1`, not `< 1` — this credential IS one of the
            // account's own (step 2 just confirmed it), so the count here is always >= 1; `<= 1`
            // is what actually gates "this is the only one," where `< 1` would never fire.
            const countRow = db
                .prepare('SELECT COUNT(*) AS n FROM credentials WHERE account_id = ?')
                .get(accountId) as { n: number };
            if (countRow.n <= 1 && !hasEnrolledRecoveryMaterial(db, accountId)) {
                throw new RevokeAbort('last_credential');
            }

            // Determine BEFORE mutating anything whether the CURRENT session was created by the
            // credential about to be revoked — read this first because the DELETE below (step
            // 5) triggers `ON DELETE SET NULL` on every session's `credential_id`, including
            // this one, which would make a post-delete read always see NULL.
            const currentSessionRow = db
                .prepare('SELECT credential_id FROM sessions WHERE id = ? AND account_id = ?')
                .get(sessionId, accountId) as { credential_id: string | null } | undefined;
            const signedOut = currentSessionRow?.credential_id === credentialId;

            // Step 4: revoke every session this credential created — owner-scoped by BOTH
            // credential_id and account_id, so a session on a different account can never be
            // touched even if a credential id were somehow reused (it can't be, the primary key
            // forbids it, but this doesn't rely on that).
            db.prepare(
                `UPDATE sessions SET revoked_at = ?
                 WHERE credential_id = ? AND account_id = ? AND revoked_at IS NULL`,
            ).run(now, credentialId, accountId);

            // Step 5: delete, owner-scoped by id AND account_id — never trust id alone.
            db.prepare('DELETE FROM credentials WHERE id = ? AND account_id = ?').run(
                credentialId,
                accountId,
            );

            return { ok: true, signedOut } as const;
        });
    } catch (error) {
        if (error instanceof RevokeAbort) {
            return { ok: false, reason: error.reason };
        }
        throw error;
    }
}

/** What `GET /api/auth/passkeys` returns — never the public key or counter (decision 8). */
export interface PasskeySummary {
    id: string;
    createdAt: number;
    lastUsedAt: number | null;
    transports: string[];
    /** True when this credential created the session making the request. */
    current: boolean;
}

export function listPasskeys(
    db: DatabaseSync,
    accountId: string,
    currentCredentialId: string | null,
): PasskeySummary[] {
    const rows = db
        .prepare(
            `SELECT id, created_at, last_used_at, transports
             FROM credentials
             WHERE account_id = ?
             ORDER BY created_at ASC`,
        )
        .all(accountId) as unknown as {
        id: string;
        created_at: number;
        last_used_at: number | null;
        transports: string | null;
    }[];

    return rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        transports: decodeTransports(row.transports),
        current: currentCredentialId !== null && row.id === currentCredentialId,
    }));
}
