import type { DatabaseSync } from 'node:sqlite';

const EVENTS = [
    'auth_failure',
    'passkey_added',
    'passkey_revoked',
    'sessions_revoked_by_credential_revoke',
    'session_revoked',
    'other_sessions_revoked',
    'account_recovered',
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
