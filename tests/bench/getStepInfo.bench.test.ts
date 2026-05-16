// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getStepInfo } from '../../public/utils.js';

describe('getStepInfo Performance', () => {
    // Setup a large measure map simulating a long song with frequent meter changes
    const TOTAL_MEASURES = 2000;
    const measureMap = [];
    let currentStep = 0;

    for (let i = 0; i < TOTAL_MEASURES; i++) {
        // Alternate between 4/4 and 3/4 to ensure variety
        const ts = i % 2 === 0 ? '4/4' : '3/4';
        const length = TIME_SIGNATURES[ts].beats * TIME_SIGNATURES[ts].stepsPerBeat;

        measureMap.push({
            start: currentStep,
            end: currentStep + length,
            ts: ts,
        });
        currentStep += length;
    }

    const tsConfig = TIME_SIGNATURES['4/4'];
    const ITERATIONS = 10000;
    // Pick a step near the end to maximize linear search cost
    const targetStep = currentStep - 20;

    it('Benchmark getStepInfo lookup', () => {
        const start = performance.now();

        for (let i = 0; i < ITERATIONS; i++) {
            getStepInfo(targetStep, tsConfig, measureMap, TIME_SIGNATURES);
        }

        const duration = performance.now() - start;
        console.log(`getStepInfo duration for ${ITERATIONS} lookups: ${duration.toFixed(2)}ms`);

        // Basic correctness check to ensure we aren't optimizing away logic
        const result = getStepInfo(targetStep, tsConfig, measureMap, TIME_SIGNATURES);
        expect(result.tsName).toBeDefined();
    });
});
