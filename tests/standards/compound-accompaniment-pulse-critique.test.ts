// @ts-nocheck
/**
 * Compound-meter accompaniment pulse-density critique (epic-1-compound-meter S3).
 *
 * Before S3, accompaniment.ts had three 4/4-shaped fallbacks:
 *
 *   1. `handleSustainEvents` line ~1483:
 *        `const isBeat = stepInfo ? stepInfo.isBeatStart : measureStep % 4 === 0`
 *      In 6/8 this would fire on steps 0, 4, 8 (4/4 quarter positions) instead
 *      of the dotted-quarter pulses at steps 0 and 6.
 *
 *   2. `getAccompanimentNotes` line ~1834:
 *        `const isBeatStart = stepInfo ? stepInfo.isBeatStart : measureStep % 4 === 0`
 *      Same wrong fallback — used to gate bass/chord coordination logic.
 *
 *   3. `strum-country` ghost-strum gate:
 *        `measureStep % 4 !== 0` → replaced with `!isBeatStart` so ghost strums
 *      respect the actual TS beat grid rather than a hardcoded 4.
 *
 *   4. Bossa Nova `spb === 4` gate:
 *        Previously the compound-meter guard was implicit — 6/8 has spb=2, so
 *      `spb === 4` was always false and the Bossa path was silently skipped.
 *      Now made explicit: `!ts.isCompound && ts.beats >= 4 && spb === 4` with a
 *      comment that partido-alto is a 4/4 16th-note idiom.
 *
 * This test verifies that in Jazz 6/8, `generateCompingPattern` places hits
 * predominantly on the dotted-quarter pulse positions (steps 0 and 6) rather than
 * on 4/4-derived beat positions (steps 2, 8, 14 — the "and-of-N" positions in a
 * wrongly-applied 4/4 grid).
 *
 * After S3 review, `accompaniment.ts` exposes a dedicated `COMPOUND_COMPING_CELLS`
 * bank for compound meters with pulse-aware cells: [0,6], [0,6,10], [6,10],
 * [0,4,6], [10]. Step 14 is unreachable in a 12-step 6/8 bar; the new bank
 * doesn't include it. Off-pulse hits in the new bank (steps 4 and 10) are
 * intentional 6/8 anticipation, not 4/4-derived offbeats.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { generateCompingPattern } from '../../public/engine/accompaniment.js';
import { getState } from '../../public/state.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
}));

const SIX_EIGHT = TIME_SIGNATURES['6/8'];
const STEPS_PER_BAR_6_8 = SIX_EIGHT.beats * SIX_EIGHT.stepsPerBeat; // 12
// why: 6/8 dotted-quarter pulses are at steps 0 and 6 (per TIME_SIGNATURES['6/8'].pulse)
const PULSE_STEPS = new Set([0, 6]);

function buildJazzState() {
    return {
        playback: { bandIntensity: 0.6, complexity: 0.5 },
        groove: { genreFeel: 'Jazz', pocket: 0 },
        arranger: { timeSignature: '6/8' },
    };
}

describe('compound-accompaniment: 6/8 pulse density (S3)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        getState.mockReturnValue(buildJazzState());
    });

    // -----------------------------------------------------------------------
    // 1. Pulse steps (0, 6) receive more hits than non-pulse steps across many bars.
    //    Sweeps sectionIds and barIndices to exercise all Jazz comping cells.
    // -----------------------------------------------------------------------
    it('Jazz 6/8: dense pulse landing, no silent bars, no 4/4-derived offbeats', () => {
        // why: S3 review caught that the 4/4-shaped JAZZ_COMPING_CELLS produced
        //      ~19% silent bars (cell [14] dropped entirely) and ~17% step-8 hits
        //      (a 4/4-derived offbeat that fights the 6/8 pulse). The fix routes
        //      compound meters to COMPOUND_COMPING_CELLS — pulse-aware cells
        //      built around the 6/8 grid (pulses at 0, 6; anticipation at 10).
        //      This test guards three musical claims:
        //        (a) Pulse share ≥ 60% — most hits land on the dotted-quarter
        //            pulse; the rest are intentional 6/8 anticipation cells
        //            (steps 4, 10) — not 4/4-derived offbeats.
        //        (b) Silent-bar rate < 5% — no cell collapses to zero hits.
        //        (c) 4/4-derived offbeat hits < 10% — steps {2, 8, 14} (the 4/4
        //            "and-of-N" positions that aren't 6/8-idiomatic) are rare.
        const sectionIds = ['A', 'B', 'C', 'verse', 'chorus', 'bridge', 'intro', 'outro'];
        const FOUR_FOUR_DERIVED_OFFBEATS = new Set([2, 8, 14]);
        let pulseHits = 0;
        let fourFourDerivedHits = 0;
        let totalHits = 0;
        let totalBars = 0;
        let silentBars = 0;

        for (const sectionId of sectionIds) {
            for (let barIndex = 0; barIndex < 25; barIndex++) {
                const pattern = generateCompingPattern(
                    getState(),
                    'Jazz',
                    'balanced',
                    SIX_EIGHT,
                    STEPS_PER_BAR_6_8,
                    barIndex,
                    sectionId,
                );
                totalBars++;
                let barHits = 0;
                for (let step = 0; step < STEPS_PER_BAR_6_8; step++) {
                    if (pattern[step] === 1) {
                        totalHits++;
                        barHits++;
                        if (PULSE_STEPS.has(step)) {
                            pulseHits++;
                        }
                        if (FOUR_FOUR_DERIVED_OFFBEATS.has(step)) {
                            fourFourDerivedHits++;
                        }
                    }
                }
                if (barHits === 0) {
                    silentBars++;
                }
            }
        }

        const pulseRatio = totalHits > 0 ? pulseHits / totalHits : 0;
        const fourFourDerivedRatio = totalHits > 0 ? fourFourDerivedHits / totalHits : 0;
        const silentBarRatio = totalBars > 0 ? silentBars / totalBars : 0;

        // Critique Report (visible without re-running probes)
        console.log(
            `[compound-accompaniment Jazz 6/8] bars=${totalBars} hits=${totalHits} ` +
                `pulse=${(pulseRatio * 100).toFixed(1)}% ` +
                `4/4-derived=${(fourFourDerivedRatio * 100).toFixed(1)}% ` +
                `silent-bars=${(silentBarRatio * 100).toFixed(1)}%`,
        );

        expect(pulseRatio).toBeGreaterThanOrEqual(0.6);
        expect(fourFourDerivedRatio).toBeLessThan(0.1);
        expect(silentBarRatio).toBeLessThan(0.05);
    });

    // -----------------------------------------------------------------------
    // 2. Bar-level: each generated pattern respects the 12-step boundary.
    // -----------------------------------------------------------------------
    it('Jazz 6/8: no hits beyond step 11 (12-step bar bound)', () => {
        // why: COMPOUND_COMPING_CELLS uses step indices in {0, 4, 6, 10}. All
        //      fall within the 12-step 6/8 bar. This test guards against any
        //      future cell that strays out of bounds (the old JAZZ_COMPING_CELLS
        //      bank had `[14]` which silently dropped — `hit()` gates
        //      `step < length`).
        const sectionIds = ['A', 'B', 'C', 'verse', 'chorus'];
        for (const sectionId of sectionIds) {
            for (let barIndex = 0; barIndex < 20; barIndex++) {
                const pattern = generateCompingPattern(
                    getState(),
                    'Jazz',
                    'balanced',
                    SIX_EIGHT,
                    STEPS_PER_BAR_6_8,
                    barIndex,
                    sectionId,
                );
                // why: pattern length must equal 12; step 14 is not reachable
                expect(pattern.length).toBe(12);
                for (let step = 0; step < STEPS_PER_BAR_6_8; step++) {
                    expect(pattern[step]).toBeOneOf([0, 1]);
                }
            }
        }
    });

    // -----------------------------------------------------------------------
    // 3. Bossa Nova in 6/8 routes through the compound-meter bank.
    //    The partido-alto gate requires `!ts.isCompound`, so 6/8 Bossa falls
    //    to the Jazz branch — which itself picks COMPOUND_COMPING_CELLS.
    // -----------------------------------------------------------------------
    it('Bossa Nova 6/8: uses compound-meter cell bank (no out-of-bounds hits)', () => {
        // why: epic-1-compound-meter S3 made the `!ts.isCompound` guard explicit.
        //      Before the fix, Bossa in 6/8 silently skipped the partido-alto branch
        //      (spb===4 was false) and also skipped the Jazz branch (genre===Bossa),
        //      falling through to the generic fallback. Now Bossa in 6/8 routes
        //      through the Jazz path → COMPOUND_COMPING_CELLS. Verify valid
        //      12-step patterns with no out-of-range steps.
        getState.mockReturnValue({
            playback: { bandIntensity: 0.6, complexity: 0.5 },
            groove: { genreFeel: 'Bossa Nova', pocket: 0 },
            arranger: { timeSignature: '6/8' },
        });

        for (let barIndex = 0; barIndex < 20; barIndex++) {
            const pattern = generateCompingPattern(
                getState(),
                'Bossa Nova',
                'balanced',
                SIX_EIGHT,
                STEPS_PER_BAR_6_8,
                barIndex,
                'verse',
            );
            expect(pattern.length).toBe(12);
            for (let step = 0; step < STEPS_PER_BAR_6_8; step++) {
                expect(pattern[step]).toBeOneOf([0, 1]);
            }
        }
    });

    // -----------------------------------------------------------------------
    // 4. Bossa Nova stays in 4/4 — partido-alto cells fire correctly.
    //    The `!ts.isCompound` guard must not break the 4/4 Bossa path.
    // -----------------------------------------------------------------------
    it('Bossa Nova 4/4: partido-alto still fires (step 14 present)', () => {
        // why: regression guard — S3 adds `!ts.isCompound` to the Bossa gate.
        //      Confirm that 4/4 Bossa (the canonical case) still enters the
        //      partido-alto branch. Every BOSSA_PARTIDO_ALTO_CELLS entry ends on
        //      step 14 (anticipation-of-1). The 4/4 pattern is 16 steps long
        //      so step 14 is reachable and must fire.
        getState.mockReturnValue({
            playback: { bandIntensity: 0.6, complexity: 0.5 },
            groove: { genreFeel: 'Bossa Nova', pocket: 0 },
            arranger: { timeSignature: '4/4' },
        });

        const FOUR_FOUR = TIME_SIGNATURES['4/4'];
        let step14Count = 0;
        const sectionIds = ['A', 'B', 'C', 'verse', 'chorus', 'bridge', 'intro', 'outro'];

        for (const sectionId of sectionIds) {
            for (let barIndex = 0; barIndex < 8; barIndex++) {
                const pattern = generateCompingPattern(
                    getState(),
                    'Bossa Nova',
                    'balanced',
                    FOUR_FOUR,
                    16,
                    barIndex,
                    sectionId,
                );
                if (pattern[14] === 1) {
                    step14Count++;
                }
            }
        }

        // why: every BOSSA_PARTIDO_ALTO_CELLS entry includes step 14, so
        //      step 14 should fire in every bar. 64 bars × 100% = 64 expected.
        expect(step14Count).toBe(64);
    });
});
