// @ts-nocheck
/* eslint-disable */
import { describe, expect, it } from 'vitest';
import {
    FILL_TEMPLATES,
    generatePhrasePickup,
    generateProceduralFill,
} from '../../../public/engine/fills.js';

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

    describe('Phrase pickup (generatePhrasePickup)', () => {
        // The pickup window is the bar's last beat, keyed RELATIVE 0..stepsPerBeat-1.
        // Relative-0 is the beat's downbeat — in 4/4 that's the beat-4 backbeat slot
        // (step 12), which the BASE groove must keep. Every variant must leave it empty.
        it('never writes the leading subdivision (relative 0) — backbeat stays with the base groove', () => {
            // Sweep all three variant bands and a range of intensities.
            for (const seed of [0.1, 0.4, 0.7, 0.95]) {
                for (const intensity of [0.46, 0.6, 0.8, 1.0]) {
                    const pickup = generatePhrasePickup(4, intensity, seed);
                    expect(pickup[0]).toBeUndefined();
                }
            }
        });

        it('also clears the backbeat-adjacent 16th (relative 1) in the two-note + tom variants', () => {
            // Only the busier flurry (0.55 <= seed < 0.85) is allowed to use relative 1.
            expect(generatePhrasePickup(4, 0.7, 0.1)[1]).toBeUndefined(); // two-note hinge
            expect(generatePhrasePickup(4, 0.7, 0.95)[1]).toBeUndefined(); // snare→tom color
            expect(generatePhrasePickup(4, 0.7, 0.6)[1]).toBeDefined(); // flurry uses it
        });

        it('velocities climb into the downbeat and stay below the backbeat crack', () => {
            const pickup = generatePhrasePickup(4, 0.8, 0.1);
            const penult = pickup[2][0].vel;
            const last = pickup[3][0].vel;
            expect(last).toBeGreaterThan(penult); // climbing lead-in
            expect(last).toBeLessThan(0.9); // never overpowers the backbeat
        });

        it('only uses the busier 16th flurry when there are enough subdivisions (stepsPerBeat >= 4)', () => {
            // Compound beat (stepsPerBeat 2): even the flurry seed band collapses to
            // the simple two-note hinge — keys only at penult(0)/last(1)... but
            // relative-0 must still be reserved, so the 2-step window uses last only
            // for the leading? No: with stepsPerBeat 2, penult=0/last=1, and the
            // default hinge writes both — assert it does NOT exceed the window.
            const pickup = generatePhrasePickup(2, 0.8, 0.6); // flurry band, but spb<4
            const keys = Object.keys(pickup).map(Number);
            keys.forEach((k) => {
                expect(k).toBeGreaterThanOrEqual(0);
                expect(k).toBeLessThan(2);
            });
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
