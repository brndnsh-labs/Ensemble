// @ts-nocheck
/**
 * Multi-genre chromatic approach critique.
 *
 * why: S2 from epic-bass-voice-leading — removes the ['Jazz','Blues'] genre gate
 * from the generic chromatic-approach branch so walking bass in any genre can
 * produce leading-tone approaches into chord changes (bass.md P1 #4).
 * Chromatic probability is multiplied by 0.5 for non-Jazz/Blues to preserve
 * idiom without over-jazzing rock/funk/pop/country genres.
 *
 * Test strategy:
 *   • Jazz + quarter style: regression — approach rate must stay above prior threshold.
 *   • Rock genre + quarter style: NEW — gate removal means approaches now fire where
 *     they were previously blocked (pullTension < 0.7 in the old Jazz/Blues OR gate).
 *   • Funk + funk style: verifies funk's own approach branch (bass-styles.ts:612-622)
 *     fires on the 'a' of beat 4 before chord changes — that branch has no genre gate
 *     (S1 already fixed it) and is unaffected by S2.
 *
 * Measurement window: step 14 in a 16-step 4/4 measure = the "& of beat 4" = the
 * canonical position jazz critics listen for chromatic leading-tone approaches.
 * Funk's own approach fires on step 15 (the "a" of beat 4); that is measured separately.
 */

import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getFrequency, getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

// --- Shared helpers ---

/**
 * Builds a mock state for the given genre/style. Uses intensity=0.8, complexity=0.7,
 * tension=0.3 — realistic "mid-high performance" settings.
 * pullTension = 0.3 + 0.8*0.3 + 0.7*0.2 = 0.54, which is below the old 0.7 threshold
 * so the old Jazz/Blues-OR-gate would have blocked all approaches for Rock/Country.
 */
const makeMockState = (genreFeel: string, stateOverrides = {}) => ({
    playback: { bandIntensity: 0.8, complexity: 0.7, bpm: 120 },
    groove: { genreFeel, pocket: 0, instruments: [], lastDrumPreset: genreFeel },
    soloist: makeSoloistMock({ busySteps: 0, tension: 0.3 }),
    arranger: { timeSignature: '4/4', totalSteps: 0, stepMap: [] },
    ...stateOverrides,
});

/**
 * Build a 2-bar repeating progression of alternating chords so every bar boundary
 * is a real chord change (roots differ by 5 semitones).
 */
const makeStepMap = (numBars: number) => {
    const chordC = {
        rootMidi: 48,
        quality: 'maj7',
        beats: 4,
        intervals: [0, 4, 7, 11],
        sectionId: '1',
    };
    const chordF = {
        rootMidi: 53,
        quality: '7',
        beats: 4,
        intervals: [0, 4, 7, 10],
        sectionId: '1',
    };
    const map = [];
    for (let m = 0; m < numBars; m++) {
        map.push({
            start: m * 16,
            end: (m + 1) * 16,
            chord: m % 2 === 0 ? chordC : chordF,
        });
    }
    return map;
};

/**
 * Simulate a performance and return the note produced on step 14 of each measure
 * (the "& of beat 4"). Returns { chromaticCount, chordChangeCount } for the
 * chord-change bars (every bar, since the progression alternates each measure).
 *
 * A "chromatic approach" is defined as a note whose pitch class is exactly 1 semitone
 * below or above the NEXT chord's root — the canonical leading-tone resolution.
 */
const measureApproachRate = (
    numBars: number,
    genreFeel: string,
    bassStyle: string,
): { chromaticCount: number; chordChangeCount: number } => {
    const stepMap = makeStepMap(numBars);
    const mockState = makeMockState(genreFeel);
    mockState.arranger.totalSteps = numBars * 16;
    mockState.arranger.stepMap = stepMap;
    getState.mockReturnValue(mockState);

    const tsConfig = TIME_SIGNATURES['4/4'];
    const totalSteps = numBars * 16;
    let chromaticCount = 0;
    let chordChangeCount = 0;
    let lastMidi: number | null = null;

    for (let i = 0; i < totalSteps; i++) {
        const stepInMeasure = i % 16;
        const measure = Math.floor(i / 16);
        const currentChord = stepMap[measure].chord;
        const nextMeasure = measure + 1;
        const nextChord = nextMeasure < numBars ? stepMap[nextMeasure].chord : null;

        const info = getStepInfo(i, tsConfig, [], TIME_SIGNATURES);
        const active = isBassActive(getState(), bassStyle, i, stepInMeasure, info, {});

        let note = null;
        if (active) {
            note = getBassNote(
                getState(),
                currentChord,
                nextChord,
                info.beatIndex,
                lastMidi ? getFrequency(lastMidi) : 0,
                48,
                bassStyle,
                0,
                i,
                stepInMeasure,
                {},
                info,
            );
        }

        // Sample only step 14 (the "& of beat 4") when the next bar has a different root
        if (stepInMeasure === 14 && nextChord && nextChord.rootMidi !== currentChord.rootMidi) {
            chordChangeCount++;
            if (note && !note.muted) {
                const notePc = note.midi % 12;
                const targetPc = nextChord.rootMidi % 12;
                const semitoneDistance = Math.min(
                    Math.abs(notePc - targetPc),
                    12 - Math.abs(notePc - targetPc),
                );
                if (semitoneDistance === 1) {
                    chromaticCount++;
                }
            }
        }

        if (note && !note.muted) {
            lastMidi = note.midi;
        }
    }

    return { chromaticCount, chordChangeCount };
};

