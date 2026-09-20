/**
 * The one base-path rule (#1354): `scripts/base-path.mjs` for the build tooling and
 * `lib/base-path.ts` for the browser. Both sides are tested here because the cutover is only a
 * build flag if they agree — a normaliser that accepted `/v2/` and a `withBase` that doubled the
 * slash would publish an app whose service worker and asset URLs disagree with its own HTML.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { basePathFromEnv, DEFAULT_BASE_PATH, normalizeBasePath } from '../scripts/base-path.mjs';

describe('normalizeBasePath', () => {
    it('leaves today’s published base alone', () => {
        expect(normalizeBasePath('/v2')).toBe('/v2');
        expect(DEFAULT_BASE_PATH).toBe('/v2');
    });

    it('spells the site root as the empty string Next accepts as a basePath', () => {
        // `next/dist/server/config.js` rejects a literal '/', so '' is the only root basePath.
        expect(normalizeBasePath('/')).toBe('');
        expect(normalizeBasePath('//')).toBe('');
    });

    it('adds the leading slash and drops the trailing one', () => {
        expect(normalizeBasePath('v2')).toBe('/v2');
        expect(normalizeBasePath('/v2/')).toBe('/v2');
        expect(normalizeBasePath('  /v2/  ')).toBe('/v2');
        expect(normalizeBasePath('/stand/beta')).toBe('/stand/beta');
    });

    it('throws on a base that would silently mis-scope the worker or the assets', () => {
        for (const bad of [
            '',
            '   ',
            undefined,
            'https://ensemble.brndn.zip/v2',
            '/v2//beta',
            '/v 2',
            '/..',
            '/v2/../root',
        ]) {
            expect(() => normalizeBasePath(bad as string)).toThrow(/ENSEMBLE_V2_BASE/);
        }
    });
});

describe('basePathFromEnv', () => {
    it('defaults to today’s /v2 when nothing asked for another base', () => {
        expect(basePathFromEnv({})).toBe('/v2');
    });

    it('reads the flip from the environment', () => {
        expect(basePathFromEnv({ ENSEMBLE_V2_BASE: '/' })).toBe('');
        expect(basePathFromEnv({ ENSEMBLE_V2_BASE: '/v2' })).toBe('/v2');
    });

    it('fails loudly rather than guessing what an empty value meant', () => {
        expect(() => basePathFromEnv({ ENSEMBLE_V2_BASE: '' })).toThrow(/ENSEMBLE_V2_BASE/);
    });
});

describe('withBase', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    // `BASE_PATH` is a build constant Next inlines, so each case re-imports the module with the
    // value that build would have had.
    async function load(basePath: string | undefined) {
        vi.resetModules();
        if (basePath === undefined) {
            vi.stubEnv('NEXT_PUBLIC_BASE_PATH', undefined);
        } else {
            vi.stubEnv('NEXT_PUBLIC_BASE_PATH', basePath);
        }
        return import('./base-path');
    }

    it('prefixes an absolute app path with the published base', async () => {
        const { BASE_PATH, withBase } = await load('/v2');
        expect(BASE_PATH).toBe('/v2');
        expect(withBase('/sw.js')).toBe('/v2/sw.js');
        expect(withBase('/pack-files.json')).toBe('/v2/pack-files.json');
        expect(withBase('/')).toBe('/v2/');
        expect(withBase('/packs/grand/manifest.json')).toBe('/v2/packs/grand/manifest.json');
    });

    it('leaves the path untouched at the site root, with no doubled slash', async () => {
        const { BASE_PATH, withBase } = await load('');
        expect(BASE_PATH).toBe('');
        expect(withBase('/sw.js')).toBe('/sw.js');
        expect(withBase('/')).toBe('/');
        expect(withBase('/packs/grand/manifest.json')).toBe('/packs/grand/manifest.json');
    });

    it('falls back to today’s base outside a Next build', async () => {
        const { BASE_PATH } = await load(undefined);
        expect(BASE_PATH).toBe('/v2');
    });
});
