/**
 * The one place that says where this app is served from (#1354).
 *
 * Today the music stand is a Next static export mounted at `/v2/` beside the v1 app; at the
 * phase-5 cutover (`docs/design/ensemble-v2-rollout.md`) it takes the site root instead. That
 * flip has to be ONE value rather than a repo-wide grep, so every build-time consumer —
 * `next.config.mjs`, `scripts/offline.mjs`, `scripts/serve.mjs` and the Playwright fixtures —
 * reads `ENSEMBLE_V2_BASE` through `basePathFromEnv` here, and the browser reads the same value
 * back out of `lib/base-path.ts` (`next.config.mjs` publishes it as `NEXT_PUBLIC_BASE_PATH`).
 *
 * Plain `.mjs` with no dependencies on purpose: `next.config.mjs` and the deploy/serve scripts
 * are Node ESM with no compile step in front of them, so a `.ts` module could not be the shared
 * one. `checks/fixtures.ts` imports it too, which Node's `require(esm)` support allows.
 *
 * The normalised form is what a URL prefix has to look like: a leading slash, no trailing slash,
 * and the site root spelled as the empty string — which is also the only `basePath` Next accepts
 * for the root (it rejects a literal `'/'`; see `next/dist/server/config.js`).
 */

/** What the build uses when `ENSEMBLE_V2_BASE` is unset: today's published location. */
export const DEFAULT_BASE_PATH = '/v2';

// A path segment: no empty segments, no `.`/`..` traversal, no characters that would need
// escaping in a URL. Deliberately stricter than the two values in use, so a typo fails the
// build instead of quietly publishing to a path nothing serves.
const PATH_SHAPE = /^(\/[A-Za-z0-9_-][A-Za-z0-9._~-]*)+$/;

/**
 * Normalise one authored base path, or throw. `'/'` (the site root) normalises to `''`.
 * Accepts a missing leading slash and a trailing one; rejects everything else loudly, because
 * a malformed base silently mis-scopes the service worker and every asset URL.
 *
 * @param {string | undefined} value
 * @returns {string}
 */
export function normalizeBasePath(value) {
    const authored = typeof value === 'string' ? value.trim() : '';
    if (authored === '') {
        throw new Error(
            `ENSEMBLE_V2_BASE must be a path prefix like "${DEFAULT_BASE_PATH}", or "/" for the site root; received ${JSON.stringify(value)}`,
        );
    }
    const prefixed = authored.startsWith('/') ? authored : `/${authored}`;
    const trimmed = prefixed.replace(/\/+$/, '');
    if (trimmed === '') {
        return '';
    }
    if (!PATH_SHAPE.test(trimmed)) {
        throw new Error(
            `ENSEMBLE_V2_BASE must be a path prefix like "${DEFAULT_BASE_PATH}", or "/" for the site root; received ${JSON.stringify(value)}`,
        );
    }
    return trimmed;
}

/**
 * The base path this build is for: `ENSEMBLE_V2_BASE`, or today's `/v2` when it is unset.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function basePathFromEnv(env = process.env) {
    const authored = env.ENSEMBLE_V2_BASE;
    return authored === undefined ? DEFAULT_BASE_PATH : normalizeBasePath(authored);
}
