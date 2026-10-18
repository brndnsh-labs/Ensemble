import type { Context, MiddlewareHandler } from 'hono';
import { createRateLimiter } from '../auth/rate-limit.js';
import { sendError } from './errors.js';

/**
 * Finding 1(b) (#1196 independent review): a single shared, per-identity budget applied to every
 * `/api/*` request, registered as the very FIRST middleware inside that scope in `app.ts` — ahead
 * of `sameOriginGuard`, `jsonOnlyGuard`, `bodyLimit`, and `authPolicy`'s own unknown-route 404,
 * none of which carry a rate limit of their own. Without this, all four are reachable for free by
 * an unauthenticated caller, and two of them (`sameOriginGuard`'s 403, `authPolicy`'s unknown-route
 * 404) need no special header at all: see `same-origin.ts`'s final `return sendError(c, 403,
 * 'forbidden_origin')` and `auth-policy.ts`'s `if (!selected) return sendError(c, 404,
 * 'not_found')`, which returns before that file's own per-route limiter is ever consulted.
 *
 * This does not replace `AUTH_POLICIES`' per-route budgets further down the chain — it is a
 * backstop bounding the guards that currently have none. 300/min per identity is deliberately
 * generous relative to any single route's own budget (the tightest is `GET /api/auth/session` at
 * 120/min) so it never trips on legitimate combined traffic across routes, while still being far
 * below the ~10,000 requests it would otherwise take to threaten `recordSecurityEvent`'s global
 * audit-row ring (`src/auth/security-events.ts`) — belt-and-suspenders alongside that file's own
 * `AUTH_DECISION_CODES` narrowing, which is the primary fix for the audit-eviction half of
 * Finding 1.
 */
export function transportRateLimitGuard(
    identify: (c: Context) => string,
    now: () => number,
): MiddlewareHandler {
    const limiter = createRateLimiter({ max: 300, windowMs: 60_000 });
    return async (c, next) => {
        const result = limiter(identify(c), now());
        if (!result.allowed) {
            c.header('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
            return sendError(c, 429, 'rate_limited');
        }
        return next();
    };
}
