/* eslint-disable */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../../public/config.js';
import {
    calculateTimingOffset,
    clampFreq,
    compressSections,
    createReverbImpulse,
    createSoftClipCurve,
    decompressSections,
    formatUnicodeSymbols,
    getChordMidiNotes,
    getFrequency,
    getMidi,
    getStepInfo,
    midiToNote,
    normalizeKey,
    transposeKeyName,
} from '../../../public/utils.js';

describe('Utility Functions', () => {
    describe('DSP Utility Functions', () => {
        let mockAudioCtx;

        beforeEach(() => {
            mockAudioCtx = {
                sampleRate: 44100,
                createBuffer: vi.fn((channels, length, sampleRate) => ({
                    numberOfChannels: channels,
                    length,
                    sampleRate,
                    _data: Array.from({ length: channels }, () => new Float32Array(length)),
                    getChannelData(channel) {
                        return this._data[channel];
                    },
                })),
            };
        });

        it('should correctly generate a reverb impulse', () => {
            const impulse = createReverbImpulse(mockAudioCtx, 1.0, 2.0);

            expect(mockAudioCtx.createBuffer).toHaveBeenCalledWith(2, 44100, 44100);
            expect(impulse.numberOfChannels).toBe(2);
            expect(impulse.length).toBe(44100);
            expect(impulse.sampleRate).toBe(44100);

            // Check that the data is populated
            const channelData = impulse.getChannelData(0);
            expect(channelData[0]).not.toBeNaN();
            expect(channelData[44099]).toBeCloseTo(0, 4); // Should decay towards 0
        });

        it('should create and cache a soft clip curve', () => {
            const curve1 = createSoftClipCurve();
            expect(curve1).toBeInstanceOf(Float32Array);
            expect(curve1.length).toBe(44100);

            // Check that it's monotonic cubic: f(x) = (3x - x^3) / 2
            // At x=-1 (i=0), f(-1) = (-3 + 1)/2 = -1
            expect(curve1[0]).toBeCloseTo(-1, 5);
            // At x=1 (i=44099), f(1) ~ 1
            expect(curve1[44099]).toBeCloseTo(1, 4);
            // At x=0 (i=22050), f(0) = 0
            expect(curve1[22050]).toBeCloseTo(0, 5);

            const curve2 = createSoftClipCurve();
            expect(curve1).toBe(curve2); // Should be exactly the same cached instance
        });

        it('should clamp frequencies correctly', () => {
            expect(clampFreq(-100)).toBe(0);
            expect(clampFreq(440)).toBe(440);
            expect(clampFreq(25000)).toBe(24000); // Default max
            expect(clampFreq(25000, 26000)).toBe(25000); // Custom max
        });
    });

    describe('calculateTimingOffset', () => {
        const pocket = {
            globalDrive: 0.5,
            tightness: 0.8,
            bassGravity: 0.7,
            chordGravity: 0.6,
            soloistGravity: 0.4,
        };

        afterEach(() => {
            vi.restoreAllMocks();
        });

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

        it('should apply chord gravity displacement', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5);
            const offset = calculateTimingOffset('chords', pocket, 1.0);
            // 0.6 chordGravity -> 0.4 * 0.006 = +0.0024
            // + 0.3 (1-bassGravity) * 0.003 = +0.0009
            // sum = 0.0033
            // elasticity factor * 0.1 -> 0.00033
            // Global drive -> -0.006
            // Total -> -0.00567
            expect(offset).toBeCloseTo(-0.00567, 5);
        });

        it('should apply soloist gravity displacement', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5);
            const offset = calculateTimingOffset('soloist', pocket, 1.0);
            // 0.4 soloistGravity -> 0.6 * 0.012 = 0.0072
            // elasticity factor * 0.1 -> 0.00072
            // Global drive -> -0.006
            // Total -> -0.00528
            expect(offset).toBeCloseTo(-0.00528, 5);
        });

        it('should handle missing match as 0 instrumentSpecific', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5);
            const offset = calculateTimingOffset('unknown', pocket, 1.0);
            // instrumentSpecific = 0
            // Total -> -0.006
            expect(offset).toBeCloseTo(-0.006, 5);
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

    describe('transposeKeyName', () => {
        it('should transpose normalized keys across large negative intervals', () => {
            expect(transposeKeyName('C', -13)).toBe('B');
            expect(transposeKeyName('F#', -1)).toBe('F');
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
        it('should calculate notes grouped by odds then evens for a major chord', () => {
            const chord = { rootMidi: 60, quality: 'major' }; // C4
            // Expected Odds: 60, 64, 67, 71, 74 (1, 3, 5, 7, 9)
            // Expected Evens: 62, 65, 69, 72, 76 (2, 4, 6, 8, 10)
            expect(getChordMidiNotes(chord, 4)).toEqual([60, 64, 67, 71, 74, 62, 65, 69, 72, 76]);
        });

        it('should calculate notes grouped by odds then evens for a minor chord', () => {
            const chord = { rootMidi: 62, quality: 'minor' }; // D4
            // Expected Odds: 62, 65, 69, 72, 76 (1, b3, 5, b7, 9)
            // Expected Evens: 64, 67, 70, 74, 77 (2, 4, b6, 8, b10)
            expect(getChordMidiNotes(chord, 4)).toEqual([62, 65, 69, 72, 76, 64, 67, 70, 74, 77]);
        });

        it('should calculate notes grouped by odds then evens for a diminished chord', () => {
            const chord = { rootMidi: 71, quality: 'diminished' }; // B4
            // Expected Odds: 71, 74, 77, 81, 84
            // Expected Evens: 72, 76, 79, 83, 86
            expect(getChordMidiNotes(chord, 4)).toEqual([71, 74, 77, 81, 84, 72, 76, 79, 83, 86]);
        });

        it('should calculate notes grouped by odds then evens for a dominant chord', () => {
            const chord = { rootMidi: 67, quality: 'dominant' }; // G4
            // Expected Odds: 67, 71, 74, 77, 81
            // Expected Evens: 69, 72, 76, 79, 83
            expect(getChordMidiNotes(chord, 4)).toEqual([67, 71, 74, 77, 81, 69, 72, 76, 79, 83]);
        });

        it('should return empty array for invalid input', () => {
            expect(getChordMidiNotes(null)).toEqual([]);
            expect(getChordMidiNotes({})).toEqual([]);
            expect(getChordMidiNotes({ rootMidi: NaN })).toEqual([]);
            expect(getChordMidiNotes({ rootMidi: Infinity })).toEqual([]);
        });
    });

    describe('midiToNote', () => {
        it('should correctly convert valid MIDI numbers to note names and octaves', () => {
            expect(midiToNote(60)).toEqual({ name: 'C', octave: 4 });
            expect(midiToNote(61)).toEqual({ name: 'Db', octave: 4 });
            expect(midiToNote(72)).toEqual({ name: 'C', octave: 5 });
            expect(midiToNote(21)).toEqual({ name: 'A', octave: 0 });
            expect(midiToNote(0)).toEqual({ name: 'C', octave: -1 });
        });

        it('should handle negative MIDI numbers correctly', () => {
            expect(midiToNote(-1)).toEqual({ name: 'B', octave: -2 });
            expect(midiToNote(-12)).toEqual({ name: 'C', octave: -2 });
        });

        it('should return fallback for NaN or non-finite values', () => {
            expect(midiToNote(NaN)).toEqual({ name: '---', octave: 0 });
            expect(midiToNote(Infinity)).toEqual({ name: '---', octave: 0 });
            expect(midiToNote(undefined)).toEqual({ name: '---', octave: 0 });
            expect(midiToNote(null)).toEqual({ name: '---', octave: 0 });
            expect(midiToNote('60')).toEqual({ name: '---', octave: 0 });
        });
    });

    describe('getMidi', () => {
        it('should correctly convert frequency to MIDI note', () => {
            expect(getMidi(440)).toBe(69);
            expect(getMidi(261.63)).toBe(60);
        });

        it('should return null for invalid frequency', () => {
            expect(getMidi(0)).toBe(null);
            expect(getMidi(-440)).toBe(null);
            expect(getMidi(NaN)).toBe(null);
            expect(getMidi(Infinity)).toBe(null);
        });
    });

    describe('Compression/Decompression', () => {
        it('should correctly compress an array of sections into a base64 string and decompress it back to the original object structure', () => {
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

        it('should correctly preserve Unicode characters (like emojis) during section compression/decompression cycle', () => {
            const sections = [{ id: '1', label: 'Intro 🎵', value: 'Cm7' }];
            const compressed = compressSections(sections);
            const decompressed = decompressSections(compressed);
            expect(decompressed[0].label).toBe('Intro 🎵');
        });

        it('should preserve explicit local minor flags through section compression', () => {
            const sections = [
                { id: '1', label: 'Verse', value: 'E7 | Am7', key: 'A', isMinor: true },
                { id: '2', label: 'Bridge', value: 'Amaj7', key: 'A', isMinor: false },
            ];
            const decompressed = decompressSections(compressSections(sections));

            expect(decompressed[0]).toMatchObject({
                label: 'Verse',
                key: 'A',
                isMinor: true,
            });
            expect(decompressed[1]).toMatchObject({
                label: 'Bridge',
                key: 'A',
                isMinor: false,
            });
        });
    });
});
