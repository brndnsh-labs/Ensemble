/* eslint-disable */
import { describe, it, expect } from 'vitest';
import { getStepsPerMeasure, getStepInfo } from '../../public/utils.js';
import { TIME_SIGNATURES } from '../../public/config.js';

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
            Object.keys(TIME_SIGNATURES).forEach(ts => {
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

        it('should handle 6/8 with 3+3 grouping', () => {
            const config68 = TIME_SIGNATURES['6/8']; // { beats: 6, stepsPerBeat: 2, grouping: [3, 3] }
            
            expect(getStepInfo(0, config68).isGroupStart).toBe(true);
            expect(getStepInfo(0, config68).groupIndex).toBe(0);
            
            expect(getStepInfo(6, config68).isGroupStart).toBe(true);
            expect(getStepInfo(6, config68).groupIndex).toBe(1);
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
            { start: 28, end: 44, ts: '4/4' }
        ];

        const tsConfig = TIME_SIGNATURES['4/4'];

        it('should find the first measure', () => {
            const result = getStepInfo(0, tsConfig, measureMap, TIME_SIGNATURES);
            expect(result.tsName).toBe('4/4');
            expect(result.isMeasureStart).toBe(true);

            const result2 = getStepInfo(15, tsConfig, measureMap, TIME_SIGNATURES);
            expect(result2.tsName).toBe('4/4');
            expect(result2.isMeasureStart).toBe(false);
        });

        it('should find the middle measure (3/4)', () => {
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

        it('should find the last measure', () => {
            const result = getStepInfo(28, tsConfig, measureMap, TIME_SIGNATURES);
            expect(result.tsName).toBe('4/4');
            expect(result.isMeasureStart).toBe(true);

            const resultEnd = getStepInfo(43, tsConfig, measureMap, TIME_SIGNATURES);
            expect(resultEnd.tsName).toBe('4/4');
        });

        it('should fallback correctly if step is out of bounds', () => {
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
