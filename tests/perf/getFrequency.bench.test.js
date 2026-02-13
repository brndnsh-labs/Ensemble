
import { describe, it, expect } from 'vitest';
import { getFrequency } from '../../public/utils.js';

describe('getFrequency Performance', () => {
    // Large number of iterations to exaggerate performance differences
    const ITERATIONS = 10000000;
    // Notes to test
    const notes = Array.from({ length: 128 }, (_, i) => i);
    // Include some out of range notes
    const outOfRange = [-10, 150, 200];

    it('Benchmark getFrequency lookup', () => {
        const start = performance.now();

        for (let i = 0; i < ITERATIONS; i++) {
            // Cycle through notes 0-127
            const note = notes[i % 128];
            getFrequency(note);
        }

        const duration = performance.now() - start;
        console.log(`getFrequency duration for ${ITERATIONS} lookups: ${duration.toFixed(2)}ms`);

        // Correctness check
        expect(getFrequency(69)).toBe(440);
        expect(getFrequency(60)).toBeCloseTo(261.63, 2);
    });

    it('Benchmark getFrequency with out-of-range inputs', () => {
        const start = performance.now();

        for (let i = 0; i < ITERATIONS; i++) {
             // Cycle through out of range notes
             const note = outOfRange[i % outOfRange.length];
             getFrequency(note);
        }

        const duration = performance.now() - start;
        console.log(`getFrequency (out-of-range) duration for ${ITERATIONS} lookups: ${duration.toFixed(2)}ms`);
    });
});
