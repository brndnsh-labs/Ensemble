/**
 * Where this app is served from, as the browser sees it (#1354).
 *
 * `scripts/base-path.mjs` owns the rule and `next.config.mjs` applies it, both to Next's own
 * `basePath` and to `NEXT_PUBLIC_BASE_PATH`, which Next inlines into the bundle at build time.
 * So this is a build constant, not a runtime lookup: `'/v2'` for today's beta, `''` once the
 * stand takes the site root at the phase-5 cutover.
 *
 * Next rewrites what it owns — `next/link`, `next/image`, the `_next/*` asset URLs and the
 * prerendered HTML — against `basePath` on its own. It does NOT touch a hand-written `fetch`
 * URL, a `caches` key or a `serviceWorker.register` path, which is exactly what this module is
 * for. Use `withBase` for any absolute same-origin path this app spells itself.
 */

/**
 * The fallback repeats `scripts/base-path.mjs`'s `DEFAULT_BASE_PATH` rather than importing it —
 * that module reads `process.env` and belongs to the build, not the bundle. `base-path.test.ts`
 * pins both to the same value so the two cannot drift. It is reached only outside a Next build
 * (a unit test); every built page gets the inlined value.
 */
export const BASE_PATH: string = process.env.NEXT_PUBLIC_BASE_PATH ?? '/v2';

/** Prefix one absolute app path (`'/sw.js'`, `'/pack-files.json'`) with the build's base. */
export function withBase(path: string): string {
    return `${BASE_PATH}${path}`;
}
