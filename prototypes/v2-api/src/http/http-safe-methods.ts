/**
 * The single source of truth for "safe" HTTP methods, shared by `same-origin.ts` and
 * `content-type.ts` so they cannot silently diverge (P2-7 review finding on #1189).
 *
 * Deny-list, not allow-list: only `GET`, `HEAD` and `OPTIONS` are exempt from the same-origin and
 * JSON-only guards. Before this module existed, both guards separately allow-listed
 * `POST`/`PUT`/`PATCH`/`DELETE` as "unsafe" — which meant `PURGE`, `PROPFIND`, `MKCOL`, `LOCK`,
 * and any other WebDAV/custom verb silently skipped BOTH guards. Harmless today (no route
 * matches them), but the next story (#1190-#1192) inherits this file's routes and could add one
 * that does.
 */
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isSafeMethod(method: string): boolean {
    return SAFE_METHODS.has(method);
}
