import type { MiddlewareHandler } from 'hono';

/**
 * Security headers on every `/api/*` response, including 404, 413, 415, 403 and 500 (#1189
 * decision 12). Registered before any other `/api/*` middleware so it is the outer-most layer:
 * it sets headers on the way back OUT, after `await next()`, which is what makes them survive
 * `app.notFound`/`app.onError` and any inner middleware's own early return — verified against
 * the installed `hono@4.13.7`, a middleware registered on the same path pattern still wraps both
 * the not-found fallback and a thrown handler error, because both resolve through the same
 * routed middleware chain rather than bypassing it.
 *
 * - `Cache-Control: private, no-store` — Cloudflare fronts the origin; nothing here may be
 *   cached or served from the anonymous app-shell's offline allowlist.
 * - `X-Content-Type-Options: nosniff`
 * - `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` — this service never
 *   serves HTML, so `default-src 'none'` is safe, and `frame-ancestors 'none'` blocks framing.
 * - `Referrer-Policy: no-referrer`
 */
export function securityHeaders(): MiddlewareHandler {
    return async (c, next) => {
        await next();
        c.header('Cache-Control', 'private, no-store');
        c.header('X-Content-Type-Options', 'nosniff');
        c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
        c.header('Referrer-Policy', 'no-referrer');
    };
}
