// @ts-nocheck
/**
 * Reggae One Drop + Latin Partido Alto/Samba 6/8 critique (epic-1-compound-meter S16c).
 *
 * S16/S16b shipped universal hat + kick density filters, but two genres carried
 * *partial* compound-awareness — some motifs already used `isPulseStart`, others
 * still used 4/4-idiomatic predicates. S16c finishes them:
 *
 *  REGGAE (`grooves/reggae.ts`) — premise correction: the One Drop motif (kick on
 *    `isBackbeat && isBeatStart`) is actually CORRECT in 6/8. `isBackbeat` resolves
 *    to mStep 6 only (compound branch: `isGroupStart && backbeat.includes(groupIndex)`,
 *    backbeat [1]), so the drop lands on the second dotted-quarter pulse with beat 1
 *    silent — the genre's defining feature. The real defect was the Rockers motif
 *    (motif 2) combining every offbeat → 8 kicks/bar, and reggae kick having no
 *    `compoundKickAllowed` filter at all (skipped in S16b). Fix: add the filter.
 *
 *  LATIN (`grooves/latin.ts`) — the Partido Alto motif (motif 3) used a 4/4 2-bar
 *    offbeat clave that produced a 7-hits-vs-1-hit bar split in 6/8. Gated on
 *    `!isCompound` (consistent with the Samba decision from S16b); this also closes
 *    a latent S16b fall-through where Samba (motif 2) in compound dropped into the
 *    Partido Alto `else`. Compound latin snare/clave now comes from the
 *    'Afro-Cuban 6/8' drum preset, not the generic genre strategy.
 *
 * Acceptance:
 *   (a) Reggae One Drop: the drop (mStep 6) is universal across bars; beat 1
 *       (mStep 0) is NOT — One Drop bars keep it silent. Kick density bounded.
 *   (b) Reggae at high intensity: the Rockers over-density (was ~3.25/bar mean,
 *       8/bar on Rockers bars) is trimmed by the new filter.
 *   (c) Latin Partido Alto/Samba in 6/8: no 7-vs-1 bar split — even-bar vs
 *       odd-bar snare density is symmetric, and no bar is over-dense.
 *   (d) Latin 4/4 snare preserved (no-op regression guard).
 */

import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';
import { installSeededRandom } from '../utils/seeded-random.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

// Deterministic Math.random so `roll()`-driven ghost notes (latin offbeat
// embellishments, reggae shuffle) don't flake the density bounds.
installSeededRandom();

const SIX_EIGHT = TIME_SIGNATURES['6/8'];
const FOUR_FOUR = TIME_SIGNATURES['4/4'];
const NUM_BARS = 64;

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

function simulateHits(instName: string, timeSignature: '6/8' | '4/4', numBars: number) {
    const tsConfig = timeSignature === '6/8' ? SIX_EIGHT : FOUR_FOUR;
    const stepsPerBar = tsConfig.beats * tsConfig.stepsPerBeat;

    let totalHits = 0;
    const hitsByStep: Record<number, number> = {};
    const hitsByBar: number[] = new Array(numBars).fill(0);

    for (let bar = 0; bar < numBars; bar++) {
        for (let stepInBar = 0; stepInBar < stepsPerBar; stepInBar++) {
            const absoluteStep = bar * stepsPerBar + stepInBar;
            const info = getStepInfo(absoluteStep, tsConfig, [], TIME_SIGNATURES);

            const params = {
                step: absoluteStep,
                inst: { name: instName, muted: false, steps: [] },
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
                hitsByBar[bar]++;
            }
        }
    }

    return { totalHits, hitsByStep, hitsByBar };
}

