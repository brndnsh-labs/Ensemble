/* eslint-disable */
import { describe, expect, it } from 'vitest';
import { FILL_TEMPLATES, generateProceduralFill } from '../../../public/engine/fills.js';

describe('Drums Engine Logic (Fills)', () => {
    describe('Fill Generation', () => {
        it('should generate valid fill steps for various intensities', () => {
            const intensities = [0.2, 0.5, 0.9];
            intensities.forEach((intensity) => {
                const fill = generateProceduralFill('Rock', intensity, 16);
                expect(typeof fill).toBe('object');
                const steps = Object.keys(fill).map(Number);
                if (intensity > 0.3) {
                    expect(steps.length).toBeGreaterThan(0);
                }
                steps.forEach((step) => {
                    expect(step).toBeGreaterThanOrEqual(0);
                    expect(step).toBeLessThan(16);
                    expect(Array.isArray(fill[step])).toBe(true);
                });
            });
        });

        it('should handle odd time signatures correctly', () => {
            const spm = 12; // 3/4 time
            const fill = generateProceduralFill('Jazz', 0.6, spm);
            const steps = Object.keys(fill).map(Number);
            steps.forEach((step) => {
                expect(step).toBeGreaterThanOrEqual(0);
                expect(step).toBeLessThan(spm);
            });
        });

        it('should fall back to Rock if genre is unknown', () => {
            const fill = generateProceduralFill('NonExistentGenre', 0.5, 16);
            expect(Object.keys(fill).length).toBeGreaterThan(0);
        });
    });

    describe('Template Integrity', () => {
        const validInstruments = [
            'Kick',
            'Snare',
            'HiHat',
            'Open',
            'Crash',
            'Clave',
            'Conga',
            'Bongo',
            'Perc',
            'Shaker',
            'Guiro',
            'High Tom',
            'Mid Tom',
            'Low Tom',
            'Sidestick',
        ];

        Object.entries(FILL_TEMPLATES).forEach(([genre, levels]) => {
            Object.entries(levels).forEach(([level, templates]) => {
                templates.forEach((template, idx) => {
                    it(`should have structural integrity: ${genre} - ${level} [${idx}]`, () => {
                        const { steps, instruments, velocities } = template;

                        // Check matching lengths
                        expect(
                            instruments.length,
                            `Instrument array length mismatch in ${genre}/${level}[${idx}]`,
                        ).toBe(steps.length);
                        expect(
                            velocities.length,
                            `Velocity array length mismatch in ${genre}/${level}[${idx}]`,
                        ).toBe(steps.length);

                        // Check for undefined or invalid instruments
                        instruments.forEach((inst, instIdx) => {
                            expect(
                                inst,
                                `Instrument at index ${instIdx} is undefined in ${genre}/${level}[${idx}]`,
                            ).toBeDefined();
                            expect(
                                validInstruments.includes(inst),
                                `Unknown instrument "${inst}" in ${genre}/${level}[${idx}]`,
                            ).toBe(true);
                        });

                        // Check steps are within standard bounds (0-15)
                        steps.forEach((step) => {
                            expect(step).toBeGreaterThanOrEqual(0);
                            expect(step).toBeLessThan(16);
                        });
                    });
                });
            });
        });
    });
});
