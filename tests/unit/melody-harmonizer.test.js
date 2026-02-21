import { describe, expect, it } from 'vitest';
import { Harmonizer } from '../../public/melody-harmonizer.js';

describe('Melody Harmonizer', () => {
    const harmonizer = new Harmonizer();

    const cMajorScale = [
        { beat: 0, midi: 60, energy: 1 }, // C
        { beat: 1, midi: 62, energy: 1 }, // D
        { beat: 2, midi: 64, energy: 1 }, // E
        { beat: 3, midi: 65, energy: 1 }, // F
    ];

    it('should generate 3 distinct options', () => {
        const options = harmonizer.generateOptions(cMajorScale, 'C');
        expect(options).toHaveLength(3);
        expect(options[0].type).toBe('Consonant');
        expect(options[1].type).toBe('Balanced');
        expect(options[2].type).toBe('Complex');
    });

    it('should include reasoning for chords', () => {
        const options = harmonizer.generateOptions(cMajorScale, 'C');
        const opt = options[0];
        expect(opt.chords).toBeDefined();
        expect(opt.chords.length).toBeGreaterThan(0);

        const firstChord = opt.chords[0];
        expect(firstChord.reasons).toBeInstanceOf(Array);
        // It might be empty if no specific reason triggered, but usually "Melody matches X"
        // In this simple case, C matches I.
    });

    it('should support legacy generateProgression method', () => {
        const prog = harmonizer.generateProgression(cMajorScale, 'C', 0.5);
        expect(typeof prog).toBe('string');
        expect(prog.length).toBeGreaterThan(0);
    });

    it('should handle silent melodies gracefullly', () => {
        const silent = [];
        const options = harmonizer.generateOptions(silent, 'C');
        expect(options).toHaveLength(0);

        const prog = harmonizer.generateProgression(silent, 'C', 0.5);
        expect(prog).toBe('I');
    });
});
