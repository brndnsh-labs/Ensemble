import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revForPack } from '../../../public/data/sound-packs.js';
import { __resetPackCacheForTest } from '../../../public/engine/instrument-registry.js';
import {
    __resetLoaderForTest,
    loadPack,
    type PackManifest,
    withRevToken,
} from '../../../public/engine/sample-loader.js';

/**
 * #752 — catalog `rev` cache-bust. Re-encoding a pack in place must produce new
 * asset URLs (`?v=<rev>`) so the CacheFirst SW + browser HTTP cache miss and
 * re-fetch. The token is sourced from the bundled catalog (hash-busted each
 * deploy), never from the `/packs/`-served manifest (which would itself be stale).
 */

function makeCtx(): AudioContext {
    return {
        decodeAudioData: vi.fn(async (bytes: ArrayBuffer) => ({ byteLength: bytes.byteLength })),
    } as unknown as AudioContext;
}

function stubFetch(): ReturnType<typeof vi.fn> {
    const fn = vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(url.length),
    }));
    vi.stubGlobal('fetch', fn);
    return fn;
}

const manifest: PackManifest = {
    id: 'grand',
    samples: [
        { key: 'A4', url: '/packs/grand/a4.m4a' },
        { key: 'C4', url: '/packs/grand/c4.m4a' },
    ],
};

beforeEach(() => {
    __resetPackCacheForTest();
    __resetLoaderForTest();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('#752 — withRevToken URL construction', () => {
    it('leaves the URL bare for the default rev (<= 1) — no spurious re-download', () => {
        expect(withRevToken('/packs/grand/a4.m4a', 1)).toBe('/packs/grand/a4.m4a');
        expect(withRevToken('/packs/grand/manifest.json', 1)).toBe('/packs/grand/manifest.json');
    });

    it('appends ?v=<rev> when a pack is bumped to >= 2', () => {
        expect(withRevToken('/packs/grand/a4.m4a', 2)).toBe('/packs/grand/a4.m4a?v=2');
        expect(withRevToken('/packs/grand/manifest.json', 3)).toBe(
            '/packs/grand/manifest.json?v=3',
        );
    });

    it('uses & when the URL already carries a query', () => {
        expect(withRevToken('/packs/x/a.m4a?foo=1', 2)).toBe('/packs/x/a.m4a?foo=1&v=2');
    });
});

describe('#752 — revForPack catalog lookup', () => {
    it('defaults to 1 for a catalog pack with no rev set (today: all packs)', () => {
        expect(revForPack('grand')).toBe(1);
    });

    it('defaults to 1 for an unknown pack id', () => {
        expect(revForPack('does-not-exist')).toBe(1);
    });
});

describe('#752 — loadPack threads rev into sample fetch URLs', () => {
    it('fetches bare sample URLs at the default rev', async () => {
        const fetchFn = stubFetch();
        await loadPack(makeCtx(), manifest);
        const urls = fetchFn.mock.calls.map((c) => c[0]);
        expect(urls).toEqual(['/packs/grand/a4.m4a', '/packs/grand/c4.m4a']);
    });

    it('appends ?v=<rev> to every sample URL when the pack is bumped', async () => {
        const fetchFn = stubFetch();
        await loadPack(makeCtx(), manifest, 2);
        const urls = fetchFn.mock.calls.map((c) => c[0]);
        expect(urls).toEqual(['/packs/grand/a4.m4a?v=2', '/packs/grand/c4.m4a?v=2']);
        // A bumped rev yields distinct URLs → CacheFirst SW + browser cache miss.
        expect(urls.every((u) => u.includes('?v=2'))).toBe(true);
    });
});
