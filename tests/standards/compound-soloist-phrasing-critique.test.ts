// @ts-nocheck
/**
 * Compound-meter soloist phrasing critique (epic-1-compound-meter S6).
 *
 * The story flagged that `soloist-seeder.ts:674-720` is compound-aware (pulse-
 * driven cell generation) but the rest of the soloist pipeline had not been
 * audited. The S6 audit found a real bug at `soloist.ts:1685-1688`:
 *
 *     const isGoodEntry =
 *         isBeatStart ||
 *         (measureStep % (stepsPerBeat / 2) === 0 &&
 *             scrambleHash(callSeedBase + 50) < intentBehavior.syncopationBias);
 *
 * The syncopated-entry branch divides by `stepsPerBeat / 2`. In 6/8
 * (stepsPerBeat=2) that's `% 1 === 0` — ALWAYS TRUE — so phrase wake-up could
 * fire on every step, scattering phrase boundaries uniformly across the bar
 * instead of clustering them on the compound pulse positions {0, 6}.
 *
 * The fix (applied in S6) branches on `isCompound`:
 *   - Simple meters: strong = `isBeatStart`, syncopated branch on the 8th-grid.
 *   - Compound meters: strong = `stepInfo.isPulse` (steps 0, 6 in 6/8;
 *     0, 6, 12, 18 in 12/8). The syncopated branch is disabled because
 *     every step is already on the 8th-grid in compound.
 *
 * This test exercises `getSoloistNote` over many bars of 6/8 jazz, observes
 * when the soloist transitions out of `phrasing.isResting` (= phrase start),
 * records the measure-step of each transition, and asserts the distribution
 * clusters on the pulse positions — NOT on step 8 (the 4/4-style mid-bar
 * that the broken formula would have allowed at intensity-driven syncopated
 * wake-ups).
 *
 * Why the bug isn't visible in 4/4: in 4/4 (stepsPerBeat=4), the syncopated
 * branch is `measureStep % 2 === 0` — the 8th-grid (steps 0,2,4,...,14) — a
 * musically meaningful subset of the bar. In compound it degenerates to "any
 * step", which is the failure mode this test catches.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
}));

function buildState({
    style = 'jazz',
    intensity = 0.7,
    currentLoopCount = 2,
    timeSignature = '6/8',
} = {}) {
    const ts = TIME_SIGNATURES[timeSignature];
    const stepsPerBar = ts.beats * ts.stepsPerBeat;
    // why: a long active stretch + short rest stretch so we get many phrase
    // boundaries per ~hundred-bar simulation. activeSteps small so phrases end
    // often; restSteps small so the engine reaches the wake-up gate often.
    const soloist = makeSoloistMock({
        enabled: true,
        style,
        mode: 'monophonic',
        octave: 64,
        sessionSteps: 0,
        phrasingState: 'rest',
        isResting: true,
        restSteps: 1,
        activeSteps: 0,
        busySteps: 0,
        phraseContext: {
            role: 'call',
            skeleton: [],
            lastInterval: null,
            profile: 'miles',
            signature: null,
            responseSignature: null,
            responseMode: 'free',
            responseSource: 'free',
            sectionLabel: null,
            sectionOccurrence: 0,
        },
    });

    return {
        playback: {
            bandIntensity: intensity,
            bpm: 110,
            complexity: 0.6,
            intent: {},
            lyricalBias: 0.1,
            currentLoopCount,
        },
        groove: { genreFeel: 'Jazz', pocket: 0 },
        soloist,
        harmony: { enabled: false },
        arranger: {
            timeSignature,
            sectionMap: [{ start: 0, end: stepsPerBar * 64, label: 'A' }],
            totalSteps: stepsPerBar * 64,
        },
        chords: { enabled: true },
    };
}

/**
 * Drives `getSoloistNote` across `numBars` of the given compound meter and
 * records the measure-step at which `soloist.session.phrasing.isResting` flips
 * false (= phrase START).
 */
