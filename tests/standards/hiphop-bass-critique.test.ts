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

describe('Hip Hop Bassist Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    /**
     * Hip-hop bass simulator. Accepts an optional chord sequence (one entry per bar)
     * so we can compare held-chord vs frequent-change behavior for the 808 slide
     * critique (bass.md P1 #7 / Epic 5 S7).
     */
    const simulatePerformance = (numBars, stateOverrides = {}, chordSequence = null) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 90 },
            groove: {
                genreFeel: 'Hip Hop',
                creativity: true,
                lastDrumPreset: 'Hip Hop',
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

        const chordC = { rootMidi: 36, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };
        const chords = chordSequence || Array(numBars).fill(chordC);
        const tsConfig = TIME_SIGNATURES['4/4'];

        const performance = [];
        let prevFreq = 0;
        for (let globalStep = 0; globalStep < numBars * 16; globalStep++) {
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);
            const barIndex = Math.floor(globalStep / 16);
            const stepInChord = globalStep % 16;
            const chord = chords[barIndex];
            const nextChord = chords[barIndex + 1] || null;

            // Re-mock before active check to ensure internal isBassActive sees correct intensity
            getState.mockReturnValue(mockState);
            const active = isBassActive(getState(), 'hiphop', globalStep, stepInChord, info, {});

            if (active) {
                const note = getBassNote(
                    getState(),
                    chord,
                    nextChord,
                    info.beatIndex,
                    prevFreq,
                    36,
                    'hiphop',
                    0,
                    globalStep,
                    stepInChord,
                    {},
                    info,
                );
                if (note) {
                    performance.push({
                        step: globalStep,
                        loopStep: stepInChord,
                        info,
                        note,
                        chord,
                        nextChord,
                    });
                    prevFreq = note.freq;
                }
            }
        }
        return performance;
    };

    it('should stay grounded in the ultra-deep sub register', () => {
        const performance = simulatePerformance(32, { playback: { bandIntensity: 0.5 } });

        const deepNotes = performance.filter((p) => p.note.midi <= 38);
        const ratio = deepNotes.length / (performance.length || 1);

        console.log(`[Hip Hop Critique] Sub Register Ratio: ${(ratio * 100).toFixed(1)}%`);
        expect(ratio).toBeGreaterThan(0.85);
    });

    it('should implement long sustains for sub-chugs', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.3 } });

        let totalDuration = 0;
        performance.forEach((p) => {
            totalDuration += p.note.durationSteps;
        });

        const avgDuration = totalDuration / (performance.length || 1);
        console.log(`[Hip Hop Critique] Avg Note Duration: ${avgDuration.toFixed(2)} steps`);

        expect(avgDuration).toBeGreaterThan(2.0);
    });

    /**
     * S7: 808 slide is a chord-boundary gesture, not a within-chord leap.
     * With all bars on the SAME chord, the previous engine produced +12 / +7
     * leaps mid-chord at high complexity. After S7 these are thinned to a
     * single grace-octave path gated `complexity > 0.85 && p < 0.15`.
     *
     * We test at complexity 0.9 to actually EXERCISE the surviving grace path —
     * testing at complexity 0.75 (below the 0.85 gate) is a tautology because
     * the grace branch is gated off. We also use an F-rooted chord so the
     * grace octave lands at MIDI 41 (above the 38 ceiling). With a C chord
     * (rootMidi 36 → finalDeepRoot 24 → grace 24+12=36) the grace would sit
     * inside the deep ceiling and the assertion would silently miss the
     * grace path firing entirely.
     */
    it('should NOT produce within-chord octave leaps at very high complexity (held chord)', () => {
        const chordF = { rootMidi: 41, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };
        const performance = simulatePerformance(
            64,
            { playback: { bandIntensity: 0.75, complexity: 0.9, bpm: 90 } },
            Array(64).fill(chordF),
        );

        const aboveCeiling = performance.filter((p) => p.note.midi > 38);
        const aboveCeilingRatio = aboveCeiling.length / (performance.length || 1);

        console.log(
            `[Hip Hop S7] Grace-path firing rate at complexity 0.9 (held F chord): ${aboveCeiling.length}/${performance.length} = ${(aboveCeilingRatio * 100).toFixed(1)}%`,
        );

        // why: pre-S7 the engine produced `finalDeepRoot + 12` or `+ 7` on
        // ~50% of non-beat-start active steps at complexity > 0.7. Post-S7
        // retains only the grace path at complexity > 0.85 + p < 0.15, which
        // fires on the "and" of each beat (4 ands per bar at active rate).
        // Expected rate ≈ 0.15 * (4 ands / ~8 active steps) ≈ 7.5%. Band
        // 0-20% guards against the deleted leap reappearing while permitting
        // the thinned grace tail.
        expect(aboveCeilingRatio).toBeLessThan(0.2);
        // Grace path must actually exercise; if it stops firing entirely we'd
        // silently pass on a deleted-grace regression. Lower-bound at > 0.
        expect(aboveCeiling.length).toBeGreaterThan(0);
    });

    /**
     * S7: slides fire on chord-change boundaries at high intensity. We build a
     * chord sequence that alternates roots so every bar has a real change.
     * The slide gesture sets `bendStartInterval` !== 0 on the note returned
     * for the "and" of beat 4 (the last active step before the new chord).
     */
    it('should emit chord-boundary slides at high intensity (frequent chord changes)', () => {
        // Alternate C7 / F7 every bar — every bar boundary is a real PC change.
        const chordC = { rootMidi: 36, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };
        const chordF = { rootMidi: 41, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };
        const seq = [];
        for (let i = 0; i < 32; i++) {
            seq.push(i % 2 === 0 ? chordC : chordF);
        }
        const performance = simulatePerformance(
            32,
            { playback: { bandIntensity: 0.75, complexity: 0.5, bpm: 90 } },
            seq,
        );

        // Count chord-change boundaries we could have hit. Last bar has no
        // nextChord (null), so don't count it.
        const boundaryCount = seq.length - 1;
        const slides = performance.filter((p) => (p.note.bendStartInterval || 0) !== 0);
        const slideRate = slides.length / boundaryCount;

        console.log(
            `[Hip Hop S7] Slides on chord-change boundaries: ${slides.length}/${boundaryCount} (${(slideRate * 100).toFixed(1)}%)`,
        );

        // why: slide gate is intensity > 0.5 + Math.random() < 0.55. At
        // intensity 0.75 we expect ~55% of boundaries to slide; band the
        // assertion at 0.30-0.85 for stochastic stability (30 runs across
        // a 0.55 binomial with n=31 trials gives plenty of headroom on both
        // sides). The directional claim — slide rate is materially above
        // 10% — is what the audit acceptance criterion requires.
        expect(slideRate).toBeGreaterThan(0.3);
        expect(slideRate).toBeLessThanOrEqual(0.85);

        // Every slide must use ±2 semitones (audit recipe; documented in
        // engine comments).
        slides.forEach((p) => {
            expect(Math.abs(p.note.bendStartInterval)).toBe(2);
        });

        // Every slide must land on the "and" of beat 4 (step 14 in 4/4 16th
        // grid) — the last active step before the chord change.
        slides.forEach((p) => {
            expect(p.loopStep).toBe(14);
        });
    });

    /**
     * S7: slide direction matches harmonic motion — the audible slide goes UP
     * into ascending targets, DOWN into descending targets. This is the
     * canonical 808 slide idiom (FL Studio "slide note"): the note ORIGINATES
     * at/near the previous root and glides INTO the target.
     *
     * C7 → F7 (ascending root, rawDelta = +5): bendStartInterval = -2 (start
     * 2 semitones BELOW F, bend UP into F).
     * F7 → C7 (descending root, rawDelta = -5): bendStartInterval = +2 (start
     * 2 semitones ABOVE C, bend DOWN into C).
     */
    it('should slide direction matches harmonic motion (up into ascending roots, down into descending)', () => {
        const chordC = { rootMidi: 36, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };
        const chordF = { rootMidi: 41, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };
        const seq = [];
        for (let i = 0; i < 32; i++) {
            seq.push(i % 2 === 0 ? chordC : chordF);
        }
        const performance = simulatePerformance(
            32,
            { playback: { bandIntensity: 0.85, complexity: 0.5, bpm: 90 } },
            seq,
        );

        const slides = performance.filter((p) => (p.note.bendStartInterval || 0) !== 0);

        // C7 → F7 boundaries (current chord is C, rawDelta = +5 → bend UP from -2)
        const ascendingBoundaries = slides.filter((p) => p.chord.rootMidi === 36);
        // F7 → C7 boundaries (current chord is F, rawDelta = -5 → bend DOWN from +2)
        const descendingBoundaries = slides.filter((p) => p.chord.rootMidi === 41);

        console.log(
            `[Hip Hop S7] Direction: ${ascendingBoundaries.length} ascending(-2 = up) / ${descendingBoundaries.length} descending(+2 = down)`,
        );

        ascendingBoundaries.forEach((p) => {
            expect(p.note.bendStartInterval).toBe(-2);
        });
        descendingBoundaries.forEach((p) => {
            expect(p.note.bendStartInterval).toBe(2);
        });
    });

    /**
     * S7: slide rate strictly scales with chord-change rate. Compare a
     * held-chord chart (no boundaries) against an alternating chart (boundary
     * every bar). Held should produce zero slides; alternating should produce
     * strictly more.
     */
    it('should scale slide rate with chord-change rate (held vs alternating)', () => {
        // Held: 32 bars of C7
        const heldPerf = simulatePerformance(32, {
            playback: { bandIntensity: 0.75, complexity: 0.5, bpm: 90 },
        });
        const heldSlides = heldPerf.filter((p) => (p.note.bendStartInterval || 0) !== 0);

        // Alternating: every bar boundary is a real chord change
        const chordC = { rootMidi: 36, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };
        const chordF = { rootMidi: 41, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };
        const seq = [];
        for (let i = 0; i < 32; i++) {
            seq.push(i % 2 === 0 ? chordC : chordF);
        }
        const altPerf = simulatePerformance(
            32,
            { playback: { bandIntensity: 0.75, complexity: 0.5, bpm: 90 } },
            seq,
        );
        const altSlides = altPerf.filter((p) => (p.note.bendStartInterval || 0) !== 0);

        console.log(
            `[Hip Hop S7] Slide rate comparison: held=${heldSlides.length} alternating=${altSlides.length}`,
        );

        // why: held-chord has no chord-change boundaries; isChordChangeApproach
        // returns false on every step → zero slides, period.
        expect(heldSlides.length).toBe(0);
        // why: alternating chart with intensity 0.75 + ~55% boundary slide rate
        // across 31 boundaries should produce many slides. 20-run sample: 11-22
        // observed (mean ~17, σ ≈ 3). Floor at > 8 — ~3σ below the observed
        // mean — guards against the slide branch being silently disabled while
        // leaving headroom for natural PRNG-stream variation when future engine
        // touches shift the draw count. A floor at min - 1 (> 10) would flake
        // on any seed not in the 20-run sample.
        expect(altSlides.length).toBeGreaterThan(8);
        // Strictly more is the comparative assertion the acceptance criterion
        // requires.
        expect(altSlides.length).toBeGreaterThan(heldSlides.length);
    });

    /**
     * S7: at low intensity (below the 0.5 gate), even frequent chord changes
     * produce zero slides. Quiet hip-hop stays grounded.
     */
    it('should not slide at low intensity even with frequent chord changes', () => {
        const chordC = { rootMidi: 36, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };
        const chordF = { rootMidi: 41, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };
        const seq = [];
        for (let i = 0; i < 32; i++) {
            seq.push(i % 2 === 0 ? chordC : chordF);
        }
        // Intensity 0.45 — above the 0.4 sub-chug floor (so notes fire),
        // below the 0.5 slide gate.
        const performance = simulatePerformance(
            32,
            { playback: { bandIntensity: 0.45, complexity: 0.5, bpm: 90 } },
            seq,
        );

        const slides = performance.filter((p) => (p.note.bendStartInterval || 0) !== 0);
        console.log(`[Hip Hop S7] Slides at intensity 0.45: ${slides.length}`);
        expect(slides.length).toBe(0);
    });
});
