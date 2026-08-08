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
 *   • Funk + funk style: verifies funk's own approach branch (the "4. Harmonic
 *     Approaches" block in `getBassNoteStyle`'s Funk branch, bass-styles.ts)
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
import { installSeededRandom } from '../utils/seeded-random.js';

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
 * Funk's own approach branch (the "4. Harmonic Approaches" block in
 * `getBassNoteStyle`'s Funk branch, bass-styles.ts) fires at stepInBeat === 3,
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

/**
 * Measures how often the chromatic-approach branch's expressive pitch-bend
 * fires (bendStartInterval !== 0), among all step-14 samples that reached the
 * chord-change-approach code path (note.approachTargetRoot is the
 * test-observability field set on both the chromatic and perfect-interval
 * approach branches — see approachBend in bass-styles.ts).
 *
 * why: approachBend gates the bend to a fixed genre allowlist
 * (EXPRESSIVE_BEND_GENRES, bass-styles.ts) added by a 2026-07-16 hygiene
 * sweep — before this, none of the tests above inspected bendStartInterval
 * at all, so a genre-string typo or an accidentally-emptied allowlist would
 * have passed every existing assertion silently.
 */
const measureBendRate = (
    numBars: number,
    genreFeel: string,
    bassStyle: string,
): { bentCount: number; sampleCount: number; chromaticCount: number } => {
    const stepMap = makeStepMap(numBars);
    const mockState = makeMockState(genreFeel);
    mockState.arranger.totalSteps = numBars * 16;
    mockState.arranger.stepMap = stepMap;
    getState.mockReturnValue(mockState);

    const tsConfig = TIME_SIGNATURES['4/4'];
    const totalSteps = numBars * 16;
    let bentCount = 0;
    let sampleCount = 0;
    let chromaticCount = 0;
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

        if (
            stepInMeasure === 14 &&
            nextChord &&
            nextChord.rootMidi !== currentChord.rootMidi &&
            note &&
            !note.muted &&
            typeof note.approachTargetRoot === 'number'
        ) {
            sampleCount++;
            // #1254 — the denominator must be CHROMATIC approaches only. `getBassNote` has
            // two approach branches and BOTH set `approachTargetRoot`: the chromatic
            // leading-tone branch (which can bend) and a fallback that picks targetRoot
            // ±5/±7 (which passes bend `0` unconditionally). Counting both made this
            // metric `chromaticProb × bendProb`, so a musically-motivated retune of Jazz's
            // `chromaticProb` — touching no bend logic at all — would have reddened the
            // *bend* test with a misleading failure. Filtering to leading-tone landings
            // makes the rate equal `bendProb` alone, which is what the test's name claims.
            //
            // Compared mod 12 because the chromatic branch runs its candidate through
            // `clampAndNormalizeMidi`, which may octave-shift it; the fallback branch's
            // ±5/±7 are 5 or 7 mod 12 and so can never be mistaken for a leading tone.
            const semitonesFromTarget = Math.abs(note.midi - note.approachTargetRoot) % 12;
            if (semitonesFromTarget === 1 || semitonesFromTarget === 11) {
                chromaticCount++;
                if (note.bendStartInterval) {
                    bentCount++;
                }
            }
        }

        if (note && !note.muted) {
            lastMidi = note.midi;
        }
    }

    return { bentCount, sampleCount, chromaticCount };
};

// --- Tests ---

