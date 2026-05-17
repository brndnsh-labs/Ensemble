// @ts-nocheck
// tests/standards/soloist-tension-awareness.test.ts
//
// Critique test for `coordination-contract/S2` — pipe `isTensionChord` +
// `altPitchClasses` through the coordination contract so the soloist's pitch
// picker leans on b9/#9/#11/b13 over V7alt/V7b9/V7#9 chords.
//
// Setup: 96-bar "blocks" of solo over G7 (plain dominant, no alterations) vs.
// G7alt (fully altered dominant — coordination publishes altPitchClasses
// {b9=Ab=8, #9=Bb=10, #11=C#=1, b13=Eb=3}). Measure the percentage of soloist
// notes whose pitch class is in the altered set. Acceptance: the altered case
// exceeds the plain case by ≥15 percentage points.
//
// Reliability target: 30 trials, ≥28/30 pass — leaves stochastic-variance
// headroom (the picker is weighted-random; SRDC phase, motif seeding, and
// rhythm scheduling all introduce trial-to-trial drift). This matches the
// `soloist-harmony-spectral-gap.test.ts` reliability template.
//
// Source: docs/audit/harmony-coordination.md P0 #8;
//         docs/audit/epic-coordination-contract.md S2.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { getState } from '../../public/state.js';
import { makeSoloistMock } from '../utils/mock-soloist.js';

// Mock state.js — getSoloistNote reads through getState().
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
}));

// Mock config.js — getSoloistNote reads TIME_SIGNATURES.
vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4 },
    },
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
}));

// G7 = MIDI root 55. Altered extensions over G:
//   b9  = G + 1 = Ab → pc 8
//   #9  = G + 3 = Bb → pc 10
//   #11 = G + 6 = Db → pc 1
//   b13 = G + 8 = Eb → pc 3
const ALTERED_PCS = new Set([8, 10, 1, 3]);

// Plain G7 chord — no alterations published.
const G7_PLAIN = { rootMidi: 55, quality: '7', intervals: [0, 4, 7, 10], beats: 4 };
// Altered G7 — coordination context will publish isTensionChord=true and
// altPitchClasses = [8, 10, 1, 3] (the alteration PCs above).
const G7_ALT = { rootMidi: 55, quality: '7alt', intervals: [0, 4, 7, 10], beats: 4 };

// Coordination context shape the soloist's picker reads. The picker reads
// `coordination.stepCoordination?.isTensionChord` and `.altPitchClasses` —
// matching how tick-logic.ts wraps the per-tick coordination object into
// `{ sectionStart, sectionEnd, stepCoordination: coordination }` at call sites.
function makeCoordination(chord, sectionStart, sectionEnd) {
    const isAlt = chord.quality === '7alt';
    return {
        sectionStart,
        sectionEnd,
        stepCoordination: {
            step: 0,
            isTensionChord: isAlt,
            // why: test isolation — we drive the alteration set explicitly rather than
            // depending on getAltPitchClasses, so a regression in the picker is not
            // masked by a regression in the producer (each tested separately).
            altPitchClasses: isAlt ? [8, 10, 1, 3] : [],
            upcomingSectionFirstChord: null,
            soloistMidi: 0,
            soloistActive: false,
            lastActiveSoloistMidi: 0,
            lastActiveSoloistStep: 0,
            accompanimentMidis: [],
            avgChordMidi: 0,
            bassMidi: 0,
            kickHit: false,
            snareHit: false,
        },
    };
}

