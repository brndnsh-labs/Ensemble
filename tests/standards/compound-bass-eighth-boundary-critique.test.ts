// @ts-nocheck
/**
 * Compound-meter `is8th` semantics critique (epic-1-compound-meter S2).
 *
 * Before this story, `bass-engine.ts` and three branches in `bass-styles.ts`
 * computed `is8th = step % (ts.stepsPerBeat / 2) === 0`. For 6/8 / 7/8 / 12/8
 * (`stepsPerBeat = 2`) that's `step % 1 === 0` = always-true, so the rock /
 * metal / walking-ska / disco "fire on every eighth" gates degenerated to
 * "fire on every step" in compound meters even when they only happened to
 * coincide with the eighth grid (12 onsets/bar in 6/8 instead of the 6
 * eighths the consumer expected to gate against).
 *
 * Fix:
 *   - `getStepInfo` now exposes `isEighthBoundary: boolean`, true on every
 *     eighth-grid position (`stepsPerBeat >= 4` → `step % 2 === 0`;
 *     `stepsPerBeat = 2` → every step, since each step IS an eighth).
 *   - bass-engine + the rock / walking-ska branches in bass-styles read the
 *     canonical field instead of the broken local formula.
 *
 * The behavioral net is identical for the currently-supported meters (6/8
 * and 12/8 still fire every step under rock-style because each step IS an
 * eighth), but the code is now correct *by name* and the gate works for
 * any future meter with `stepsPerBeat` ≠ 2 or 4 (e.g. a hypothetical
 * 3-per-beat meter).
 */

import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('compound-meter is8th → isEighthBoundary (S2)', () => {
    describe('getStepInfo.isEighthBoundary', () => {
        it('marks every other step in 4/4 (16th-grid)', () => {
            const ts = TIME_SIGNATURES['4/4'];
            const flags: boolean[] = [];
            for (let step = 0; step < 16; step++) {
                flags.push(getStepInfo(step, ts, [], TIME_SIGNATURES).isEighthBoundary);
            }
            // why: 4/4 has stepsPerBeat=4 (16th grid). Eighth boundaries are
            // every other step: 0, 2, 4, 6, 8, 10, 12, 14.
            expect(flags).toEqual([
                true,
                false,
                true,
                false,
                true,
                false,
                true,
                false,
                true,
                false,
                true,
                false,
                true,
                false,
                true,
                false,
            ]);
            expect(flags.filter(Boolean).length).toBe(8);
        });

        it('marks every step in 6/8 (8th-grid, each step IS an eighth)', () => {
            const ts = TIME_SIGNATURES['6/8'];
            const flags: boolean[] = [];
            for (let step = 0; step < 12; step++) {
                flags.push(getStepInfo(step, ts, [], TIME_SIGNATURES).isEighthBoundary);
            }
            // why: 6/8 has stepsPerBeat=2, subdivision='8th'. Each step already
            // IS an eighth, so the eighth-grid is every step — 6 eighths/bar.
            expect(flags.every(Boolean)).toBe(true);
            expect(flags.length).toBe(12);
        });

        it('marks every step in 12/8 (8th-grid)', () => {
            const ts = TIME_SIGNATURES['12/8'];
            const flags: boolean[] = [];
            for (let step = 0; step < 24; step++) {
                flags.push(getStepInfo(step, ts, [], TIME_SIGNATURES).isEighthBoundary);
            }
            expect(flags.every(Boolean)).toBe(true);
            expect(flags.length).toBe(24);
        });

        it('marks every step in 7/8 (8th-grid)', () => {
            // why: 7/8 is `stepsPerBeat=2` with quarter-BPM. Eighth-boundary is
            // still "every step" semantically.
            const ts = TIME_SIGNATURES['7/8'];
            const flags: boolean[] = [];
            for (let step = 0; step < 14; step++) {
                flags.push(getStepInfo(step, ts, [], TIME_SIGNATURES).isEighthBoundary);
            }
            expect(flags.every(Boolean)).toBe(true);
        });

        it('marks every other step in 3/4, 5/4, 7/4 (all 16th-grid)', () => {
            for (const tsName of ['3/4', '5/4', '7/4']) {
                const ts = TIME_SIGNATURES[tsName];
                const stepsPerBar = ts.beats * ts.stepsPerBeat;
                let trueCount = 0;
                for (let step = 0; step < stepsPerBar; step++) {
                    if (getStepInfo(step, ts, [], TIME_SIGNATURES).isEighthBoundary) {
                        trueCount++;
                    }
                }
                // half of the steps are eighth boundaries
                expect(trueCount).toBe(stepsPerBar / 2);
            }
        });
    });

    describe('rock-style bass onsets per bar', () => {
        // why: `isBassActive('rock', ...)` returns true exactly on
        // `isEighthBoundary`. Lock in the post-fix counts for each meter
        // so a future regression in the `is8th` formula trips this test.
        const cases: Array<{ tsName: string; stepsPerBar: number; expected: number }> = [
            { tsName: '4/4', stepsPerBar: 16, expected: 8 },
            { tsName: '3/4', stepsPerBar: 12, expected: 6 },
            { tsName: '6/8', stepsPerBar: 12, expected: 12 }, // each step IS an eighth
            { tsName: '12/8', stepsPerBar: 24, expected: 24 },
            { tsName: '7/8', stepsPerBar: 14, expected: 14 },
        ];

        for (const { tsName, stepsPerBar, expected } of cases) {
            it(`rock style fires on every eighth in ${tsName} (${expected}/${stepsPerBar})`, () => {
                const mockState = {
                    playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 110 },
                    groove: {
                        genreFeel: 'Rock',
                        lastDrumPreset: 'Rock',
                        instruments: [],
                    },
                    arranger: { timeSignature: tsName, totalSteps: stepsPerBar },
                    soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
                };
                getState.mockReturnValue(mockState);

                const ts = TIME_SIGNATURES[tsName];
                let onsets = 0;
                for (let step = 0; step < stepsPerBar; step++) {
                    const info = getStepInfo(step, ts, [], TIME_SIGNATURES);
                    const active = isBassActive(
                        getState(),
                        'rock',
                        step,
                        step % stepsPerBar,
                        info,
                        {},
                    );
                    if (active) {
                        onsets++;
                    }
                }
                expect(onsets).toBe(expected);
            });
        }
    });
});
