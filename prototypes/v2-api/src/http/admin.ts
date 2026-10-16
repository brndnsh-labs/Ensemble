import type { DatabaseSync } from 'node:sqlite';
import { type Context, Hono } from 'hono';
import type { SessionClaims } from '../auth/index.js';
import { createRateLimiter } from '../auth/rate-limit.js';
import { readAdminOverview } from '../db/admin-overview.js';
import { sendError } from './errors.js';

/**
 * The operator's read-only overview (#1717), mounted at `/api/admin`.
 *
 * Authorization is the deploy-config allowlist and nothing else. Every refusal — no session, a
 * recovery session, an account not on the list, any caller while the list is empty — is the same
 * 404 an unknown route gets, decided before anything else is spent or validated, so the route
 * says nothing about itself to anyone it refuses. Only a listed account reaches the budget below.
 */
export const ADMIN_POLICIES: Readonly<Record<string, { max: number; windowMs: number }>> =
    Object.freeze({
        // A person reloading a page; nothing scripted has a reason to come close.
        'GET /api/admin/overview': { max: 30, windowMs: 60_000 },
    });

export interface AdminRoutesOptions {
    db: DatabaseSync;
    now: () => number;
    identify: (c: Context) => string;
    requireSession: (
        c: Context,
    ) => { ok: true; claims: SessionClaims } | { ok: false; response: Response };
    adminAccountIds: readonly string[];
    registrationCap: number;
}

export function adminRoutes({
    db,
    now,
    identify,
    requireSession,
    adminAccountIds,
    registrationCap,
}: AdminRoutesOptions): Hono {
    const routes = new Hono();
    const overviewBudget = createRateLimiter(ADMIN_POLICIES['GET /api/admin/overview']);

    routes.get('/overview', (c) => {
        const session = requireSession(c);
        if (!session.ok || !adminAccountIds.includes(session.claims.accountId)) {
            return sendError(c, 404, 'not_found');
        }
        // The route takes no query string; refused only once the caller is known to be listed.
        if (new URL(c.req.url).search !== '') {
            return sendError(c, 400, 'malformed_request');
        }
        const budget = overviewBudget(identify(c), now());
        if (!budget.allowed) {
            c.header('Retry-After', String(Math.ceil(budget.retryAfterMs / 1000)));
            return sendError(c, 429, 'rate_limited');
        }
        return c.json(
            readAdminOverview(db, {
                cap: registrationCap,
                callerId: session.claims.accountId,
                now: now(),
            }),
        );
    });

    return routes;
}
