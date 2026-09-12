import type { Context, MiddlewareHandler } from 'hono';
import { sendError } from './errors.js';
import { isSafeMethod } from './http-safe-methods.js';

/**
 * JSON-only guard (#1189 decision 10). An unsafe method that carries a body must send
 * `Content-Type: application/json`, or it gets `415`. This is also why there is no CORS
 * middleware anywhere in this service: a cross-origin page's `fetch` sending this content type
 * forces a CORS preflight (which we never answer with an `Access-Control-Allow-Origin`, so the
 * browser blocks the response), and a plain HTML form cannot set an arbitrary `Content-Type` at
 * all. `GET`/`HEAD`/`OPTIONS` are exempt (see `http-safe-methods.ts` — shared with
 * `same-origin.ts` so the two guards can't diverge on which methods they gate), and an unsafe
 * method with no body at all (e.g. a bare `POST /api/auth/logout`) is exempt too — nothing to
 * typecheck without a payload.
 */

/**
 * Whether the request carries a body at all. `Content-Length: 0` (or its absence, with no
 * chunked transfer-encoding either) means no body — an unsafe method can still legitimately omit
 * one (logout, revoke-others).
 */
export function requestHasBody(c: Context): boolean {
    const contentLength = c.req.header('content-length');
    if (contentLength !== undefined) {
        return Number(contentLength) > 0;
    }
    const transferEncoding = c.req.header('transfer-encoding');
    return transferEncoding?.toLowerCase().includes('chunked') ?? false;
}

/**
 * Exact media-type match against `application/json`, ignoring parameters (`; charset=utf-8`)
 * and case. Splitting on `;` and comparing only the media-type segment (not
 * `startsWith('application/json')`) is deliberate: `startsWith` would also accept
 * `application/jsonx` or `application/json-patch+json`, neither of which this service parses as
 * JSON the way the guard's name promises.
 */
function isExactlyJson(contentType: string): boolean {
    const mediaType = (contentType.split(';')[0] ?? '').trim().toLowerCase();
    return mediaType === 'application/json';
}

export function jsonOnlyGuard(): MiddlewareHandler {
    return async (c, next) => {
        if (isSafeMethod(c.req.method) || !requestHasBody(c)) {
            return next();
        }
        const contentType = c.req.header('content-type') ?? '';
        if (!isExactlyJson(contentType)) {
            return sendError(c, 415, 'unsupported_media_type');
        }
        return next();
    };
}
