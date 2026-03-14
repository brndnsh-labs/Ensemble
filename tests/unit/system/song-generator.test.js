/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import { generateSong } from '../../../public/song-generator.js';

describe('Song Generator (Inspiration Hub) - Music Theory Logic', () => {
    it('should generate minor progressions when isMinor is true', () => {
        const sections = generateSong({
            structure: 'pop',
            isMinor: true,
            key: 'Am',
        });

        // Check if common minor Roman numerals exist in the output
        const allChords = sections.map((s) => s.value).join(' ');
        expect(allChords.toLowerCase()).toContain('i');
        // Minor progressions in the pool use 'i', 'iv', 'bVI', etc.
        // We look for lowercase 'i' specifically
        expect(allChords).toMatch(/\bi\b|\biv\b|\bv\b/);
    });

    it('should implement Jazz AABA structure with motif memory', () => {
        const sections = generateSong({
            structure: 'jazz',
            complexity: 0.5,
        });

        // Verify structure labels
        expect(sections.map((s) => s.label)).toEqual(['A1', 'A2', 'B', 'A3']);

        // Verify A sections are identical (motif memory)
        expect(sections[0].value).toBe(sections[1].value);
        expect(sections[0].value).toBe(sections[3].value);

        // Verify B section is different
        expect(sections[2].value).not.toBe(sections[0].value);
    });

    it('should add chord extensions at high complexity', () => {
        const simpleSections = generateSong({
            structure: 'pop',
            complexity: 0.1,
        });
        const complexSections = generateSong({
            structure: 'pop',
            complexity: 0.9,
        });

        const simpleChords = simpleSections.map((s) => s.value).join(' ');
        const complexChords = complexSections.map((s) => s.value).join(' ');

        // Simple should mostly be basic Roman numerals (I, IV, V, vi)
        // Complex should contain extensions like maj9, 13, 9
        expect(complexChords).toMatch(/maj9|13|9/);
        expect(simpleChords).not.toMatch(/maj9|13/);
    });

    it('should respect the seed from a current section', () => {
        const seedValue = 'I | IV | V | I';
        const sections = generateSong({
            structure: 'pop',
            seed: { type: 'Verse', value: seedValue },
        });

        // The Verse sections should match the seed exactly
        const verse = sections.find((s) => s.label === 'Verse');
        expect(verse.value).toBe(seedValue);
    });
});
