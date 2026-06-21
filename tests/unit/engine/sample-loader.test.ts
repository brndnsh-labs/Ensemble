import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    __resetPackCacheForTest,
    getPackBuffer,
    isPackLoaded,
} from '../../../public/engine/instrument-registry.js';
import {
    __resetLoaderForTest,
    loadPack,
    type PackManifest,
} from '../../../public/engine/sample-loader.js';

// A decoded-buffer stand-in (the loader/registry never inspect contents).
const fakeBuffer = (tag: string): AudioBuffer => ({ tag }) as unknown as AudioBuffer;

// Minimal AudioContext: decodeAudioData returns a distinct buffer per call so
// we can assert the right bytes landed under the right key.
function makeCtx(): { ctx: AudioContext; decode: ReturnType<typeof vi.fn> } {
    const decode = vi.fn(async (bytes: ArrayBuffer) => fakeBuffer(`decoded-${bytes.byteLength}`));
    return { ctx: { decodeAudioData: decode } as unknown as AudioContext, decode };
}

// fetch stub: each url yields an arrayBuffer whose byteLength encodes the url,
// so a decoded buffer can be traced back to its sample.
function stubFetch(opts: { ok?: boolean; status?: number } = {}): ReturnType<typeof vi.fn> {
    const fn = vi.fn(async (url: string) => ({
        ok: opts.ok ?? true,
        status: opts.status ?? 200,
        arrayBuffer: async () => new ArrayBuffer(url.length),
    }));
    vi.stubGlobal('fetch', fn);
    return fn;
}

const manifest: PackManifest = {
    id: 'grand',
    samples: [
        { key: 'A4', url: '/packs/grand/a4.opus' },
        { key: 'C4', url: '/packs/grand/c4.opus' },
    ],
};

beforeEach(() => {
    __resetPackCacheForTest();
    __resetLoaderForTest();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('sample-loader — happy path', () => {
    it('fetches, decodes, and registers every sample', async () => {
        const fetchFn = stubFetch();
        const { ctx, decode } = makeCtx();

        await loadPack(ctx, manifest);

        expect(fetchFn).toHaveBeenCalledTimes(2);
        expect(decode).toHaveBeenCalledTimes(2);
        expect(isPackLoaded('grand')).toBe(true);
        expect(getPackBuffer('grand', 'A4')).not.toBeNull();
        expect(getPackBuffer('grand', 'C4')).not.toBeNull();
        // The registry now resolves this pack's voice to a sample source.
    });
});

describe('sample-loader — lazy / idempotent', () => {
    it('does not re-fetch a pack that is already loaded', async () => {
        const fetchFn = stubFetch();
        const { ctx } = makeCtx();

        await loadPack(ctx, manifest);
        await loadPack(ctx, manifest);

        expect(fetchFn).toHaveBeenCalledTimes(2); // not 4
    });

    it('dedupes concurrent loads into one in-flight fetch set', async () => {
        const fetchFn = stubFetch();
        const { ctx } = makeCtx();

        await Promise.all([loadPack(ctx, manifest), loadPack(ctx, manifest)]);

        expect(fetchFn).toHaveBeenCalledTimes(2); // shared in-flight promise
        expect(isPackLoaded('grand')).toBe(true);
    });
});

describe('sample-loader — fail loud', () => {
    it.each([
        ['not an object', null],
        ['missing id', { samples: [{ key: 'A4', url: '/a.opus' }] }],
        ['empty samples', { id: 'x', samples: [] }],
        ['malformed sample entry', { id: 'x', samples: [{ key: 'A4' }] }],
    ])('throws on a malformed manifest (%s)', async (_label, bad) => {
        const { ctx } = makeCtx();
        await expect(loadPack(ctx, bad as unknown as PackManifest)).rejects.toThrow(
            /\[sample-loader\]/,
        );
        expect(isPackLoaded((bad as { id?: string })?.id ?? 'x')).toBe(false);
    });

    it('rejects and stays unloaded (retryable) on a non-OK fetch', async () => {
        const fetchFn = stubFetch({ ok: false, status: 404 });
        const { ctx } = makeCtx();

        await expect(loadPack(ctx, manifest)).rejects.toThrow(/fetch failed \(404\)/);
        expect(isPackLoaded('grand')).toBe(false);

        // The in-flight entry was cleared, so a recovered fetch can retry.
        stubFetch();
        await loadPack(ctx, manifest);
        expect(isPackLoaded('grand')).toBe(true);
        expect(fetchFn).toHaveBeenCalled();
    });

    it('rejects on an undecodable payload and registers nothing (atomic)', async () => {
        // Distinguishable URL lengths (20 vs 19) so exactly ONE decode fails
        // while its sibling decodes fine — the real partial-success path that
        // atomicity protects (a half-loaded pack must never be observable).
        const partialManifest: PackManifest = {
            id: 'grand',
            samples: [
                { key: 'A4', url: '/packs/grand/a4.opus' }, // 20 bytes — decodes OK
                { key: 'C4', url: '/packs/grand/c.opus' }, // 19 bytes — decode throws
            ],
        };
        stubFetch();
        const badLen = partialManifest.samples[1].url.length; // 19
        const decode = vi.fn(async (bytes: ArrayBuffer) => {
            if (bytes.byteLength === badLen) {
                throw new Error('EncodingError: bad audio data');
            }
            return fakeBuffer('ok');
        });
        const ctx = { decodeAudioData: decode } as unknown as AudioContext;

        await expect(loadPack(ctx, partialManifest)).rejects.toThrow(/bad audio data/);
        // Both decodes were attempted; A4 succeeded but because C4 failed the
        // pack is present-or-absent — the successful A4 buffer must NOT leak in.
        expect(decode).toHaveBeenCalledTimes(2);
        expect(isPackLoaded('grand')).toBe(false);
        expect(getPackBuffer('grand', 'A4')).toBeNull(); // successful sibling not leaked
        expect(getPackBuffer('grand', 'C4')).toBeNull();
    });
});
