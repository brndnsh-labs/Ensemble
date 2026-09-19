/**
 * One typed same-origin `fetch` wrapper for `/api/*` (#1261, rollout decision 9 S4: plain
 * `fetch`, no query/cache/state library). This is the only place account code talks to the
 * network; `session.ts` and the Save transport both go through it rather than calling `fetch`
 * themselves.
 *
 * The server's collapsed error taxonomy (`prototypes/v2-api/src/http/errors.ts`) is the load-
 * bearing fact this module leans on: "every HTTP failure this service ever emits is one of
 * these codes, sent as `{ "error": "<code>" }`" — regardless of status. A success body never
 * carries an `error` key (a session read returns `{ accountId }`, a committed or conflicted
 * Save returns a `SaveReply`-shaped object per `lib/sync/protocol.ts`, and a Save conflict is
 * still HTTP 409 despite being a normal protocol outcome, not a failure). So the presence of a
 * string `error` field is the actual success/failure discriminator here, not the status code —
 * checking status alone would misclassify a legitimate 409 conflict Save reply as an error.
 *
 * `ApiErrorCode` is a deliberate COPY of the server's `ApiErrorCode`, not an import: this app
 * and `prototypes/v2-api` are separate services, each with its own `package.json`, with no
 * shared dependency edge, so the two unions must be kept in sync by hand when the server's taxonomy
 * changes. A code this app has never seen (a future server addition, or a body this app cannot
 * trust) maps to `{ kind: 'unknown' }` rather than being silently accepted or thrown raw.
 *
 * Never caches a private response: `cache: 'no-store'` bypasses the browser HTTP cache, and
 * separately, `scripts/offline.mjs`'s generated service worker only intercepts `fetch` events
 * whose path starts with `/v2/` (`url.pathname.startsWith('/v2/')`) — an `/api/*` request never
 * reaches its `event.respondWith` at all, so there is nothing here that could accidentally
 * route a session or Save response through the offline cache even if it tried to.
 */

/** Mirrors `prototypes/v2-api/src/http/errors.ts`'s `ApiErrorCode`. Keep the two in sync. */
export type ApiErrorCode =
    | 'malformed_request'
    | 'authentication_failed'
    | 'unauthenticated'
    | 'forbidden_origin'
    | 'payload_too_large'
    | 'unsupported_media_type'
    | 'not_found'
    | 'internal_error'
    | 'fresh_auth_required'
    | 'last_credential'
    | 'rate_limited'
    | 'credential_limit'
    | 'registration_closed'
    | 'operation_mismatch'
    | 'quota_exceeded';

const KNOWN_CODES: ReadonlySet<string> = new Set<ApiErrorCode>([
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
    'registration_closed',
    'operation_mismatch',
    'quota_exceeded',
]);

export type ApiError =
    /** The request never reached an HTTP response at all — offline, DNS, connection refused. */
    | { kind: 'network' }
    /** A response arrived but was not JSON, or had no recognizable shape at all. */
    | { kind: 'unknown'; status: number }
    /** A well-formed `{ error: <code> }` body, `code` in the closed union above. */
    | { kind: 'code'; code: ApiErrorCode; status: number };

export type ApiResult<T> = { ok: true; value: T; status: number } | { ok: false; error: ApiError };

export interface AccountApi {
    get<T>(path: string): Promise<ApiResult<T>>;
    /** `body` is sent VERBATIM — never re-serialized. Callers own their own canonical bytes. */
    post<T>(path: string, body: string): Promise<ApiResult<T>>;
}

function isErrorBody(value: unknown): value is { error: string } {
    return (
        !!value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        typeof (value as Record<string, unknown>).error === 'string'
    );
}

async function call<T>(
    fetchImpl: typeof fetch,
    path: string,
    init: RequestInit,
): Promise<ApiResult<T>> {
    let response: Response;
    try {
        response = await fetchImpl(path, {
            ...init,
            credentials: 'same-origin',
            cache: 'no-store',
        });
    } catch {
        return { ok: false, error: { kind: 'network' } };
    }
    // `204 No Content` is a SUCCESS in this contract with nothing to parse — `POST
    // /api/auth/logout` and `POST /api/auth/recovery/confirm` both answer `c.body(null, 204)`,
    // and `response.json()` on an empty body rejects, which would misreport a completed sign-out
    // or recovery confirmation as `{ kind: 'unknown' }`. The server never sends a 204 carrying a
    // body, so there is no case where skipping the parse loses information (#1262).
    if (response.status === 204) {
        return { ok: true, value: undefined as T, status: 204 };
    }
    let body: unknown;
    try {
        body = await response.json();
    } catch {
        // Never surface the parse failure or any raw body text — it can carry arbitrary
        // upstream content (an HTML error page from a proxy, a truncated response, etc).
        return { ok: false, error: { kind: 'unknown', status: response.status } };
    }
    if (isErrorBody(body)) {
        return {
            ok: false,
            error: KNOWN_CODES.has(body.error)
                ? { kind: 'code', code: body.error as ApiErrorCode, status: response.status }
                : { kind: 'unknown', status: response.status },
        };
    }
    return { ok: true, value: body as T, status: response.status };
}

/** `fetchImpl` defaults to the global `fetch`; tests inject a fake to avoid a network mock. */
export function createAccountApi(fetchImpl: typeof fetch = fetch): AccountApi {
    return {
        get: <T>(path: string) => call<T>(fetchImpl, path, { method: 'GET' }),
        post: <T>(path: string, body: string) =>
            call<T>(fetchImpl, path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            }),
    };
}
