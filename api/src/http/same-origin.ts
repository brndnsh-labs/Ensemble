import type { MiddlewareHandler } from 'hono';
import type { WebAuthnConfig } from '../auth/config.js';
import { sendError } from './errors.js';
import { isSafeMethod } from './http-safe-methods.js';

/**
 * Our own same-origin protection (#1189 decision 9), replacing `hono/csrf` entirely — do not
 * reintroduce it. Measured against the installed `hono@4.13.7`: its built-in `csrf()` only
 * checks form-like content types (reasoning that JSON triggers a CORS preflight), so a
 * header-less or foreign-origin JSON mutation sails straight through it. It also never consults
 * `Referer` and compares its default origin against `new URL(c.req.url).origin`, which behind
 * Caddy is the container's internal `http://` URL — never derive "our origin" that way.
 *
 * Applies to every UNSAFE method — a deny-list of `GET`/`HEAD`/`OPTIONS` (shared with
 * `content-type.ts` via `http-safe-methods.ts`, so the two guards cannot diverge on which
 * methods they gate), not an allow-list of `POST`/`PUT`/`PATCH`/`DELETE`. Rules run in this
 * exact order and are ALL enforced together, not as
 * mutually-exclusive branches — a normal browser request carries both `Sec-Fetch-Site` and
 * `Origin`, and both must pass:
 *
 * 1. If `Sec-Fetch-Site` is present, it must be exactly `same-origin`, or `403`. Plain
 *    `same-site` would admit a sibling host (`ensemble.brndn.zip` into `ensembletest.brndn.zip`).
 * 2. If `Origin` is present, it must equal `config.origin` exactly (never the request URL), or
 *    `403`.
 * 3. If `Origin` is absent and `Referer` is present, the Referer's parsed origin must equal
 *    `config.origin`; an unparseable Referer is `403`.
 * 4. Both `Origin` and `Referer` absent: `403`. This is belt-and-suspenders on top of
 *    `SameSite=Strict`, not the sole CSRF defense — fail closed rather than assume same-site
 *    cookie scoping alone is enough.
 */

function originFromReferer(referer: string): string | null {
    try {
        return new URL(referer).origin;
    } catch {
        return null;
    }
}

export function sameOriginGuard(config: WebAuthnConfig): MiddlewareHandler {
    return async (c, next) => {
        if (isSafeMethod(c.req.method)) {
            return next();
        }

        const secFetchSite = c.req.header('sec-fetch-site');
        if (secFetchSite !== undefined && secFetchSite !== 'same-origin') {
            return sendError(c, 403, 'forbidden_origin');
        }

        const origin = c.req.header('origin');
        if (origin !== undefined) {
            if (origin !== config.origin) {
                return sendError(c, 403, 'forbidden_origin');
            }
            return next();
        }

        const referer = c.req.header('referer');
        if (referer !== undefined) {
            const refererOrigin = originFromReferer(referer);
            if (refererOrigin === null || refererOrigin !== config.origin) {
                return sendError(c, 403, 'forbidden_origin');
            }
            return next();
        }

        return sendError(c, 403, 'forbidden_origin');
    };
}