describe('Multi-Genre Chord-Change Chromatic Approach Critique', () => {
    // why: `approachBend` rolls a flat raw `Math.random() < 0.2` whenever the chromatic
    // branch is taken (`bass-styles.ts`), so the measured bend rate is an unseeded
    // binomial. Measured over 50 isolated runs: mean 19.1% (matching the designed
    // ~19%), sd 5.3%, range 9.7-33.9% — wide enough that CI run 283 crossed the 35%
    // ceiling at 35.5% (a +3.1σ draw). A mulberry32-seeded spy collapses every
    // assertion in this file to one deterministic run. See docs/FLAKY_TESTS.md
    // (unseeded-statistical class).
    installSeededRandom();

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
        // quarter-note fallback structure. Re-measured 2026-07-24 over 60 unseeded
        // runs: 31.5-43.3% at 128 bars (mean 37.7%, sd 2.6%) — the "22-35%" this
        // comment used to claim was stale, and the seeded draw of 41.7% would have
        // read as a regression against it. The 20% floor now sits ~11pt below the
        // observed minimum, so it guards only a gross break of the branch.
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
        // headroom for stochastic upper tail (re-measured 2026-07-24: 11.4-20.4% over
        // 60 unseeded runs on 256-bar charts, mean 15.3%; a 2× regression to ~30% would
        // trip this). Preserves the "non-jazz/blues gets 0.5× probability" musical claim
        // from `getBassNote`'s chromaticProb block in bass-engine.ts — Jazz measures
        // 31.5-43.3% on its own 128-bar window, well above this ceiling.
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

    // why: Funk's own approach branch (the "4. Harmonic Approaches" block in
    // `getBassNoteStyle`'s Funk branch, bass-styles.ts) was fixed in S1 to
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
        // why: funk approach branch (the "4. Harmonic Approaches" block in
        // `getBassNoteStyle`'s Funk branch, bass-styles.ts) fires on stepInBeat === 3 with
        // intensity > 0.75 and a 60% raw probability gate; both ±1 outcomes are chromatic.
        // Theoretical ceiling ≈ 60% but the branch competes with other funk fills and slap
        // gestures — a constant 24.71%, because this funk path rolls `scrambleHash`, not
        // `Math.random`, so it was already fully deterministic before this file was
        // seeded (verified: sd 0 across 60 unseeded runs and identical at 4 seeds).
        // The old "22-27% across 30-run loops" implied a spread that does not exist.
        // 10% floor guards against the
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

    // why: approachBend (bass-styles.ts) gates the expressive pitch-bend to a
    // fixed EXPRESSIVE_BEND_GENRES allowlist (Jazz/Blues/Funk/Neo-Soul/Country).
    // Nothing above this test inspects bendStartInterval, so a genre-string
    // typo or an accidentally-emptied allowlist would pass every other
    // assertion in this file silently — this is the regression guard for that.
    it('approach bend fires for an allowlisted genre (Jazz) and never for an excluded genre (Rock)', () => {
        const numBars = 1024;
        const jazz = measureBendRate(numBars, 'Jazz', 'quarter');
        const rock = measureBendRate(numBars, 'Rock', 'quarter');
        const jazzRate = jazz.bentCount / (jazz.chromaticCount || 1);

        console.log(
            '\n--- APPROACH-BEND GENRE GATE REPORT ---\n' +
                `[Jazz samples] ${jazz.sampleCount} approaches, ${jazz.chromaticCount} chromatic  bent=${jazz.bentCount}  rate=${(jazzRate * 100).toFixed(1)}%\n` +
                `[Rock samples] ${rock.sampleCount} approaches, ${rock.chromaticCount} chromatic  bent=${rock.bentCount}\n` +
                '[Required]     Jazz bend rate 13-32% of chromatic approaches, Rock bent=0\n' +
                '----------------------------------------\n',
        );

        // Harness integrity, not statistics. The total approach count is structurally
        // deterministic — the step-14 activity gate runs on `scrambleHash(step, loopCount)`,
        // not `Math.random`, so it is invariant under the seeded spy AND under any
        // bend/chromatic constant (verified 476 at five different bend probabilities).
        // Asserted exactly, so a future change to `makeStepMap` or the approach gate that
        // collapses the sample set fails here loudly instead of silently widening the band.
        expect(jazz.sampleCount).toBe(476);
        expect(rock.sampleCount).toBe(476);
        // The chromatic subset IS stochastic — it scales with `chromaticProb` (370 of 476
        // at the current 0.95). This floor is a COLLAPSE detector only, set far below any
        // plausible retune on purpose: dropping `chromaticProb` to 0.7 yields ~270 and must
        // NOT redden this test, because the bend rate is the thing under measurement here
        // and the file already has a dedicated chromatic-rate test. An earlier draft used
        // `> 300`, which re-coupled the two concerns that re-denominating the metric had
        // just separated — verified by mutation: at `chromaticProb = 0.7` the rate stays in
        // band at 17.6% but a 300-floor fails.
        expect(jazz.chromaticCount).toBeGreaterThan(100);

        // The musical claim (#1254): the scoop into the chromatic leading tone is an
        // OCCASIONAL expressive gesture — roughly one approach in five. `approachBend`
        // rolls a flat `Math.random() < 0.2` (`bass-styles.ts`), whose own comment is
        // explicit that firing on every approach "reads as a mannerism".
        //
        // The band is set from the AUDIBLE boundaries, not from σ. The listener-distinct
        // categories are: ~0-5% the articulation is effectively gone; ~10% rare; ~20%
        // occasional; ~40%+ a tic. Nobody hears the difference between 15% and 25% —
        // roughly 9 versus 15 scoops across a 128-bar stretch — so a band that reddened
        // there would be flagging a change no ear can detect, and would eventually be
        // loosened by someone who was right to loosen it.
        //
        // Measured seeded rates across a bend-probability sweep at n≈370: p=0.10 → 10.3%,
        // 0.15 → 15.4%, 0.20 → 21.6%, 0.25 → 27.8%, 0.30 → 34.1%, 0.40 → 43.2%.
        // [0.13, 0.32] therefore FAILS p=0.10 and p≥0.30 (the audible category changes)
        // and TOLERATES p=0.15/0.25 (the inaudible ones) — which is the intended
        // discrimination, not a weakness. Statistically the floor is 3.4σ below the 20%
        // mean (sd 2.08% at this n) and the ceiling 5.8σ above, so stream-shift false-fail
        // risk is negligible on both edges.
        //
        // Honest about power: the ceiling catches p=0.40 essentially always, but p=0.30
        // only ~20% of stream positions (its mean of 30% sits under 0.32; this seed drew
        // 1.7σ high). That is the accepted cost of not gating on inaudible differences —
        // a doubling of the gesture rate is caught, a 50% increase may not be.
        //
        // Why the old [0.05, 0.35] was a fence: at the previous 128-bar sample (n≈62,
        // sd 5.1%) a measured 6% and a measured 34% both passed — a bass that almost never
        // scoops and one that bends into every other chord change. The #1254 reviewer
        // proposed [0.12, 0.28], the right instinct but un-derivable at n=62 (±1.4σ → ~8%
        // false-fail on any stream shift). Growing the sample is what made an honest band
        // possible at all; the 8× longer run costs ~300ms.
        expect(jazzRate).toBeGreaterThan(0.13);
        expect(jazzRate).toBeLessThan(0.32);
        // why: Rock is not in EXPRESSIVE_BEND_GENRES — this must stay exactly
        // 0. A genre-string typo or an emptied allowlist would leak a nonzero
        // bend here without tripping any other test in this file.
        expect(rock.bentCount).toBe(0);
    });
});
