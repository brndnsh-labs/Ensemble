/* eslint-disable */
import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../../public/config.js';
import { clampFreq, createSoftClipCurve } from '../../../public/engine/synth-utils.js';
import {
    compressSections,
    decompressSections,
    formatUnicodeSymbols,
    getChordMidiNotes,
    getFrequency,
    getMidi,
    getStepInfo,
    midiToNote,
    normalizeKey,
    secondsPerBeatFor,
    secondsPerStepFor,
    transposeKeyName,
} from '../../../public/utils.js';

describe('Utility Functions', () => {
    describe('DSP Utility Functions', () => {
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

    // BPM is quarter-notes/min for every meter (DAW/MIDI convention). Lock in:
    //   - secondsPerStepFor(bpm) = (60/bpm)/4 — one 16th — in ALL meters.
    //   - secondsPerBeatFor returns one `ts.beats`-native unit:
    //       stepsPerBeat=4 (2/4, 3/4, 4/4, 5/4, 7/4) → 60/bpm (one quarter);
    //       stepsPerBeat=2 (6/8, 7/8, 12/8)          → (60/bpm)/2 (one eighth).
    describe('secondsPerStepFor / secondsPerBeatFor (quarter-note BPM)', () => {
        const bpm = 120;
        const FLOAT_TOL = 1e-9;

        const quarterBeatMeters = ['2/4', '3/4', '4/4', '5/4', '7/4'];
        const eighthBeatMeters = ['7/8', '6/8', '12/8'];

        it('step duration is one 16th = (60/bpm)/4 regardless of meter', () => {
            // Step duration no longer depends on time signature at all.
            expect(secondsPerStepFor(bpm)).toBeCloseTo(60 / bpm / 4, 12);
        });

        quarterBeatMeters.forEach((tsName) => {
            it(`one ts.beats unit = one quarter for ${tsName} (quarter beat)`, () => {
                const ts = TIME_SIGNATURES[tsName];
                expect(ts.stepsPerBeat).toBe(4);
                expect(secondsPerBeatFor(ts, bpm)).toBeCloseTo(60 / bpm, 12);
            });
        });

        eighthBeatMeters.forEach((tsName) => {
            it(`one ts.beats unit = one eighth for ${tsName} (eighth beat)`, () => {
                const ts = TIME_SIGNATURES[tsName];
                // ts.beats counts eighths in all three (7/8, 6/8, 12/8)
                expect(ts.stepsPerBeat).toBe(2);
                expect(secondsPerBeatFor(ts, bpm)).toBeCloseTo(60 / bpm / 2, 12);
            });
        });

        it('matches the All-Blues 6/8 felt pulse: ~0.667s per dotted-quarter at bpm=90', () => {
            // The All Blues preset is now bpm=90 (quarter-notes/min). The felt
            // dotted-quarter pulse = 6 steps (= 6 sixteenths = 1.5 quarters).
            const stepSec = secondsPerStepFor(90);
            const pulseSec = stepSec * 6;
            expect(pulseSec).toBeCloseTo(1.5 * (60 / 90), 6); // = 1.0s
            expect(pulseSec).toBeCloseTo(1.0, 6);
        });

        it('keeps 4/4 step duration identical to the canonical formula', () => {
            // why: regression guard — 4/4 critique tests rely on 0.25 * (60/bpm).
            const oldFormula = 0.25 * (60 / bpm);
            expect(secondsPerStepFor(bpm)).toBeCloseTo(oldFormula, FLOAT_TOL);
        });

        it('keeps the bar shape: total bar duration = stepsPerBar × stepSec', () => {
            // Under quarter-note BPM a step is (60/bpm)/4 in every meter, so a
            // bar's clock length = (16ths per bar) × that.
            // 4/4 (16 steps) = 4 quarters
            expect(16 * secondsPerStepFor(bpm)).toBeCloseTo(4 * (60 / bpm), 9);
            // 6/8 (12 steps) = 3 quarters of clock time (= 2 dotted-quarters)
            expect(12 * secondsPerStepFor(bpm)).toBeCloseTo(3 * (60 / bpm), 9);
            // 12/8 (24 steps) = 6 quarters (= 4 dotted-quarters)
            expect(24 * secondsPerStepFor(bpm)).toBeCloseTo(6 * (60 / bpm), 9);
            // 3/4 (12 steps) = 3 quarters
            expect(12 * secondsPerStepFor(bpm)).toBeCloseTo(3 * (60 / bpm), 9);
            // 7/8 (14 steps) = 3.5 quarters (7 eighths)
            expect(14 * secondsPerStepFor(bpm)).toBeCloseTo(3.5 * (60 / bpm), 9);
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

        // #776: enharmonic naturals must resolve onto KEY_ORDER members, else
        // resolveChordRoot computes baseOctave-1 (wrong pitch). Guards the real
        // config.ts ENHARMONIC_MAP (chords-logic.test.ts mocks config, so this is
        // the test that actually fails if those entries are reverted).
        it('should normalize enharmonic naturals B#/Cb/E#/Fb to their KEY_ORDER members', () => {
            expect(normalizeKey('B#')).toBe('C');
            expect(normalizeKey('Cb')).toBe('B');
            expect(normalizeKey('E#')).toBe('F');
            expect(normalizeKey('Fb')).toBe('E');
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

        it('should honor parsed diminished-seventh intervals from the chord engine', () => {
            const chord = { rootMidi: 60, quality: 'dim', is7th: true, intervals: [0, 3, 6, 9] };
            expect(getChordMidiNotes(chord, 4)).toEqual([60, 63, 66, 69, 72, 61, 65, 68, 73, 75]);
        });

        it('should place slash bass notes below the helper voicing output', () => {
            const chord = {
                rootMidi: 60,
                quality: 'maj7',
                intervals: [0, 4, 7, 11, 14],
                bassMidi: 67,
            };
            expect(getChordMidiNotes(chord, 4)).toEqual([55, 60, 64, 71, 74, 62, 65, 69, 72, 76]);
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
            expect(midiToNote(69)).toEqual({ name: 'A', octave: 4 });
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
            expect(midiToNote(undefined as any)).toEqual({ name: '---', octave: 0 });
            expect(midiToNote(null as any)).toEqual({ name: '---', octave: 0 });
            expect(midiToNote('60' as any)).toEqual({ name: '---', octave: 0 });
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

        it('should round-trip per-section targetIntensity and instrument overrides', () => {
            const sections = [
                {
                    id: '1',
                    label: 'Verse',
                    value: 'I | IV',
                    targetIntensity: 0.2,
                    instruments: { groove: false, soloist: true },
                },
                { id: '2', label: 'Chorus', value: 'V | I' },
            ] as any[];
            const decompressed = decompressSections(compressSections(sections));

            expect(decompressed[0].targetIntensity).toBeCloseTo(0.2, 5);
            expect(decompressed[0].instruments).toEqual({ groove: false, soloist: true });
            // Section without overrides should not gain spurious fields
            expect(decompressed[1].targetIntensity).toBeUndefined();
            expect(decompressed[1].instruments).toBeUndefined();
        });

        it('should clamp out-of-range targetIntensity on decompress', () => {
            const sections = [
                { id: '1', label: 'Verse', value: 'I', targetIntensity: 1.5 },
                { id: '2', label: 'Chorus', value: 'V', targetIntensity: -0.3 },
            ] as any[];
            const decompressed = decompressSections(compressSections(sections));
            expect(decompressed[0].targetIntensity).toBe(1);
            expect(decompressed[1].targetIntensity).toBe(0);
        });

        it('should ignore unknown instrument keys in the override map', () => {
            // Craft a payload with a malicious extra key — should drop it.
            const compressed = compressSections([
                {
                    id: '1',
                    label: 'Verse',
                    value: 'I',
                    instruments: { groove: true, bogus: true } as any,
                },
            ]);
            const decompressed = decompressSections(compressed);
            expect(decompressed[0].instruments).toEqual({ groove: true });
        });
    });
});
