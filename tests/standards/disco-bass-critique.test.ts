// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';
import { installSeededRandom } from '../utils/seeded-random.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Disco Bassist Critique', () => {
    // why: the octave pump rolls raw `Math.random() < octaveProb` once per upbeat
    // (`bass-styles.ts`, the disco branch), so the alternation rate is an unseeded
    // binomial. Measured over 300 isolated runs the pooled rate is 94.2% — exactly
    // the designed 0.4 + 0.9*0.6 = 0.94 (`bass-engine.ts` passes `bandIntensity`
    // through unscaled), so the engine is not under-delivering — but the per-run
    // sample is only ~40 upbeat pairs (see the Root-Octave test's comment), and a
    // 2000-iteration in-process sweep dipped below the 0.80 floor 3 times (1 in
    // ~640, worst draw 0.774). CI run 283 saw 31/41 = 75.6%, one step further into
    // the same tail. A mulberry32-seeded spy collapses every test in this file to
    // one deterministic run. Restores mocks in before+after, so it subsumes the old
    // `vi.restoreAllMocks()` beforeEach. See docs/FLAKY_TESTS.md (unseeded-statistical).
    //
    // Seed choice (0x1234, not the shared 0xc0ffee default): 0xc0ffee draws
    // 29/34 = 85.3% on the Root-Octave test — below the measured 86.1% minimum of
    // 120 unseeded runs, i.e. a bottom-1% sample. It still *passes* the 0.80 floor,
    // so this is not threshold-shopping; but #1254 re-derives that band **from the
    // pinned value**, and anchoring it to a verified bottom-1% draw would freeze RNG
    // noise as the musical target, 9pt under the engine's true centre. 0x1234 draws
    // 45/48 = 93.8%, the closest of twelve candidate seeds to the 94.2% mean.
    //
    // Pinned at the describe level deliberately: `reseed()` mutates the handle's
    // persistent seed and `beforeEach` replays it, so a per-test `rng.reseed()` would
    // silently govern every *later* test in the file too — making three unrelated
    // critique tests' streams a function of test ordering.
    installSeededRandom(0x1234);

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 124 },
            groove: {
                genreFeel: 'Disco',
                lastDrumPreset: 'Disco',
                instruments: [],
            },
            arranger: {
                timeSignature: '4/4',
                totalSteps: numBars * 16,
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
            ...stateOverrides,
        };
        getState.mockReturnValue(mockState);

        const chordC = { rootMidi: 48, intervals: [0, 4, 7], quality: 'maj', beats: 4 };
        const tsConfig = TIME_SIGNATURES['4/4'];

        const performance = [];
        let prevFreq = 0;
        for (let globalStep = 0; globalStep < numBars * 16; globalStep++) {
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);
            const active = isBassActive(getState(), 'disco', globalStep, globalStep % 16, info, {});

            if (active) {
                const note = getBassNote(
                    getState(),
                    chordC,
                    null,
                    info.beatIndex,
                    prevFreq,
                    48,
                    'disco',
                    0,
                    globalStep,
                    globalStep % 16,
                    {},
                    info,
                );
                if (note) {
                    performance.push({ step: globalStep, loopStep: globalStep % 16, info, note });
                    prevFreq = note.freq;
                }
            }
        }
        return performance;
    };

    it('should implement Root-Octave alternating at high intensity', () => {
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.9, complexity: 0.5, bpm: 124 },
        });

        let octaveAlternations = 0;
        let checks = 0;

        performance.forEach((p, i) => {
            if (p.info.isBeatStart && i + 1 < performance.length) {
                const next = performance[i + 1];
                if (next.info.mStep % 4 === 2) {
                    // The "and"
                    checks++;
                    const diff = Math.abs(next.note.midi - p.note.midi);
                    if (diff === 12) {
                        octaveAlternations++;
                    }
                }
            }
        });

        const score = octaveAlternations / (checks || 1);
        console.log(`[Disco Critique] Octave Alternation Score: ${(score * 100).toFixed(1)}%`);

        // octaveProb = 0.4 + intensity*0.6 = 0.94 at intensity 0.9 (the disco branch
        // in bass-styles.ts). Re-measured 2026-07-24 over 300 isolated runs: pooled
        // 94.2%, per-run mean 94.2% / sd 3.4% / min 81.8%.
        //
        // The sample is smaller than it looks. `checks` counts only beat-start → "and"
        // pairs, and the gallop claims the 'e' slot in between. Note the gate is
        // `Math.random() < gallopProb - 0.1`, so the *effective* rate here is
        // 0.474 - 0.1 ≈ 0.37, not the 0.474 the variable holds — that voids ~37% of
        // the 64 beat-starts, giving measured `checks` of 29-52 (mean 40.1). NOT the
        // "~64/run" an earlier comment here claimed; that stale figure is what made
        // CI run 283's failure look inexplicable.
        //
        // Threshold > 0.80 is deliberately left alone: #1254 owns re-deriving this
        // band (it sits ~4σ below the mean, so it asserts "octaves weren't suppressed
        // entirely" rather than the name's "Root-Octave alternating"), and re-deriving
        // it is only sound off the seeded value. Until it does, note the cost of the
        // seed pin: unseeded, an engine drop 0.94 → 0.85 reddened ~6% of runs, so it
        // was at least visible as a "flake"; pinned at 93.8% against a 0.80 floor,
        // that same audible regression never reddens at all.
        //
        // #1254 should also fix *what* is measured, not just the band: this reads the
        // "and" via array adjacency (`performance[i + 1]`), so on the ~37% of beats
        // where the gallop interposes a note the pump's alternation is invisible —
        // dropped from the sample rather than counted as a miss. Looking the "and" up
        // by step index instead restores all 64 pairs and makes the metric mean its name.
        expect(score).toBeGreaterThan(0.8);
    });

    it('should implement the "Gallop" (16th skips) at maximum complexity', () => {
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.95, complexity: 0.95, bpm: 124 },
        });

        const syncopatedHits = performance.filter((p) => p.info.mStep % 2 !== 0);
        console.log(`[Disco Critique] Syncopated (Gallop) Hits: ${syncopatedHits.length}`);

        // gallopProb-0.1 = intensity^2*0.4 + complexity*0.3 - 0.1 = 0.55 at max settings.
        // 128 possible 16th positions × 0.55 = ~70 expected.
        expect(syncopatedHits.length).toBeGreaterThan(50);
    });

    it('should stay strictly within the bass spectral slot (28-51)', () => {
        const performance = simulatePerformance(32, {
            playback: { bandIntensity: 0.9, complexity: 0.5, bpm: 124 },
        });

        performance.forEach((p) => {
            expect(p.note.midi).toBeGreaterThanOrEqual(28);
            expect(p.note.midi).toBeLessThanOrEqual(51);
        });
    });

    it('should suppress the Gallop at low intensity', () => {
        // gallopProb-0.1 = intensity^2*0.4 + complexity*0.3 - 0.1.
        // At intensity 0.2, complexity 0.2: 0.016 + 0.06 - 0.1 = negative → 0 firings.
        // High vs low: dramatic density gap from 16th positions.
        const high = simulatePerformance(16, {
            playback: { bandIntensity: 0.95, complexity: 0.95, bpm: 124 },
        });
        const low = simulatePerformance(16, {
            playback: { bandIntensity: 0.2, complexity: 0.2, bpm: 124 },
        });
        const galloperCount = (perf) => perf.filter((p) => p.info.mStep % 2 !== 0).length;
        const highGallops = galloperCount(high);
        const lowGallops = galloperCount(low);
        console.log(`[Disco Critique] Gallop scaling: high=${highGallops} low=${lowGallops}`);
        expect(highGallops).toBeGreaterThan(50);
        expect(lowGallops).toBe(0);
    });
});
