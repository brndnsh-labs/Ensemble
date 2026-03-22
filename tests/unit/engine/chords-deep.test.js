import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getChordDetails } from '../../../public/engine/chords-engine.js';

describe('Chords Details Deep Dive', () => {
    it('should extract complex chord qualities', () => {
        const qualities = [
            { input: 'Cmaj11', quality: 'maj11' },
            { input: 'Cmaj7#11', quality: 'maj7#11' },
            { input: 'Csus4', quality: 'sus4' },
            { input: 'Csus2', quality: 'sus2' },
            { input: 'Cadd9', quality: 'add9' },
            { input: 'C6', quality: '6' },
            { input: 'Cm6', quality: 'm6' },
        ];

        qualities.forEach(({ input, quality }) => {
            const details = getChordDetails(input);
            expect(details.quality).toBe(quality);
        });
    });

    it('should handle various dominant extensions', () => {
        const dominants = ['C9', 'C11', 'C13', 'C7b9', 'C7#9', 'C7b5', 'C7#5'];
        dominants.forEach((input) => {
            const details = getChordDetails(input);
            expect(details.quality).toBeDefined();
            expect(details.is7th).toBe(true);
        });
    });
});
