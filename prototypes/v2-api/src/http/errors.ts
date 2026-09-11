import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { LoginFailureReason, RegistrationFailureReason } from '../auth/index.js';

/**
 * The collapsed error-code taxonomy (#1189 decision 14). Every HTTP failure this service ever
 * emits is one of these codes, sent as `{ "error": "<code>" }` — never a library message, a
 * stack, a payload echo, or a ceremony-specific reason. The point is that a caller (or an
 * attacker probing the endpoint) cannot distinguish "wrong password-equivalent" from
 * "credential does not exist" from "counter regression": see `ceremonyFailureResponse` below.
 */
export type ApiErrorCode =
    | 'malformed_request'
    | 'authentication_failed'
    | 'unauthenticated'
    | 'forbidden_origin'
    | 'payload_too_large'
    | 'unsupported_media_type'
    | 'not_found'
    | 'internal_error';

export function sendError(c: Context, status: ContentfulStatusCode, code: ApiErrorCode) {
    return c.json({ error: code }, status);
}

/**
 * Collapses every `RegistrationFailureReason`/`LoginFailureReason` from `src/auth/` into the
 * HTTP boundary's two-code taxonomy (decision 14, review advisory #2). `malformed_request` is
 * the one reason that reflects a client-shape problem rather than an authentication outcome, so
 * it alone gets its own code and a 400. Every other reason — `credential_exists`,
 * `credential_not_found`, `user_handle_missing`, `user_handle_mismatch`, `ceremony_not_found`,
 * `ceremony_expired`, `ceremony_type_mismatch`, `verification_failed`, `account_not_found`,
 * `counter_regression` — collapses to the identical `401 authentication_failed`. Never add a
 * distinct code for one of those: that reopens the credential-existence probe review advisory
 * #2 was written to close.
 */
export function ceremonyFailureResponse(
    c: Context,
    reason: RegistrationFailureReason | LoginFailureReason,
) {
    if (reason === 'malformed_request') {
        return sendError(c, 400, 'malformed_request');
    }
    return sendError(c, 401, 'authentication_failed');
}