/**
 * Measure funk-specific approach rate on step 15 (the "a" of beat 4).
 * Funk's own approach branch (bass-styles.ts:612-622) fires at stepInBeat === 3,
 * which is steps 3, 7, 11, 15 in a 16-step 4/4 measure. Step 15 is the last
 * 16th note of the bar, immediately before the next bar's chord lands.
 */
const measureFunkApproachRateOnA = (
    numBars: number,
): { chromaticCount: number; chordChangeCount: number } => {
    const stepMap = makeStepMap(numBars);
    const mockState = makeMockState('Funk');
    mockState.arranger.totalSteps = numBars * 16;
    mockState.arranger.stepMap = stepMap;
    getState.mockReturnValue(mockState);

    const tsConfig = TIME_SIGNATURES['4/4'];
    const totalSteps = numBars * 16;
    let chromaticCount = 0;
    let chordChangeCount = 0;
    let lastMidi: number | null = null;

    for (let i = 0; i < totalSteps; i++) {
        const stepInMeasure = i % 16;
        const measure = Math.floor(i / 16);
        const currentChord = stepMap[measure].chord;
        const nextMeasure = measure + 1;
        const nextChord = nextMeasure < numBars ? stepMap[nextMeasure].chord : null;

        const info = getStepInfo(i, tsConfig, [], TIME_SIGNATURES);
        const active = isBassActive(getState(), 'funk', i, stepInMeasure, info, {});

        let note = null;
        if (active) {
            note = getBassNote(
                getState(),
                currentChord,
                nextChord,
                info.beatIndex,
                lastMidi ? getFrequency(lastMidi) : 0,
                48,
                'funk',
                0,
                i,
                stepInMeasure,
                {},
                info,
            );
        }

        // Sample step 15 (the "a" of beat 4) when next bar has a different root
        if (stepInMeasure === 15 && nextChord && nextChord.rootMidi !== currentChord.rootMidi) {
            chordChangeCount++;
            if (note && !note.muted) {
                const notePc = note.midi % 12;
                const targetPc = nextChord.rootMidi % 12;
                const semitoneDistance = Math.min(
                    Math.abs(notePc - targetPc),
                    12 - Math.abs(notePc - targetPc),
                );
                if (semitoneDistance === 1) {
                    chromaticCount++;
                }
            }
        }

        if (note && !note.muted) {
            lastMidi = note.midi;
        }
    }

    return { chromaticCount, chordChangeCount };
};

/**
 * Measures the absolute MIDI distance (not pitch-class distance) between each
 * approach note and the engine's own target root — `note.approachTargetRoot`,
 * which is `normalizeToRange(nextTarget)`, the single octave the engine aimed
 * at. This catches octave-jump violations: a correct chromatic approach is ±1
 * semitone in absolute pitch, not ±1 pc displaced by an octave (a 13-semitone
 * jump).
 *
 * why: S3 (bass.md P0 #2) — withOctaveJump was applying ±12 to approach notes,
 * turning half-step landings into leaps. After S3, the absolute distance must
 * be ≤7 for all approach notes (±1 chromatic, −5 perfect-fourth-below,
 * +7 fifth-above).
 *
 * Measuring against the engine's surfaced target (rather than the closest of
 * all octaves of the chart root) is what makes the metric able to SEE the
 * regression: a closest-octave search re-folds any ±12 displacement away.
 *
 * Returns { maxDist, violations } so tests can assert both the worst case and
 * the total violation count.
 */
