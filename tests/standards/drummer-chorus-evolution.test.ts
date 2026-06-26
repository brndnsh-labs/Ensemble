// @ts-nocheck
/**
 * Drummer Chorus Evolution Critique — epic-form-arrangement S1 / finding #806
 *
 * Chorus Evolution is a HYBRID per-loop lever (#806). The drummer establishes a
 * solid pocket on The Head (loop 0) and OPENS UP across repeat passes:
 *
 *   1. Motif backbone — `loopMotifCeiling(loopCount)` caps the motif INDEX each
 *      genre's getMotif may reach: loop 0 → 1 (Standard), loop 1 → 2 (Active),
 *      loop 2+ → Infinity (full genre range). Clamped per-tick via
 *      `Math.min(getMotif(...), motifCeiling)` at every genre call site.
 *   2. Continuous touches — `chorusEvolutionScale(loopCount)` ramps the entropy
 *      ghost-density gate from 0.5 (head floor) to 1.0 by loop 2, and widens the
 *      two entropy ghost-velocity ceilings by up to +0.10.
 *
 * The prior lever (a per-loop motif cap laundered into a complexity float fed to
 * getMotif) was INERT — getMotif's coarse complexity gate ignored the range, so
 * loops 0 and 2 produced byte-identical drums and the old divergence test was
 * quarantined as provably false. This rewrite exercises the real hybrid lever.
 *
 * Coverage:
 *   1. Unit: loopMotifCeiling() boundary table.
 *   2. Unit: chorusEvolutionScale() ramp table.
 *   3. Critique: per-step fingerprint (shouldPlay + velocity, all 4 lanes, 8-bar
 *      window) diverges between loop 0 and loop 2 for EXPRESSIVE genres, on a
 *      meaningful fraction of seeds — and is byte-deterministic per (genre, seed,
 *      loop). Steady-time genres (Disco/Acoustic/Blues) are documented as
 *      intentionally non-evolving via motif and pinned to stay LOW.
 *
 * Source: form-arranger.md P0 #3, drums.md P2 #17.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import {
    applyGrooveOverrides,
    chorusEvolutionScale,
    loopMotifCeiling,
} from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal mock state that drives applyGrooveOverrides through a given
 * genre strategy with a single orchestrationMap entry at motifComplexity=2
 * (Active). `currentLoopCount` simulates a specific playback loop; `seed` is the
 * per-section motif marker the conductor would write into sectionSeedMap.
 */
function makeMockState(currentLoopCount: number, genre: string, seed: number) {
    return {
        playback: {
            bandIntensity: 0.75,
            bpm: 100,
            songMode: false,
            currentLoopCount,
        },
        groove: {
            genreFeel: genre,
            lastDrumPreset: genre,
            instruments: [],
            accentMap: null,
            fillMap: null,
            sectionSeedMap: { s1: seed },
            seedTimelineStartStep: 0,
            // motifComplexity:2 (Active) — a mid-density section. Loop 0 clamps the
            // motif index to 1; loop 2 unlocks the full genre range, and the
            // entropy ghost-density gate opens from 0.5 → 1.0. Both Chorus
            // Evolution levers are live here.
            orchestrationMap: [
                {
                    start: 0,
                    end: 512,
                    motifComplexity: 2,
                    rideVoice: 'HiHat-Closed',
                    snareVoice: 'Snare',
                    energyLevel: 0.9,
                },
            ],
        },
        soloist: {
            enabled: false,
            session: { phrasing: { busySteps: 0 } },
        },
        arranger: {
            timeSignature: '4/4',
            sectionMap: [
                { id: 's1', start: 0, end: 256, label: 'Verse' },
                { id: 's1', start: 256, end: 512, label: 'Chorus' },
            ],
            stepMap: [
                // minimal stepMap so binarySearchMap resolves sectionId='s1'
                { start: 0, end: 512, chord: { sectionId: 's1' } },
            ],
            totalSteps: 512,
        },
    };
}

/**
 * Run all four instrument lanes at a given step and return the groove decision
 * ({shouldPlay, soundName, velocity, ...}) for each.
 */