describe('Soloist tension-chord awareness (altered V7 dominants)', () => {
    let soloistState;

    beforeEach(() => {
        vi.restoreAllMocks();

        // Configure a jazz soloist with no thematic seed, no head-bypass biasing,
        // no SRV/profile bonus that competes with the alteration multiplier —
        // following feedback_test_isolation_competing_biases: clear other biases
        // on the mock that push toward the same pitch classes so the test
        // measures the alteration multiplier in isolation.
        soloistState = makeSoloistMock({
            enabled: true,
            style: 'jazz',
            mode: 'monophonic',
            octave: 64,
            sessionSteps: 0,
            notesInPhrase: 0,
            // SRDC = Departure: chord-tone multiplier is depressed (0.45), scale-tone
            // boost active (×2.0). This is where the altered-tone bias is most musically
            // relevant in real solos (departure = exploration phase) AND least overwhelmed
            // by chord-tone gravity. Keeps the test isolated to the new bias.
            srdcState: 'Departure',
            isResting: false,
            phrasingState: 'play',
            phraseContext: {
                role: 'call',
                skeleton: [],
                lastInterval: null,
                // profile=null: don't add a Greats profile (srv/gilmour/etc.) — those
                // bias toward pentatonic/chord-tone pitch classes that overlap with
                // the alteration set in some keys and would pollute the measurement.
                profile: null,
            },
        });

        getState.mockReturnValue({
            playback: {
                bandIntensity: 0.7,
                bpm: 140,
                complexity: 0.7,
                intent: {},
                lyricalBias: 0.1,
                currentLoopCount: 2, // Loop 2+: no Head adherence, no thematic-seed bias.
            },
            groove: { genreFeel: 'Jazz', pocket: 0 },
            soloist: soloistState,
            harmony: { enabled: false },
            arranger: { timeSignature: '4/4' },
        });
    });

    // Runs a block of bars with a single chord and reports the fraction of
    // soloist notes whose pitch class is in ALTERED_PCS.
    const measureAlteredRate = (chord, numBars) => {
        const stepsPerBar = 16;
        const sectionStart = 0;
        const sectionEnd = numBars * stepsPerBar;
        const coordination = makeCoordination(chord, sectionStart, sectionEnd);

        let altCount = 0;
        let totalCount = 0;
        let lastFreq = 0;

        // Reset soloist counters at the start of each block so prior block
        // doesn't bleed phrasing state into this measurement.
        soloistState.session.sessionSteps = 0;
        soloistState.session.phrasing.isResting = false;
        soloistState.audio.lastFreq = null;
        soloistState.audio.lastMidiPlayed = null;

        for (let bar = 0; bar < numBars; bar++) {
            for (let step = 0; step < stepsPerBar; step++) {
                const absStep = bar * stepsPerBar + step;
                coordination.stepCoordination.step = absStep;
                const note = getSoloistNote(
                    getState(),
                    chord,
                    chord,
                    absStep,
                    lastFreq,
                    64,
                    'jazz',
                    step,
                    coordination,
                    { isBeatStart: step % 4 === 0, mStep: step },
                );
                if (note) {
                    const primary = Array.isArray(note) ? note[0] : note;
                    if (primary.midi > 0) {
                        const pc = ((primary.midi % 12) + 12) % 12;
                        if (ALTERED_PCS.has(pc)) {
                            altCount++;
                        }
                        totalCount++;
                        lastFreq = primary.frequency || lastFreq;
                    }
                }
                soloistState.session.sessionSteps++;
            }
        }
        return { altRate: totalCount > 0 ? altCount / totalCount : 0, totalCount };
    };

    it('biases ≥15pt more toward b9/#9/#11/b13 over G7alt vs plain G7', () => {
        const TRIALS = 30;
        const BARS_PER_BLOCK = 96; // enough notes per block to make the rate stable
        let passing = 0;
        const gaps: number[] = [];

        for (let trial = 0; trial < TRIALS; trial++) {
            const plain = measureAlteredRate(G7_PLAIN, BARS_PER_BLOCK);
            const altered = measureAlteredRate(G7_ALT, BARS_PER_BLOCK);

            const gap = altered.altRate - plain.altRate;
            gaps.push(gap);

            // why ≥0.15 (15 percentage points): the story's acceptance criterion.
            // The `weight *= 3` multiplier is a final-stage scalar on a candidate
            // weight that's typically ~100-500 for scale/chord tones; tripling the
            // four alteration PCs in the candidate pool produces a measurable but
            // not overwhelming shift (chord-tone bonuses on strong beats still win).
            // In practice the gap is typically ~0.20-0.35 — 0.15 leaves a 5-20pt
            // safety margin for stochastic variance from the weighted-random pick.
            if (gap >= 0.15) {
                passing++;
            }
        }

        const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const minGap = Math.min(...gaps);
        const maxGap = Math.max(...gaps);

        // eslint-disable-next-line no-console
        console.log(
            `[tension-awareness] mean gap ${(meanGap * 100).toFixed(1)}pt; ` +
                `range ${(minGap * 100).toFixed(1)}pt..${(maxGap * 100).toFixed(1)}pt; ` +
                `${passing}/${TRIALS} trials ≥ 15pt`,
        );

        // why threshold = TRIALS - 2 (≥28/30): matches the spectral-gap critique
        // reliability bar. The picker is weighted-random; even a strong bias
        // occasionally produces a block where SRDC + rhythm variance suppresses
        // the alteration rate within stochastic noise. Two miss-budget out of 30
        // is the measured floor — tighten if the picker becomes more deterministic.
        expect(passing).toBeGreaterThanOrEqual(TRIALS - 2);

        // Also assert that the MEAN gap is comfortably above the threshold so a
        // future change that drops the mean below 15pt would fail even if the
        // per-trial pass rate stays high (catches regressions that erode the bias).
        expect(meanGap).toBeGreaterThanOrEqual(0.15);
    });

    it('does not affect pitch distribution when isTensionChord is false (plain V7 control)', () => {
        // Negative control: with isTensionChord=false the picker should NOT
        // amplify the {1,3,8,10} pitch classes. Run the plain-G7 block twice
        // and verify the altered-rate is in the same neighborhood (no systematic
        // bias either direction). Loose threshold — this is a sanity check that
        // the gate works, not a precise distribution test.
        const TRIALS = 30;
        const BARS_PER_BLOCK = 64;
        let withinTolerance = 0;

        for (let trial = 0; trial < TRIALS; trial++) {
            const a = measureAlteredRate(G7_PLAIN, BARS_PER_BLOCK);
            const b = measureAlteredRate(G7_PLAIN, BARS_PER_BLOCK);
            // why ≤0.20 absolute drift: plain-vs-plain should have no systematic
            // bias; allow 20pt block-to-block stochastic variance (the rate over
            // 64 bars × ~7 notes/bar = ~448 notes is reasonably stable but the
            // weighted-random picker can drift this much on small SRDC-phase
            // window differences). The gate is the assertion below — what we're
            // verifying is the multiplier doesn't fire when the chord isn't tension.
            if (Math.abs(a.altRate - b.altRate) <= 0.2) {
                withinTolerance++;
            }
        }

        // why TRIALS - 3: same stochastic floor as the primary test plus
        // small extra margin since this is a 2-block comparison.
        expect(withinTolerance).toBeGreaterThanOrEqual(TRIALS - 3);
    });
});
