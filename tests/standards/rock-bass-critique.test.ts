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
        // 32 bars × 8 eighths = 256 possible hits. The syncopation branch fires at
        // p = 0.3 + 0.95*0.2 = 0.49 on each "and" step (128 total), and 50% of those
        // produce a 5th (non-root PC) vs octave (same PC as root). Expected non-root
        // hits from syncopation alone ≈ 128 * 0.49 * 0.5 ≈ 31.  σ ≈ 4.9.
        // The push branch also contributes a small number; the simulatePerformance
        // fixture passes {} context (no section boundary) so pushes are suppressed
        // to ~0.15× — contributing only ~1–2 notes.
        // Observed range (post S2 gate): 23-52 across 15 runs.
        // Threshold lowered from >30 to >15: gives ≈ 3pt below the 2σ lower tail
        // while still asserting that syncopation is clearly present.
        expect(nonRootHits).toBeGreaterThan(15);
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
        // After epic-deferred-followups S2 (section-gated push): the push gate now
        // fires at full probability only when barsUntilSectionChange === 0. We pass
        // that value in the context so this fixture measures the chromatic sub-branch
        // at the boundary-gate's maximum rate, not the heavily-suppressed mid-section
        // residual. The push probability at intensity=0.7 with barsUntilSectionChange=0
        // is (0.1 + 0.7*0.15)*1.0 = 0.205. Expected chromatic events:
        //   192 * 0.205 * 0.115 ≈ 4.5 — P(0 hits) ≈ e^-4.5 ≈ 1.1%
        //   — same reliability as the original 64-bar / 0.61-prob design.
        //
        // Measurement: step 12 (beat 4 start, isBeatStart=true) in each bar.
        // Every bar boundary is a chord change (C↔G alternation).
        // We classify each note as:
        //   - chromatic: pitch is nextChord.rootMidi ± 1 (±1 semitone pitch-class distance)
        //   - anticipation: pitch matches nextChord.rootMidi pitch class (whole-root arrival)
        //   - other: root of current chord or no note (push-point probability not met)

        const numBars = 192;
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
        // why: simulate "last bar before a section boundary" so the push gate fires
        // at full probability (sectionGateMult = 1.0). Without this the push is
        // suppressed to 15% of base, making expected chromatic events < 1 over
        // 192 bars — unreliable for the >= 1 assertion.
        const atBoundaryCtx = { stepCoordination: { barsUntilSectionChange: 0 } };

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
                    atBoundaryCtx,
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

        // why: realized rate = P(chromatic) × P(push-point gate at boundary) =
        // 0.115 × 0.205 ≈ 2.4% of bars. At 192 bars, expected chromatic events ≈ 4.5.
        const pushPointFirings = chromaticHits + anticipationHits;
        const conditionalRate = pushPointFirings > 0 ? (chromaticHits / pushPointFirings) * 100 : 0;
        console.log(
            `[Rock Critique] Chromatic Leading Tone on Beat-4 Push-Point (at boundary):\n` +
                `  Push-point chord-change bars sampled:  ${pushPointChordChangeBars}\n` +
                `  Push-point gate firings (chr+ant):     ${pushPointFirings}\n` +
                `  Chromatic hits (±1 semitone):          ${chromaticHits}\n` +
                `  Root anticipation hits:                ${anticipationHits}\n` +
                `  Conditional chromatic rate (chr/fired):${conditionalRate.toFixed(1)}%\n` +
                `  (Expected: ~2.4% of bars realized; ~11.5% conditional inside gate)`,
        );

        // why: at intensity=0.7 with barsUntilSectionChange=0 (full gate), theoretical
        // chromatic probability is 0.08 + 0.7*0.05 = 0.115 per push-point event that
        // wins the isPushPoint gate (p = 0.205). Expected chromatic events ≈ 4.5.
        // P(0 hits) ≈ e^-4.5 ≈ 1.1% — acceptably low for an unseeded test.
        expect(chromaticHits).toBeGreaterThanOrEqual(1);

        // why: chromatic must be meaningfully rarer than root anticipation. At expected
        // ratio ≈4.5 : ≈35, allowing chromatic up to 40% of anticipation count catches
        // regressions where the chromatic gate grows accidentally.
        expect(chromaticHits).toBeLessThan(anticipationHits * 0.4);

        // why: hard upper bound guards against probability-blow-up regressions. At
        // p=0.115 we expect ~4.5; anything above 20 means the sub-vocabulary has
        // taken over and rock has been over-jazzed.
        expect(chromaticHits).toBeLessThan(20);
    });

    it('push rate at section boundary should fall in the 10-25% band (S2 gate)', () => {
        // why: epic-deferred-followups S2 — the push probability was ~55% at intensity
        // 0.5 (too frequent to function as a signpost). New design: 10-25% band.
        // We measure at barsUntilSectionChange=0 (full gate, sectionGateMult=1.0) so
        // the test exercises the designed maximum rate without the suppression factor.
        // At intensity=0.6: p = (0.1 + 0.6*0.15)*1.0 = 0.19 — comfortably inside 10-25%.
        // 256 bars × every-bar chord change = 256 push-point opportunities.
        // Expected pushes ≈ 256 * 0.19 ≈ 48.6. σ ≈ sqrt(256*0.19*0.81) ≈ 6.3.
        //   7% floor (18 pushes): (48.6-18)/6.3 ≈ 4.9σ below mean — P(fail) < 0.001%.
        //  25% ceiling (64 pushes): (64-48.6)/6.3 ≈ 2.4σ above mean — P(fail) ≈ 0.8%.
        // Combined: < 0.81% total flake rate per run.

        const numBars = 256;
        const chordC = { rootMidi: 48, quality: 'maj', beats: 4 };
        const chordG = { rootMidi: 55, quality: 'maj', beats: 4 };

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
        const atBoundaryCtx = { stepCoordination: { barsUntilSectionChange: 0 } };

        let pushFirings = 0;
        let pushOpportunities = 0;
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
                    atBoundaryCtx,
                    info,
                );
            }

            // Beat 4 (step 12 in a 4/4 bar) is the only push-point slot.
            // A push fires when the note targets the *next* chord root (±1 semitone),
            // not the *current* chord's root.
            if (stepInMeasure === 12) {
                pushOpportunities++;
                if (note) {
                    const notePc = ((note.midi % 12) + 12) % 12;
                    const currentRootPc = ((currentChord.rootMidi % 12) + 12) % 12;
                    const nextRootPc = ((nextChord.rootMidi % 12) + 12) % 12;
                    const distFromCurrent = Math.min(
                        Math.abs(notePc - currentRootPc),
                        12 - Math.abs(notePc - currentRootPc),
                    );
                    const distFromNext = Math.min(
                        Math.abs(notePc - nextRootPc),
                        12 - Math.abs(notePc - nextRootPc),
                    );
                    if (distFromNext <= 1 && distFromCurrent > 1) {
                        pushFirings++;
                    }
                }
            }

            if (note && !note.muted) {
                prevFreq = note.freq;
            }
        }

        const pushRate = pushFirings / pushOpportunities;
        console.log(
            `[Rock Critique] Push Rate at Section Boundary (barsUntilSectionChange=0):\n` +
                `  Push opportunities (beat-4 chord-change bars): ${pushOpportunities}\n` +
                `  Push firings (next-chord target, ±1 semitone):  ${pushFirings}\n` +
                `  Push rate:                                       ${(pushRate * 100).toFixed(1)}%\n` +
                `  Target: 10-25% (S2 design: base 0.1+i*0.15, at intensity=0.6 -> ~19%)`,
        );

        // why: 7% lower bound — the push must fire meaningfully more than noise at the
        // boundary. Below 7% the gesture is inaudible as a structural signpost. The
        // design target is ~19%; the 7% floor gives 12pt headroom at the lower tail.
        expect(pushRate).toBeGreaterThanOrEqual(0.07);
        // why: 25% upper bound — the push must remain a signpost, not a default behavior.
        // At intensity=0.6, design target is ~19%; the upper bound gives ~6pt headroom.
        expect(pushRate).toBeLessThanOrEqual(0.25);
    });

    it('push rate should cluster at section boundaries, not fire uniformly (S2 gate)', () => {
        // why: epic-deferred-followups S2 — the core musical requirement is that the
        // push *clusters* at section boundaries rather than scattering uniformly across
        // all chord changes. We compare two fixtures:
        //   - "at boundary" (barsUntilSectionChange=0): full gate (sectionGateMult=1.0)
        //   - "mid-section" (barsUntilSectionChange=-1): suppressed (sectionGateMult=0.15)
        // The boundary push rate must be meaningfully higher than the mid-section rate.
        //
        // Statistical design: 256 bars each.
        //   Boundary: p ≈ 0.19 -> expected 48.6 pushes, sigma ≈ 6.3
        //   Mid-section: p ≈ 0.19*0.15 ≈ 0.029 -> expected 7.4 pushes, sigma ≈ 2.7
        // Using 256 bars (vs 128) halves the relative std-dev on the small mid-section
        // arm, tightening the ratio distribution.
        // Threshold: boundary rate >= 3× mid-section rate. Design ratio ≈ 6.7×
        // gives 3.7× margin above the guard.

        const numBars = 256;
        const chordC = { rootMidi: 48, quality: 'maj', beats: 4 };
        const chordG = { rootMidi: 55, quality: 'maj', beats: 4 };

        const makeState = () => ({
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
                stepMap: Array.from({ length: numBars }, (_, m) => ({
                    start: m * 16,
                    end: (m + 1) * 16,
                    chord: m % 2 === 0 ? chordC : chordG,
                })),
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        });

        const tsConfig = TIME_SIGNATURES['4/4'];

        const countPushes = (barsUntilSectionChange: number) => {
            getState.mockReturnValue(makeState());
            const ctx = { stepCoordination: { barsUntilSectionChange } };
            let pushFirings = 0;
            let pushOpportunities = 0;
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
                        ctx,
                        info,
                    );
                }

                if (stepInMeasure === 12) {
                    pushOpportunities++;
                    if (note) {
                        const notePc = ((note.midi % 12) + 12) % 12;
                        const currentRootPc = ((currentChord.rootMidi % 12) + 12) % 12;
                        const nextRootPc = ((nextChord.rootMidi % 12) + 12) % 12;
                        const distFromCurrent = Math.min(
                            Math.abs(notePc - currentRootPc),
                            12 - Math.abs(notePc - currentRootPc),
                        );
                        const distFromNext = Math.min(
                            Math.abs(notePc - nextRootPc),
                            12 - Math.abs(notePc - nextRootPc),
                        );
                        if (distFromNext <= 1 && distFromCurrent > 1) {
                            pushFirings++;
                        }
                    }
                }

                if (note && !note.muted) {
                    prevFreq = note.freq;
                }
            }
            return pushFirings / pushOpportunities;
        };

        const boundaryRate = countPushes(0); // sectionGateMult = 1.0
        const midSectionRate = countPushes(-1); // sectionGateMult = 0.15

        console.log(
            `[Rock Critique] Push Clustering at Section Boundaries:\n` +
                `  Boundary push rate    (barsUntilSectionChange=0):  ${(boundaryRate * 100).toFixed(1)}%\n` +
                `  Mid-section push rate (barsUntilSectionChange=-1): ${(midSectionRate * 100).toFixed(1)}%\n` +
                `  Ratio (boundary/mid): ${midSectionRate > 0 ? (boundaryRate / midSectionRate).toFixed(1) : 'inf'}x\n` +
                `  Target: boundary >= 3x mid-section (design ratio ~6.7x)`,
        );

        // why: boundary pushes must fire at a meaningfully higher rate than mid-section
        // pushes. The 3× threshold sits 3.7× below the design ratio of 6.7×, giving
        // enough headroom for sampling variance while still catching a regression where
        // the gate multipliers converge (e.g. both become 0.5 instead of 1.0 vs 0.15).
        // Edge case: if midSectionRate rounds to 0 the ratio is infinite — the push is
        // completely off mid-section, which strictly satisfies the clustering requirement.
        if (midSectionRate === 0) {
            expect(boundaryRate).toBeGreaterThan(0);
        } else {
            expect(boundaryRate / midSectionRate).toBeGreaterThanOrEqual(3);
        }
    });
});
