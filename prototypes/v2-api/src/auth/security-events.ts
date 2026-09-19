import type { DatabaseSync } from 'node:sqlite';

const EVENTS = [
    'auth_failure',
    'passkey_added',
    'passkey_revoked',
    'sessions_revoked_by_credential_revoke',
    'session_revoked',
    'other_sessions_revoked',
    'account_recovered',
    // #1271. Written INSIDE the deletion transaction, after that transaction has wiped this
    // account's every other row (this table's included): it is the registration of the deleted
    // identity — an account id and a timestamp — and the only trace deletion leaves behind.
    'account_deleted',
] as const;
type Event = (typeof EVENTS)[number];
const CODES = [
    'malformed_request',
    'authentication_failed',
    'unauthenticated',
    'forbidden_origin',
    'payload_too_large',
    'unsupported_media_type',
    'not_found',
    'internal_error',
    'fresh_auth_required',
    'last_credential',
    'rate_limited',
    'credential_limit',
] as const;
export type SecurityEventCode = (typeof CODES)[number];

/**
 * The subset of `CODES` that represents an actual authentication/authorization DECISION, as
 * opposed to a transport-layer guard rejecting the request before any auth logic ran
 * (`forbidden_origin` from `same-origin.ts`, `unsupported_media_type` from `content-type.ts`,
 * `payload_too_large` from `app.ts`'s `bodyLimit`, an unknown-route `not_found` from
 * `auth-policy.ts`), the limiter's own bookkeeping (`rate_limited`), a client-shape problem
 * (`malformed_request`), or this service's own bug (`internal_error`). `app.ts`'s `auth_failure`
 * recorder consults this predicate — not the full `CODES` list — before writing a row.
 *
 * #1196 independent-review Finding 1: every one of the excluded codes is reachable with zero
 * authentication, and `forbidden_origin`/`not_found` need no special header at all. Auditing them
 * let an anonymous flood of the cheapest possible request (a bare `GET` to a made-up
 * `/api/auth/*` path) burn through `recordSecurityEvent`'s global 10,000-row ring below and evict
 * every genuine `passkey_added`/`session_revoked`/`account_recovered` row — this table's only
 * forensic record of the documented borrowed-session takeover risk. Narrowing to genuine
 * authentication/authorization outcomes closes that off; see `src/http/app.ts` and
 * `src/http/rate-limit-guard.ts` for the paired fix (a rate limiter ahead of these same guards).
 */
const AUTH_DECISION_CODES: readonly SecurityEventCode[] = [
    'authentication_failed',
    'unauthenticated',
    'fresh_auth_required',
    'last_credential',
    'credential_limit',
];

export function isAuthDecisionCode(code: unknown): code is SecurityEventCode {
    return typeof code === 'string' && (AUTH_DECISION_CODES as readonly string[]).includes(code);
}

export interface SecurityEvent {
    event: Event;
    /** Only verified server results/session claims may populate these, never request body IDs. */
    accountId?: string;
    credentialId?: string;
    code?: string;
}

function identifier(value: unknown, max: number): string | null {
    return typeof value === 'string' && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value)
        ? value
        : null;
}

/**
 * A deliberately narrow serializer: arbitrary Error messages/causes can contain secrets even
 * after truncation. Store a fixed allowlisted description, never those objects or their text.
 * Best-effort means audit loss cannot turn a committed auth operation into a failure/retry.
 * The 30-day/10,000-row cap also prevents anonymous failures exhausting disposable storage.
 */
export function recordSecurityEvent(db: DatabaseSync, input: SecurityEvent, now: number): void {
    try {
        if (!EVENTS.includes(input.event) || !Number.isSafeInteger(now)) {
            return;
        }
        const code = CODES.find((candidate) => candidate === input.code) ?? 'internal_error';
        const failure = input.event === 'auth_failure';
        db.prepare(`INSERT INTO auth_security_events
            (created_at, event, account_id, credential_id, error_name, error_code, message, cause)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
            now,
            input.event,
            identifier(input.accountId, 128),
            identifier(input.credentialId, 2048),
            failure ? 'AuthError' : null,
            failure ? code : null,
            failure ? `Auth request rejected: ${code}`.slice(0, 120) : null,
            failure ? (code === 'internal_error' ? 'internal' : 'request_rejected') : null,
        );
        db.prepare('DELETE FROM auth_security_events WHERE created_at < ?').run(
            now - 30 * 24 * 60 * 60_000,
        );
        db.prepare(
            'DELETE FROM auth_security_events WHERE id IN (SELECT id FROM auth_security_events ORDER BY id DESC LIMIT -1 OFFSET 10000)',
        ).run();
    } catch {
        /* No logging fallback: even the database error may contain sensitive input. */
    }
}
