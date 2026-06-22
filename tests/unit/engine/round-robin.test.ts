import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    __resetPackCacheForTest,
    getPackBuffer,
    getPackBufferVariants,
} from '../../../public/engine/instrument-registry.js';
import { __resetLoaderForTest, loadPack } from '../../../public/engine/sample-loader.js';
import { pickRoundRobin } from '../../../public/engine/sample-voice.js';

/**
 * #657 — deterministic round-robin support for the drum pack runtime.
 *
 * Two halves: (1) a zone key can carry N alternate takes through the loader +
 * registry, and (2) `pickRoundRobin` cycles them deterministically (seeded by
 * the playing position), so a sampled kit varies hit-to-hit without ever
 * depending on `Math.random`.
 */

const fakeBuffer = (tag: string): AudioBuffer => ({ tag }) as unknown as AudioBuffer;

function makeCtx(): AudioContext {
    return {
        // decode → a buffer tagged with the requested URL, so we can assert
        // *which* take landed where and in what order.
        decodeAudioData: vi.fn(async (bytes: ArrayBuffer & { __url?: string }) =>
            fakeBuffer(bytes.__url ?? '?'),
        ),
    } as unknown as AudioContext;
}

// fetch stub: manifest URL → the manifest JSON; sample URLs → bytes carrying
// their own URL so the decode stub can tag the resulting buffer.
function stubFetch(manifest: unknown) {
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
            if (url.endsWith('manifest.json')) {
                return { ok: true, status: 200, json: async () => manifest };
            }
            const bytes = new ArrayBuffer(8) as ArrayBuffer & { __url?: string };
            bytes.__url = url;
            return { ok: true, status: 200, arrayBuffer: async () => bytes };
        }),
    );
}

beforeEach(() => {
    __resetPackCacheForTest();
    __resetLoaderForTest();
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe('round-robin — loader + registry (N takes per zone)', () => {
    it('accumulates a zone’s primary + variant takes under one key, in manifest order', async () => {
        stubFetch({
            id: 'kit',
            samples: [
                {
                    key: 'snare',
                    url: '/packs/kit/snare_0.m4a',
                    variants: ['/packs/kit/snare_1.m4a', '/packs/kit/snare_2.m4a'],
                },
                { key: 'kick', url: '/packs/kit/kick_0.m4a' }, // single-take zone
            ],
        });

        await loadPack(makeCtx(), {
            id: 'kit',
            samples: [
                {
                    key: 'snare',
                    url: '/packs/kit/snare_0.m4a',
                    variants: ['/packs/kit/snare_1.m4a', '/packs/kit/snare_2.m4a'],
                },
                { key: 'kick', url: '/packs/kit/kick_0.m4a' },
            ],
        });

        const snare = getPackBufferVariants('kit', 'snare');
        expect(snare).not.toBeNull();
        expect(snare?.length).toBe(3);
        // Order is manifest order: primary url first, then each variant.
        expect(snare?.map((b) => (b as unknown as { tag: string }).tag)).toEqual([
            '/packs/kit/snare_0.m4a',
            '/packs/kit/snare_1.m4a',
            '/packs/kit/snare_2.m4a',
        ]);

        // A single-take zone is a length-1 list — and getPackBuffer (the pitched
        // accessor) still returns take 0, back-compatible with pre-#657 packs.
        expect(getPackBufferVariants('kit', 'kick')?.length).toBe(1);
        expect((getPackBuffer('kit', 'snare') as unknown as { tag: string }).tag).toBe(
            '/packs/kit/snare_0.m4a',
        );
    });
});

describe('round-robin — pickRoundRobin (deterministic selection)', () => {
    const takes = ['a', 'b', 'c'] as const;

    it('is stable across loops: the same seed always returns the same take', () => {
        // "Stable across loops" = reproducible. Re-render the same position in a
        // later loop → identical take, with no Math.random nondeterminism.
        for (let seed = 0; seed < 50; seed++) {
            expect(pickRoundRobin(takes, seed)).toBe(pickRoundRobin(takes, seed));
        }
    });

    it('cycles through every take across a position sweep (not stuck on one)', () => {
        const seen = new Set<string>();
        for (let step = 0; step < 64; step++) {
            const t = pickRoundRobin(takes, step);
            if (t !== null) {
                seen.add(t);
            }
        }
        // All three alternates get used over a bar-sweep — the anti-machine-gun
        // guarantee. (A `step % 3` modulo would also pass coverage but lock to a
        // fixed grid; scrambleHash decorrelates while staying deterministic.)
        expect(seen).toEqual(new Set(['a', 'b', 'c']));
    });

    it('does not collapse to a fixed grid pattern (scrambled, not raw modulo)', () => {
        // Raw `seed % 3` would give 0,1,2,0,1,2…; assert the scrambled sequence
        // differs from that lockstep so we know the decorrelation is real.
        const scrambled = Array.from({ length: 12 }, (_, step) => pickRoundRobin(takes, step));
        const rawModulo = Array.from({ length: 12 }, (_, step) => takes[step % takes.length]);
        expect(scrambled).not.toEqual(rawModulo);
    });

    it('returns the only take for a single-take zone, and null for an empty set', () => {
        expect(pickRoundRobin(['solo'], 7)).toBe('solo');
        expect(pickRoundRobin(['solo'], 999)).toBe('solo');
        expect(pickRoundRobin([], 0)).toBeNull();
    });
});
