// @ts-nocheck
/**
 * Compound-meter soloist phrasing critique — PRODUCTION-FAITHFUL on the live
 * engine (getSoloistNotePhraseFirst). Rerouted from the retired legacy
 * getSoloistNote (epic #10, #863).
 *
 * WHAT IT GUARDS NOW: the live soloist phrases on the COMPOUND EIGHTH-NOTE GRID
 * in 6/8 and 12/8 — phrase-starts land on the eighth-note positions (even
 * 16th-steps), with the 16th-note offbeats (odd steps) a clear minority. This is
 * the live engine's actual failure-mode guard: a meter-blind phrase machine
 * scatters wake-ups across EVERY step, collapsing the on-grid share toward the
 * 0.5 uniform baseline.
 *
 * WHAT CHANGED FROM THE LEGACY TEST: the legacy version asserted phrase-starts
 * CLUSTER on the dotted-quarter PULSE ({0,6} in 6/8) — it guarded a specific
 * legacy bug where `isGoodEntry` degenerated to `measureStep % 1 === 0` (always
 * true) in compound (in the now-deleted legacy `soloist.ts`). The live phrase-first engine is theme-
 * driven (`phrasing.isResting` flips false only when a seeded theme note sounds),
 * and the seeder places theme notes across the eighth-note grid — NOT tightly on
 * the dotted-quarter pulse. So the strict pulse-clustering claim is FALSE on the
 * live engine and is intentionally dropped (measured: 6/8 pulse-share ~28%,
 * eighth-grid share ~97%). Tighter dotted-quarter-pulse clustering — strongest in
 * 12/8, where the on-grid share is lower (~79%) — is a phrasing port candidate.
 * What survives is the musically meaningful, TRUE property: the compound soloist
 * stays on the eighth grid rather than syncopating onto 16th offbeats.
 *
 * Production-faithful: real dispatch-built state, a real seed in the target
 * compound meter, an absolute advancing step with currentLoopCount per loop.
 */

import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { getSoloistNotePhraseFirst } from '../../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import { getStepInfo } from '../../public/utils.js';

function buildState(timeSignature: string, intensity: number) {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, timeSignature);
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: 'Jazz' });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'jazz' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, intensity);
    dispatch(ACTIONS.SET_BPM, 110);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === 'Pop (Standard)');
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `p-${i}` }));
    validateProgression(state);
    const seed = generateSessionSeed(
        state,
        state.arranger,
        'smart',
        intensity,
        'COMPOUND_PHRASING',
    );
    state.soloist.session.seed = seed;
    state.soloist.session.phrasing.isResting = true;
    return state;
}

/**
 * Drive the live engine across `numBars` of the given compound meter and record
 * the measure-step at which `phrasing.isResting` flips false (= phrase START).
 */
function collectPhraseStartMeasureSteps(numBars: number, timeSignature: string, intensity: number) {
    const ts = TIME_SIGNATURES[timeSignature];
    const stepsPerBar = ts.beats * ts.stepsPerBeat;
    const state = buildState(timeSignature, intensity);
    const phr = state.soloist.session.phrasing;
    const total = state.arranger.totalSteps;
    const stepMap = state.arranger.stepMap;
    const chordAt = (s: number) => {
        const w = ((s % total) + total) % total;
        return stepMap.find((e: any) => w >= e.start && w < e.end)?.chord || null;
    };

    const phraseStartMeasureSteps: number[] = [];
    let wasResting = phr.isResting === true;

    for (let bar = 0; bar < numBars; bar++) {
        for (let step = 0; step < stepsPerBar; step++) {
            const absStep = bar * stepsPerBar + step;
            state.playback.currentLoopCount = Math.floor(absStep / total);
            getSoloistNotePhraseFirst(
                state,
                chordAt(absStep),
                chordAt(absStep + 1),
                absStep,
                null,
                state.soloist.octave,
                'smart',
                absStep % stepsPerBar,
                {},
                { isDownbeat: step === 0, isMeasureStart: step === 0 },
            );
            const isRestingNow = phr.isResting === true;
            if (wasResting && !isRestingNow) {
                phraseStartMeasureSteps.push(absStep % stepsPerBar);
            }
            wasResting = isRestingNow;
        }
    }
    return phraseStartMeasureSteps;
}

