/**
 * Critique: the bass density gate must LOCK loop-to-loop.
 *
 * `checkBassActiveStyle` decides whether the bass plays on each step. Five
 * styles gated that decision on raw Math.random (jazz/quarter eighth-skip,
 * funk ghost, metal gallop, blues shuffle, walking-ska skip), so the bass
 * re-rolled which offbeats it played every bar AND every loop — it never
 * locked to a groove. Epic 2 S4 seeds every gate on (step, loopCount), the
 * same shape the compound walking gate and the comping overlay use.
 *
 * Guards:
 *   (1) determinism — identical (step, loop) → identical onset decision.
 *   (2) non-tautology — the gate actually fires (the pattern varies bar-to-bar
 *       within a loop); a regression to "foundational-only" would make every
 *       bar identical and silently pass a determinism-only check.
 *   (3) loop reproducibility — re-running a later loop reproduces it.
 */
import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { checkBassActiveStyle } from '../../public/engine/bass-styles.js';
import { getStepInfo } from '../../public/utils.js';

const FOUR_FOUR = '4/4';
const STEPS_PER_BAR = 16;
const NUM_BARS = 16;
const ts = { stepsPerBeat: 4, beats: 4 };

// Per-style params chosen so the seeded random gate is actually in play (not
// pinned off by intensity/bpm thresholds), so guard (2) is meaningful.
const STYLES: Record<string, { bpm: number; intensity: number; complexity: number }> = {
    // jazz/quarter 4/4 walking eighth-skip (skipProb pinned off above 165 BPM).
    quarter: { bpm: 120, intensity: 0.6, complexity: 0.5 },
    funk: { bpm: 120, intensity: 0.6, complexity: 0.5 },
    metal: { bpm: 120, intensity: 0.6, complexity: 0.5 },
    blues: { bpm: 120, intensity: 0.6, complexity: 0.5 },
    // walking-ska's skip gate only fires above 185 BPM.
    'walking-ska': { bpm: 190, intensity: 0.6, complexity: 0.5 },
};

function runPass(style: string, loopCount: number): boolean[][] {
    const { bpm, intensity, complexity } = STYLES[style];
    const playback = {
        bandIntensity: intensity,
        complexity,
        bpm,
        currentLoopCount: loopCount,
    } as any;
    // Rock feel keeps the 'quarter' style on the simple-meter walking path
    // (it isn't re-routed by genreFeel === 'Jazz'), so this exercises the
    // quarter eighth-skip gate directly, not the Jazz branch.
    const groove = { genreFeel: 'Rock' } as any;

    const bars: boolean[][] = [];
    for (let bar = 0; bar < NUM_BARS; bar++) {
        const row = new Array(STEPS_PER_BAR).fill(false);
        for (let mStep = 0; mStep < STEPS_PER_BAR; mStep++) {
            const step = bar * STEPS_PER_BAR + mStep;
            const info = getStepInfo(step, FOUR_FOUR, [], TIME_SIGNATURES);
            const intBeat = info.beatIndex;
            const isQuarter = info.isBeatStart;
            const isEighthBoundary = info.isEighthBoundary;
            row[mStep] = checkBassActiveStyle(
                style,
                step,
                step,
                info,
                ts,
                intBeat,
                isQuarter,
                isEighthBoundary,
                playback,
                groove,
            );
        }
        bars.push(row);
    }
    return bars;
}

const barsEqual = (a: boolean[], b: boolean[]) => a.every((v, i) => v === b[i]);

describe('Bass density gate locks (determinism + non-tautology)', () => {
    for (const style of Object.keys(STYLES)) {
        describe(style, () => {
            it('(1) is deterministic loop-to-loop: identical (step, loop) → identical onsets', () => {
                expect(runPass(style, 0)).toEqual(runPass(style, 0));
            });

            it('(2) the seeded gate actually fires (pattern varies bar-to-bar)', () => {
                const bars = runPass(style, 0);
                // If the gate were ignored (foundational-only), every bar would be
                // identical. A seeded-on-step gate makes the bars differ.
                const allBarsIdentical = bars.every((row) => barsEqual(row, bars[0]));
                expect(
                    allBarsIdentical,
                    `${style}: every bar identical — the seeded random gate isn't contributing, ` +
                        `so a determinism-only pass would be tautological`,
                ).toBe(false);
            });

            it('(3) a later loop is itself reproducible', () => {
                expect(runPass(style, 3)).toEqual(runPass(style, 3));
            });
        });
    }
});
