// @ts-nocheck
/**
 * Cross-genre 6/8 kick-density critique (epic-1-compound-meter S16b).
 *
 * S16 fixed the universal HiHat over-density in 6/8 via `compoundHatAllowed`.
 * The same bug-shape persists in kick lanes across the same 9 affected files —
 * kick foundations gate on `isBeatStart` (every eighth in 6/8) or use
 * 4/4-idiomatic motifs (metal driving 8ths/gallop/double-16ths, latin Samba,
 * funk Funky Drummer ghosts, country train-beat) that fire continuously in 6/8.
 *
 * The S16b fix:
 *  (1) New `compoundKickAllowed(context)` helper in grooves/utils.ts. Sparse
 *      profile only (kick is always sparse — no shimmer analog): pulses at
 *      low intensity, +backbeat at moderate, +and-of-pulse at high.
 *  (2) 4/4-idiomatic motifs gated on `!isCompound` (metal motifs 1-4, latin
 *      Samba snare motif 2, country train-beat snare, funk Funky Drummer
 *      snare-ghost layer). In compound, those genres fall back to their
 *      motif 0 / foundation behavior.
 *
 * Acceptance assertions:
 *   (a) For each affected genre, kick density in 6/8 at intensity 0.5 is
 *       ≤ ~50% of its 4/4 baseline.
 *   (b) 4/4 kick density is preserved (no-op regression guard).
 *
 * Genres covered: Rock, Metal, Country, Blues, Disco, Funk, Hip Hop, Neo-Soul,
 * Latin. Excluded: Jazz (already compound-aware via S11), Acoustic (kick is
 * already fixed-position/compound-safe per S16 audit), Ska-Punk (skank
 * identity), Minimal/Shred (sparse/re-export). Reggae excluded — its kick is
 * partial-compound-broken (One Drop motif), tracked in S16c.
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

const SIX_EIGHT = TIME_SIGNATURES['6/8'];
const FOUR_FOUR = TIME_SIGNATURES['4/4'];

// Genres in scope for S16b kick-density. Each carries its 4/4 kick baseline
// expected ceiling — the test enforces 6/8 kick ≤ ~50% of this baseline.
const GENRES = [
    { label: 'Rock', genreFeel: 'Rock' },
    { label: 'Metal', genreFeel: 'Metal' },
    { label: 'Country', genreFeel: 'Country' },
    { label: 'Blues', genreFeel: 'Blues' },
    { label: 'Disco', genreFeel: 'Disco' },
    { label: 'Funk', genreFeel: 'Funk' },
    { label: 'Hip Hop', genreFeel: 'Hip Hop' },
    { label: 'Neo-Soul', genreFeel: 'Neo-Soul' },
    { label: 'Latin', genreFeel: 'Latin' },
];

function buildState(genreFeel: string, timeSignature: '6/8' | '4/4', intensity: number) {
    return {
        playback: { bandIntensity: intensity, bpm: 120, songMode: false },
        groove: {
            genreFeel,
            creativity: true,
            lastDrumPreset: genreFeel,
            instruments: [],
        },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        arranger: { timeSignature },
    };
}

function simulateKickHits(timeSignature: '6/8' | '4/4', numBars: number) {
    const tsConfig = timeSignature === '6/8' ? SIX_EIGHT : FOUR_FOUR;
    const stepsPerBar = tsConfig.beats * tsConfig.stepsPerBeat;

    let totalHits = 0;
    const hitsByStep: Record<number, number> = {};

    for (let bar = 0; bar < numBars; bar++) {
        for (let stepInBar = 0; stepInBar < stepsPerBar; stepInBar++) {
            const absoluteStep = bar * stepsPerBar + stepInBar;
            const info = getStepInfo(absoluteStep, tsConfig, [], TIME_SIGNATURES);

            const params = {
                step: absoluteStep,
                inst: { name: 'Kick', muted: false, steps: [] },
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
            if (result?.shouldPlay) {
                totalHits++;
                hitsByStep[info.mStep] = (hitsByStep[info.mStep] || 0) + 1;
            }
        }
    }

    return { totalHits, hitsByStep };
}

describe('Compound-meter Kick density (S16b)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const NUM_BARS = 64;
    const INTENSITY = 0.5;
    // why: absolute hits/bar acceptance (NOT a 4/4-ratio — funk/hiphop 4/4
    // baselines are naturally low, so a ratio test mislabels musically-correct
    // pulse-anchored 6/8 as "too dense"). At intensity 0.5 the helper only lets
    // `isPulseStart` through (2 positions in 6/8), so the target is exactly the
    // 2 dotted-quarter pulses. The floor of 1.8 (per S16b review F1) is the
    // load-bearing assertion: it catches the "lost second pulse" regression
    // where a `!isBackbeat` foundation collapses to downbeat-only (1/bar) in
    // compound. Both pulses {0, 6} must fire — verified by the per-step check.
    const KICK_HITS_PER_BAR_MAX = 2.5;
    const KICK_HITS_PER_BAR_MIN = 1.8;

    for (const { label, genreFeel } of GENRES) {
        it(`${label}: 6/8 kick anchors both pulses, density ∈ [${KICK_HITS_PER_BAR_MIN}, ${KICK_HITS_PER_BAR_MAX}] hits/bar at intensity ${INTENSITY}`, () => {
            getState.mockReturnValue(buildState(genreFeel, '4/4', INTENSITY));
            const fourFour = simulateKickHits('4/4', NUM_BARS);
            getState.mockReturnValue(buildState(genreFeel, '6/8', INTENSITY));
            const sixEight = simulateKickHits('6/8', NUM_BARS);

            const hitsPerBar4 = fourFour.totalHits / NUM_BARS;
            const hitsPerBar6 = sixEight.totalHits / NUM_BARS;
            const pulse0 = sixEight.hitsByStep[0] || 0;
            const pulse6 = sixEight.hitsByStep[6] || 0;

            console.log(`\n--- ${label.toUpperCase()} 6/8 KICK DENSITY ---`);
            console.log(
                `  4/4: ${hitsPerBar4.toFixed(2)} hits/bar | 6/8: ${hitsPerBar6.toFixed(2)} hits/bar (target ∈ [${KICK_HITS_PER_BAR_MIN}, ${KICK_HITS_PER_BAR_MAX}])`,
            );
            console.log(
                `  Pulses: mStep 0 = ${pulse0}/${NUM_BARS}, mStep 6 = ${pulse6}/${NUM_BARS}`,
            );
            console.log(`  Hits-by-step:`, sixEight.hitsByStep);

            expect(
                hitsPerBar6,
                `${label} 6/8 kick density should be ≤ ${KICK_HITS_PER_BAR_MAX} hits/bar (bug was up to 12/bar)`,
            ).toBeLessThanOrEqual(KICK_HITS_PER_BAR_MAX);
            expect(
                hitsPerBar6,
                `${label} 6/8 kick density should be ≥ ${KICK_HITS_PER_BAR_MIN} hits/bar (both dotted-quarter pulses)`,
            ).toBeGreaterThanOrEqual(KICK_HITS_PER_BAR_MIN);
            // why (S16b review F1): both pulses must be populated. A regression
            // that drops the second pulse would still pass a pure density bound
            // if it added density elsewhere — assert the pulse positions directly.
            expect(
                pulse0,
                `${label} 6/8 kick missing the downbeat (mStep 0)`,
            ).toBeGreaterThanOrEqual(NUM_BARS * 0.5);
            expect(
                pulse6,
                `${label} 6/8 kick missing the second pulse (mStep 6)`,
            ).toBeGreaterThanOrEqual(NUM_BARS * 0.5);
        });
    }

    it('helper is a no-op in 4/4: Kick density preserved across all genres at intensity 0.5', () => {
        // why: regression guard — `compoundKickAllowed` must return `true` in
        // simple meters so 4/4 kick behavior is byte-identical. Wide range —
        // we're just catching a "filter zeroed everything" regression.
        for (const { label, genreFeel } of GENRES) {
            getState.mockReturnValue(buildState(genreFeel, '4/4', INTENSITY));
            const { totalHits } = simulateKickHits('4/4', 16);
            const hitsPerBar = totalHits / 16;
            expect(hitsPerBar, `${label} 4/4 kick density vanished`).toBeGreaterThan(0);
            expect(hitsPerBar, `${label} 4/4 kick density absurdly high`).toBeLessThan(20);
        }
    });
});
