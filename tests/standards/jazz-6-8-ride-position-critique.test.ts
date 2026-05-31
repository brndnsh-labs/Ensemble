// @ts-nocheck
/**
 * Jazz 6/8 ride skip-beat position critique (epic-1-compound-meter S11).
 *
 * Before this story, jazz.ts computed `isSkipBeat = stepInGroup === groupSteps - 1`
 * in the compound branch. In 6/8 (groupSteps=6) that placed the skip on
 * mStep ∈ {5, 11} — the final *sixteenth* of each dotted-quarter group.
 *
 * Idiomatic jazz 6/8 "spang-a-lang" places the skip on the *last eighth*
 * (the third eighth of each group, anticipating the next pulse):
 *   mStep ∈ {4, 10}  ← stepInGroup === groupSteps - 2
 *
 * After the fix, the ride pattern should cluster on:
 *   {0, 6}   — dotted-quarter pulses (isPulse)
 *   {4, 10}  — skip-beat anticipation (isSkipBeat, fixed)
 *
 * Acceptance assertions (see epic-1-compound-meter S11):
 *   (a) ≥ 90% of ride hits land on cluster steps {0, 4, 6, 10}.
 *   (b) ≤  5% of ride hits land on the old wrong positions {5, 11}.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

// why: 6/8 has 12 steps per bar (6 eighth-note beats × 1 step/eighth = 12 steps)
const SIX_EIGHT = TIME_SIGNATURES['6/8'];

// why: after S11 fix, the canonical ride cluster is pulses {0, 6} + skip-beats {4, 10}
const CLUSTER_STEPS = new Set([0, 4, 6, 10]);

// why: the old wrong positions (last 16th of each group) must now be nearly silent
const OLD_SKIP_STEPS = new Set([5, 11]);

function buildJazzState(timeSignature: string) {
    return {
        playback: { bandIntensity: 0.6, bpm: 120, songMode: false },
        groove: {
            genreFeel: 'Jazz',
            lastDrumPreset: 'Jazz',
            instruments: [],
        },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        arranger: { timeSignature },
    };
}

/**
 * Simulate a multi-bar jazz performance in a compound meter and collect ride hits.
 * Parameterized by tsConfig so the same harness covers 6/8 and 12/8.
 * Returns { totalRideHits, clusterHits, oldSkipHits, hitsByStep }.
 */
function simulateRideHits(
    numBars: number,
    tsConfig: { beats: number; stepsPerBeat: number },
    clusterSteps: Set<number>,
    oldSkipSteps: Set<number>,
) {
    const stepsPerBar = tsConfig.beats * tsConfig.stepsPerBeat;
    let totalRideHits = 0;
    let clusterHits = 0;
    let oldSkipHits = 0;
    const hitsByStep: Record<number, number> = {};

    for (let bar = 0; bar < numBars; bar++) {
        for (let stepInBar = 0; stepInBar < stepsPerBar; stepInBar++) {
            const absoluteStep = bar * stepsPerBar + stepInBar;

            // why: use getStepInfo with the actual compound tsConfig and TIME_SIGNATURES
            // map so isCompound, stepInGroup, groupIndex, isPulse are all populated
            // correctly — the production path does the same via tick-logic.ts.
            const info = getStepInfo(absoluteStep, tsConfig, [], TIME_SIGNATURES);

            const params = {
                step: absoluteStep,
                inst: { name: 'Open', muted: false, steps: [] },
                stepVal: 0,
                playback: getState().playback,
                groove: getState().groove,
                isDownbeat: info.isMeasureStart,
                isBeatStart: info.isBeatStart,
                isPulse: info.isPulse,
                isPulseStart: info.isPulseStart,
                isGroupStart: info.isGroupStart,
                isBackbeat: info.isBackbeat,
                isOffbeat: info.isOffbeat,
                isEOfBeat: info.isEOfBeat,
                isAOfBeat: info.isAOfBeat,
                beatIndex: info.beatIndex,
                tsConfig: info.tsConfig,
                mStep: info.mStep,
                isCompound: info.isCompound,
                stepInGroup: info.stepInGroup,
                groupIndex: info.groupIndex,
                sectionOccurrence: 0,
                isFinalMeasure: false,
            };

            const result = applyGrooveOverrides(getState(), params);

            if (result.shouldPlay) {
                totalRideHits++;
                const mStep = info.mStep;
                hitsByStep[mStep] = (hitsByStep[mStep] || 0) + 1;
                if (clusterSteps.has(mStep)) {
                    clusterHits++;
                }
                if (oldSkipSteps.has(mStep)) {
                    oldSkipHits++;
                }
            }
        }
    }

    return { totalRideHits, clusterHits, oldSkipHits, hitsByStep };
}

