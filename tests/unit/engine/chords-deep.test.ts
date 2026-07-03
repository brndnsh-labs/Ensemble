import { describe, expect, it } from 'vitest';
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
        const dominants = [
            { input: 'C9', quality: '9' },
            { input: 'C11', quality: '11' },
            { input: 'C13', quality: '13' },
            { input: 'C7b9', quality: '7b9' },
            { input: 'C7#9', quality: '7#9' },
            { input: 'C7b5', quality: 'halfdim' },
            { input: 'C7#5', quality: 'aug' },
        ];
        dominants.forEach(({ input, quality }) => {
            const details = getChordDetails(input);
            expect(details.quality).toBe(quality);
            expect(details.is7th).toBe(true);
        });
    });
});
