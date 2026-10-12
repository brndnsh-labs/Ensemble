import { describe, expect, it } from 'vitest';
import { getChordDetails } from '../../../public/engine/chords-engine.js';

describe('Augmented Chords Support', () => {
    describe('getChordDetails', () => {
        const testCases = [
            { input: 'Caug', expectedQuality: 'aug', expectedIs7th: false },
            { input: 'C+', expectedQuality: 'aug', expectedIs7th: false },
            { input: 'Caug7', expectedQuality: 'aug', expectedIs7th: true },
            { input: 'C+7', expectedQuality: 'aug', expectedIs7th: true },
            { input: 'C7+', expectedQuality: 'aug', expectedIs7th: true },
            { input: 'Cmaj7#5', expectedQuality: 'augmaj7', expectedIs7th: true },
            { input: 'Cmaj7+', expectedQuality: 'augmaj7', expectedIs7th: true }, // maj7+ === maj7#5 (augmaj7); chords-engine sets is7th = true
        ];

        testCases.forEach(({ input, expectedQuality, expectedIs7th }) => {
            it(`should identify properties correctly for ${input}`, () => {
                const details = getChordDetails(input);
                expect(details.quality).toBe(expectedQuality);
                expect(details.is7th).toBe(expectedIs7th);
            });
        });
    });
});
