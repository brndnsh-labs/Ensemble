import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetPackCacheForTest } from '../../../public/engine/instrument-registry.js';
import {
    __resetPackRuntimeForTest,
    ensurePackLoaded,
    getPackZones,
} from '../../../public/engine/pack-runtime.js';

const fakeBuffer = (): AudioBuffer => ({}) as AudioBuffer;

function makeCtx(): AudioContext {
    return {
        decodeAudioData: vi.fn(async () => fakeBuffer()),
    } as unknown as AudioContext;
}

// fetch stub: manifest URL → the manifest JSON; sample URLs → audio bytes.
function stubFetch(manifest: unknown) {
    const fn = vi.fn(async (url: string) => {
        if (url.endsWith('manifest.json')) {
            return { ok: true, status: 200, json: async () => manifest };
        }
        return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) };
    });
    vi.stubGlobal('fetch', fn);
    return fn;
}

const manifest = {
    id: 'grand',
    samples: [
        { key: '60', rootMidi: 60, url: '/packs/grand/60.m4a' },
        { key: '63', rootMidi: 63, url: '/packs/grand/63.m4a' },
    ],
};

beforeEach(() => {
    __resetPackCacheForTest();
    __resetPackRuntimeForTest();
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe('pack-runtime', () => {
    it('fetches the manifest, loads samples, and builds zones with root pitches', async () => {
        stubFetch(manifest);
        expect(getPackZones('grand')).toBeNull(); // not loaded yet

        await ensurePackLoaded(makeCtx(), 'grand');

        const zones = getPackZones('grand');
        expect(zones).not.toBeNull();
        expect(zones?.map((z) => z.rootMidi).sort((a, b) => a - b)).toEqual([60, 63]);
        expect(zones?.every((z) => z.buffer !== null)).toBe(true);
    });

    it('dedupes concurrent ensure calls (one manifest fetch)', async () => {
        const fetchFn = stubFetch(manifest);
        const ctx = makeCtx();
        await Promise.all([ensurePackLoaded(ctx, 'grand'), ensurePackLoaded(ctx, 'grand')]);
        const manifestFetches = fetchFn.mock.calls.filter((c) =>
            String(c[0]).endsWith('manifest.json'),
        );
        expect(manifestFetches).toHaveLength(1);
    });

    it('swallows a failed manifest fetch — zones stay null so the seam falls back', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ ok: false, status: 404 })),
        );
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await ensurePackLoaded(makeCtx(), 'grand');
        expect(getPackZones('grand')).toBeNull();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('skips samples with no rootMidi (percussive entries) when building zones', async () => {
        stubFetch({
            id: 'mixed',
            samples: [
                { key: 'a', url: '/packs/mixed/a.m4a' }, // no rootMidi
                { key: '60', rootMidi: 60, url: '/packs/mixed/60.m4a' },
            ],
        });
        await ensurePackLoaded(makeCtx(), 'mixed');
        const zones = getPackZones('mixed');
        expect(zones).toHaveLength(1);
        expect(zones?.[0].rootMidi).toBe(60);
    });
});