const measureApproachDistances = (
    numBars: number,
    genreFeel: string,
    bassStyle: string,
): { maxDist: number; violations: number; total: number } => {
    const stepMap = makeStepMap(numBars);
    const mockState = makeMockState(genreFeel);
    mockState.arranger.totalSteps = numBars * 16;
    mockState.arranger.stepMap = stepMap;
    getState.mockReturnValue(mockState);

    const tsConfig = TIME_SIGNATURES['4/4'];
    const totalSteps = numBars * 16;
    let maxDist = 0;
    let violations = 0;
    let total = 0;
    let lastMidi: number | null = null;

    for (let i = 0; i < totalSteps; i++) {
        const stepInMeasure = i % 16;
        const measure = Math.floor(i / 16);
        const currentChord = stepMap[measure].chord;
        const nextMeasure = measure + 1;
        const nextChord = nextMeasure < numBars ? stepMap[nextMeasure].chord : null;

        const info = getStepInfo(i, tsConfig, [], TIME_SIGNATURES);
        const active = isBassActive(getState(), bassStyle, i, stepInMeasure, info, {});

        let note = null;
        if (active) {
            note = getBassNote(
                getState(),
                currentChord,
                nextChord,
                info.beatIndex,
                lastMidi ? getFrequency(lastMidi) : 0,
                48,
                bassStyle,
                0,
                i,
                stepInMeasure,
                {},
                info,
            );
        }

        // Sample step 14 (the "& of beat 4") when next bar has a different root
        if (stepInMeasure === 14 && nextChord && nextChord.rootMidi !== currentChord.rootMidi) {
            if (note && !note.muted) {
                // why: the engine builds the chromatic approach off a SINGLE
                // octave — `targetRoot = normalizeToRange(nextTarget)`, the
                // octave of the next root nearest the bass register. The engine
                // surfaces that exact value as `note.approachTargetRoot` (a
                // test-observability field, bass-engine.ts) and we measure the
                // landing distance against it directly.
                //
                // The prior metric measured distance to the *closest of all
                // octaves* of the chart root. That re-folded any ±12
                // displacement away: a withOctaveJump call adds ±12, but the
                // min-over-octaves search then just picked the adjacent octave
                // candidate and reported distance ≈1 again — so the regression
                // the test claims to guard was invisible to it. Measured
                // against the single engine target, an octave jump reads as a
                // ≥13-semitone miss and trips the violation count.
                //
                // Scope: this guards ANY octave displacement of the approach
                // note relative to the engine's aimed-at root — a re-added
                // withOctaveJump, OR a `clampAndNormalizeMidi` register-clamp
                // that octave-shifts the chromatic candidate after targetRoot
                // is captured. Both are real "this isn't a half-step landing"
                // bugs; the metric does not need to distinguish them.
                const engineTarget = note.approachTargetRoot;
                if (typeof engineTarget === 'number') {
                    total++;
                    // Distance must be ≤7: ±1 chromatic, −5 perfect-fourth
                    // below, +7 perfect-fifth above. withOctaveJump would add
                    // ±12, pushing this to ≥12 — clearly out of range.
                    const dist = Math.abs(note.midi - engineTarget);
                    if (dist > maxDist) {
                        maxDist = dist;
                    }
                    if (dist > 7) {
                        violations++;
                    }
                }
            }
        }

        if (note && !note.muted) {
            lastMidi = note.midi;
        }
    }

    return { maxDist, violations, total };
};

// --- Tests ---

