/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));
vi.mock('../../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: { bandIntensity: 0.5 },
        chords: { density: 'standard', octave: 60, pianoRoots: true },
        arranger: {
            timeSignature: '4/4',
            key: 'C',
            isMinor: false,
            notation: 'roman',
            sections: [],
        },
        groove: { genreFeel: 'Rock' },
        bass: { enabled: true },
        harmony: { enabled: false },
        soloist: {},
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

vi.mock('../../../public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    ENHARMONIC_MAP: { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' },
    ROMAN_VALS: { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 },
    NNS_OFFSETS: [0, 2, 4, 5, 7, 9, 11],
    INTERVAL_TO_ROMAN: {
        0: 'I',
        1: 'bII',
        2: 'II',
        3: 'bIII',
        4: 'III',
        5: 'IV',
        6: 'bV',
        7: 'V',
        8: 'bVI',
        9: 'VI',
        10: 'bVII',
        11: 'VII',
    },
    INTERVAL_TO_NNS: {
        0: '1',
        1: 'b2',
        2: '2',
        3: 'b3',
        4: '3',
        5: '4',
        6: 'b5',
        7: '5',
        8: 'b6',
        9: '6',
        10: 'b7',
        11: '7',
    },
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th' },
    },
}));

import {
    getBestInversion,
    getChordDetails,
    getIntervals,
    transformRelativeProgression,
    validateProgression,
} from '../../../public/chords.js';
import { getState } from '../../../public/state.js';

const { arranger, playback, chords, bass, groove } = getState();

describe('Chords & Voicing Logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        groove.genreFeel = 'Rock';
        bass.enabled = true;
        chords.density = 'standard';
        playback.bandIntensity = 0.5;
    });

    describe('Chord Parsing (getChordDetails)', () => {
        it('should correctly identify various chord qualities', () => {
            expect(getChordDetails('C').quality).toBe('major');
            expect(getChordDetails('m7').quality).toBe('minor');
            expect(getChordDetails('m7').is7th).toBe(true);
            expect(getChordDetails('maj7').quality).toBe('maj7');
            expect(getChordDetails('7alt').quality).toBe('7alt');
            expect(getChordDetails('13(#11b9)').quality).toBe('13');
            expect(getChordDetails('m7/G').quality).toBe('minor');
        });
    });

    describe('Interval Generation (getIntervals)', () => {
        it('should provide spread 10ths for Rock Major', () => {
            const intervals = getIntervals('major', false, 'standard', 'Rock', false);
            expect(intervals).toEqual([0, 7, 16, 19]);
        });

        it('should use rootless functional voicings for Jazz', () => {
            groove.genreFeel = 'Jazz';
            // maj7 -> 3, 5, 7
            expect(getIntervals('maj7', true, 'standard', 'Jazz', true)).toEqual([4, 7, 11]);
            // m7 -> b3, 5, b7
            expect(getIntervals('minor', true, 'standard', 'Jazz', true)).toEqual([3, 7, 10]);
            // 7 -> 3, 5, b7
            expect(getIntervals('7', true, 'standard', 'Jazz', true)).toEqual([4, 7, 10]);
        });

        it('should scale density for Jazz voicings', () => {
            groove.genreFeel = 'Jazz';
            // standard maj7: 3, 5, 7 [4, 7, 11]
            // rich maj7: 3, 7, 9 [4, 11, 14]
            expect(getIntervals('maj7', true, 'rich', 'Jazz', true)).toEqual([4, 11, 14]);
            // rich 7: 3, b7, 9, 13 [4, 10, 14, 21]
            expect(getIntervals('7', true, 'rich', 'Jazz', true)).toEqual([4, 10, 14, 21]);
        });

        it('should handle altered dominants correctly', () => {
            groove.genreFeel = 'Jazz';
            const intervals = getIntervals('7alt', true, 'standard', 'Jazz', true);
            // 3, b7, #9, b13 -> [4, 10, 15, 20]
            expect(intervals).toEqual([4, 10, 15, 20]);
        });

        it('should use rootless voicings for Blues dominant chords', () => {
            groove.genreFeel = 'Blues';
            // Dominant 7: 3, 5, b7 [4, 7, 10]
            expect(getIntervals('7', true, 'standard', 'Blues', true)).toEqual([4, 7, 10]);
        });

        it('should use "So What" voicing for Neo-Soul minor 7', () => {
            groove.genreFeel = 'Neo-Soul';
            expect(getIntervals('minor', true, 'standard', 'Neo-Soul', true)).toEqual([
                5, 10, 15, 19,
            ]);
        });

        it('should NOT produce a perfect 5th for half-diminished in Rock/Pop', () => {
            const intervals = getIntervals('halfdim', true, 'standard', 'Rock', true);
            expect(intervals).toContain(6); // b5
            expect(intervals).not.toContain(7); // No natural 5
        });
    });

    describe('Inversion & Voice Leading (getBestInversion)', () => {
        it('should center the first chord and minimize movement thereafter', () => {
            // C Major triad
            const voicedC = getBestInversion(60, [0, 4, 7], []);
            expect(voicedC).toEqual([55, 60, 64]);

            // Transition to F Major [5, 9, 0]
            const voicedF = getBestInversion(65, [0, 4, 7], voicedC);
            // Closest F triad to [55, 60, 64] is [53, 57, 60] or [57, 60, 65]
            // Let's verify voice leading
            const avgC = voicedC.reduce((a, b) => a + b, 0) / 3; // 59.66
            const avgF = voicedF.reduce((a, b) => a + b, 0) / 3;
            expect(Math.abs(avgF - avgC)).toBeLessThan(7);
        });

        it('should respect range limits and prevent overlapping with bass', () => {
            const voicedLow = getBestInversion(36, [0, 4, 7], []);
            const avg = voicedLow.reduce((a, b) => a + b, 0) / 3;
            expect(avg).toBeGreaterThanOrEqual(43);
        });

        it('should maintain spread voicings as a unit', () => {
            const intervals = [0, 7, 16, 19];
            const voiced = getBestInversion(48, intervals, []);
            const resultIntervals = voiced.map((n) => n - voiced[0]);
            expect(resultIntervals).toEqual(intervals);
        });
    });

    describe('Transposition (transformRelativeProgression)', () => {
        it('should transpose Roman Numerals correctly', () => {
            // iim7 | V7 | Imaj7 shift -3
            const result = transformRelativeProgression('iim7 | V7 | Imaj7', -3, true);
            expect(result).toBe('ivm7 | bVII7 | bIIImaj7');
        });

        it('should handle Nashville Numbers and Absolute names', () => {
            expect(transformRelativeProgression('1 | 4 | 5', -3, true)).toBe('b3 | b6 | b7');
            expect(transformRelativeProgression('C | F | G', 1, false)).toBe('Db | Gb | Ab');
        });

        it('should handle slash chords and preserve casing', () => {
            expect(transformRelativeProgression('C/E | G/B', 2, false)).toBe('D/Gb | A/Db');
            expect(transformRelativeProgression('i | IV | V7', 3, false)).toBe('vi | II | III7');
        });
    });

    describe('Preset Validation (validateProgression)', () => {
        it('should generate correct chords for Minor Blues in C Minor', () => {
            arranger.sections = [
                { id: 's1', label: 'Main', value: 'i7 | i7 | iv7 | V7', repeat: 1 },
            ];
            arranger.key = 'C';
            arranger.isMinor = true;
            validateProgression();

            expect(arranger.progression[0].absName).toBe('Cm7');
            expect(arranger.progression[2].absName).toBe('Fm7');
            expect(arranger.progression[3].absName).toBe('G7');
        });
    });
});
