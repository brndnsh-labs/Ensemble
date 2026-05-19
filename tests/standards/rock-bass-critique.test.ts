// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Rock Bassist Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 120 },
            groove: {
                genreFeel: 'Rock',
                creativity: true,
                lastDrumPreset: 'Rock',
                instruments: [],
            },
            arranger: {
                timeSignature: '4/4',
                totalSteps: numBars * 16,
                stepMap: [],
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
            ...stateOverrides,
        };

        // Populate step map for chord change detection
        const chordC = { rootMidi: 48, quality: 'maj', beats: 4 };
        const chordG = { rootMidi: 55, quality: 'maj', beats: 4 };
        for (let m = 0; m < numBars; m++) {
            mockState.arranger.stepMap.push({
                start: m * 16,
                end: (m + 1) * 16,
                chord: m % 2 === 0 ? chordC : chordG,
            });
        }

        getState.mockReturnValue(mockState);

        const tsConfig = TIME_SIGNATURES['4/4'];
        const performance = [];
        let prevFreq = 0;

        for (let i = 0; i < numBars * 16; i++) {
            const stepInMeasure = i % 16;
            const measure = Math.floor(i / 16);
            const currentChord = measure % 2 === 0 ? chordC : chordG;
            const nextChord = (measure + 1) % 2 === 0 ? chordC : chordG;
            const info = getStepInfo(i, tsConfig, [], TIME_SIGNATURES);

            const active = isBassActive(getState(), 'rock', i, stepInMeasure, info, {});
            if (active) {
                const note = getBassNote(
                    getState(),
                    currentChord,
                    nextChord,
                    info.beatIndex,
                    prevFreq,
                    48,
                    'rock',
                    0,
                    i,
                    stepInMeasure,
                    {},
                    info,
                );
                if (note) {
                    performance.push({ step: i, info, note, chord: currentChord });
                    prevFreq = note.freq;
                }
            }
        }
        return performance;
    };

    it('should maintain driving 8th notes at high intensity', () => {
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.9, complexity: 0.5, bpm: 120 },
        });

        const eighthNoteHits = performance.filter((p) => p.step % 2 === 0);
        const totalPossibleEighths = 16 * 8;

        const ratio = eighthNoteHits.length / totalPossibleEighths;
        console.log(`[Rock Critique] 8th Note Continuity: ${(ratio * 100).toFixed(1)}%`);

        // Rock style fires on every 8th note unconditionally at intensity >= 0.4
        // (bass-styles.ts:27 returns is8th; bass-engine.ts:444 only nulls at intensity < 0.4).
        expect(ratio).toBe(1.0);
    });

    it('should stay grounded on the root most of the time', () => {
        const performance = simulatePerformance(16);

        let rootHits = 0;
        performance.forEach((p) => {
            if (p.note.midi % 12 === p.chord.rootMidi % 12) {
                rootHits++;
            }
        });

        const ratio = rootHits / (performance.length || 1);
        console.log(`[Rock Critique] Root Grounding: ${(ratio * 100).toFixed(1)}%`);
        // Observed 91.4-94.5% across 10 runs at intensity 0.6; >0.88 keeps ~3pt headroom.
        expect(ratio).toBeGreaterThan(0.88);
    });

    it('should occasionally add 5ths or Octaves at high intensity', () => {
        const performance = simulatePerformance(32, {
            playback: { bandIntensity: 0.95, complexity: 0.5, bpm: 120 },
        });

        let nonRootHits = 0;
        performance.forEach((p) => {
            const pc = p.note.midi % 12;
            const rootPc = p.chord.rootMidi % 12;
            if (pc !== rootPc) {
                nonRootHits++;
            }
        });

        console.log(`[Rock Critique] Melodic Variation Hits: ${nonRootHits}`);
        // 32 bars × 8 eighths = 256 possible hits. withOctaveJump fires at
        // 0.02 + intensity*0.08 = 0.096 per chord-start; getBassNoteStyle for 'rock'
        // also picks non-root tones. Observed 45-62 across 10 runs.
        // Tightened from >5 (10x too loose) to >30 (~15 headroom on worst observation).
        expect(nonRootHits).toBeGreaterThan(30);
    });

    it('should reduce note density at very low intensity', () => {
        // Below intensity 0.4 the rock branch (bass-engine.ts:444-456) nulls 60% of
        // non-downbeat notes when no kick is triggering, so total hits should fall well
        // below the 100%-eighth-note baseline.
        const high = simulatePerformance(16, {
            playback: { bandIntensity: 0.9, complexity: 0.5, bpm: 120 },
        });
        const low = simulatePerformance(16, {
            playback: { bandIntensity: 0.25, complexity: 0.3, bpm: 120 },
        });

        const ratio = low.length / high.length;
        console.log(
            `[Rock Critique] Intensity Density Scaling: high=${high.length} low=${low.length} ratio=${ratio.toFixed(2)}`,
        );

        // High should fire ~128 (every 8th over 16 bars), low should drop to roughly
        // downbeats + ghost survivors (~30-50).
        expect(high.length).toBeGreaterThan(120);
        expect(low.length).toBeLessThan(high.length * 0.6);
    });

    it('should occasionally produce chromatic leading tones on beat-4 push-points into chord changes', () => {
        // why: the native 'rock' handler always returns non-null on is8th slots,
        // so the universal chromatic-approach branch (bass-styles.ts:1141-1203) never
        // fires for rock. Epic 9 S4 adds a sub-branch inside the push-point gate that
        // emits a half-step approach (~8-13% of push-point chord-change events).
        // The Stones-style root anticipation remains dominant; the chromatic pickup is
        // the Zeppelin/Sabbath sub-vocabulary (bass.md P1 #4).
        //
        // Measurement: step 12 (beat 4 start, isBeatStart=true) in each bar of the
        // 64-bar C↔G alternating fixture. Every bar boundary is a chord change.
        // We measure at the push-point and classify each note as:
        //   - chromatic: pitch is nextChord.rootMidi ± 1 (±1 semitone pitch-class distance)
        //   - anticipation: pitch matches nextChord.rootMidi pitch class (whole-root arrival)
        //   - other: root of current chord or no note (push-point probability not met)
        // 64 bars chosen because expected chromatic events ≈ 64*0.61*0.115 ≈ 4.5,
        // making P(0 hits) ≈ e^-4.5 ≈ 1.1% — well below the "no flake" threshold.

        const numBars = 64;
        const chordC = { rootMidi: 48, quality: 'maj', beats: 4 };
        const chordG = { rootMidi: 55, quality: 'maj', beats: 4 };

        const mockState = {
            playback: { bandIntensity: 0.7, complexity: 0.5, bpm: 120 },
            groove: {
                genreFeel: 'Rock',
                creativity: true,
                lastDrumPreset: 'Rock',
                instruments: [],
            },
            arranger: {
                timeSignature: '4/4',
                totalSteps: numBars * 16,
                stepMap: [],
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        };

        for (let m = 0; m < numBars; m++) {
            mockState.arranger.stepMap.push({
                start: m * 16,
                end: (m + 1) * 16,
                chord: m % 2 === 0 ? chordC : chordG,
            });
        }

        getState.mockReturnValue(mockState);

        const tsConfig = TIME_SIGNATURES['4/4'];

        let chromaticHits = 0;
        let anticipationHits = 0;
        let pushPointChordChangeBars = 0;
        let prevFreq = 0;

        for (let i = 0; i < numBars * 16; i++) {
            const stepInMeasure = i % 16;
            const measure = Math.floor(i / 16);
            const currentChord = measure % 2 === 0 ? chordC : chordG;
            const nextChord = (measure + 1) % 2 === 0 ? chordC : chordG;
            const info = getStepInfo(i, tsConfig, [], TIME_SIGNATURES);

            const active = isBassActive(getState(), 'rock', i, stepInMeasure, info, {});
            let note = null;
            if (active) {
                note = getBassNote(
                    getState(),
                    currentChord,
                    nextChord,
                    info.beatIndex,
                    prevFreq,
                    48,
                    'rock',
                    0,
                    i,
                    stepInMeasure,
                    {},
                    info,
                );
            }

            // Sample step 12 (beat 4 push-point) — these are the only slots where the
            // chromatic sub-branch can fire. Every bar has a chord change (C↔G alternation).
            if (stepInMeasure === 12) {
                pushPointChordChangeBars++;
                if (note) {
                    // why: the anticipation and chromatic notes use ghost=1 (palm-mute) to
                    // signal a pickup gesture — they are still audible (just damped), so we
                    // count them regardless of muted state. Filtering on !note.muted would
                    // miss the primary signal we're measuring.
                    const notePc = ((note.midi % 12) + 12) % 12;
                    const nextTargetPc = ((nextChord.rootMidi % 12) + 12) % 12;
                    // pitch-class distance, wrapping around the octave (octave-invariant)
                    const pcDist = Math.min(
                        Math.abs(notePc - nextTargetPc),
                        12 - Math.abs(notePc - nextTargetPc),
                    );
                    if (pcDist === 1) {
                        // ±1 semitone pitch-class from next chord root = chromatic leading tone
                        chromaticHits++;
                    } else if (pcDist === 0) {
                        // same pitch class = whole-root anticipation (Stones-style)
                        anticipationHits++;
                    }
                }
            }

            if (note && !note.muted) {
                prevFreq = note.freq;
            }
        }

        // why: realized rate = P(chromatic) × P(push-point gate) = 0.115 × 0.61 ≈ 7%
        // of bars. The "chromatic rate of push-point bars" denominator includes bars
        // where the push-point gate didn't fire, so the printed rate sits below the
        // raw conditional probability — that's expected.
        const pushPointFirings = chromaticHits + anticipationHits;
        const conditionalRate = pushPointFirings > 0 ? (chromaticHits / pushPointFirings) * 100 : 0;
        console.log(
            `[Rock Critique] Chromatic Leading Tone on Beat-4 Push-Point:\n` +
                `  Push-point chord-change bars sampled:  ${pushPointChordChangeBars}\n` +
                `  Push-point gate firings (chr+ant):     ${pushPointFirings}\n` +
                `  Chromatic hits (±1 semitone):          ${chromaticHits}\n` +
                `  Root anticipation hits:                ${anticipationHits}\n` +
                `  Conditional chromatic rate (chr/fired):${conditionalRate.toFixed(1)}%\n` +
                `  (Expected: ~7% of bars realized; ~11.5% conditional inside gate)`,
        );

        // why: at intensity=0.7 and 64 bars, theoretical chromatic probability is
        // 0.08 + 0.7*0.05 = 0.115 per push-point event that wins the isPushPoint gate
        // (isPushPoint fires at p = 0.4 + 0.7*0.3 = 0.61). Expected chromatic events
        // ≈ 64 * 0.61 * 0.115 ≈ 4.5. P(0 hits) ≈ e^-4.5 ≈ 1.1% — acceptably low
        // for an unseeded test. Lower bound ≥ 1 confirms the sub-branch fires at all.
        // 64 bars was chosen specifically to make this assertion reliable (≥ 98.9% pass rate).
        expect(chromaticHits).toBeGreaterThanOrEqual(1);

        // why: chromatic must be meaningfully rarer than root anticipation, not just
        // not-dominant. At expected ratio 4.5 : 34.5 (≈13%), allowing chromatic up to
        // 40% of anticipation count catches regressions where the chromatic gate
        // accidentally grows (e.g. dropping the *0.5 universal-branch dampener and
        // pasting that formula here would push chromatic toward parity).
        expect(chromaticHits).toBeLessThan(anticipationHits * 0.4);

        // why: hard upper bound guards against probability-blow-up regressions. At
        // p=0.115 (design) we expect ~4.5; p=0.50 would yield ~20. Anything above 20
        // means the sub-vocabulary has taken over and rock has been over-jazzed.
        expect(chromaticHits).toBeLessThan(20);
    });
});
