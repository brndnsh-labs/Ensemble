import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type {
    AddPasskeyFailureReason,
    LoginFailureReason,
    ReauthFailureReason,
    RegistrationFailureReason,
    RevokePasskeyFailureReason,
} from '../auth/index.js';

/**
 * The collapsed error-code taxonomy (#1189 decision 14, extended by #1190 decision 9). Every
 * HTTP failure this service ever emits is one of these codes, sent as `{ "error": "<code>" }` —
 * never a library message, a stack, a payload echo, or a ceremony-specific reason. The point is
 * that a caller (or an attacker probing the endpoint) cannot distinguish "wrong
 * password-equivalent" from "credential does not exist" from "counter regression": see
 * `ceremonyFailureResponse` below. `fresh_auth_required` and `last_credential` are the two new
 * codes #1190 adds — everything else stays exactly as #1189 shipped it.
 */
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
    | 'last_credential';

export function sendError(c: Context, status: ContentfulStatusCode, code: ApiErrorCode) {
    return c.json({ error: code }, status);
}

/**
 * Collapses every ceremony failure reason from `src/auth/` — registration, login, reauth, and
 * add-passkey — into the HTTP boundary's taxonomy (decision 14, review advisory #2; extended by
 * #1190 decision 9). `malformed_request` is the one reason that reflects a client-shape problem
 * rather than an authentication outcome, so it alone gets its own code and a 400.
 * `fresh_auth_required` (add-passkey only) is the one reason that reflects a session that is
 * valid but not recent enough, so it alone gets `403`. Every other reason — including
 * `session_mismatch` and the reused `credential_not_found`/`credential_exists` at reauth/
 * add-passkey — collapses to the identical `401 authentication_failed`. Never add a distinct
 * code for one of those: that reopens the credential-existence probe review advisory #2 was
 * written to close, and a session-binding failure must look identical to any other ceremony
 * failure for the same anti-probing reason.
 */
export function ceremonyFailureResponse(
    c: Context,
    reason:
        | RegistrationFailureReason
        | LoginFailureReason
        | ReauthFailureReason
        | AddPasskeyFailureReason,
) {
    if (reason === 'malformed_request') {
        return sendError(c, 400, 'malformed_request');
    }
    if (reason === 'fresh_auth_required') {
        return sendError(c, 403, 'fresh_auth_required');
    }
    return sendError(c, 401, 'authentication_failed');
}

/**
 * `revokePasskey`'s failure reasons (#1190 decision 6) are not a ceremony — there is no
 * `ceremonyToken`/challenge involved at all — so they get their own small mapping rather than
 * being folded into `ceremonyFailureResponse`'s union. `not_found` is deliberately the SAME code
 * whether the target credential doesn't exist or belongs to another account (decision 6 step 2).
 */
export function revokePasskeyFailureResponse(c: Context, reason: RevokePasskeyFailureReason) {
    if (reason === 'fresh_auth_required') {
        return sendError(c, 403, 'fresh_auth_required');
    }
    if (reason === 'not_found') {
        return sendError(c, 404, 'not_found');
    }
    return sendError(c, 409, 'last_credential');
}
