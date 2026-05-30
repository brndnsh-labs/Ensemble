// @ts-nocheck
/**
 * Drummer Chorus Evolution Critique — epic-form-arrangement S1
 *
 * Verifies that motif complexity cap relaxes per loop:
 *   Loop 0, 1  → Standard (1): metronomic pocket on The Head.
 *   Loop 2+    → Active   (2): groove opens up on repeat passes.
 *
 * Two tiers of coverage:
 *   1. Unit: motifCapForLoop() boundary table — all edge cases.
 *   2. Integration smoke: applyGrooveOverrides() with an Active orchestration
 *      entry (motifComplexity:3) produces observably different context when
 *      called with loopCount=0 vs loopCount=2.
 *
 * Source: form-arranger.md P0 #3, drums.md P2 #17.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides, motifCapForLoop } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal mock state that drives applyGrooveOverrides through a Funk
 * strategy with a fixed orchestrationMap entry at motifComplexity=3 (Busy).
 * Pass currentLoopCount to simulate a specific playback loop.
 */
function makeMockState(currentLoopCount: number) {
    return {
        playback: {
            bandIntensity: 0.75,
            bpm: 100,
            songMode: false,
            currentLoopCount,
        },
        groove: {
            genreFeel: 'Funk',
            lastDrumPreset: 'Funk',
            instruments: [],
            accentMap: null,
            fillMap: null,
            sectionSeedMap: { s1: 0.42 },
            seedTimelineStartStep: 0,
            // motifComplexity:3 (Busy) — the per-tick cap will clamp this
            // to 1 (Loop 0) or 2 (Loop 2+), proving the cap is wired.
            orchestrationMap: [
                {
                    start: 0,
                    end: 512,
                    motifComplexity: 3,
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
                // minimal stepMap so binarySearchMap doesn't crash
                { start: 0, end: 512, chord: { sectionId: 's1' } },
            ],
            totalSteps: 512,
        },
    };
}

/**
 * Run all four instrument lanes at a given step and return a hit summary.
 * Returns {shouldPlay, soundName, velocity} for each instrument.
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

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Drummer Chorus Evolution Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1. Unit: motifCapForLoop boundary table
    // -------------------------------------------------------------------------
    describe('motifCapForLoop() — per-loop cap formula', () => {
        it('Loop 0 → cap 1 (Standard: metronomic pocket on The Head)', () => {
            expect(motifCapForLoop(0)).toBe(1);
        });

        it('Loop 1 → cap 1 (still Standard: second pass still disciplined)', () => {
            expect(motifCapForLoop(1)).toBe(1);
        });

        it('Loop 2 → cap 2 (Active: groove opens up on repeat pass)', () => {
            expect(motifCapForLoop(2)).toBe(2);
        });

        it('Loop 3 → cap 2 (Active: stays capped, never Busy)', () => {
            expect(motifCapForLoop(3)).toBe(2);
        });

        it('Loop 5 → cap 2 (Active ceiling holds at 2 indefinitely)', () => {
            expect(motifCapForLoop(5)).toBe(2);
        });

        it('Loop 100 → cap 2 (extreme loop count never exceeds Active)', () => {
            expect(motifCapForLoop(100)).toBe(2);
        });
    });

    // -------------------------------------------------------------------------
    // 2. Integration smoke: same orchestration entry, different loop → diverges
    // -------------------------------------------------------------------------
    describe('applyGrooveOverrides() — cap wired into per-tick path', () => {
        it('Loop 0 (cap=1) and Loop 2 (cap=2) produce different results on a Busy orchestration entry', () => {
            const stateLoop0 = makeMockState(0);
            const stateLoop2 = makeMockState(2);
            getState.mockReturnValue(stateLoop0);

            // Scan 4 bars (64 steps) and collect per-step hit counts.
            // With a motifComplexity:3 entry capped to 1 vs 2, the Funk
            // strategy selects a different activeMotif, which drives different
            // ghost-note and hat-bark decisions across the phrase.
            let loop0Hits = 0;
            let loop2Hits = 0;
            const diffSteps: number[] = [];

            for (let step = 0; step < 64; step++) {
                const r0 = runStep(step, stateLoop0);
                const r2 = runStep(step, stateLoop2);

                for (const inst of ['Kick', 'Snare', 'HiHat', 'Open']) {
                    if (r0[inst].shouldPlay) {
                        loop0Hits++;
                    }
                    if (r2[inst].shouldPlay) {
                        loop2Hits++;
                    }
                    // Track steps where the two loops disagree on any lane
                    if (r0[inst].shouldPlay !== r2[inst].shouldPlay) {
                        if (!diffSteps.includes(step)) {
                            diffSteps.push(step);
                        }
                    }
                }
            }

            console.log('\n--- DRUMMER CHORUS EVOLUTION CRITIQUE REPORT ---');
            console.log(
                `[motifCapForLoop] Loop 0→${motifCapForLoop(0)}, Loop 1→${motifCapForLoop(1)}, ` +
                    `Loop 2→${motifCapForLoop(2)}, Loop 5→${motifCapForLoop(5)}`,
            );
            console.log(`[Loop 0 hits / 64 steps] ${loop0Hits}  (cap=1 / Standard)`);
            console.log(`[Loop 2 hits / 64 steps] ${loop2Hits}  (cap=2 / Active)`);
            console.log(
                `[Divergent steps]        ${diffSteps.length} of 64 steps differ between Loop 0 and Loop 2`,
            );
            console.log('------------------------------------------------\n');

            // The two loops must produce measurably different distributions.
            // We don't mandate a direction because motif selection is seed-based:
            // cap=1 (Standard) and cap=2 (Active) select different motif indices
            // which shift ghost note and hat bark placement, not raw hit count.
            // Divergent step count >0 proves the cap is wired into the per-tick path.
            expect(diffSteps.length).toBeGreaterThan(0);

            // Require at least 5% of steps to differ — a single off-by-one would
            // give 1-2 divergent steps; a genuine motif-tier shift gives ~15-30%.
            // why: 64 steps × 5% = 3.2 → threshold 3; actual ~19 gives strong margin.
            expect(diffSteps.length).toBeGreaterThanOrEqual(3);
        });
    });
});
