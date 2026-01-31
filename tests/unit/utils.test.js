/* eslint-disable */
import { describe, it, expect } from 'vitest';
import { normalizeKey, getFrequency, midiToNote, getMidi, getStepsPerMeasure, formatUnicodeSymbols, getStepInfo } from '../../public/utils.js';
import { TIME_SIGNATURES } from '../../public/config.js';

describe('Utility Functions', () => {
    describe('formatUnicodeSymbols', () => {
        it('should convert # to ♯', () => {
            expect(formatUnicodeSymbols('C#')).toBe('C♯');
            expect(formatUnicodeSymbols('F#m7')).toBe('F♯m7');
            expect(formatUnicodeSymbols('#IV')).toBe('♯IV');
        });

        it('should convert b to ♭ for notes and suffixes', () => {
            expect(formatUnicodeSymbols('Bb')).toBe('B♭');
            expect(formatUnicodeSymbols('Ebmaj7')).toBe('E♭maj7');
            expect(formatUnicodeSymbols('bII')).toBe('♭II');
            expect(formatUnicodeSymbols('bvii9')).toBe('♭vii9');
            expect(formatUnicodeSymbols('m7b5')).toBe('m7♭5');
            expect(formatUnicodeSymbols('7b9')).toBe('7♭9');
        });

        it('should not convert b in quality names like halfdim or maj', () => {
            expect(formatUnicodeSymbols('halfdim')).toBe('halfdim');
            expect(formatUnicodeSymbols('maj7')).toBe('maj7');
        });

        it('should handle bass notes with slashes', () => {
            expect(formatUnicodeSymbols('Ab/Gb')).toBe('A♭/G♭');
            expect(formatUnicodeSymbols('C/E')).toBe('C/E');
        });
    });

    describe('normalizeKey', () => {
        it('should normalize C# to Db', () => {
            expect(normalizeKey('C#')).toBe('Db');
        });

        it('should return the same key if no normalization is needed', () => {
            expect(normalizeKey('C')).toBe('C');
            expect(normalizeKey('F')).toBe('F');
        });
    });

    describe('getFrequency', () => {
        it('should return 440 for MIDI 69', () => {
            expect(getFrequency(69)).toBe(440);
        });

        it('should return 261.63 for MIDI 60 (Middle C)', () => {
            expect(getFrequency(60)).toBeCloseTo(261.63, 2);
        });
    });

    describe('midiToNote', () => {
        it('should return C4 for MIDI 60', () => {
            expect(midiToNote(60)).toEqual({ name: 'C', octave: 4 });
        });

        it('should return A4 for MIDI 69', () => {
            expect(midiToNote(69)).toEqual({ name: 'A', octave: 4 });
        });
    });

    describe('getMidi', () => {
        it('should return 69 for 440Hz', () => {
            expect(getMidi(440)).toBe(69);
        });

        it('should return 60 for 261.63Hz', () => {
            expect(getMidi(261.63)).toBe(60);
        });
    });

    describe('getStepsPerMeasure', () => {
        it('should return 16 for 4/4', () => {
            expect(getStepsPerMeasure('4/4')).toBe(16);
        });

        it('should return 12 for 3/4', () => {
            expect(getStepsPerMeasure('3/4')).toBe(12);
        });

        it('should return 12 for 6/8', () => {
            expect(getStepsPerMeasure('6/8')).toBe(12);
        });
    });

    describe('Compression/Decompression', () => {
        it('should compress and decompress sections correctly', async () => {
            const { compressSections, decompressSections } = await import('../../public/utils.js');
            const sections = [
                { id: '1', label: 'Verse', value: 'C | F' },
                { id: '2', label: 'Chorus', value: 'G | C' }
            ];
            const compressed = compressSections(sections);
            expect(typeof compressed).toBe('string');
            expect(compressed.length).toBeGreaterThan(0);

            const decompressed = decompressSections(compressed);
            expect(decompressed).toHaveLength(2);
            expect(decompressed[0].label).toBe('Verse');
            expect(decompressed[0].value).toBe('C | F');
            expect(decompressed[1].label).toBe('Chorus');
            expect(decompressed[1].value).toBe('G | C');
            // IDs are regenerated on decompression
            expect(decompressed[0].id).not.toBe('1');
        });

        it('should handle unicode characters', async () => {
            const { compressSections, decompressSections } = await import('../../public/utils.js');
            const sections = [{ id: '1', label: 'Intro 🎵', value: 'Cm7' }];
            const compressed = compressSections(sections);
            const decompressed = decompressSections(compressed);
            expect(decompressed[0].label).toBe('Intro 🎵');
        });
    });

    describe('getStepInfo with Measure Map (Binary Search)', () => {
        // Construct a measure map with known boundaries
        // Measure 1: 0-16 (4/4)
        // Measure 2: 16-28 (3/4, 12 steps)
        // Measure 3: 28-44 (4/4)
        const measureMap = [
            { start: 0, end: 16, ts: '4/4' },
            { start: 16, end: 28, ts: '3/4' },
            { start: 28, end: 44, ts: '4/4' }
        ];

        const tsConfig = TIME_SIGNATURES['4/4'];

        it('should find the first measure', () => {
            const result = getStepInfo(0, tsConfig, measureMap, TIME_SIGNATURES);
            expect(result.tsName).toBe('4/4');
            expect(result.isMeasureStart).toBe(true);

            const result2 = getStepInfo(15, tsConfig, measureMap, TIME_SIGNATURES);
            expect(result2.tsName).toBe('4/4');
            expect(result2.isMeasureStart).toBe(false);
        });

        it('should find the middle measure (3/4)', () => {
            // Step 16 is the start of the 2nd measure (3/4)
            const result = getStepInfo(16, tsConfig, measureMap, TIME_SIGNATURES);
            expect(result.tsName).toBe('3/4');
            expect(result.isMeasureStart).toBe(true);
            expect(result.mStep).toBe(0);

            // Step 27 is the last step of the 2nd measure
            const resultEnd = getStepInfo(27, tsConfig, measureMap, TIME_SIGNATURES);
            expect(resultEnd.tsName).toBe('3/4');
            expect(resultEnd.isMeasureStart).toBe(false);
            expect(resultEnd.mStep).toBe(11);
        });

        it('should find the last measure', () => {
            const result = getStepInfo(28, tsConfig, measureMap, TIME_SIGNATURES);
            expect(result.tsName).toBe('4/4');
            expect(result.isMeasureStart).toBe(true);

            const resultEnd = getStepInfo(43, tsConfig, measureMap, TIME_SIGNATURES);
            expect(resultEnd.tsName).toBe('4/4');
        });

        it('should fallback correctly if step is out of bounds', () => {
            // Step 44 is beyond the map (end is exclusive)
            const result = getStepInfo(44, tsConfig, measureMap, TIME_SIGNATURES);

            expect(result.tsName).toBe('4/4'); // tsConfig is 4/4
        });

        it('should handle single item map', () => {
            const singleMap = [{ start: 0, end: 16, ts: '4/4' }];
            const result = getStepInfo(5, tsConfig, singleMap, TIME_SIGNATURES);
            expect(result.tsName).toBe('4/4');
        });
    });
});
