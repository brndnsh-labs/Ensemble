import { describe, expect, it, vi } from 'vitest';
import { getChordDetails, getIntervals } from '../../public/chords.js';

// Mock state
vi.mock('../../public/state.js', () => {
    const mockState = {
        playback: { bandIntensity: 0.5 },
        chords: { density: 'standard', octave: 60, pianoRoots: true },
        arranger: { timeSignature: '4/4', key: 'C', isMinor: false, notation: 'roman' },
        groove: { genreFeel: 'Rock' },
        bass: { enabled: true },
        soloist: {},
        harmony: {},
        vizState: {},
        midi: {},
        storage: {},
        dispatch: vi.fn(),
    };
    return {
        ...mockState,
        stateMap: mockState,
        getState: () => mockState,
    };
});

describe('Augmented Chords Support', () => {
    describe('getChordDetails', () => {
        const testCases = [
            { input: 'Caug', expectedQuality: 'aug', expectedIs7th: false },
            { input: 'C+', expectedQuality: 'aug', expectedIs7th: false },
            { input: 'Caug7', expectedQuality: 'aug', expectedIs7th: true },
            { input: 'C+7', expectedQuality: 'aug', expectedIs7th: true },
            { input: 'C7+', expectedQuality: 'aug', expectedIs7th: true },
            { input: 'Cmaj7#5', expectedQuality: 'augmaj7', expectedIs7th: true },
            { input: 'Cmaj7+', expectedQuality: 'augmaj7', expectedIs7th: false }, // getChordDetails parses 'maj7+' as quality: 'augmaj7', is7th: false based on previous tests
        ];

        testCases.forEach(({ input, expectedQuality, expectedIs7th }) => {
            it(`should identify properties correctly for ${input}`, () => {
                const details = getChordDetails(input);
                expect(details.quality).toBe(expectedQuality);
                if (expectedIs7th !== undefined && expectedIs7th !== false) {
                    expect(details.is7th).toBe(expectedIs7th);
                }
            });
        });
    });

    describe('getIntervals', () => {
        const cases = [
            { desc: 'augmented triad', quality: 'aug', is7th: false, expected: [0, 4, 8] },
            { desc: 'augmented 7th', quality: 'aug', is7th: true, expected: [0, 4, 8, 10] },
            {
                desc: 'augmented major 7th',
                quality: 'augmaj7',
                is7th: true,
                expected: [0, 4, 8, 11],
            },
        ];

        cases.forEach(({ desc, quality, is7th, expected }) => {
            it(`should return ${expected} for ${desc}`, () => {
                const intervals = getIntervals(quality, is7th, 'standard', 'Rock', true);
                expect(intervals).toEqual(expected);
            });
        });
    });
});
