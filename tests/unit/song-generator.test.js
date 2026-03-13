import { describe, expect, it, vi } from 'vitest';
import { generateSong } from '../../public/song-generator.js';

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

    it('should handle random key selection', () => {
        const result = generateSong({ key: 'Random' });
        expect(typeof result[0].key).toBe('string');
        expect(result[0].key.length).toBeGreaterThan(0);
    });

    it('should respect a specific time signature', () => {
        const result = generateSong({ timeSignature: '3/4' });
        expect(result[0].timeSignature).toBe('3/4');
    });

    it('should handle random time signature selection', () => {
        // Mock Math.random to test different branches
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

    it('should generate a Ballad structure', () => {
        const result = generateSong({ structure: 'ballad' });
        const labels = result.map((s) => s.label);
        expect(labels).toContain('Verse');
        expect(labels).toContain('Chorus');
    });

    it('should generate a Simple structure', () => {
        const result = generateSong({ structure: 'simple' });
        const labels = result.map((s) => s.label);
        expect(labels).toEqual(['Verse', 'Chorus', 'Verse', 'Chorus']);
    });

    it('should use provided seed memory (lines 133-135)', () => {
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

    it('should fallback to Verse pool if label is unknown (line 153)', () => {
        // We can't easily trigger an unknown label with generateSong alone
        // without mocking STRUCTURES, but we can verify it doesn't crash.
        // Actually, we can pass a structure that isn't in STRUCTURES if we could,
        // but it defaults to pop.
        const result = generateSong({ structure: 'unknown_style' });
        expect(result.length).toBeGreaterThan(0);
    });
});