describe('Multi-Genre Chord-Change Chromatic Approach Critique', () => {
    // why: S2 regression — jazz rate must stay above the prior threshold.
    // Before S2 the gate was: Jazz/Blues always eligible. After S2 it's: always eligible,
    // Jazz/Blues get 0.95 override at high intensity. Net effect on Jazz: identical.
    it('Jazz quarter-style retains >20% chromatic approach rate at step 14 (regression)', () => {
        const numBars = 128;
        const { chromaticCount, chordChangeCount } = measureApproachRate(
            numBars,
            'Jazz',
            'quarter',
        );
        const rate = chromaticCount / (chordChangeCount || 1);

        console.log(
            '\n--- JAZZ APPROACH REGRESSION REPORT ---\n' +
                `[Step-14 samples]       ${chordChangeCount}\n` +
                `[Chromatic approaches]  ${chromaticCount}\n` +
                `[Rate]                  ${(rate * 100).toFixed(1)}% (Target: >20%)\n` +
                '---------------------------------------\n',
        );

        expect(chordChangeCount).toBeGreaterThan(50);
        // Jazz with intensity > 0.75 forces chromaticProb = 0.95; chromatic choices
        // (±1) have 80% weight in the picker, so expected rate ≈ 0.95 × 0.8 ≈ 76%.
        // However the quarter-style walking path on step 14 is an isEighthSkip, and
        // the approach branch competes with the isJazz beat-2 path and the overall
        // quarter-note fallback structure. Empirically we observe 22-35% at 128 bars.
        // 20% floor gives ~2pt headroom below the observed minimum — guards against
        // regressions without being so tight it flakes on stochastic runs.
        expect(rate).toBeGreaterThan(0.2);
    });

    // why: S2 core claim — the ['Jazz','Blues'] OR-gate previously blocked Rock genre
    // walking bass from producing chromatic approaches when pullTension < 0.7.
    // At our test settings (intensity=0.8, complexity=0.7, tension=0.3) pullTension ≈ 0.54,
    // which is below 0.7, so approaches were 0% before S2. After S2 they fire at
    // ~0.5× the base probability (≈ 30-40% per approach window), making them
    // audible — 5% floor with wide upper headroom guards against regressions.
    it('Rock genre with quarter style produces chromatic approaches into chord changes after S2', () => {
        const numBars = 256;
        const { chromaticCount, chordChangeCount } = measureApproachRate(
            numBars,
            'Rock',
            'quarter',
        );
        const rate = chromaticCount / (chordChangeCount || 1);

        console.log(
            '\n--- ROCK GENRE / QUARTER STYLE APPROACH REPORT ---\n' +
                `[Step-14 samples]       ${chordChangeCount}\n` +
                `[Chromatic approaches]  ${chromaticCount}\n` +
                `[Rate]                  ${(rate * 100).toFixed(1)}% (Target: 5-25%)\n` +
                '--------------------------------------------------\n',
        );

        expect(chordChangeCount).toBeGreaterThan(100);
        // why: audit acceptance is "5-15% of chord-change beat-4-ands" (bass.md P1 #4).
        // 5% floor confirms the gate is gone; 25% ceiling = audit's 15% target + 10pp
        // headroom for stochastic upper tail (observed 11-22% across 60-run loops on
        // 256-bar charts; a 2× regression to ~30% would trip this). Preserves the
        // "non-jazz/blues gets 0.5× probability" musical claim from bass-engine.ts:697-700
        // — Jazz still measures 22-35% on the same window, well above this ceiling.
        expect(rate).toBeGreaterThan(0.05);
        expect(rate).toBeLessThan(0.25);
    });

    // why: S2 verification for a second non-jazz genre (Country). Before S2, country
    // walking bass with pullTension < 0.7 produced 0% chromatic approaches. After S2
    // the same 0.5× reduction applies — a meaningful but smaller rate than Jazz.
    it('Country genre with quarter style produces chromatic approaches into chord changes after S2', () => {
        const numBars = 256;
        const { chromaticCount, chordChangeCount } = measureApproachRate(
            numBars,
            'Country',
            'quarter',
        );
        const rate = chromaticCount / (chordChangeCount || 1);

        console.log(
            '\n--- COUNTRY GENRE / QUARTER STYLE APPROACH REPORT ---\n' +
                `[Step-14 samples]       ${chordChangeCount}\n` +
                `[Chromatic approaches]  ${chromaticCount}\n` +
                `[Rate]                  ${(rate * 100).toFixed(1)}% (Target: 5-25%)\n` +
                '------------------------------------------------------\n',
        );

        expect(chordChangeCount).toBeGreaterThan(100);
        // why: matches Rock — audit's 5-15% target + 10pp headroom for stochastic tail.
        expect(rate).toBeGreaterThan(0.05);
        expect(rate).toBeLessThan(0.25);
    });

    // why: Funk's own approach branch (bass-styles.ts:612-622) was fixed in S1 to
    // use isChordChangeApproach (no genre gate). S2 does not affect this branch.
    // This test verifies funk still produces chromatic leading tones on the "a" of
    // beat 4 before chord changes — the idiomatic slap-bass approach gesture.
    it('Funk style produces chromatic approaches on beat-4-"a" (step 15) at chord changes', () => {
        const numBars = 256;
        const { chromaticCount, chordChangeCount } = measureFunkApproachRateOnA(numBars);
        const rate = chromaticCount / (chordChangeCount || 1);

        console.log(
            '\n--- FUNK APPROACH REPORT (step 15 / "a" of beat 4) ---\n' +
                `[Step-15 samples]       ${chordChangeCount}\n` +
                `[Chromatic approaches]  ${chromaticCount}\n` +
                `[Rate]                  ${(rate * 100).toFixed(1)}% (Target: 10-30%)\n` +
                '-------------------------------------------------------\n',
        );

        expect(chordChangeCount).toBeGreaterThan(100);
        // why: funk approach branch (bass-styles.ts:612-622) fires on stepInBeat === 3 with
        // intensity > 0.75 and a 60% raw probability gate; both ±1 outcomes are chromatic.
        // Theoretical ceiling ≈ 60% but the branch competes with other funk fills and slap
        // gestures — empirically 22-27% across 30-run loops. 10% floor guards against the
        // branch silently breaking; 30% ceiling guards against the funk slap idiom being
        // accidentally amplified (matches the same "no over-jazzing" discipline as Rock).
        expect(rate).toBeGreaterThan(0.1);
        expect(rate).toBeLessThan(0.3);
    });

    // why: Jazz and Blues should still be noticeably higher than Rock/Country because they
    // get the 0.95 intensity-override boost. This cross-genre comparison guards against
    // accidentally making all genres equally likely (which would over-jazz non-jazz genres).
    it('Jazz approach rate is higher than Rock approach rate (Jazz privilege preserved)', () => {
        const numBars = 256;

        const jazz = measureApproachRate(numBars, 'Jazz', 'quarter');
        const rock = measureApproachRate(numBars, 'Rock', 'quarter');

        const jazzRate = jazz.chromaticCount / (jazz.chordChangeCount || 1);
        const rockRate = rock.chromaticCount / (rock.chordChangeCount || 1);

        console.log(
            '\n--- JAZZ vs ROCK APPROACH COMPARISON ---\n' +
                `[Jazz rate]  ${(jazzRate * 100).toFixed(1)}%\n` +
                `[Rock rate]  ${(rockRate * 100).toFixed(1)}%\n` +
                `[Required]   Jazz > Rock\n` +
                '----------------------------------------\n',
        );

        // Jazz/Blues get 0.95 override at intensity > 0.75; Rock gets 0.5× reduction.
        // Jazz rate should be meaningfully higher.
        //
        // Reliability note (Epic 12 S4 — FOLLOWUPS §G): at the time of the Epic 11 S6
        // implementation (2026-05-20) the observed gap was ~1pp (jazz 27.5% vs rock
        // 28.4%), making this assertion sign-fragile against Math.random() stream shifts.
        // After the Epic 12 S1-S3 scrambleHash migrations stabilized the soloist engine's
        // Math.random consumption, the 256-bar observed gap moved to 14-24pp (30-run
        // sample, 2026-05-23). The 10pp cushion is now statistically honest — a regression
        // that swapped Jazz/Blues privilege for Rock would need to close a 14-24pp gap,
        // not 1pp. Passes 30/30 in isolation.
        expect(jazzRate).toBeGreaterThan(rockRate + 0.1);
    });

    // why: S3 (bass.md P0 #2) — withOctaveJump was applied inside approach branches,
    // turning half-step landings into octave-displaced leaps (e.g. F#2→G2 becomes
    // F#3→G2, a 13-semitone jump). After S3 the absolute MIDI distance from each
    // approach note to its target root must be ≤7 semitones: ±1 chromatic, −5
    // perfect-fourth below, +7 perfect-fifth above. An octave jump would be ≥12.
    it('S3: approach notes land within 7 semitones of target root (no octave-jump violations)', () => {
        const numBars = 256;

        // Test both primary styles: Jazz (high chromatic probability) and Rock (moderate)
        const jazz = measureApproachDistances(numBars, 'Jazz', 'quarter');
        const rock = measureApproachDistances(numBars, 'Rock', 'quarter');

        console.log(
            '\n--- S3 APPROACH DISTANCE REPORT ---\n' +
                `[Jazz quarter] total=${jazz.total} maxDist=${jazz.maxDist} violations=${jazz.violations}\n` +
                `[Rock quarter] total=${rock.total} maxDist=${rock.maxDist} violations=${rock.violations}\n` +
                `[Threshold]    max absolute MIDI distance ≤ 7 semitones, 0 violations\n` +
                '------------------------------------\n',
        );

        // why: 0 violations is the correct bar — withOctaveJump adds exactly ±12
        // so any violation represents the old broken path, not edge-case noise.
        expect(jazz.violations).toBe(0);
        expect(rock.violations).toBe(0);

        // why: total > 0 confirms the approach branch actually fired and we measured something
        expect(jazz.total).toBeGreaterThan(0);
        expect(rock.total).toBeGreaterThan(0);
    });
});
