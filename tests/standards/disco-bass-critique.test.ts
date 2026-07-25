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
    // binomial and this file used to flake on its tail (CI run 283, `31/41 = 75.6%`
    // against a 0.80 floor). A mulberry32-seeded spy collapses every test in this file
    // to one deterministic run. Restores mocks in before+after, so it subsumes the old
    // `vi.restoreAllMocks()` beforeEach. See docs/FLAKY_TESTS.md (unseeded-statistical).
    //
    // Measured under the CURRENT (#1254, step-index) metric at 512 pairs, 300 unseeded
    // runs: mean 88.84%, sd 1.41%. That is NOT the 0.94 `octaveProb` implies, and the
    // gap is a real engine defect, not measurement noise — see the Root-Octave test.
    // The pre-#1254 figures that used to live here (pooled 94.2%, ~40 pairs/run, a
    // 2000-iteration sweep against the 0.80 floor) all described the old
    // array-adjacency metric and no longer apply to anything in this file.
    //
    // Seed choice (0x1234, not the shared 0xc0ffee default): under the old metric
    // 0xc0ffee drew a verified bottom-1% sample (29/34 = 85.3%), and #1254 had to
    // re-derive the band *from the pinned value* — anchoring a musical target to a
    // bottom-1% draw would have frozen RNG noise as the target. 0x1234 was picked as
    // the closest of twelve candidates to the mean and remains a good pin under the
    // corrected metric: it draws 452/512 = 88.3%, 0.4σ below the 88.84% mean.
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

    /**
     * Octave-alternation rate: of every beat that has a playable "and" two 16th steps
     * later, how often does the pair span an octave?
     *
     * #1254 — the "and" is looked up BY STEP INDEX, not by array adjacency. The old
     * `performance[i + 1]` asked "is the next note played an 'and'?", so whenever the
     * gallop claimed the 'e' in between, the pair failed the `mStep % 4 === 2` check and
     * was dropped from the sample entirely — not counted as a miss. That voided ~37% of
     * beats, and it voided precisely the busiest ones, which a disco listener judges
     * hardest. The metric was silent about its own hardest case while being named
     * "Root-Octave alternating". Correcting it moved the measured rate from ~94.5% to
     * ~88.8%, because the discarded pairs were the failing ones.
     */
    const scoreOctaveAlternation = (performance) => {
        let octaveAlternations = 0;
        let checks = 0;
        let andsNotPlayed = 0;
        const byStep = new Map(performance.map((p) => [p.step, p]));

        performance.forEach((p) => {
            if (!p.info.isBeatStart) {
                return;
            }
            const and = byStep.get(p.step + 2);
            if (!and) {
                // A genuinely unplayed "and" is not a failed alternation — there is no
                // pair to judge. Counted and reported so a silent collapse in the
                // sample size can't masquerade as a healthy score.
                andsNotPlayed++;
                return;
            }
            checks++;
            if (Math.abs(and.note.midi - p.note.midi) === 12) {
                octaveAlternations++;
            }
        });

        return {
            score: octaveAlternations / (checks || 1),
            octaveAlternations,
            checks,
            andsNotPlayed,
        };
    };

    it('should implement Root-Octave alternating at high intensity', () => {
        // 128 bars, not the file's usual 16 (#1254). At 16 bars the metric samples 64
        // pairs and carries sd 4.05, which is wider than the effect it has to detect:
        // the 0.94 → 0.859 engine regression this test exists to catch only moves the
        // mean 7pt, so the healthy and regressed distributions overlap and NO threshold
        // can separate them. Measured sd by sample size (300 runs each): 64 pairs 4.05,
        // 128 pairs 2.81, 256 pairs 2.01, 512 pairs 1.43 — textbook 1/sqrt(n), and the
        // mean holds at 88.8-89.2 throughout, which also confirms nothing loop- or
        // section-dependent drifts over the longer run. 512 pairs is what makes the band
        // below an actual gate rather than a fence. One extra simulated run, no
        // measurable runtime cost.
        const performance = simulatePerformance(128, {
            playback: { bandIntensity: 0.9, complexity: 0.5, bpm: 124 },
        });

        const { score, octaveAlternations, checks, andsNotPlayed } =
            scoreOctaveAlternation(performance);
        console.log(
            `[Disco Critique] Octave Alternation Score: ${(score * 100).toFixed(1)}% ` +
                `(${octaveAlternations}/${checks} pairs; ${andsNotPlayed} "and"s unplayed)`,
        );

        // The musical claim (#1254): at high intensity the octave lands on at least 17 of
        // every 20 upbeats — the pump is the line's identity, not an occasional flourish.
        //
        // Derived, not guessed. Measured at 512 pairs over 300 unseeded runs per variant,
        // sweeping the engine's `octaveProb` (the disco branch in `bass-styles.ts`):
        //
        //   octaveProb @ i=0.9 | mean  | sd   | min  | max
        //   0.94 (the design)  | 88.84 | 1.41 | 84.2 | 93.2
        //   0.895 (mild drop)  | 85.15 | 1.61 | 79.9 | 89.8
        //   0.859 (the #1254 regression) | 82.07 | 1.76 | 77.3 | ~86
        //
        // Floor 0.85 sits 2.7σ below the design mean and 1.7σ ABOVE the 0.859-regression
        // mean, so it catches ~95% of that regression's stream positions. The old `> 0.80`
        // sat *below* that regression's mean — it could not catch the very drop this test
        // exists to detect, which is what made it a fence rather than a gate (the 0.859
        // mutant scores 80.3% and would have passed it by 0.3pt).
        //
        // Honest about the headroom: 0.85 is slightly ABOVE the 300-run minimum of 84.2,
        // so the floor sits just inside the healthy distribution's lower tail — roughly 1
        // unseeded run in 300 would fail it. That costs nothing while the test is seeded
        // and deterministic; the residual risk is ~0.3% that an unrelated RNG-stream shift
        // re-draws a healthy run below the floor.
        //
        // NO CEILING here, deliberately. `octaveProb = 0.4 + intensity * 0.6` reaches
        // exactly 1.0 at intensity 1.0, so the engine's own design says "alternate on
        // every upbeat" is correct at the top of the range — an upper bound asserting the
        // pump must MISS some upbeats would contradict the curve it is testing, and
        // relentlessness is the disco idiom besides. The "must redden in both directions"
        // property comes from the intensity-response test below, which is a real musical
        // claim and is immune to the level shift that fixing the anchor bug will cause.
        //
        // Note the design mean is 88.84%, NOT the 94% `octaveProb = 0.94` implies, and
        // that gap is an ENGINE DEFECT, not measurement noise — the metric correction is
        // what exposed it. Split by what the gallop's interposed 'e' played: when the 'e'
        // repeats the root, alternation is 88-94%; when the 'e' jumps the octave, it
        // collapses to 5-9%. `normalizeToRange` (`bass-engine.ts`) recomputes the register
        // anchor from `prevMidi` every step, so the gallop's octave drags the "and" up an
        // octave, and the `absMax` fold in the disco branch then collapses it back onto
        // the downbeat's own pitch — a unison, from a roll that succeeded. Same mechanism
        // costs the downbeat its anchor: the low root lands on only ~49% of beats and the
        // pump descends (245) more often than it ascends (201). Tracked as #1271; this floor
        // will want re-deriving UPWARD once that lands (true clean-beat rate is ~93%).
        expect(score).toBeGreaterThan(0.85);
    });

    it('scales the octave pump with intensity — the octave emerges as energy builds', () => {
        // This is where "reddens in both directions" comes from (#1254), replacing an
        // upper bound on the high-intensity rate. The design is `octaveProb = 0.4 +
        // intensity * 0.6`, so the pump is meant to be a GRADIENT: present but sparse when
        // the band is laying back, relentless when it lifts. A fixed rate — at any level,
        // including a mechanically perfect 100% — fails this, which is precisely what a
        // ceiling on the high-intensity number cannot express.
        //
        // Measured seeded rates at 512 pairs: i=0.3 → 57.2%, i=0.5 → 68.8%, i=0.7 → 77.0%,
        // i=0.9 → 88.7%, tracking `octaveProb` (0.58/0.70/0.82/0.94) with a consistent
        // offset from the anchor defect described above. sd at this sample is ~1.4-2.2%,
        // so the ~31pt spread between the extremes is ~15σ — enormous headroom.
        //
        // Deliberately asserted as a GAP rather than two absolute bands: the anchor fix
        // will raise every level here, and this test should survive that untouched. What
        // must not change is that the low end stays clearly below the high end.
        const low = scoreOctaveAlternation(
            simulatePerformance(128, {
                playback: { bandIntensity: 0.3, complexity: 0.5, bpm: 124 },
            }),
        );
        const high = scoreOctaveAlternation(
            simulatePerformance(128, {
                playback: { bandIntensity: 0.9, complexity: 0.5, bpm: 124 },
            }),
        );

        console.log(
            `[Disco Critique] Octave pump vs intensity: i=0.3 → ${(low.score * 100).toFixed(1)}% ` +
                `(n=${low.checks}), i=0.9 → ${(high.score * 100).toFixed(1)}% (n=${high.checks}), ` +
                `gap ${((high.score - low.score) * 100).toFixed(1)}pt`,
        );

        // Sample integrity first — a collapsed n would make the gap meaningless.
        expect(low.checks).toBeGreaterThan(400);
        expect(high.checks).toBeGreaterThan(400);

        // Measured gap ~31pt. Floor of 15pt is ~7σ of headroom below it while still being
        // far more than any plausible re-levelling from the anchor fix would erase: the
        // design's own low-to-high span is 36pt (0.58 → 0.94), so a 15pt floor tolerates
        // the gradient being compressed by more than half before it complains.
        expect(high.score - low.score).toBeGreaterThan(0.15);
        // And the laid-back end must actually sound laid back — not the hook at full tilt.
        expect(low.score).toBeLessThan(0.75);
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
