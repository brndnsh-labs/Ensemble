import type { DatabaseSync } from 'node:sqlite';

/**
 * The one implementation of "freshly authenticated" (#1190 orchestrator decision 2). Adding or
 * revoking a passkey is a sensitive operation and must require a RECENT user-verified ceremony,
 * not merely a valid session — a stolen or borrowed logged-in session must not be promotable
 * into permanent account takeover by silently enrolling an attacker's passkey and revoking the
 * owner's. This predicate is that gate, and it is the ONLY place that decides "fresh": no
 * second JS implementation of this concept exists anywhere in this service, and #1191's
 * recovery-material changes are required to reuse it rather than grow a sibling.
 *
 * `isFreshlyAuthenticated` is a single SQL read requiring ALL of:
 *  1. the session belongs to `accountId` (never trust a session id alone — a caller must always
 *     supply the account it claims to be checking, so a session id collision/guess across
 *     accounts can't slip through)
 *  2. `revoked_at IS NULL` — a revoked session (e.g. by `revokePasskey` itself, or logout) was
 *     never fresh again, no matter how recently it was created
 *  3. `expires_at > now` — the exact comparison `readSession` (session.ts) uses; an expired
 *     session is not fresh even if it happens to still be inside the freshness window
 *  4. `created_at >= now - FRESH_AUTH_WINDOW_MS` — the session must have been ISSUED recently.
 *     `>=`, not `>`: the boundary instant itself (created exactly `FRESH_AUTH_WINDOW_MS` ago)
 *     still counts as fresh, matching "within the last N minutes" read inclusively.
 *  5. `credential_id IS NOT NULL` — the session must have been created BY a passkey ceremony.
 *     This is deliberate and fails safe: #1191's recovery session has no credential, so it can
 *     never satisfy this predicate by default. If #1191 ever lets a recovery session enroll a
 *     replacement passkey, that is an explicitly scoped permission added elsewhere — it must
 *     never come from weakening this clause.
 *
 * Every session is created by a user-verified ceremony (registration, login or reauth), so a
 * brand-new session is fresh for `FRESH_AUTH_WINDOW_MS` from the moment it's issued — including
 * right after signup, which is exactly what makes "enroll a second passkey immediately after
 * registering" frictionless by design.
 *
 * Called inside the commit transaction of every sensitive write (add-passkey commit, revoke) —
 * never trust an earlier check alone, because the WebAuthn ceremony's real-world await (the user
 * physically touching a key) is exactly the window a session could go stale in — and also at
 * add-passkey OPTIONS time, so a stale session is rejected with `403 fresh_auth_required` before
 * any ceremony even starts, rather than only failing at the end of one.
 */
export const FRESH_AUTH_WINDOW_MS = 10 * 60 * 1000;

export function isFreshlyAuthenticated(
    db: DatabaseSync,
    sessionId: string,
    accountId: string,
    now: number,
): boolean {
    const row = db
        .prepare(
            `SELECT 1 FROM sessions
             WHERE id = ?
               AND account_id = ?
               AND revoked_at IS NULL
               AND expires_at > ?
               AND created_at >= ?
               AND credential_id IS NOT NULL
             LIMIT 1`,
        )
        .get(sessionId, accountId, now, now - FRESH_AUTH_WINDOW_MS);

    return row !== undefined;
}