describe('Compound-meter Reggae + Latin (S16c)', () => {
    it('(a) Reggae One Drop: the drop (mStep 6) is universal, beat 1 (mStep 0) is conditionally silent', () => {
        // Intensity 0.4 (> INTENSITY_BANDS.LOW 0.35, < 0.7) → motif 0 (One Drop,
        // seed < 0.6) / motif 1 (Steppers) only. One Drop hits the drop at mStep 6
        // and leaves beat 1 silent; Steppers adds mStep 0. So mStep 6 fires every
        // bar while mStep 0 fires only on Steppers bars.
        getState.mockReturnValue(buildState('Reggae', '6/8', 0.4));
        const { totalHits, hitsByStep } = simulateHits('Kick', '6/8', NUM_BARS);
        const hitsPerBar = totalHits / NUM_BARS;
        const pulse0 = hitsByStep[0] || 0;
        const pulse6 = hitsByStep[6] || 0;

        console.log('\n--- REGGAE ONE DROP 6/8 (intensity 0.4) ---');
        console.log(
            `  ${hitsPerBar.toFixed(2)} kicks/bar | mStep 0 = ${pulse0}/${NUM_BARS}, mStep 6 = ${pulse6}/${NUM_BARS}`,
        );
        console.log('  Hits-by-step:', hitsByStep);

        expect(
            hitsPerBar,
            'One Drop/Steppers kick density should be sparse (≤ 2.1/bar)',
        ).toBeLessThanOrEqual(2.1);
        expect(pulse6, 'the drop (mStep 6) should fire nearly every bar').toBeGreaterThanOrEqual(
            NUM_BARS * 0.95,
        );
        expect(
            pulse0,
            'beat 1 (mStep 0) must be conditionally silent — One Drop preserves it',
        ).toBeLessThan(pulse6);
    });

    it('(b) Reggae high-intensity: Rockers over-density is trimmed by compoundKickAllowed', () => {
        // At intensity 0.9 the Rockers motif (motif 2) is reachable and pre-fix
        // combined every offbeat → 8 kicks/bar (mean ~3.25 across motifs). The new
        // filter trims Rockers to the two dotted-quarter pulses {0,6}: its source
        // predicate emits only odd-step offbeats {1,3,5,7,9,11}, none of which is
        // the and-of-pulse slot {4,10}, so the filter's high-intensity tier is
        // inert here and the reachable ceiling is exactly 2/bar (not 4). The mean
        // lands ~1.75/bar across the motif mix.
        getState.mockReturnValue(buildState('Reggae', '6/8', 0.9));
        const { totalHits, hitsByStep, hitsByBar } = simulateHits('Kick', '6/8', NUM_BARS);
        const hitsPerBar = totalHits / NUM_BARS;
        const maxBar = Math.max(...hitsByBar);

        console.log('\n--- REGGAE HIGH-INTENSITY 6/8 KICK (intensity 0.9) ---');
        console.log(`  ${hitsPerBar.toFixed(2)} kicks/bar | max bar = ${maxBar}`);
        console.log('  Hits-by-step:', hitsByStep);

        expect(
            hitsPerBar,
            'Rockers must be trimmed (was ~3.25/bar mean, 8/bar on Rockers bars)',
        ).toBeLessThanOrEqual(2.75);
        expect(
            maxBar,
            'Rockers must collapse to the two pulses — reachable ceiling is 2/bar',
        ).toBeLessThanOrEqual(2);
    });

    it('(c) Latin Partido Alto/Samba: no 7-vs-1 bar split in 6/8', () => {
        // Pre-fix the Partido Alto motif gave bar-1 = 7 hits, bar-2 = 1 hit (and
        // Samba fell through into the same block). Gated off in compound → the only
        // remaining snare is symmetric offbeat ghosts (motif 0/1) + turnarounds.
        getState.mockReturnValue(buildState('Latin', '6/8', 0.9));
        const { totalHits, hitsByBar } = simulateHits('Snare', '6/8', NUM_BARS);
        const hitsPerBar = totalHits / NUM_BARS;
        const maxBar = Math.max(...hitsByBar);

        // Latin uses 2-bar seed stability → even bars = clave bar-1, odd bars = bar-2.
        let evenSum = 0;
        let oddSum = 0;
        for (let i = 0; i < hitsByBar.length; i++) {
            if (i % 2 === 0) {
                evenSum += hitsByBar[i];
            } else {
                oddSum += hitsByBar[i];
            }
        }
        const evenMean = evenSum / (NUM_BARS / 2);
        const oddMean = oddSum / (NUM_BARS / 2);

        console.log('\n--- LATIN PARTIDO/SAMBA 6/8 SNARE (intensity 0.9) ---');
        console.log(`  ${hitsPerBar.toFixed(2)} snare/bar | max bar = ${maxBar}`);
        console.log(
            `  even-bar mean = ${evenMean.toFixed(2)}, odd-bar mean = ${oddMean.toFixed(2)} (was 7 vs 1)`,
        );

        expect(
            hitsPerBar,
            'compound latin snare should be sparse (preset owns the 6/8 clave)',
        ).toBeLessThanOrEqual(3);
        expect(maxBar, 'no bar should carry the broken 7-hit Partido pattern').toBeLessThanOrEqual(
            6,
        );
        expect(
            Math.abs(evenMean - oddMean),
            'even-bar vs odd-bar density must be symmetric (the 7-vs-1 split is gone)',
        ).toBeLessThanOrEqual(1.5);
    });

    it('(d) Latin 4/4 snare preserved (no-op regression guard)', () => {
        getState.mockReturnValue(buildState('Latin', '4/4', 0.9));
        const { totalHits } = simulateHits('Snare', '4/4', 16);
        const hitsPerBar = totalHits / 16;
        console.log(`\n--- LATIN 4/4 SNARE: ${hitsPerBar.toFixed(2)} hits/bar ---`);
        expect(hitsPerBar, '4/4 latin snare (clave/cross-stick) should be alive').toBeGreaterThan(
            0.5,
        );
        expect(hitsPerBar, '4/4 latin snare density absurdly high').toBeLessThan(15);
    });
});