function runStep(step: number, mockState: any): Record<string, any> {
    const tsConfig = TIME_SIGNATURES['4/4'];
    const info = getStepInfo(step, tsConfig, [], TIME_SIGNATURES);
    const results: Record<string, any> = {};

    for (const instName of ['Kick', 'Snare', 'HiHat', 'Open']) {
        const params = {
            step,
            inst: { name: instName, muted: false, steps: [] },
            stepVal: instName === 'HiHat' ? 1 : 0,
            playback: mockState.playback,
            groove: mockState.groove,
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
            mStep: info.mStep ?? 0,
            isCompound: false,
            stepInGroup: 0,
            groupIndex: 0,
        };
        results[instName] = applyGrooveOverrides(mockState, params);
    }
    return results;
}

const LANES = ['Kick', 'Snare', 'HiHat', 'Open'];
// 8-bar window starting at step 16 — skips the first bar so the engine's
// first-bar suppression (bar 0 establishes the pocket) doesn't dominate.
const WINDOW_START = 16;
const WINDOW_BARS = 8;
const WINDOW_STEPS = WINDOW_BARS * 16; // 128 steps × 4 lanes = 512 fingerprint cells

// 9 seeds spread across [0,1) — the per-section motif marker domain. The engine
// is fully deterministic given (genre, seed, loop); sweeping seeds samples
// different motif selections so we measure how OFTEN a loop opens the groove,
// not whether one cherry-picked seed happens to bite.
const SEEDS = [0.07, 0.18, 0.29, 0.42, 0.53, 0.61, 0.74, 0.83, 0.96];

/**
 * Per-step fingerprint of the 8-bar window: shouldPlay + velocity for all 4
 * lanes, as exact strings (the engine is deterministic, so byte-equality is the
 * right comparator — no quantization needed).
 */
function fingerprint(genre: string, seed: number, loopCount: number): string[] {
    const state = makeMockState(loopCount, genre, seed);
    getState.mockReturnValue(state);
    const cells: string[] = [];
    for (let s = WINDOW_START; s < WINDOW_START + WINDOW_STEPS; s++) {
        const r = runStep(s, state);
        for (const lane of LANES) {
            cells.push(`${r[lane].shouldPlay ? 1 : 0}:${r[lane].velocity.toFixed(3)}`);
        }
    }
    return cells;
}

/** Count of fingerprint cells that differ between loop 0 and loop 2. */
function divergenceCells(genre: string, seed: number): number {
    const f0 = fingerprint(genre, seed, 0);
    const f2 = fingerprint(genre, seed, 2);
    let diff = 0;
    for (let i = 0; i < f0.length; i++) {
        if (f0[i] !== f2[i]) {
            diff++;
        }
    }
    return diff;
}

