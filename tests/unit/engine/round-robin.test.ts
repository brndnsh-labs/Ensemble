import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    __resetPackCacheForTest,
    getPackBuffer,
    getPackBufferVariants,
    registerPackBuffer,
} from '../../../core/engine/instrument-registry.js';
import { __resetLoaderForTest, loadPack } from '../../../core/engine/sample-loader.js';
import { pickRoundRobin } from '../../../core/engine/sample-voice.js';
import { playDrumSound } from '../../../core/engine/synth-drums.js';
import type { EnsembleState } from '../../../core/types.js';

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

describe('round-robin — never the same take twice in a row (#1999)', () => {
    /** The takes a run of `hits` hits plays, each pick told the one before. */
    const run = <T>(takes: readonly T[], hits: number, seedOf = (i: number) => i * 250) => {
        const played: (T | null)[] = [];
        for (let i = 0; i < hits; i++) {
            played.push(pickRoundRobin(takes, seedOf(i), played.at(-1) ?? null));
        }
        return played;
    };

    it.each([2, 3, 4, 6])('consecutive picks over %i takes never share a take', (n) => {
        const takes = Array.from({ length: n }, (_, i) => `t${i}`);
        // Hit positions as the kit sends them: milliseconds of the hit's time, a sixteenth
        // apart at 120 bpm, then the same run at a jittered spacing.
        for (const seedOf of [(i: number) => i * 125, (i: number) => i * 125 + ((i * 7) % 13)]) {
            const played = run(takes, 512, seedOf);
            for (let i = 1; i < played.length; i++) {
                expect(played[i]).not.toBe(played[i - 1]);
            }
            // Still a round robin: every take is used.
            expect(new Set(played)).toEqual(new Set(takes));
        }
    });

    it('stays deterministic: the same seeds and the same previous take give the same run', () => {
        const takes = ['a', 'b', 'c', 'd'];
        expect(run(takes, 64)).toEqual(run(takes, 64));
    });

    it('a previous take the set does not hold is ignored, and a single take still plays', () => {
        const takes = ['a', 'b', 'c'];
        for (let seed = 0; seed < 32; seed++) {
            expect(pickRoundRobin(takes, seed, 'z')).toBe(pickRoundRobin(takes, seed));
        }
        expect(pickRoundRobin(['solo'], 3, 'solo')).toBe('solo');
    });

    it('the sampled kit never plays one articulation’s take twice in a row', () => {
        // Through the kit itself (`playDrumSound` → the pack's strike): the buffer each hit's
        // source was handed is the take it played.
        const PACK = 'rr-kit';
        const snares = ['s0', 's1', 's2', 's3'].map(fakeBuffer);
        const hats = ['h0', 'h1'].map(fakeBuffer);
        for (const take of snares) {
            registerPackBuffer(PACK, 'snare', take);
        }
        for (const take of hats) {
            registerPackBuffer(PACK, 'hihat-closed', take);
        }
        const played: AudioBuffer[] = [];
        const param = () => ({
            value: 0,
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            setTargetAtTime: vi.fn(),
            cancelScheduledValues: vi.fn(),
        });
        const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: param(), pan: param() });
        const audio = {
            currentTime: 0,
            createGain: vi.fn(node),
            createStereoPanner: vi.fn(node),
            createBufferSource: vi.fn(() => {
                const source = { ...node(), start: vi.fn(), stop: vi.fn(), buffer: null };
                return new Proxy(source, {
                    set(target, key, value) {
                        if (key === 'buffer') {
                            played.push(value);
                        }
                        return Reflect.set(target, key, value);
                    },
                });
            }),
        };
        const state = {
            playback: { audio, audioGraph: { drums: { gain: node() } } },
            groove: { voice: `pack:${PACK}`, humanize: 0, lastSampledHatVoice: null },
        } as unknown as EnsembleState;

        for (let i = 0; i < 200; i++) {
            // Snare and hat interleaved: each articulation remembers its own last take.
            playDrumSound(state, i % 2 ? 'Snare' : 'HiHat', i * 0.125, 1);
        }

        const snareRun = played.filter((b) => snares.includes(b));
        const hatRun = played.filter((b) => hats.includes(b));
        expect(snareRun).toHaveLength(100);
        expect(hatRun).toHaveLength(100);
        for (const takes of [snareRun, hatRun]) {
            for (let i = 1; i < takes.length; i++) {
                expect(takes[i]).not.toBe(takes[i - 1]);
            }
        }
    });
});