describe('Jazz 6/8 Ride Skip-Beat Position (S11)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        getState.mockReturnValue(buildJazzState('6/8'));
    });

    it('ride hits cluster on {0,4,6,10} ≥ 90% and avoid old positions {5,11} ≤ 5% (128 bars)', () => {
        // why: 128 bars provides a wide statistical window across sectionSeed
        // variation to ensure the threshold is robust, not dependent on a
        // lucky seed. The skip-beat has a probability gate of
        // `0.6 + drumComplexity * 0.3` ≈ 0.84 at intensity 0.6 + creativity,
        // so cluster coverage is high but not always 100%.
        const numBars = 128;
        const { totalRideHits, clusterHits, oldSkipHits, hitsByStep } = simulateRideHits(
            numBars,
            SIX_EIGHT,
            CLUSTER_STEPS,
            OLD_SKIP_STEPS,
        );

        const clusterRatio = totalRideHits > 0 ? clusterHits / totalRideHits : 0;
        const oldSkipRatio = totalRideHits > 0 ? oldSkipHits / totalRideHits : 0;

        console.log('\n--- JAZZ 6/8 RIDE POSITION CRITIQUE REPORT ---');
        console.log(`[Bars]          ${numBars}`);
        console.log(`[Total Ride Hits] ${totalRideHits}`);
        console.log(
            `[Cluster {0,4,6,10}] ${clusterHits} hits = ${(clusterRatio * 100).toFixed(1)}% (Target: ≥ 90%)`,
        );
        console.log(
            `[Old skip {5,11}]    ${oldSkipHits} hits = ${(oldSkipRatio * 100).toFixed(1)}% (Target: ≤ 5%)`,
        );
        console.log('[Hits by mStep]', hitsByStep);
        console.log('-----------------------------------------------\n');

        // CRITICAL: canonical spang-a-lang positions dominate
        expect(clusterRatio).toBeGreaterThanOrEqual(0.9);

        // CRITICAL: old wrong positions (last 16th of each group) must be rare
        expect(oldSkipRatio).toBeLessThanOrEqual(0.05);
    });

    it('ride hits are non-trivially dense (at least 2 hits per bar on average)', () => {
        // why: guards against a degenerate fix that makes isRideStep never fire.
        // Canonical jazz 6/8 ride fires on all 4 cluster positions per bar
        // with the pulse positions at probability 1.0 and skip at ~0.84.
        // Expected ~3.7 hits/bar at intensity 0.6.
        const numBars = 64;
        const { totalRideHits } = simulateRideHits(
            numBars,
            SIX_EIGHT,
            CLUSTER_STEPS,
            OLD_SKIP_STEPS,
        );
        const hitsPerBar = totalRideHits / numBars;

        console.log(`[Jazz 6/8 Ride Density] ${hitsPerBar.toFixed(2)} hits/bar (Target: ≥ 2.0)`);

        expect(hitsPerBar).toBeGreaterThanOrEqual(2.0);
    });
});

// epic-1-compound-meter S11 follow-up: the S11 fix (`groupSteps - 2`) is
// meter-agnostic, so 12/8 (compound-quadruple, grouping [3,3,3,3], 24 steps)
// should place the spang-a-lang skip on the last eighth of each group too.
// Cluster = pulses {0,6,12,18} + skip-beats {4,10,16,22}; old wrong positions
// (last 16th of each group) = {5,11,17,23}.
describe('Jazz 12/8 Ride Skip-Beat Position (S11 follow-up)', () => {
    const TWELVE_EIGHT = TIME_SIGNATURES['12/8'];
    const CLUSTER_12_8 = new Set([0, 4, 6, 10, 12, 16, 18, 22]);
    const OLD_SKIP_12_8 = new Set([5, 11, 17, 23]);

    beforeEach(() => {
        vi.restoreAllMocks();
        getState.mockReturnValue(buildJazzState('12/8'));
    });

    it('ride hits cluster on {0,4,6,10,12,16,18,22} ≥ 90% and avoid {5,11,17,23} ≤ 5% (128 bars)', () => {
        const numBars = 128;
        const { totalRideHits, clusterHits, oldSkipHits, hitsByStep } = simulateRideHits(
            numBars,
            TWELVE_EIGHT,
            CLUSTER_12_8,
            OLD_SKIP_12_8,
        );

        const clusterRatio = totalRideHits > 0 ? clusterHits / totalRideHits : 0;
        const oldSkipRatio = totalRideHits > 0 ? oldSkipHits / totalRideHits : 0;

        console.log('\n--- JAZZ 12/8 RIDE POSITION CRITIQUE REPORT ---');
        console.log(
            `[Cluster] ${clusterHits}/${totalRideHits} = ${(clusterRatio * 100).toFixed(1)}% (Target: ≥ 90%)`,
        );
        console.log(
            `[Old skip {5,11,17,23}] ${oldSkipHits} = ${(oldSkipRatio * 100).toFixed(1)}% (Target: ≤ 5%)`,
        );
        console.log('[Hits by mStep]', hitsByStep);
        console.log('-----------------------------------------------\n');

        expect(clusterRatio).toBeGreaterThanOrEqual(0.9);
        expect(oldSkipRatio).toBeLessThanOrEqual(0.05);
    });

    it('ride hits are non-trivially dense (≥ 2 hits per bar on average)', () => {
        const numBars = 64;
        const { totalRideHits } = simulateRideHits(
            numBars,
            TWELVE_EIGHT,
            CLUSTER_12_8,
            OLD_SKIP_12_8,
        );
        const hitsPerBar = totalRideHits / numBars;
        console.log(`[Jazz 12/8 Ride Density] ${hitsPerBar.toFixed(2)} hits/bar (Target: ≥ 2.0)`);
        expect(hitsPerBar).toBeGreaterThanOrEqual(2.0);
    });
});
