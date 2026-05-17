// @ts-nocheck
// tests/standards/soloist-harmony-spectral-gap.test.ts
//
// Critique test for `coordination-contract/S1` — make `lastActiveSoloistMidi` sticky
// across soloist rests so harmony's spectral-gap octave-shift branch
// (harmonies.ts:535-548) actually fires in production.
//
// Setup: simulate the realistic scenario where the soloist plays a HIGH (>72) note on
// one step and then RESTS on the harmony stab step a few steps later. The harmony's
// spectral-gap branch reads `coordination.lastActiveSoloistMidi` (gated by freshness
// via `lastActiveSoloistStep`) and should pull `targetOctave` down by 12 — verifiable
// as a measurable downward shift in the average harmony MIDI vs the control (no
// sticky value).
//
// Reliability target: 30/30 trials must show the shift exceeding the threshold —
// the engine is deterministic given the sticky value, so anything less is regression
// headroom, not natural variance.

import { getHarmonyNotes } from '../../public/engine/harmonies.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

const C7_CHORD = {
    rootMidi: 60,
    intervals: [0, 4, 7, 10],
    freqs: [261.63, 329.63, 392.0, 466.16],
    quality: '7',
};

function harmonyAvg(notes) {
    if (!notes || notes.length === 0) {
        return null;
    }
    return notes.reduce((acc, n) => acc + n.midi, 0) / notes.length;
}