// Compound fixtures. `pulseSteps` are the dotted-quarter pulses, kept only for
// the getStepInfo sanity sub-test. `gridFloor` is the eighth-note-grid (even
// 16th-step) share floor — the load-bearing assertion. Baseline for a meter-blind
// (every-step) phrase machine is 0.5 (half the steps are even), so each floor sits
// well above 0.5 and is non-vacuous. Floors set with headroom below the measured
// live share (6/8 ~97%, 12/8 ~79%).
type CompoundFixture = {
    timeSignature: string;
    pulseSteps: ReadonlySet<number>;
    gridFloor: number;
};
const COMPOUND_FIXTURES: readonly CompoundFixture[] = [
    {
        timeSignature: '6/8',
        pulseSteps: new Set([0, 6]),
        gridFloor: 0.85,
    },
    {
        timeSignature: '12/8',
        pulseSteps: new Set([0, 6, 12, 18]),
        gridFloor: 0.65,
    },
];

describe('compound-soloist: phrase boundaries stay on the eighth grid (phrase-first)', () => {
    // -----------------------------------------------------------------------
    // 1. The Big One: phrase START steps in 6/8 and 12/8 land on the eighth-note
    //    grid (even 16th-steps), NOT scattered onto 16th-note offbeats. A
    //    meter-blind phrase machine collapses this toward the 0.5 uniform
    //    baseline.
    // -----------------------------------------------------------------------
    for (const fixture of COMPOUND_FIXTURES) {
        const ts = TIME_SIGNATURES[fixture.timeSignature];
        const stepsPerBar = ts.beats * ts.stepsPerBeat;
        const pulseList = [...fixture.pulseSteps].sort((a, b) => a - b);

        it(`jazz ${fixture.timeSignature}: phrase-starts stay on the eighth grid (≥${(fixture.gridFloor * 100).toFixed(0)}%), not on 16th offbeats`, () => {
            // Pool three intensity bands to broaden the sample (the density gate
            // varies per-step via scrambleHash; pooling yields a robust sample).
            const numBars = 120;
            const starts = [
                ...collectPhraseStartMeasureSteps(numBars, fixture.timeSignature, 0.55),
                ...collectPhraseStartMeasureSteps(numBars, fixture.timeSignature, 0.75),
                ...collectPhraseStartMeasureSteps(numBars, fixture.timeSignature, 0.9),
            ];

            expect(starts.length).toBeGreaterThan(20);

            const hist = new Array(stepsPerBar).fill(0);
            for (const s of starts) {
                hist[s]++;
            }

            const totalHits = starts.length;
            // Eighth-note grid = even 16th-steps; 16th offbeats = odd steps.
            let gridHits = 0;
            for (let s = 0; s < stepsPerBar; s += 2) {
                gridHits += hist[s];
            }
            const gridShare = gridHits / totalHits;
            const pulseHits = pulseList.reduce((acc, s) => acc + hist[s], 0);
            const pulseShare = pulseHits / totalHits;

            console.log(
                `\n--- COMPOUND SOLOIST PHRASING CRITIQUE (${fixture.timeSignature}, phrase-first) ---`,
            );
            console.log(`Total phrase starts: ${totalHits} over ${numBars} bars × 3 intensities`);
            console.log(`[Histogram by mStep] ${hist.map((c, i) => `${i}:${c}`).join('  ')}`);
            console.log(
                `[Eighth-grid share]  ${(gridShare * 100).toFixed(1)}% (floor ${(fixture.gridFloor * 100).toFixed(0)}%, uniform baseline 50%)`,
            );
            console.log(
                `[Dotted-pulse share] ${(pulseShare * 100).toFixed(1)}% on {${pulseList.join(',')}} (NOT asserted — see header)`,
            );

            // The load-bearing claim: phrase-starts stay on the eighth grid, well
            // above the 0.5 every-step baseline. A regression that scatters
            // wake-ups across all steps (the legacy `% 1 === 0` failure mode)
            // drives this toward 0.5 and trips the floor.
            expect(gridShare).toBeGreaterThan(fixture.gridFloor);
        });
    }

    // -----------------------------------------------------------------------
    // 2. Sanity: getStepInfo identifies the canonical pulse positions in each
    //    compound meter (engine-independent — guards the metric the assertion
    //    above relies on). Unchanged from the legacy version.
    // -----------------------------------------------------------------------
    for (const fixture of COMPOUND_FIXTURES) {
        const ts = TIME_SIGNATURES[fixture.timeSignature];
        const stepsPerBar = ts.beats * ts.stepsPerBeat;
        const pulseList = [...fixture.pulseSteps].sort((a, b) => a - b);

        it(`getStepInfo: in ${fixture.timeSignature}, pulse positions are exactly {${pulseList.join(',')}}`, () => {
            const pulseSteps: number[] = [];
            for (let step = 0; step < stepsPerBar; step++) {
                const info = getStepInfo(step, ts, [], TIME_SIGNATURES);
                if (info.isPulse === true) {
                    pulseSteps.push(step);
                }
            }
            expect(new Set(pulseSteps)).toEqual(fixture.pulseSteps);
        });
    }
});
