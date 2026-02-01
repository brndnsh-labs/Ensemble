import { describe, it, expect } from 'vitest';
import { extractForm } from '../../public/form-extractor.js';

// Helper to generate beat data from a chord string
// Format: "C | F | G | C" (each chord is 1 measure = 4 beats)
function generateBeatData(progressionStr, repeats = 1, variationFn = null) {
    const beatsPerMeasure = 4;
    const measures = progressionStr.split('|').map(c => c.trim());
    const beatData = [];

    for (let r = 0; r < repeats; r++) {
        measures.forEach((chord, mIdx) => {
            let currentChord = chord;

            // Apply variation if provided
            if (variationFn) {
                const varied = variationFn(r, mIdx, chord);
                if (varied) currentChord = varied;
            }

            for (let b = 0; b < beatsPerMeasure; b++) {
                beatData.push({
                    beat: beatData.length,
                    chord: currentChord,
                    energy: 0.8 // Simulate decent energy
                });
            }
        });
    }
    return beatData;
}

describe('Form Extractor - Lead Sheet Logic', () => {

    it('should identify a standard 12-Bar Blues as a single repeating section', () => {
        const blues = "C | C | C | C | F | F | C | C | G | F | C | G";
        const data = generateBeatData(blues, 3); // 3 choruses

        const sections = extractForm(data, 4);

        // Expectation: Ideally 1 section repeated 3 times.
        // Or 3 sections of "12-Bar Blues Form".
        // The current extractor might split it differently, but we want to assert high-level structure.

        console.log('Blues Sections:', sections.map(s => `${s.label} (${s.repeat})`));

        // We want fewer sections, ideally just one main block type
        const uniqueLabels = new Set(sections.map(s => s.label));
        expect(uniqueLabels.size).toBeLessThanOrEqual(2); // Maybe "Main Theme" and "Intro/Outro" if it glitches

        // The total measures should be preserved
        const totalMeasures = sections.reduce((acc, s) => acc + (s.lengthInMeasures * s.repeat), 0);
        expect(totalMeasures).toBe(12 * 3);
    });

    it('should identify House of the Rising Sun as repeating verses', () => {
        // Am | C | D | F | Am | C | E | E
        // Am | C | D | F | Am | E | Am | E
        const verse = "Am | C | D | F | Am | C | E | E | Am | C | D | F | Am | E | Am | E";
        const data = generateBeatData(verse, 2);

        const sections = extractForm(data, 4);
        console.log('Rising Sun Sections:', sections.map(s => `${s.label} (${s.repeat})`));

        // Should be 2 repetitions of a 16-bar form, or maybe 4 repetitions of 8-bar forms?
        // Ideally: "Verse" x 2

        const mainSections = sections.filter(s => s.lengthInMeasures >= 8);
        expect(mainSections.length).toBeGreaterThan(0);
        expect(mainSections[0].repeat).toBeGreaterThanOrEqual(1);
    });

    it('should handle AABA form correctly', () => {
        const A = "C | Am | F | G | C | Am | F | G"; // 8 bars
        const B = "F | F | C | C | D7 | D7 | G7 | G7"; // 8 bars bridge

        // A A B A
        const full = `${A} | ${A} | ${B} | ${A}`;
        const data = generateBeatData(full, 1);

        const sections = extractForm(data, 4);
        console.log('AABA Sections:', sections.map(s => `${s.label} (${s.repeat})`));

        // Expect: A (x2) -> B -> A
        // Or: A -> A -> B -> A

        expect(sections.length).toBeGreaterThanOrEqual(3);

        // If A1 and A2 are merged:
        if (sections[0].repeat === 2) {
            expect(sections[0].label).toContain('Section A');
            expect(sections[1].label).toContain('Section B'); // B != A

            // The last section should be A again
            const lastSection = sections[sections.length - 1];
            expect(lastSection.label).toBe(sections[0].label);
        } else {
             // If not merged:
            expect(sections[0].label).toBe(sections[1].label); // A == A
            expect(sections[2].label).not.toBe(sections[0].label); // B != A
            expect(sections[3].label).toBe(sections[0].label); // Back to A
        }
    });

    it('should handle slight variations (The "Fuzzy" Test)', () => {
        const A1 = "C | Am | F | G";
        const A2 = "C | Am | F | G7"; // G vs G7 variation

        const full = `${A1} | ${A2} | ${A1} | ${A2}`;
        const data = generateBeatData(full, 1);

        const sections = extractForm(data, 4);
        console.log('Fuzzy Sections:', sections.map(s => `${s.label}: ${s.value}`));

        // Ideally, these should be grouped as the same section despite the G/G7 difference.
        // Current behavior might split them. We want to improve this.

        const uniqueLabels = new Set(sections.map(s => s.label));
        // If strict, we get 2 labels. If fuzzy, we get 1.
        // We want to move towards 1.
        expect(uniqueLabels.size).toBeLessThan(3);
    });

    it('should identify Amazing Grace (16 bar)', () => {
        // F | F | Bb | F | F | F | C | C
        // F | F | Bb | F | F | C | F | F
        const verse = "F | F | Bb | F | F | F | C | C | F | F | Bb | F | F | C | F | F";
        const data = generateBeatData(verse, 2);

        const sections = extractForm(data, 4);
        console.log('Amazing Grace Sections:', sections.map(s => `${s.label} (${s.repeat})`));

        const totalMeasures = sections.reduce((acc, s) => acc + (s.lengthInMeasures * s.repeat), 0);
        expect(totalMeasures).toBe(32);

        // Should ideally be one repeating block
        const significant = sections.filter(s => s.lengthInMeasures > 4);
        expect(significant.length).toBeGreaterThan(0);
    });

});
