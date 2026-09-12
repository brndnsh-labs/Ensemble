import type { DatabaseSync } from 'node:sqlite';
import {
    type AuthenticationResponseJSON,
    verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { withTransaction } from '../db/transaction.js';
import type { WebAuthnConfig } from './config.js';
import { type CredentialRow, decodeTransports } from './credential-row.js';

/**
 * The assertion-verify-and-commit core shared by `login.ts`'s `verifyLogin` and #1190's
 * `reauth.ts`'s `verifyReauth` (orchestrator decision 3: "step-up re-authentication ... shares
 * login's verification core; it is not copied"). Extracted verbatim out of #1188's `verifyLogin`
 * — every behavior here (including the exact SQL and the counter-regression handling) is
 * unchanged from what #1188 shipped and reviewed; `test/auth/login.test.ts`'s existing suite,
 * run unmodified through `verifyLogin`, is the regression guard that this extraction didn't
 * alter it.
 *
 * Callers are responsible for everything BEFORE this: the shape guard, the atomic challenge
 * claim, locating `credentialRow`, and any caller-specific binding check (login's required
 * `userHandle`; reauth's session/account binding and optional `userHandle`). This function only
 * ever does the cryptographic verify and the counter commit — it never looks at ceremony type,
 * session, or account binding, so a caller cannot accidentally rely on it to enforce those.
 */
export type AssertionCommitFailureReason =
    | 'verification_failed'
    | 'account_not_found'
    | 'credential_not_found'
    | 'counter_regression';

export type AssertionCommitResult =
    | { ok: true; newCounter: number }
    | { ok: false; reason: AssertionCommitFailureReason };

class CommitAbort extends Error {
    constructor(readonly reason: AssertionCommitFailureReason) {
        super(reason);
    }
}

export async function verifyAssertionAndCommitCounter(
    db: DatabaseSync,
    config: WebAuthnConfig,
    credentialRow: CredentialRow,
    response: AuthenticationResponseJSON,
    expectedChallenge: string,
    now: number,
): Promise<AssertionCommitResult> {
    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
        verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge,
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
            // Re-check account and credential state at commit time, not just at whatever
            // earlier lookup found credentialRow — a concurrent revoke/delete between that
            // lookup and this point must not silently commit a stale write.
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

            // Monotonic counter under concurrency (decision 9, #1188). Synced passkeys always
            // report counter 0 (measured: 0 -> 0 verifies) — a naive "must strictly increase"
            // check would lock out every iCloud/Google-synced passkey, so 0 -> 0 is the one
            // allowed exception. Zero rows changed means a counter regression: a racing
            // login/reauth already committed a counter this one has already passed, or a cloned
            // authenticator.
            const info = db
                .prepare(
                    `UPDATE credentials SET sign_count = ?, last_used_at = ?
                     WHERE id = ? AND (sign_count < ? OR (? = 0 AND sign_count = 0))`,
                )
                .run(newCounter, now, credentialRow.id, newCounter, newCounter);
            if (info.changes === 0) {
                throw new CommitAbort('counter_regression');
            }

            return { ok: true, newCounter } as const;
        });
    } catch (error) {
        if (error instanceof CommitAbort) {
            return { ok: false, reason: error.reason };
        }
        throw error;
    }
}
