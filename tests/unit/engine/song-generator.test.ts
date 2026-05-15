import { describe, expect, it, vi } from 'vitest';
import { generateSong } from '../../../public/song-generator.js';

describe('Song Generator', () => {
    it('should generate a song with default options', () => {
        const result = generateSong();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toHaveProperty('label');
        expect(result[0]).toHaveProperty('value');
        expect(result[0]).toHaveProperty('key');
    });

    it('should respect a specific key', () => {
        const result = generateSong({ key: 'Eb' });
        expect(result[0].key).toBe('Eb');
    });

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
        expect(allChords).toMatch(/\bi\b|\biv\b|\bv\b/);
    });

    it('should respect a specific time signature', () => {
        const result = generateSong({ timeSignature: '3/4' });
        expect(result[0].timeSignature).toBe('3/4');
    });

    it('should handle random time signature selection', () => {
        const spy = vi.spyOn(Math, 'random');

        // 4/4 branch (< 0.7)
        spy.mockReturnValue(0.5);
        let result = generateSong({ timeSignature: 'Random' });
        expect(result[0].timeSignature).toBe('4/4');

        // 3/4 branch (0.7 - 0.9)
        spy.mockReturnValue(0.8);
        result = generateSong({ timeSignature: 'Random' });
        expect(result[0].timeSignature).toBe('3/4');

        // 6/8 branch (> 0.9)
        spy.mockReturnValue(0.95);
        result = generateSong({ timeSignature: 'Random' });
        expect(result[0].timeSignature).toBe('6/8');

        spy.mockRestore();
    });

    it('should generate a Blues structure', () => {
        const result = generateSong({ structure: 'blues' });
        const labels = result.map((s) => s.label);
        expect(labels).toContain('Verse');
        expect(labels).toContain('Solo');
        // Blues should have 12 bars per section
        expect(result[0].value.split(' | ').length).toBe(12);
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

        // Complex should contain extensions like maj9, 13, 9
        expect(complexChords).toMatch(/maj9|13|9/);
        expect(simpleChords).not.toMatch(/maj9|13/);
    });

    it('should generate a Simple structure', () => {
        const result = generateSong({ structure: 'simple' });
        const labels = result.map((s) => s.label);
        expect(labels).toEqual(['Verse', 'Chorus', 'Verse', 'Chorus']);
    });

    it('should respect the seed from a current section', () => {
        const seedValue = 'I | IV | V | I';
        const result = generateSong({
            structure: 'simple',
            seed: { type: 'Verse', value: seedValue },
        });

        const verses = result.filter((s) => s.label === 'Verse');
        verses.forEach((v) => {
            expect(v.value).toBe(seedValue);
        });
    });

    it('should reuse generated progressions for same labels (memory logic)', () => {
        const result = generateSong({ structure: 'simple' }); // Verse, Chorus, Verse, Chorus
        expect(result[0].value).toBe(result[2].value); // First and second Verse should match
        expect(result[1].value).toBe(result[3].value); // First and second Chorus should match
    });
});
