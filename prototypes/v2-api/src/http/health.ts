import type { DatabaseSync } from 'node:sqlite';
import type { Hono } from 'hono';

/**
 * Operator readiness, outside /api/auth so probes never spend a caller's auth budget.
 * Read the actual schema (not the constant SELECT 1) without touching account data, issuing
 * cookies, or writing timestamps. Startup has already applied the image's migrations.
 * Caddy should route only /api/* publicly; /healthz is for the container/operator network.
 */
export function registerHealthCheck(app: Hono, db: DatabaseSync, revision: string): void {
    app.get('/healthz', (c) => {
        try {
            db.prepare('SELECT filename FROM _migrations LIMIT 1').get();
            return c.json({ status: 'ok', revision });
        } catch {
            // Never expose a database filename, exception, schema contents or stack trace.
            return c.json({ status: 'unavailable' }, 503);
        }
    });
}