/** Per-genre divergence summary across all swept seeds. */
function genreDivergence(genre: string, minCells: number) {
    const perSeed = SEEDS.map((seed) => divergenceCells(genre, seed));
    const total = perSeed.reduce((a, b) => a + b, 0);
    const seedsBiting = perSeed.filter((d) => d > minCells).length;
    const maxDiv = Math.max(...perSeed);
    const avgDiv = total / SEEDS.length;
    return { perSeed, avgDiv, maxDiv, seedsBiting };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Drummer Chorus Evolution Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. Unit: loopMotifCeiling boundary table
    // -------------------------------------------------------------------------
    describe('loopMotifCeiling() — per-loop motif-index ceiling', () => {
        it('Loop 0 → ceiling 1 (Standard: tight, foundational Head)', () => {
            expect(loopMotifCeiling(0)).toBe(1);
        });

        it('Loop 1 → ceiling 2 (Active: opening up on the second pass)', () => {
            expect(loopMotifCeiling(1)).toBe(2);
        });

        it('Loop 2 → no cap (full genre range, full-tilt feel)', () => {
            expect(loopMotifCeiling(2)).toBe(Number.POSITIVE_INFINITY);
        });

        it("Loop 3 → no cap (later passes match today's behavior)", () => {
            expect(loopMotifCeiling(3)).toBe(Number.POSITIVE_INFINITY);
        });

        it('Loop 100 → no cap (ceiling never re-tightens)', () => {
            expect(loopMotifCeiling(100)).toBe(Number.POSITIVE_INFINITY);
        });
    });

    // -------------------------------------------------------------------------
    // 2. Unit: chorusEvolutionScale ramp table
    // -------------------------------------------------------------------------
    describe('chorusEvolutionScale() — entropy ghost-density ramp', () => {
        it('Loop 0 → 0.5 (head floor: drummer holds back ghost density)', () => {
            expect(chorusEvolutionScale(0)).toBeCloseTo(0.5, 6);
        });

        it('Loop 1 → 0.75 (half-open)', () => {
            expect(chorusEvolutionScale(1)).toBeCloseTo(0.75, 6);
        });

        it('Loop 2 → 1.0 (fully open)', () => {
            expect(chorusEvolutionScale(2)).toBeCloseTo(1.0, 6);
        });

        it('Loop 4 → 1.0 (holds at full, never overshoots)', () => {
            expect(chorusEvolutionScale(4)).toBeCloseTo(1.0, 6);
        });
    });

    // -------------------------------------------------------------------------
    // 3. Critique: loop 2 diverges from loop 0 for expressive genres,
    //    deterministically, on a meaningful fraction of seeds.
    // -------------------------------------------------------------------------
    describe('Chorus Evolution opens the groove on repeat passes', () => {
        // Expressive genres: their motif tables span a busy range, so unlocking
        // the motif ceiling (loop 0 → 2) + opening the entropy ghost gate shifts
        // ghost/hat/decoration placement across the phrase. Measured divergence
        // with THIS harness (motifComplexity=2, the 9 SEEDS below, 512-cell
        // window) — avgDiv cells / seeds-biting (>8 cells):
        //   Funk 89/5, Neo-Soul 45/4, Blues 42/9, Hip Hop 38/6, Metal 35/6,
        //   Reggae 21/4, Jazz 23/4. Thresholds below sit as a FLOOR under these,
        //   not a fit. (#806: Blues joined this set — its drumComplexity-gated
        //   shuffle lanes flip with chorusEvolutionScale, so it evolves hard.)
        const EXPRESSIVE = ['Funk', 'Neo-Soul', 'Blues', 'Hip Hop', 'Metal', 'Reggae', 'Jazz'];

        // A "biting" seed differs by > MIN_BITE_CELLS cells. The engine is
        // deterministic, so per-seed divergence is EXACT and bimodal: seeds
        // either barely move (measured ≤6 cells: velocity-humanize jitter only)
        // or shift hard (measured ≥35 cells: a genuine motif/ghost-density open).
        // A threshold of 8 sits in the wide dead zone between those clusters
        // (7–34 would all classify identically), so the bite count is robust.
        const MIN_BITE_CELLS = 8;
        // Require at least this many of the 9 seeds to bite. Measured minimum
        // among these expressive genres is 4/9 (Neo-Soul, Reggae, Jazz); Hip Hop
        // and Metal hit 6/9. Floor of 3 sits under the weakest measured (4) and
        // is far above a fluke — because of the 6↔35-cell bimodal gap, no genuine
        // change could drift a seed across the 8-cell line, so this only fails if
        // Chorus Evolution genuinely stops opening the groove for a genre.
        const MIN_SEEDS_BITING = 3;

        it('Expressive genres diverge loop 0 → loop 2 on a meaningful fraction of seeds', () => {
            const report: Record<string, any> = {};
            for (const genre of EXPRESSIVE) {
                report[genre] = genreDivergence(genre, MIN_BITE_CELLS);
            }

            console.log('\n--- DRUMMER CHORUS EVOLUTION CRITIQUE REPORT ---');
            console.log(
                `Window: ${WINDOW_BARS} bars from step ${WINDOW_START}, ${LANES.length} lanes, ` +
                    `${SEEDS.length} seeds → ${WINDOW_STEPS * LANES.length} cells/loop`,
            );
            console.log(
                `loopMotifCeiling: L0→${loopMotifCeiling(0)}, L1→${loopMotifCeiling(1)}, ` +
                    `L2→${loopMotifCeiling(2)} | chorusEvolutionScale: L0→${chorusEvolutionScale(0)}, ` +
                    `L1→${chorusEvolutionScale(1)}, L2→${chorusEvolutionScale(2)}`,
            );
            console.log(
                `Targets (EXPRESSIVE): >=${MIN_SEEDS_BITING} of ${SEEDS.length} seeds differ by ` +
                    `>${MIN_BITE_CELLS} cells\n`,
            );
            for (const genre of EXPRESSIVE) {
                const r = report[genre];
                console.log(
                    `  ${genre.padEnd(9)} avgDiv=${r.avgDiv.toFixed(1).padStart(5)}  ` +
                        `maxDiv=${String(r.maxDiv).padStart(3)}  ` +
                        `seedsBiting=${r.seedsBiting}/${SEEDS.length}`,
                );
            }
            console.log('------------------------------------------------\n');

            for (const genre of EXPRESSIVE) {
                const r = report[genre];
                expect(
                    r.seedsBiting,
                    `${genre}: only ${r.seedsBiting}/${SEEDS.length} seeds diverged by >${MIN_BITE_CELLS} cells ` +
                        `(avgDiv=${r.avgDiv.toFixed(1)}). Chorus Evolution is not opening the groove.`,
                ).toBeGreaterThanOrEqual(MIN_SEEDS_BITING);
            }
        });

        // NOTE (deliberately NOT asserting "loop 2 is busier"): unlocking the
        // motif ceiling gives a more DEVELOPED pattern, not necessarily a denser
        // one. Measured: Funk loop 2 has FEWER hits than loop 0 (≈1791 vs 2196)
        // because its higher motifs (2 "Displaced", 3 "Linear") spread hits
        // across limbs in sequence — a more sophisticated feel with fewer
        // simultaneous notes. So "opens up" = the groove EVOLVES (divergence),
        // not "plays more notes". A monotonic-density guard would encode a false
        // musical invariant. The continuous entropy/velocity touch is the only
        // strictly-additive part; the motif backbone is developmental.
        it('Divergence is deterministic — same (genre, seed, loop) → byte-identical fingerprint', () => {
            // Re-fingerprint the same coordinates twice; any drift means an
            // unseeded Math.random leaked into the per-tick path.
            for (const genre of EXPRESSIVE) {
                for (const seed of SEEDS) {
                    for (const loop of [0, 2]) {
                        const a = fingerprint(genre, seed, loop).join('|');
                        const b = fingerprint(genre, seed, loop).join('|');
                        expect(
                            a,
                            `${genre} seed=${seed} loop=${loop}: fingerprint not reproducible`,
                        ).toBe(b);
                    }
                }
            }
        });

        // ---------------------------------------------------------------------
        // Steady-time genres: Disco (four-on-the-floor), Acoustic (ballad),
        // Blues (shuffle) are INTENTIONALLY non-evolving via motif — their pocket
        // IS the identity, so unlocking the motif ceiling barely moves them
        // (measured avgDiv: Disco ~1, Acoustic ~1, Blues ~1.4). Chorus Evolution
        // still touches them continuously via the entropy ghost-density ramp, but
        // that is a sub-cell-threshold change here. We pin them LOW to lock in
        // "steady stays steady" — NOT asserting divergence would let a future
        // change silently turn a ballad into a busy chorus.
        // ---------------------------------------------------------------------
        it('Steady-time genres stay steady (motif evolution intentionally minimal)', () => {
            // #806: Blues USED to live here, but under lever #2 (drumComplexity =
            // (motifComplexity/3) * chorusEvolutionScale) its complexity-gated lanes
            // flip between loop 0 (scale 0.5) and loop 2 (scale 1.0) → it now evolves
            // hard (measured avgDiv 42.4, biting 9/9 seeds at 42–44 cells). Blues has
            // been moved to the EXPRESSIVE set above. Disco (four-on-the-floor) and
            // Acoustic (ballad) have NO drumComplexity-gated lanes, so they stay ~0.
            const STEADY = ['Disco', 'Acoustic'];
            // Measured avgDiv ≤ 1.0; ceiling 5 leaves 4-pt headroom and still
            // catches a regression that flipped one of these into an evolver.
            const MAX_AVG_DIV = 5;

            const report: Record<string, any> = {};
            for (const genre of STEADY) {
                report[genre] = genreDivergence(genre, MIN_BITE_CELLS);
            }

            console.log('\n--- STEADY-GENRE STABILITY REPORT ---');
            console.log(`Target (STEADY): avgDiv < ${MAX_AVG_DIV} (steady stays steady)\n`);
            for (const genre of STEADY) {
                const r = report[genre];
                console.log(
                    `  ${genre.padEnd(9)} avgDiv=${r.avgDiv.toFixed(1).padStart(5)}  ` +
                        `maxDiv=${String(r.maxDiv).padStart(3)}`,
                );
            }
            console.log('-------------------------------------\n');

            for (const genre of STEADY) {
                const r = report[genre];
                expect(
                    r.avgDiv,
                    `${genre}: avgDiv=${r.avgDiv.toFixed(1)} — a steady-time genre evolved more than expected.`,
                ).toBeLessThan(MAX_AVG_DIV);
            }
        });
    });
});
