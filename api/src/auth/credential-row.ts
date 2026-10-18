/** Shared `credentials` row shape and encode/decode helpers used by both ceremony modules. */

export interface CredentialRow {
    id: string;
    account_id: string;
    public_key: Uint8Array;
    sign_count: number;
    transports: string | null;
    created_at: number;
    last_used_at: number | null;
}

/** The full `AuthenticatorTransport` enum per the WebAuthn spec — nothing else is stored. */
const VALID_TRANSPORTS = new Set([
    'ble',
    'cable',
    'hybrid',
    'internal',
    'nfc',
    'smart-card',
    'usb',
]);
/**
 * Filters to the spec's `AuthenticatorTransport` enum and dedupes before storing.
 *
 * Takes `unknown` on purpose: `@simplewebauthn/server` copies `response.transports` through
 * unchecked, so it is untrusted client input like everything else in the response. A string,
 * object or number there must store as `[]` — not throw, because this runs after the challenge
 * has already been consumed, and a throw would surface as a rejected promise instead of a typed
 * failure.
 *
 * No separate length cap is needed: the allowlist holds 7 values, so dedupe alone bounds the
 * stored list at 7 however large the input (seen: a 5000-element array, 68,891 bytes, before
 * this filter existed).
 */
export function encodeTransports(transports: unknown): string {
    const candidates: unknown[] = Array.isArray(transports) ? transports : [];
    const valid = candidates.filter(
        (t): t is string => typeof t === 'string' && VALID_TRANSPORTS.has(t),
    );
    return JSON.stringify(Array.from(new Set(valid)));
}

export function decodeTransports(transports: string | null): string[] {
    if (transports === null) {
        return [];
    }
    try {
        const parsed: unknown = JSON.parse(transports);
        return Array.isArray(parsed)
            ? parsed.filter((t): t is string => typeof t === 'string')
            : [];
    } catch {
        return [];
    }
}

/**
 * `node:sqlite` throws a plain `Error` with `code: 'ERR_SQLITE_ERROR'` on any constraint
 * violation — there is no structured error subtype to catch by `instanceof`, and `code` alone
 * does not distinguish a primary-key collision from a `NOT NULL` or `FOREIGN KEY` failure.
 * Verified against the installed `node:sqlite` (Node 26) with the real schema:
 *
 * | Violation | `errcode` | `message` |
 * | --- | --- | --- |
 * | `credentials.id` PRIMARY KEY collision | `1555` | `"UNIQUE constraint failed: credentials.id"` |
 * | `accounts.id` PRIMARY KEY collision | `1555` | `"UNIQUE constraint failed: accounts.id"` |
 * | `credentials.account_id` FOREIGN KEY failure | `787` | `"FOREIGN KEY constraint failed"` |
 * | `credentials.public_key` NOT NULL failure | `1299` | `"NOT NULL constraint failed: credentials.public_key"` |
 *
 * `errcode` alone is not enough either — an `accounts.id` collision shares the same `1555` —
 * so this checks both the raw SQLite extended result code **and** the exact column the message
 * names, not a substring match (a substring match on `"credentials.id"` would also match a
 * hypothetical `"...other_credentials.id..."` failure on an unrelated table sharing a suffix).
 */
export function isDuplicateCredentialIdError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }
    const withCode = error as Error & { code?: string; errcode?: number };
    if (withCode.code !== 'ERR_SQLITE_ERROR' || withCode.errcode !== 1555) {
        return false;
    }
    return error.message === 'UNIQUE constraint failed: credentials.id';
}
