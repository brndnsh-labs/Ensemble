/* eslint-disable */
import { describe, expect, it } from 'vitest';
import { DRUM_PRESETS } from '../../public/data/drum-presets.js';

describe('Preset Data Integrity', () => {
    it('should have expanded all drum pattern strings into numeric arrays', () => {
        // Pick a few representative presets
        const standard = DRUM_PRESETS.Standard;
        const _rock = DRUM_PRESETS['Basic Rock'];

        // Check Kick in Standard (was "2000000010000000")
        expect(Array.isArray(standard.Kick)).toBe(true);
        expect(standard.Kick[0]).toBe(2);
        expect(standard.Kick[8]).toBe(1);
        expect(standard.Kick.length).toBe(16);

        // Check a nested time signature override (3/4)
        const waltzKick = standard['3/4'].Kick;
        expect(Array.isArray(waltzKick)).toBe(true);
        expect(waltzKick.length).toBe(12);
    });

    it('should have valid numeric values (0, 1, or 2) in all instrument arrays', () => {
        Object.keys(DRUM_PRESETS).forEach((presetName) => {
            const p = DRUM_PRESETS[presetName];
            ['Kick', 'Snare', 'HiHat', 'Open'].forEach((inst) => {
                const pattern = p[inst];
                if (Array.isArray(pattern)) {
                    pattern.forEach((val) => {
                        expect([0, 1, 2]).toContain(val);
                    });
                }
            });
        });
    });

    it('should have at least one non-empty instrument pattern at the top level', () => {
        // This ensures presets aren't silent by default due to missing top-level definitions
        const ALL_INSTRUMENTS = [
            'Kick',
            'Snare',
            'HiHat',
            'Open',
            'Clave',
            'Conga',
            'Bongo',
            'Perc',
            'Shaker',
            'Guiro',
            'High Tom',
            'Mid Tom',
            'Low Tom',
        ];

        Object.keys(DRUM_PRESETS).forEach((presetName) => {
            const p = DRUM_PRESETS[presetName];
            const hasHits = ALL_INSTRUMENTS.some((inst) => {
                const pattern = p[inst];
                return Array.isArray(pattern) && pattern.some((v) => v > 0);
            });

            expect(hasHits, `Preset "${presetName}" is effectively silent at the top level`).toBe(
                true,
            );
        });
    });
});
