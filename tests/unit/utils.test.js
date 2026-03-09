/* eslint-disable */
import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import {
    calculateTimingOffset,
    formatUnicodeSymbols,
    getChordMidiNotes,
    getFrequency,
    getMidi,
    getStepInfo,
    midiToNote,
    normalizeKey,
} from '../../public/utils.js';

describe('Utility Functions', () => {
    describe('calculateTimingOffset', () => {
        const pocket = {
            globalDrive: 0.5,
            tightness: 0.8,
            bassGravity: 0.7,
            chordGravity: 0.6,
            soloistGravity: 0.4,
        };

        it('should correctly calculate global drive offset', () => {
            // 0.5 drive = -6ms (ahead)
            // With 1.0 intensity (elasticity 1.0, factor 0.1), jitter 0
            // instrumentSpecific for drums at high intensity is -0.005
            // Total = -0.006 + (-0.005 * 0.1) = -0.0065
            vi.spyOn(Math, 'random').mockReturnValue(0.5);
            const offset = calculateTimingOffset('drums', pocket, 1.0);
            expect(offset).toBeCloseTo(-0.0065, 4);
        });

        it('should apply bass gravity displacement', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5);
            // 0.7 gravity = 0.3 * 0.008 = 0.0024
            // At 1.0 intensity (elasticity 1.0, factor 0.1) -> 0.00024
            // Global drive (0.5) -> -0.006
            // Total -> -0.00576
            const offset = calculateTimingOffset('bass', pocket, 1.0);
            expect(offset).toBeCloseTo(-0.00576, 5);
        });

        it('should return 0 if pocket is missing', () => {
            expect(calculateTimingOffset('drums', null, 0.5)).toBe(0);
        });
    });

    describe('getStepInfo', () => {
        const ts44 = TIME_SIGNATURES['4/4'];

        it('should identify beat starts and offbeats in 4/4', () => {
            const info0 = getStepInfo(0, ts44, [], TIME_SIGNATURES);
            const info2 = getStepInfo(2, ts44, [], TIME_SIGNATURES);
            const info4 = getStepInfo(4, ts44, [], TIME_SIGNATURES);

            expect(info0.isBeatStart).toBe(true);
            expect(info0.isOffbeat).toBe(false);

            expect(info2.isBeatStart).toBe(false);
            expect(info2.isOffbeat).toBe(true);

            expect(info4.isBeatStart).toBe(true);
            expect(info4.isOffbeat).toBe(false);
        });

        it('should identify e and a of the beat in 4/4', () => {
            const info1 = getStepInfo(1, ts44, [], TIME_SIGNATURES);
            const info3 = getStepInfo(3, ts44, [], TIME_SIGNATURES);

            expect(info1.isEOfBeat).toBe(true);
            expect(info3.isAOfBeat).toBe(true);
        });

        it('should identify backbeats in 4/4', () => {
            const info4 = getStepInfo(4, ts44, [], TIME_SIGNATURES); // Beat 2
            const info12 = getStepInfo(12, ts44, [], TIME_SIGNATURES); // Beat 4
            expect(info4.isBackbeat).toBe(true);
            expect(info12.isBackbeat).toBe(true);
        });
    });
    describe('formatUnicodeSymbols', () => {
        it('should convert ASCII sharp (#) to Unicode sharp (♯) in chord strings', () => {
            expect(formatUnicodeSymbols('C#')).toBe('C♯');
            expect(formatUnicodeSymbols('F#m7')).toBe('F♯m7');
            expect(formatUnicodeSymbols('#IV')).toBe('♯IV');
        });

        it('should convert ASCII flat (b) to Unicode flat (♭) in chord notes and suffixes', () => {
            expect(formatUnicodeSymbols('Bb')).toBe('B♭');
            expect(formatUnicodeSymbols('Ebmaj7')).toBe('E♭maj7');
            expect(formatUnicodeSymbols('bII')).toBe('♭II');
            expect(formatUnicodeSymbols('bvii9')).toBe('♭vii9');
            expect(formatUnicodeSymbols('m7b5')).toBe('m7♭5');
            expect(formatUnicodeSymbols('7b9')).toBe('7♭9');
        });

        it('should NOT convert "b" character in chord quality names like "halfdim" or "maj"', () => {
            expect(formatUnicodeSymbols('halfdim')).toBe('halfdim');
            expect(formatUnicodeSymbols('maj7')).toBe('maj7');
        });

        it('should correctly convert flat/sharp symbols in slash chords (e.g., Ab/Gb)', () => {
            expect(formatUnicodeSymbols('Ab/Gb')).toBe('A♭/G♭');
            expect(formatUnicodeSymbols('C/E')).toBe('C/E');
        });
    });

    describe('normalizeKey', () => {
        it('should normalize C# to its enharmonic equivalent Db for consistent internal key representation', () => {
            expect(normalizeKey('C#')).toBe('Db');
        });

        it('should return the same key if no normalization is needed', () => {
            expect(normalizeKey('C')).toBe('C');
            expect(normalizeKey('F')).toBe('F');
        });
    });

    describe('getFrequency', () => {
        it('should return 440Hz for MIDI note 69 (A4)', () => {
            expect(getFrequency(69)).toBe(440);
        });

        it('should return approximately 261.63Hz for MIDI note 60 (Middle C)', () => {
            expect(getFrequency(60)).toBeCloseTo(261.63, 2);
        });
    });

    describe('midiToNote', () => {
        it('should return note name "C" and octave 4 for MIDI note 60', () => {
            expect(midiToNote(60)).toEqual({ name: 'C', octave: 4 });
        });

        it('should return A4 for MIDI 69', () => {
            expect(midiToNote(69)).toEqual({ name: 'A', octave: 4 });
        });
    });

    describe('getMidi', () => {
        it('should return MIDI note 69 for frequency 440Hz', () => {
            expect(getMidi(440)).toBe(69);
        });

        it('should return 60 for 261.63Hz', () => {
            expect(getMidi(261.63)).toBe(60);
        });
    });

    describe('getChordMidiNotes', () => {
        it('should calculate linear ascending notes for a major chord (Ionian)', () => {
            const chord = { rootMidi: 60, quality: 'major' }; // C4
            // Expected scale: C4, D4, E4, F4, G4, A4, B4, C5, D5, E5
            expect(getChordMidiNotes(chord, 4)).toEqual([60, 62, 64, 65, 67, 69, 71, 72, 74, 76]);
        });

        it('should calculate linear ascending notes for a minor chord (Aeolian)', () => {
            const chord = { rootMidi: 62, quality: 'minor' }; // D4
            // Expected scale: D4, E4, F4, G4, A4, Bb4, C5, D5, E5, F5
            expect(getChordMidiNotes(chord, 4)).toEqual([62, 64, 65, 67, 69, 70, 72, 74, 76, 77]);
        });

        it('should calculate linear ascending notes for a diminished chord (Locrian)', () => {
            const chord = { rootMidi: 71, quality: 'diminished' }; // B4
            // pc = 11. baseMidi = 71
            // Intervals: 0, 1, 3, 5, 6, 8, 10, 12, 13, 15
            expect(getChordMidiNotes(chord, 4)).toEqual([71, 72, 74, 76, 77, 79, 81, 83, 84, 86]);
        });

        it('should calculate linear ascending notes for a dominant chord (Mixolydian)', () => {
            const chord = { rootMidi: 67, quality: 'dominant' }; // G4
            // Expected scale: G4, A4, B4, C5, D5, E5, F5, G5, A5, B5
            expect(getChordMidiNotes(chord, 4)).toEqual([67, 69, 71, 72, 74, 76, 77, 79, 81, 83]);
        });

        it('should return empty array for invalid input', () => {
            expect(getChordMidiNotes(null)).toEqual([]);
            expect(getChordMidiNotes({})).toEqual([]);
        });
    });

    describe('Compression/Decompression', () => {
        it('should correctly compress an array of sections into a base64 string and decompress it back to the original object structure', async () => {
            const { compressSections, decompressSections } = await import('../../public/utils.js');
            const sections = [
                { id: '1', label: 'Verse', value: 'C | F' },
                { id: '2', label: 'Chorus', value: 'G | C' },
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

        it('should correctly preserve Unicode characters (like emojis) during section compression/decompression cycle', async () => {
            const { compressSections, decompressSections } = await import('../../public/utils.js');
            const sections = [{ id: '1', label: 'Intro 🎵', value: 'Cm7' }];
            const compressed = compressSections(sections);
            const decompressed = decompressSections(compressed);
            expect(decompressed[0].label).toBe('Intro 🎵');
        });
    });
});
