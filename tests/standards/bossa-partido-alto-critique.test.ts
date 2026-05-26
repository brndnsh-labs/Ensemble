// @ts-nocheck
/**
 * Bossa Partido-Alto Critique — epic-coordination-consistency S5.c
 *
 * Source: chords.md P0 #2 / epic-deterministic-phrasing S2 follow-up;
 *         epic-coordination-consistency.md S5.c.
 *
 * Before S5.c, Bossa shared the Jazz Charleston-family bank (`JAZZ_COMPING_CELLS`)
 * — a port-for-fidelity choice that preserved S2's determinism win but left
 * Bossa speaking Charleston dialect (flat-half-note pulse on steps 0 / 6,
 * occasional 14) instead of the partido-alto pattern that defines the genre.
 *
 * The canonical partido-alto figure is a 16th-note clave-derived cell with
 * step 14 (&-of-4) as its signature gesture — the &-of-4 anticipates beat 1
 * of the NEXT bar (anticipation-of-1), tied into the new chord's downbeat.
 *
 * Two claims to verify:
 *
 *   1. Anticipation-of-1: step 14 fires reliably across bars. Every Bossa cell
 *      now ends on step 14, so a bar-by-bar critique should see step 14 as one
 *      of the dominant hits. This is the strongest single signal that the
 *      partido-alto bank is in play and the Jazz Charleston bank is not.
 *
 *   2. Cell distinctness from Jazz: the per-bar hit patterns Bossa produces
 *      differ from what the Jazz bank would have produced on the same
 *      (sectionId, barIndex) inputs. Verifies the partido-alto bank has
 *      replaced the Jazz fallback rather than been a no-op alias.
 *
 * Determinism: cells are deterministic given (sectionId, barIndex >> 1).
 * No Math.random() needs to be stubbed for the picker itself; the 30-seed
 * reliability loop varies the sectionId hash input to sweep all 4 cells.
 *
 * Reliability budget: the picker is fully deterministic given inputs — every
 * trial within a sectionId is identical. The 30-seed sweep verifies that
 * anticipation-of-1 fires across ALL 4 cells (i.e. no cell is missing step
 * 14 in a regression).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { generateCompingPattern } from '../../public/engine/accompaniment.js';
import { getState } from '../../public/state.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
}));

const FOUR_FOUR = TIME_SIGNATURES['4/4'];

function buildState() {
    return {
        playback: { bandIntensity: 0.6, complexity: 0.5 },
        groove: { genreFeel: 'Bossa Nova', pocket: 0 },
        arranger: { timeSignature: '4/4' },
    };
}

describe('Bossa Partido-Alto Critique (S5.c)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        getState.mockReturnValue(buildState());
    });

    // -----------------------------------------------------------------------
    // 1. Anticipation-of-1 fires reliably — step 14 is the load-bearing
    //    gesture of partido-alto. Every cell includes it.
    // -----------------------------------------------------------------------
    it('every Bossa cell lands on step 14 (anticipation-of-1)', () => {
        // why: sweep all 4 cells by varying phraseIndex 0..7 (covers each cell
        //      at least once given the bank size of 4 and the % 4 modulo).
        //      sectionId varied so the sectionHash term also sweeps; 8 ids ×
        //      8 phrase indexes = 64 distinct (cell-index) samples, well
        //      above the 4 cells in the bank.
        const sectionIds = ['A', 'B', 'C', 'verse', 'chorus', 'bridge', 'intro', 'outro'];
        const cellSamples: number[][] = [];

        for (const sectionId of sectionIds) {
            for (let phraseIndex = 0; phraseIndex < 8; phraseIndex++) {
                const pattern = generateCompingPattern(
                    getState(),
                    'Bossa Nova',
                    'balanced',
                    FOUR_FOUR,
                    16,
                    phraseIndex,
                    sectionId,
                );
                const hits: number[] = [];
                for (let s = 0; s < 16; s++) {
                    if (pattern[s] === 1) {
                        hits.push(s);
                    }
                }
                cellSamples.push(hits);
            }
        }

        // Every sample MUST include step 14 — anticipation-of-1 is the genre
        // signature. A single sample without step 14 is a regression that
        // would erase the partido-alto identity.
        const missing14 = cellSamples.filter((hits) => !hits.includes(14));
        // eslint-disable-next-line no-console
        console.log(
            `[bossa-partido-alto] samples without step 14: ${missing14.length}/${cellSamples.length}`,
        );
        if (missing14.length > 0) {
            // eslint-disable-next-line no-console
            console.log('[bossa-partido-alto] first offender:', missing14[0]);
        }
        expect(missing14.length).toBe(0);
    });

    // -----------------------------------------------------------------------
    // 2. Anticipation-of-1 fires on chord-change-adjacent bars. Drive a
    //    progression where bar N+1 has a new chord; assert step 14 of bar N
    //    is in the comping pattern (i.e. the partido-alto cell lands the
    //    anticipation BEFORE the chord change).
    //
    //    why this is the canonical test of the gesture: anticipation-of-1
    //    is musically defined as "the &-of-4 of the bar BEFORE a chord change
    //    being tied into the new chord's downbeat." The bank is structured
    //    so step 14 is always lit; this test verifies that structural
    //    invariant holds at chord boundaries (not just random bars).
    // -----------------------------------------------------------------------
    it('anticipation-of-1 fires on chord-change boundaries', () => {
        // Simulate a 16-bar progression with chord changes every bar
        // (sectionId 'A' fixed; phraseIndex varies bar to bar).
        const totalBars = 16;
        let chordChangeBarsWithAnticipation = 0;
        // We treat EVERY bar transition as a chord change in this fixture —
        // so the count should be all 16 bars on cells that include step 14.
        for (let bar = 0; bar < totalBars; bar++) {
            const pattern = generateCompingPattern(
                getState(),
                'Bossa Nova',
                'balanced',
                FOUR_FOUR,
                16,
                bar,
                'A',
            );
            if (pattern[14] === 1) {
                chordChangeBarsWithAnticipation++;
            }
        }
        // eslint-disable-next-line no-console
        console.log(
            `[bossa-partido-alto] anticipation on chord-change: ${chordChangeBarsWithAnticipation}/${totalBars}`,
        );
        // why expect ALL bars: every BOSSA_PARTIDO_ALTO_CELLS entry includes
        // step 14 by design — so on a bar-by-bar chord-change progression the
        // gesture should fire every bar. Less than the full 16 means a cell
        // is missing the signature.
        expect(chordChangeBarsWithAnticipation).toBe(totalBars);
    });

    // -----------------------------------------------------------------------
    // 3. Cell distinctness from Jazz — Bossa shouldn't produce the same
    //    bar-by-bar pattern Jazz would have on identical inputs. Verifies
    //    the partido-alto bank has replaced the Jazz fallback, not been
    //    aliased to it.
    //
    //    why we compare bar-by-bar: a per-bar match would mean the picker
    //    is silently routing Bossa through JAZZ_COMPING_CELLS again.
    // -----------------------------------------------------------------------
    it('Bossa comping is distinct from Jazz comping on identical inputs', () => {
        const totalBars = 16;
        let identicalBars = 0;
        for (let bar = 0; bar < totalBars; bar++) {
            const bossaPattern = generateCompingPattern(
                getState(),
                'Bossa Nova',
                'balanced',
                FOUR_FOUR,
                16,
                bar,
                'A',
            );
            const jazzPattern = generateCompingPattern(
                getState(),
                'Jazz',
                'balanced',
                FOUR_FOUR,
                16,
                bar,
                'A',
            );
            const bossaKey = bossaPattern.join('');
            const jazzKey = jazzPattern.join('');
            if (bossaKey === jazzKey) {
                identicalBars++;
            }
        }
        // eslint-disable-next-line no-console
        console.log(`[bossa-partido-alto] bars identical to Jazz: ${identicalBars}/${totalBars}`);
        // why ≤ 2: 16 bars × 5 Jazz cells × 4 Bossa cells — the only way
        // patterns can identity-match is a coincidental cell-shape overlap
        // (e.g. if both banks happened to produce `[0, 6, ..., 14]` on the
        // same bar). With Bossa cells anchored on step 14 (Jazz cells are
        // 1- or 2-hit Charleston shapes), structural identity-match should
        // be ≤ 2 across the 16-bar sweep. Higher means the picker is
        // routing Bossa through JAZZ_COMPING_CELLS.
        expect(identicalBars).toBeLessThanOrEqual(2);
    });

    // -----------------------------------------------------------------------
    // 4. Cell variety — the picker should reach all 4 cells across a
    //    sweep, not collapse to one cell.
    // -----------------------------------------------------------------------
    it('all 4 Bossa cells are reachable across a phrase sweep', () => {
        const sectionIds = ['A', 'B', 'C', 'D', 'verse', 'chorus'];
        const distinctPatterns = new Set<string>();
        for (const sectionId of sectionIds) {
            for (let phraseIndex = 0; phraseIndex < 8; phraseIndex++) {
                const pattern = generateCompingPattern(
                    getState(),
                    'Bossa Nova',
                    'balanced',
                    FOUR_FOUR,
                    16,
                    phraseIndex,
                    sectionId,
                );
                distinctPatterns.add(pattern.join(''));
            }
        }
        // eslint-disable-next-line no-console
        console.log(
            `[bossa-partido-alto] distinct patterns across sweep: ${distinctPatterns.size}`,
        );
        // why >= 4: there are 4 cells in the bank; the sweep covers all 4
        // unique phraseHash mod-4 values, so at least 4 distinct patterns
        // must surface. (Active-vibe ornament would add more variety; this
        // test uses balanced vibe to measure raw cell distinctness.)
        expect(distinctPatterns.size).toBeGreaterThanOrEqual(4);
    });
});