function collectPhraseStartMeasureSteps(numBars: number, opts: any = {}) {
    const timeSignature = opts.timeSignature || '6/8';
    const ts = TIME_SIGNATURES[timeSignature];
    const stepsPerBar = ts.beats * ts.stepsPerBeat;
    const state = buildState(opts);
    getState.mockReturnValue(state);
    const phr = state.soloist.session.phrasing;
    const phraseStartMeasureSteps: number[] = [];
    let wasResting = phr.isResting === true;

    const CMinor = { rootMidi: 60, quality: 'm', intervals: [0, 3, 7], beats: ts.beats };
    const G = { rootMidi: 67, quality: 'maj', intervals: [0, 4, 7], beats: ts.beats };
    const progression = [CMinor, G];

    const coordination = {
        sectionStart: 0,
        sectionEnd: stepsPerBar * numBars,
        step: 0,
    };

    for (let bar = 0; bar < numBars; bar++) {
        const chord = progression[bar % progression.length];
        for (let step = 0; step < stepsPerBar; step++) {
            const absStep = bar * stepsPerBar + step;
            const stepInfo = getStepInfo(absStep, ts, [], TIME_SIGNATURES);
            getSoloistNote(
                state,
                chord,
                chord,
                absStep,
                state.soloist.audio.lastFreq || 0,
                64,
                'miles',
                step,
                { ...coordination, step: absStep },
                stepInfo,
            );
            const isRestingNow = phr.isResting === true;
            if (wasResting && !isRestingNow) {
                phraseStartMeasureSteps.push(absStep % stepsPerBar);
            }
            wasResting = isRestingNow;
            state.soloist.session.sessionSteps++;
        }
    }

    return phraseStartMeasureSteps;
}

// why: tightened thresholds (P1-2 from S6 review). The pulse-share ≥ 60% is the
// real load-bearing assertion. The off-pulse ceilings were originally ≤ 8% and
// ≤ 20% — at/below the random-uniform baseline (1/12=8.3%, 3/12=25%) so they
// were structurally guaranteed rather than statistically discriminating.
// Post-fix the strong branch fires only on isPulse in compound and the
// syncopated branch is disabled, so non-pulse phrase starts can ONLY come from
// the proactive lead-in path (last eighth of the bar) — which lands on step
// 11 (6/8) or step 23 (12/8), not on the 4/4-style sites we're guarding.
// 2% is well below the 8.3% baseline and lets the assertion actually catch a
// regression that re-opens the syncopated branch in compound.
const COMPOUND_PHRASE_PULSE_SHARE_MIN = 0.6;
const COMPOUND_PHRASE_OFF_PULSE_CEILING = 0.02;

// why: per TIME_SIGNATURES — dotted-quarter pulses + the 4/4-style mid-bar
// sentinels that the broken `% 1 === 0` syncopated formula would have allowed
// pre-S6. For each compound meter we name:
//   - PULSE_STEPS: set the post-fix engine SHOULD cluster phrase-starts on.
//   - OFF_PULSE_4_4_LIKE: 4/4-derived sentinel slots (mid-bar, "beat 3" of a
//     hypothetical 4/4 reading, etc.) that should stay near zero. We pick
//     positions ≥ 2 steps away from any pulse so the proactive lead-in path
//     (last eighth of the bar) doesn't bleed into the count.
type CompoundFixture = {
    timeSignature: string;
    pulseSteps: ReadonlySet<number>;
    offPulse44Like: readonly number[];
};
const COMPOUND_FIXTURES: readonly CompoundFixture[] = [
    {
        timeSignature: '6/8',
        pulseSteps: new Set([0, 6]),
        offPulse44Like: [2, 4, 8],
    },
    {
        timeSignature: '12/8',
        pulseSteps: new Set([0, 6, 12, 18]),
        offPulse44Like: [2, 4, 8, 14, 16, 20],
    },
];

