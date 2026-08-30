// @ts-nocheck
/* eslint-disable */
import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../../public/config.js';
import {
    getEffectiveMeterAtStep,
    getEffectiveTimeSignature,
    getEffectiveTimeSignatures,
    getMeterGroupStarts,
} from '../../../public/meter.js';
import { getStepInfo, getStepsPerMeasure } from '../../../public/utils.js';

describe('Time Signature Logic', () => {
    describe('getStepsPerMeasure', () => {
        it('should return correct steps for all supported time signatures', () => {
            expect(getStepsPerMeasure('2/4')).toBe(8);
            expect(getStepsPerMeasure('3/4')).toBe(12);
            expect(getStepsPerMeasure('4/4')).toBe(16);
            expect(getStepsPerMeasure('5/4')).toBe(20);
            expect(getStepsPerMeasure('6/8')).toBe(12);
            expect(getStepsPerMeasure('7/8')).toBe(14);
            expect(getStepsPerMeasure('7/4')).toBe(28);
            expect(getStepsPerMeasure('12/8')).toBe(24);
        });

        it('should default to 16 for unknown signatures', () => {
            expect(getStepsPerMeasure('9/8')).toBe(16);
        });

        it('should match config.js definitions', () => {
            Object.keys(TIME_SIGNATURES).forEach((ts) => {
                const config = TIME_SIGNATURES[ts];
                const expected = config.beats * config.stepsPerBeat;
                expect(getStepsPerMeasure(ts)).toBe(expected);
            });
        });
    });

    describe('getStepInfo', () => {
        it('should correctly identify measure starts', () => {
            const config44 = TIME_SIGNATURES['4/4'];
            expect(getStepInfo(0, config44).isMeasureStart).toBe(true);
            expect(getStepInfo(16, config44).isMeasureStart).toBe(true);
            expect(getStepInfo(1, config44).isMeasureStart).toBe(false);
        });

        it('should correctly identify beat starts', () => {
            const config44 = TIME_SIGNATURES['4/4'];
            expect(getStepInfo(0, config44).isBeatStart).toBe(true);
            expect(getStepInfo(4, config44).isBeatStart).toBe(true);
            expect(getStepInfo(8, config44).isBeatStart).toBe(true);
            expect(getStepInfo(12, config44).isBeatStart).toBe(true);
            expect(getStepInfo(2, config44).isBeatStart).toBe(false);
        });

        it('should correctly handle 5/4 with 3+2 grouping', () => {
            const config54 = TIME_SIGNATURES['5/4']; // { beats: 5, stepsPerBeat: 4, grouping: [3, 2] }

            // Group 1 (Beats 1, 2, 3)
            expect(getStepInfo(0, config54).isGroupStart).toBe(true);
            expect(getStepInfo(0, config54).groupIndex).toBe(0);

            expect(getStepInfo(4, config54).isGroupStart).toBe(false);
            expect(getStepInfo(4, config54).groupIndex).toBe(0);

            // Group 2 (Beats 4, 5)
            expect(getStepInfo(12, config54).isGroupStart).toBe(true);
            expect(getStepInfo(12, config54).groupIndex).toBe(1);
            expect(getStepInfo(16, config54).groupIndex).toBe(1); // Beat 5
        });

        it('uses the authored grouping across measure-map resolution', () => {
            const config54 = getEffectiveTimeSignature('5/4', [2, 3]);
            const signatures = getEffectiveTimeSignatures('5/4', [2, 3]);
            const measureMap = [{ start: 0, end: 20, ts: '5/4' }];

            expect(getStepInfo(8, config54, measureMap, signatures).isGroupStart).toBe(true);
            expect(getStepInfo(8, config54, measureMap, signatures).groupIndex).toBe(1);
            expect(getStepInfo(12, config54, measureMap, signatures).isGroupStart).toBe(false);
        });

        it('enumerates cumulative group starts for asymmetric authored groupings', () => {
            expect([...getMeterGroupStarts(getEffectiveTimeSignature('5/4', [2, 3]))]).toEqual([
                0, 8,
            ]);
            expect([...getMeterGroupStarts(getEffectiveTimeSignature('7/8', [3, 2, 2]))]).toEqual([
                0, 6, 10,
            ]);
        });

        it('moves grouping-derived pulses but preserves independent quarter-note pulses', () => {
            const customSeven = getEffectiveTimeSignature('7/8', [3, 2, 2]);
            const customSevenRegistry = getEffectiveTimeSignatures('7/8', [3, 2, 2]);
            const sevenPulses = Array.from({ length: 14 }, (_, step) => step).filter(
                (step) => getStepInfo(step, customSeven, [], customSevenRegistry).isPulse,
            );
            expect(sevenPulses).toEqual([0, 6, 10]);

            const customFive = getEffectiveTimeSignature('5/4', [2, 3]);
            expect(customFive.pulse).toEqual(TIME_SIGNATURES['5/4'].pulse);
            expect([...getMeterGroupStarts(customFive)]).toEqual([0, 8]);
        });

        it('falls back to the canonical grouping when an override is invalid', () => {
            expect(getEffectiveTimeSignature('5/4', [4, 4])).toBe(TIME_SIGNATURES['5/4']);
        });

        it('resolves a mixed-meter section seam identically on later loops', () => {
            const arranger = {
                timeSignature: '3/4',
                grouping: null,
                totalSteps: 28,
                measureMap: [
                    { start: 0, end: 12, ts: '3/4' },
                    { start: 12, end: 28, ts: '4/4' },
                ],
            };

            for (const step of [12, 40]) {
                const meter = getEffectiveMeterAtStep(arranger, step);
                expect(meter.chartStep).toBe(12);
                expect(meter.ts).toBe(TIME_SIGNATURES['4/4']);
                expect(meter.stepInfo.mStep).toBe(0);
                expect(meter.stepInfo.isMeasureStart).toBe(true);
            }
        });

        it('should correctly handle 7/8 with 2+2+3 grouping', () => {
            const config78 = TIME_SIGNATURES['7/8']; // { beats: 7, stepsPerBeat: 2, grouping: [2, 2, 3] }

            // Group 1: Steps 0-3 (Beats 1-2)
            expect(getStepInfo(0, config78).isGroupStart).toBe(true);
            expect(getStepInfo(0, config78).groupIndex).toBe(0);

            // Group 2: Steps 4-7 (Beats 3-4)
            expect(getStepInfo(4, config78).isGroupStart).toBe(true);
            expect(getStepInfo(4, config78).groupIndex).toBe(1);

            // Group 3: Steps 8-13 (Beats 5-7)
            expect(getStepInfo(8, config78).isGroupStart).toBe(true);
            expect(getStepInfo(8, config78).groupIndex).toBe(2);
            expect(getStepInfo(10, config78).groupIndex).toBe(2);
            expect(getStepInfo(12, config78).groupIndex).toBe(2);
        });

        it('should handle 6/8 with 3+3 grouping and isCompound flag', () => {
            const config68 = TIME_SIGNATURES['6/8']; // { beats: 6, stepsPerBeat: 2, grouping: [3, 3] }

            const info0 = getStepInfo(0, config68);
            expect(info0.isGroupStart).toBe(true);
            expect(info0.groupIndex).toBe(0);
            expect(info0.isCompound).toBe(true);

            const info6 = getStepInfo(6, config68);
            expect(info6.isGroupStart).toBe(true);
            expect(info6.groupIndex).toBe(1);
            expect(info6.isCompound).toBe(true);
        });

        it('should identify compound grouping and backbeats in 12/8', () => {
            const config128 = TIME_SIGNATURES['12/8'];
            expect(getStepInfo(0, config128).isCompound).toBe(true);
            expect(getStepInfo(6, config128).isGroupStart).toBe(true);
            expect(getStepInfo(0, config128).isBackbeat).toBe(false);
            expect(getStepInfo(6, config128).isBackbeat).toBe(true);
            expect(getStepInfo(12, config128).isBackbeat).toBe(false);
            expect(getStepInfo(18, config128).isBackbeat).toBe(true);
        });

        it('should identify 4/4 as NOT compound', () => {
            const config44 = TIME_SIGNATURES['4/4'];
            expect(getStepInfo(0, config44).isCompound).toBe(false);
        });
    });

    describe('getStepInfo with Measure Map (Binary Search)', () => {
        // Construct a measure map with known boundaries
        // Measure 1: 0-16 (4/4)
        // Measure 2: 16-28 (3/4, 12 steps)
        // Measure 3: 28-44 (4/4)
        const measureMap = [
            { start: 0, end: 16, ts: '4/4' },
            { start: 16, end: 28, ts: '3/4' },
            { start: 28, end: 44, ts: '4/4' },
        ];

        const tsConfig = TIME_SIGNATURES['4/4'];

        it('should find and return metadata for the first measure in a multi-measure map', () => {
            const result = getStepInfo(0, tsConfig, measureMap, TIME_SIGNATURES);
            expect(result.tsName).toBe('4/4');
            expect(result.isMeasureStart).toBe(true);

            const result2 = getStepInfo(15, tsConfig, measureMap, TIME_SIGNATURES);
            expect(result2.tsName).toBe('4/4');
            expect(result2.isMeasureStart).toBe(false);
        });

        it('should find and return metadata for a middle measure with a different time signature (3/4)', () => {
            // Step 16 is the start of the 2nd measure (3/4)
            const result = getStepInfo(16, tsConfig, measureMap, TIME_SIGNATURES);
            expect(result.tsName).toBe('3/4');
            expect(result.isMeasureStart).toBe(true);
            expect(result.mStep).toBe(0);

            // Step 27 is the last step of the 2nd measure
            const resultEnd = getStepInfo(27, tsConfig, measureMap, TIME_SIGNATURES);
            expect(resultEnd.tsName).toBe('3/4');
            expect(resultEnd.isMeasureStart).toBe(false);
            expect(resultEnd.mStep).toBe(11);
        });

        it('should find and return metadata for the final measure in the map', () => {
            const result = getStepInfo(28, tsConfig, measureMap, TIME_SIGNATURES);
            expect(result.tsName).toBe('4/4');
            expect(result.isMeasureStart).toBe(true);

            const resultEnd = getStepInfo(43, tsConfig, measureMap, TIME_SIGNATURES);
            expect(resultEnd.tsName).toBe('4/4');
        });

        it('should fallback to provided tsConfig when step is beyond measure map boundaries', () => {
            // Step 44 is beyond the map (end is exclusive)
            const result = getStepInfo(44, tsConfig, measureMap, TIME_SIGNATURES);

            expect(result.tsName).toBe('4/4'); // tsConfig is 4/4
        });

        it('should handle single item map', () => {
            const singleMap = [{ start: 0, end: 16, ts: '4/4' }];
            const result = getStepInfo(5, tsConfig, singleMap, TIME_SIGNATURES);
            expect(result.tsName).toBe('4/4');
        });
    });
});
