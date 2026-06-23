import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetPackCacheForTest } from '../../../public/engine/instrument-registry.js';
import {
    __resetPackRuntimeForTest,
    ensurePackLoaded,
    ensurePacksForVoices,
    getPackZones,
    warmPacksForVoices,
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

    it('ensurePacksForVoices loads pack voices and ignores synth voices (#666)', async () => {
        // The regression this guards: a persisted pack voice must load whenever
        // audio comes up (initAudio calls this), not only after a Sounds-panel visit.
        const fetchFn = stubFetch(manifest);
        const ctx = makeCtx();

        ensurePacksForVoices(ctx, ['synth', 'pack:grand', 'synth']);
        // ensurePackLoaded dedupes to the in-flight promise kicked off above.
        await ensurePackLoaded(ctx, 'grand');

        expect(getPackZones('grand')).not.toBeNull();
        // Only the one pack voice fetched a manifest; the two synth voices didn't.
        const manifestFetches = fetchFn.mock.calls.filter((c) =>
            String(c[0]).endsWith('manifest.json'),
        );
        expect(manifestFetches).toHaveLength(1);
    });

    it('ensurePacksForVoices is a no-op when every voice is synth (#666)', async () => {
        const fetchFn = stubFetch(manifest);
        ensurePacksForVoices(makeCtx(), ['synth', 'synth', 'synth', 'synth', 'synth']);
        await Promise.resolve();
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it('warmPacksForVoices pre-decodes a selected pack voice off an OfflineAudioContext', async () => {
        // The flash this guards: without a load-time warm, first playback comes
        // up on the synth fallback while the pack decodes. Warming decodes into
        // the registry so initAudio's ensurePacksForVoices later short-circuits.
        const fetchFn = stubFetch(manifest);
        // A normal function (not an arrow) so it's construct-callable via `new`.
        const oacCtor = vi.fn(function FakeOAC() {
            return makeCtx();
        });
        vi.stubGlobal('OfflineAudioContext', oacCtor);

        warmPacksForVoices(['pack:grand', 'synth']);
        // Dedupes to the in-flight load the warm kicked off (packId-keyed).
        await ensurePackLoaded(makeCtx(), 'grand');

        expect(oacCtor).toHaveBeenCalledTimes(1); // one decode host, not per-voice
        expect(getPackZones('grand')).not.toBeNull();
        const manifestFetches = fetchFn.mock.calls.filter((c) =>
            String(c[0]).endsWith('manifest.json'),
        );
        expect(manifestFetches).toHaveLength(1);
    });

    it('warmPacksForVoices is a no-op with no pack voice (no decode host, no fetch)', () => {
        const fetchFn = stubFetch(manifest);
        const oacCtor = vi.fn(() => makeCtx());
        vi.stubGlobal('OfflineAudioContext', oacCtor);
        warmPacksForVoices(['synth', 'synth']);
        expect(oacCtor).not.toHaveBeenCalled();
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it('warmPacksForVoices no-ops (no throw) where OfflineAudioContext is absent', () => {
        const fetchFn = stubFetch(manifest);
        vi.stubGlobal('OfflineAudioContext', undefined);
        expect(() => warmPacksForVoices(['pack:grand'])).not.toThrow();
        expect(fetchFn).not.toHaveBeenCalled();
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
