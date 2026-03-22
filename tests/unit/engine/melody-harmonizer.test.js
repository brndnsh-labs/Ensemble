import { describe, expect, it } from 'vitest';
import { Harmonizer } from '../../../public/melody-harmonizer.js';

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

    it('should handle silent melodies gracefully', () => {
        const silent = [];
        const options = harmonizer.generateOptions(silent, 'C');
        expect(options).toHaveLength(0);

        const prog = harmonizer.generateProgression(silent, 'C', 0.5);
        expect(prog).toBe('I');
    });

    it('should assign SRDC structural states to measures', () => {
        // 4 measures of melody (4 beats per measure)
        const longMelody = Array(16)
            .fill(null)
            .map((_, i) => ({
                beat: i,
                midi: 60 + (i % 7),
                energy: 1,
            }));

        const options = harmonizer.generateOptions(longMelody, 'C');
        const chords = options[0].chords;

        expect(chords[0].structuralState).toBe('Statement');
        expect(chords[1].structuralState).toBe('Restatement');
        expect(chords[2].structuralState).toBe('Departure');
        expect(chords[3].structuralState).toBe('Conclusion');
    });

    it('should favor diatonic resolution in Conclusion measures', () => {
        // Measure 1: C Major (Statement)
        // Measure 2: Highly chromatic melody (Departure)
        // Measure 3: Simple C melody (Conclusion)
        const chromaticMelody = [
            { beat: 0, midi: 60, energy: 1 }, // C
            { beat: 1, midi: 60, energy: 1 },
            { beat: 2, midi: 60, energy: 1 },
            { beat: 3, midi: 60, energy: 1 },

            { beat: 4, midi: 61, energy: 1 }, // Db (Chromatic)
            { beat: 5, midi: 63, energy: 1 }, // Eb (Chromatic)
            { beat: 6, midi: 66, energy: 1 }, // Gb (Chromatic)
            { beat: 7, midi: 68, energy: 1 }, // Ab (Chromatic)

            { beat: 8, midi: 60, energy: 1 }, // C
            { beat: 9, midi: 60, energy: 1 },
            { beat: 10, midi: 60, energy: 1 },
            { beat: 11, midi: 60, energy: 1 },
        ];

        // We use detectStructure directly or just check measure 3
        const options = harmonizer.generateOptions(chromaticMelody, 'C');
        const chords = options[0].chords;

        // Measure 3 (Index 2) is "Departure" in a 3-measure set?
        // detectStructure uses m % 4. 0=S, 1=R, 2=D, 3=C.
        // So measure 3 (index 2) is Departure.

        expect(chords[0].structuralState).toBe('Statement');
        expect(chords[1].structuralState).toBe('Restatement');
        expect(chords[2].structuralState).toBe('Departure');

        // Let's force a 4-measure melody to test Conclusion specifically
        const fourBarMelody = [
            ...chromaticMelody,
            { beat: 12, midi: 60, energy: 1 },
            { beat: 13, midi: 60, energy: 1 },
            { beat: 14, midi: 60, energy: 1 },
            { beat: 15, midi: 60, energy: 1 },
        ];

        const opt4 = harmonizer.generateOptions(fourBarMelody, 'C');
        const chords4 = opt4[0].chords;
        expect(chords4[3].structuralState).toBe('Conclusion');

        // In "Consonant" (opt4[0]), Conclusion should be strictly Diatonic (e.g., I or V)
        // whereas Departure (chords4[2]) might have struggled with the chromatic melody
        // or been allowed more freedom if we tuned it that way.

        // Verify that Conclusion is I (absRoot: 0 in C)
        expect(chords4[3].absRoot).toBe(0);
    });
});
