import { describe, expect, it } from 'vitest';
import { getMotif } from '../../../public/engine/grooves/acoustic.js';
import { INTENSITY_BANDS } from '../../../public/engine/grooves/utils.js';

describe('Acoustic Groove - getMotif', () => {
    describe('Low Complexity or Low Intensity (Cajon Feel)', () => {
        it.each([
            { seed: 0.1, complexity: 0.2, intensity: 1.0, expected: 0 },
            { seed: 0.9, complexity: 0.2, intensity: 1.0, expected: 0 },
            { seed: 0.5, complexity: 0.5, intensity: 0.1, expected: 0 },
            { seed: 0.5, complexity: 0.5, intensity: INTENSITY_BANDS.LOW - 0.01, expected: 0 },
        ])(
            'should return motif $expected when seed=$seed, complexity=$complexity, intensity=$intensity',
            ({ seed, complexity, intensity, expected }) => {
                expect(getMotif(seed, complexity, intensity)).toBe(expected);
            },
        );
    });

    describe('Stable Seed Ranges (complexity >= 0.3, intensity >= LOW)', () => {
        const complexity = 0.5;
        const intensity = 0.5;

        it.each([
            { seed: 0.1, expected: 0 },
            { seed: 0.24, expected: 0 },
            { seed: 0.25, expected: 1 },
            { seed: 0.49, expected: 1 },
        ])('should return motif $expected when seed=$seed (stable range)', ({ seed, expected }) => {
            expect(getMotif(seed, complexity, intensity)).toBe(expected);
        });
    });

    describe('Higher Seed Ranges (seed >= 0.5)', () => {
        const complexity = 0.8;

        describe('Medium Intensity (0.35 <= intensity < 0.7)', () => {
            const intensity = 0.6;
            it.each([
                { seed: 0.5, intensity, expected: 0 },
                { seed: 0.79, intensity, expected: 0 },
                { seed: 0.8, intensity, expected: 1 },
                { seed: 0.99, intensity, expected: 1 },
            ])(
                'should return motif $expected when seed=$seed and intensity=$intensity',
                ({ seed, expected, intensity }) => {
                    expect(getMotif(seed, complexity, intensity)).toBe(expected);
                },
            );
        });

        describe('High Intensity (intensity >= 0.7)', () => {
            const intensity = 0.8;
            it.each([
                { seed: 0.5, intensity, expected: 2 },
                { seed: 0.79, intensity, expected: 2 },
                { seed: 0.8, intensity, expected: 3 },
                { seed: 0.99, intensity, expected: 3 },
            ])(
                'should return motif $expected when seed=$seed and intensity=$intensity',
                ({ seed, expected, intensity }) => {
                    expect(getMotif(seed, complexity, intensity)).toBe(expected);
                },
            );
        });
    });
});