describe('compound-soloist: phrase boundaries align to pulse (S6)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // 1. The Big One: phrase START steps in 6/8 and 12/8 cluster on pulse
    //    positions, NOT on the 4/4-style sentinel slots.
    //
    //    Pre-S6 the syncopated branch at soloist.ts:1685 degenerated to
    //    `measureStep % 1 === 0` (always true) in compound, so wake-up could
    //    fire on every step. The fix gates the strong branch on
    //    `stepInfo.isPulse` in compound and disables the syncopated branch.
    // -----------------------------------------------------------------------
    for (const fixture of COMPOUND_FIXTURES) {
        const ts = TIME_SIGNATURES[fixture.timeSignature];
        const stepsPerBar = ts.beats * ts.stepsPerBeat;
        const pulseList = [...fixture.pulseSteps].sort((a, b) => a - b);

        it(`jazz ${fixture.timeSignature}: phrase-starts cluster on pulse {${pulseList.join(',')}}, not on 4/4-style sites`, () => {
            // why: sweep three intensity bands to broaden the sample without
            // flaking on phrase-count. Rest-length roll varies per-step via
            // scrambleHash; pooling intensities yields a robust sample.
            const numBars = 400;
            const starts = [
                ...collectPhraseStartMeasureSteps(numBars, {
                    intensity: 0.55,
                    timeSignature: fixture.timeSignature,
                }),
                ...collectPhraseStartMeasureSteps(numBars, {
                    intensity: 0.75,
                    timeSignature: fixture.timeSignature,
                }),
                ...collectPhraseStartMeasureSteps(numBars, {
                    intensity: 0.9,
                    timeSignature: fixture.timeSignature,
                }),
            ];

            expect(starts.length).toBeGreaterThan(20);

            const hist = new Array(stepsPerBar).fill(0);
            for (const s of starts) {
                hist[s]++;
            }

            const totalHits = starts.length;
            const pulseHits = pulseList.reduce((acc, s) => acc + hist[s], 0);
            const pulseShare = pulseHits / totalHits;
            const offPulseHits = fixture.offPulse44Like.reduce((acc, s) => acc + hist[s], 0);
            const offPulseShare = offPulseHits / totalHits;

            console.log(`\n--- COMPOUND SOLOIST PHRASING CRITIQUE (${fixture.timeSignature}) ---`);
            console.log(`Total phrase starts: ${totalHits} over ${numBars} bars`);
            console.log(`[Histogram by mStep] ${hist.map((c, i) => `${i}:${c}`).join('  ')}`);
            console.log(
                `[Pulse share]    ${(pulseShare * 100).toFixed(1)}% on {${pulseList.join(',')}} (target ≥ ${(COMPOUND_PHRASE_PULSE_SHARE_MIN * 100).toFixed(0)}%)`,
            );
            console.log(
                `[4/4-style off]  ${(offPulseShare * 100).toFixed(1)}% on {${fixture.offPulse44Like.join(',')}} (target ≤ ${(COMPOUND_PHRASE_OFF_PULSE_CEILING * 100).toFixed(0)}%)`,
            );

            // The dominant cluster must be the pulse.
            expect(pulseShare).toBeGreaterThanOrEqual(COMPOUND_PHRASE_PULSE_SHARE_MIN);

            // 4/4-derived sentinel slots together should be a near-zero
            // minority — well below the random-uniform baseline. A regression
            // re-opening the syncopated branch in compound would scatter
            // wake-ups here and break this assertion.
            expect(offPulseShare).toBeLessThanOrEqual(COMPOUND_PHRASE_OFF_PULSE_CEILING);
        });
    }

    // -----------------------------------------------------------------------
    // 2. Sanity: getStepInfo identifies the canonical pulse positions in each
    //    compound meter. A regression in getStepInfo would silently slacken
    //    assertion (1); this test guards against that.
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
