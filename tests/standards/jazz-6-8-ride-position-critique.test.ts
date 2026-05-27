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
const STEPS_PER_BAR = SIX_EIGHT.beats * SIX_EIGHT.stepsPerBeat; // 12

// why: after S11 fix, the canonical ride cluster is pulses {0, 6} + skip-beats {4, 10}
const CLUSTER_STEPS = new Set([0, 4, 6, 10]);

// why: the old wrong positions (last 16th of each group) must now be nearly silent
const OLD_SKIP_STEPS = new Set([5, 11]);

function buildJazzState() {
    return {
        playback: { bandIntensity: 0.6, bpm: 120, songMode: false },
        groove: {
            genreFeel: 'Jazz',
            creativity: true,
            lastDrumPreset: 'Jazz',
            instruments: [],
        },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        arranger: { timeSignature: '6/8' },
    };
}

/**
 * Simulate a multi-bar jazz 6/8 performance and collect ride hits.
 * Returns { totalRideHits, clusterHits, oldSkipHits, hitsByStep }.
 */
function simulateRideHits(numBars: number) {
    let totalRideHits = 0;
    let clusterHits = 0;
    let oldSkipHits = 0;
    const hitsByStep: Record<number, number> = {};

    for (let bar = 0; bar < numBars; bar++) {
        for (let stepInBar = 0; stepInBar < STEPS_PER_BAR; stepInBar++) {
            const absoluteStep = bar * STEPS_PER_BAR + stepInBar;

            // why: use getStepInfo with the actual 6/8 tsConfig and TIME_SIGNATURES
            // map so isCompound, stepInGroup, groupIndex, isPulse are all populated
            // correctly — the production path does the same via tick-logic.ts.
            const info = getStepInfo(absoluteStep, SIX_EIGHT, [], TIME_SIGNATURES);

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
                if (CLUSTER_STEPS.has(mStep)) {
                    clusterHits++;
                }
                if (OLD_SKIP_STEPS.has(mStep)) {
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
        getState.mockReturnValue(buildJazzState());
    });

    it('ride hits cluster on {0,4,6,10} ≥ 90% and avoid old positions {5,11} ≤ 5% (128 bars)', () => {
        // why: 128 bars provides a wide statistical window across sectionSeed
        // variation to ensure the threshold is robust, not dependent on a
        // lucky seed. The skip-beat has a probability gate of
        // `0.6 + drumComplexity * 0.3` ≈ 0.84 at intensity 0.6 + creativity,
        // so cluster coverage is high but not always 100%.
        const numBars = 128;
        const { totalRideHits, clusterHits, oldSkipHits, hitsByStep } = simulateRideHits(numBars);

        const clusterRatio = totalRideHits > 0 ? clusterHits / totalRideHits : 0;
        const oldSkipRatio = totalRideHits > 0 ? oldSkipHits / totalRideHits : 0;

        // biome-ignore lint/suspicious/noConsole: critique-test report
        console.log('\n--- JAZZ 6/8 RIDE POSITION CRITIQUE REPORT ---');
        // biome-ignore lint/suspicious/noConsole: critique-test report
        console.log(`[Bars]          ${numBars}`);
        // biome-ignore lint/suspicious/noConsole: critique-test report
        console.log(`[Total Ride Hits] ${totalRideHits}`);
        // biome-ignore lint/suspicious/noConsole: critique-test report
        console.log(
            `[Cluster {0,4,6,10}] ${clusterHits} hits = ${(clusterRatio * 100).toFixed(1)}% (Target: ≥ 90%)`,
        );
        // biome-ignore lint/suspicious/noConsole: critique-test report
        console.log(
            `[Old skip {5,11}]    ${oldSkipHits} hits = ${(oldSkipRatio * 100).toFixed(1)}% (Target: ≤ 5%)`,
        );
        // biome-ignore lint/suspicious/noConsole: critique-test report
        console.log('[Hits by mStep]', hitsByStep);
        // biome-ignore lint/suspicious/noConsole: critique-test report
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
        const { totalRideHits } = simulateRideHits(numBars);
        const hitsPerBar = totalRideHits / numBars;

        // biome-ignore lint/suspicious/noConsole: critique-test report
        console.log(`[Jazz 6/8 Ride Density] ${hitsPerBar.toFixed(2)} hits/bar (Target: ≥ 2.0)`);

        expect(hitsPerBar).toBeGreaterThanOrEqual(2.0);
    });
});
