import { describe, expect, it } from 'vitest';
import { mutateProgression } from '../../../public/chords.js';

describe('Chords Mutation Logic', () => {
    it('should return an object with value and mutatedIndex', () => {
        const input = 'I | IV | V | I';
        const result = mutateProgression(input);

        expect(result).toHaveProperty('value');
        expect(result).toHaveProperty('mutatedIndex');
        expect(typeof result.value).toBe('string');
        expect(typeof result.mutatedIndex).toBe('number');
    });

    it('should change exactly one chord (or keep it same if randomization picks same)', () => {
        const input = 'I | IV | V | I';
        const result = mutateProgression(input);
        const originalParts = input.split('|').map((p) => p.trim());
        const mutatedParts = result.value.split('|').map((p) => p.trim());

        expect(mutatedParts.length).toBe(originalParts.length);

        // Ensure mutatedIndex is within bounds
        expect(result.mutatedIndex).toBeGreaterThanOrEqual(0);
        expect(result.mutatedIndex).toBeLessThan(originalParts.length);
    });

    it('should handle empty strings gracefully', () => {
        const result = mutateProgression('');
        expect(result.value).toBe('');
        expect(result.mutatedIndex).toBe(-1);
    });

    it('should provide valid substitutions for common numerals', () => {
        // Run multiple times to catch different random paths
        for (let i = 0; i < 20; i++) {
            const result = mutateProgression('I');
            // 'I' can become 'vi', 'IV', 'Imaj7', or extension change
            expect(['I', 'vi', 'IV', 'Imaj7', 'I7']).toContain(result.value);
        }
    });
});