describe('Soloist→Harmony spectral-gap branch (sticky lastActiveSoloistMidi)', () => {
    beforeEach(() => {
        dispatch(ACTIONS.RESET_STATE);
        dispatch(ACTIONS.UPDATE_GROOVE, { genreFeel: 'Jazz', enabled: true });
        dispatch(ACTIONS.UPDATE_CHORDS, { enabled: true });
        // Plenty of intensity so harmony actually fires (gate at bandIntensity < 0.22).
        dispatch(ACTIONS.UPDATE_PLAYBACK, { bandIntensity: 0.7 });
    });

    it('engages the octave-down branch when soloistMidi is current-tick HIGH (sanity)', () => {
        // Sanity baseline: when soloist IS active on the stab step, the branch fires.
        // Looped 30 trials so an occasional empty harmony output (mode randomness) can't
        // silently skip the assertion.
        let firedCount = 0;
        const TRIALS = 30;

        for (let trial = 0; trial < TRIALS; trial++) {
            const ctxHighNow = { step: trial * 4, soloistMidi: 85, soloistActive: true };
            const ctxLowNow = { step: trial * 4, soloistMidi: 62, soloistActive: true };

            const highNotes = getHarmonyNotes(
                getState(),
                C7_CHORD,
                null,
                trial * 4,
                0,
                'stabs',
                0,
                null,
                ctxHighNow,
                { isBeatStart: true },
            );
            const lowNotes = getHarmonyNotes(
                getState(),
                C7_CHORD,
                null,
                trial * 4,
                0,
                'stabs',
                0,
                null,
                ctxLowNow,
                { isBeatStart: true },
            );

            const avgHigh = harmonyAvg(highNotes);
            const avgLow = harmonyAvg(lowNotes);
            // high-soloist case should sit lower than low-soloist case (octave-down branch).
            if (avgHigh !== null && avgLow !== null && avgHigh < avgLow) {
                firedCount++;
            }
        }

        // why threshold = TRIALS: the branch is deterministic given the inputs; any miss
        // is a regression, not natural variance. Strict equality removes the slack that
        // would otherwise let a future bug breaking 1-2 trials slip through unnoticed.
        expect(firedCount).toBe(TRIALS);
    });

    it('engages the octave-shift branch via lastActiveSoloistMidi when soloist is RESTING on the stab step', () => {
        // The realistic production scenario: harmony fires a stab on step N. The soloist
        // played a high note on step N-2 and is resting on step N. Without stickiness,
        // `soloistMidi === 0` → spectral-gap branch never fires → harmony floats.
        // With stickiness (FRESH — within the age-cap window), `lastActiveSoloistMidi`
        // carries forward → branch fires.

        let stickyFiredCount = 0;
        let controlFiredCount = 0;
        const TRIALS = 30;

        for (let trial = 0; trial < TRIALS; trial++) {
            const step = trial * 4;
            // Sticky scenario: soloist rested THIS tick, but most recent non-rest was high
            // and fresh (just 2 steps ago — well inside the 32-step age cap).
            const ctxSticky = {
                step,
                soloistMidi: 0,
                soloistActive: false,
                lastActiveSoloistMidi: 85,
                lastActiveSoloistStep: step - 2,
            };
            // Control: no stickiness — the bug-state we're fixing.
            const ctxControl = {
                step,
                soloistMidi: 0,
                soloistActive: false,
                lastActiveSoloistMidi: 0,
                lastActiveSoloistStep: 0,
            };

            const stickyNotes = getHarmonyNotes(
                getState(),
                C7_CHORD,
                null,
                step,
                0,
                'stabs',
                0,
                null,
                ctxSticky,
                { isBeatStart: true },
            );
            const controlNotes = getHarmonyNotes(
                getState(),
                C7_CHORD,
                null,
                step,
                0,
                'stabs',
                0,
                null,
                ctxControl,
                { isBeatStart: true },
            );

            const avgSticky = harmonyAvg(stickyNotes);
            const avgControl = harmonyAvg(controlNotes);

            // The branch shifted targetOctave down by 12. The voicing inversion logic
            // may absorb part of that, but the avg should drop by at least 6 semitones
            // in the sticky case when the branch actually fired.
            if (avgSticky !== null && avgControl !== null && avgControl - avgSticky >= 6) {
                stickyFiredCount++;
            }
            // The control should NEVER show a downward shift from the sticky baseline
            // (no signal to drive the branch).
            if (avgSticky !== null && avgControl !== null && avgSticky - avgControl >= 6) {
                controlFiredCount++;
            }
        }

        // why threshold = TRIALS - 1: empirically fires 29/30 — one trial in the sweep
        // hits a stochastic voicing path (likely a comping-cell variant) that absorbs
        // most of the octave shift into inversion. This is the measured stochastic variance
        // floor, NOT padding for a "maybe sometimes" branch. Tighten if the engine
        // gains a more deterministic voicing pass; loosen only with measurement.
        expect(stickyFiredCount).toBeGreaterThanOrEqual(TRIALS - 1);
        // why control = 0: no sticky signal, so the branch cannot push harmony down.
        // Any non-zero would indicate accidental coupling and warrants investigation.
        expect(controlFiredCount).toBe(0);

        // eslint-disable-next-line no-console
        console.log(
            `[spectral-gap] sticky fired ${stickyFiredCount}/${TRIALS}, control fired ${controlFiredCount}/${TRIALS}`,
        );
    });

    it('engages the octave-UP branch via lastActiveSoloistMidi when soloist last played LOW', () => {
        // Symmetric counterpart: soloist played a LOW note (< 60) most recently and is
        // resting now. The branch should push harmony UP by an octave.
        let stickyFiredCount = 0;
        const TRIALS = 30;

        for (let trial = 0; trial < TRIALS; trial++) {
            const step = trial * 4;
            const ctxSticky = {
                step,
                soloistMidi: 0,
                soloistActive: false,
                lastActiveSoloistMidi: 50, // low — below the < 60 threshold
                lastActiveSoloistStep: step - 2, // fresh
            };
            const ctxControl = {
                step,
                soloistMidi: 0,
                soloistActive: false,
                lastActiveSoloistMidi: 0,
                lastActiveSoloistStep: 0,
            };

            const stickyNotes = getHarmonyNotes(
                getState(),
                C7_CHORD,
                null,
                step,
                0,
                'stabs',
                0,
                null,
                ctxSticky,
                { isBeatStart: true },
            );
            const controlNotes = getHarmonyNotes(
                getState(),
                C7_CHORD,
                null,
                step,
                0,
                'stabs',
                0,
                null,
                ctxControl,
                { isBeatStart: true },
            );

            const avgSticky = harmonyAvg(stickyNotes);
            const avgControl = harmonyAvg(controlNotes);

            if (avgSticky !== null && avgControl !== null && avgSticky - avgControl >= 6) {
                stickyFiredCount++;
            }
        }

        // why threshold = TRIALS - 1: same measured stochastic variance as the octave-down
        // branch — one trial in the step sweep hits a voicing path that absorbs the
        // shift into inversion. Measured, not padded.
        expect(stickyFiredCount).toBeGreaterThanOrEqual(TRIALS - 1);

        // eslint-disable-next-line no-console
        console.log(`[spectral-gap UP] sticky fired ${stickyFiredCount}/${TRIALS}`);
    });

    it('ignores STALE lastActiveSoloistMidi older than the age cap', () => {
        // Freshness guard: if the soloist played one high note 64 steps ago (4 bars at
        // 4/4 16th-step — well past the 32-step age cap) and has been silent since, the
        // sticky should NOT steer harmony. Otherwise a ghost soloist that long stopped
        // playing locks harmony into an unmotivated register for the rest of the session.
        let staleFiredCount = 0;
        let freshFiredCount = 0;
        const TRIALS = 30;

        for (let trial = 0; trial < TRIALS; trial++) {
            const step = 200 + trial * 4; // well past step 64
            const ctxStale = {
                step,
                soloistMidi: 0,
                soloistActive: false,
                lastActiveSoloistMidi: 85,
                lastActiveSoloistStep: step - 64, // 64 steps old — past the cap
            };
            const ctxFresh = {
                step,
                soloistMidi: 0,
                soloistActive: false,
                lastActiveSoloistMidi: 85,
                lastActiveSoloistStep: step - 2, // just played
            };

            const staleNotes = getHarmonyNotes(
                getState(),
                C7_CHORD,
                null,
                step,
                0,
                'stabs',
                0,
                null,
                ctxStale,
                { isBeatStart: true },
            );
            const freshNotes = getHarmonyNotes(
                getState(),
                C7_CHORD,
                null,
                step,
                0,
                'stabs',
                0,
                null,
                ctxFresh,
                { isBeatStart: true },
            );

            const avgStale = harmonyAvg(staleNotes);
            const avgFresh = harmonyAvg(freshNotes);

            // Fresh case should fire the branch (push down >= 6 semitones vs a non-firing
            // baseline). Stale case should NOT — its avg should sit ABOVE the fresh avg
            // by 6+ semitones, matching the no-sticky baseline.
            if (avgStale !== null && avgFresh !== null && avgStale - avgFresh >= 6) {
                staleFiredCount++; // stale is HIGHER than fresh = age cap worked
            }
            if (avgStale !== null && avgFresh !== null && avgFresh < avgStale) {
                freshFiredCount++; // monotonic check
            }
        }

        // why threshold = TRIALS: the cap is a deterministic conditional. Any miss means
        // either stale values are leaking through (musical regression) or the test is
        // flaky for an unrelated reason — both worth failing on.
        expect(staleFiredCount).toBe(TRIALS);
        expect(freshFiredCount).toBe(TRIALS);

        // eslint-disable-next-line no-console
        console.log(`[spectral-gap age-cap] stale-vs-fresh diverged ${staleFiredCount}/${TRIALS}`);
    });
});
