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
        getState: () => mockState,
    };
});

describe('Augmented Chords Support', () => {
    describe('getChordDetails', () => {
        it('should identify aug quality for "aug"', () => {
            const details = getChordDetails('Caug');
            expect(details.quality).toBe('aug');
        });

        it('should identify aug quality for "+"', () => {
            const details = getChordDetails('C+');
            expect(details.quality).toBe('aug');
        });

        it('should identify aug quality and 7th for "aug7"', () => {
            const details = getChordDetails('Caug7');
            expect(details.quality).toBe('aug');
            expect(details.is7th).toBe(true);
        });

        it('should identify aug quality and 7th for "+7"', () => {
            const details = getChordDetails('C+7');
            expect(details.quality).toBe('aug');
            expect(details.is7th).toBe(true);
        });

        it('should handle "maj7#5"', () => {
            const details = getChordDetails('Cmaj7#5');
            expect(details.quality).toBe('augmaj7');
            expect(details.is7th).toBe(true);
        });

        it('should handle "maj7+"', () => {
            const details = getChordDetails('Cmaj7+');
            expect(details.quality).toBe('augmaj7');
        });

        it('should handle "7+" (dominant augmented)', () => {
            const details = getChordDetails('C7+');
            expect(details.quality).toBe('aug');
            expect(details.is7th).toBe(true);
        });
    });

    describe('getIntervals', () => {
        it('should return [0, 4, 8] for augmented triad', () => {
            const intervals = getIntervals('aug', false, 'standard', 'Rock', true);
            expect(intervals).toEqual([0, 4, 8]);
        });

        it('should return [0, 4, 8, 10] for augmented 7th', () => {
            const intervals = getIntervals('aug', true, 'standard', 'Rock', true);
            expect(intervals).toEqual([0, 4, 8, 10]);
        });

        it('should return [0, 4, 8, 11] for augmented major 7th', () => {
            const intervals = getIntervals('augmaj7', true, 'standard', 'Rock', true);
            expect(intervals).toEqual([0, 4, 8, 11]);
        });
    });
});
