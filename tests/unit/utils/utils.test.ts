/* eslint-disable */
import { describe, expect, it } from 'vitest';
import { clampFreq, createSoftClipCurve } from '../../../core/engine/audio-graph-utils.js';

import {
    getFrequency,
    getMidi,
    keyDistance,
    keyNamesFor,
    normalizeKey,
    respellKeyForMode,
    transposeKeyName,
} from '../../../core/utils.js';

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

        // #1132: the map is a plain literal, so an unguarded `MAP[k] || k` returned the
        // Object constructor for 'constructor' — a function in a string-typed result.
        it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
            'returns an inherited-property name %s unchanged, as a string',
            (bad) => {
                expect(normalizeKey(bad)).toBe(bad);
            },
        );
    });

    describe('transposeKeyName', () => {
        it('should transpose normalized keys across large negative intervals', () => {
            expect(transposeKeyName('C', -13)).toBe('B');
            expect(transposeKeyName('F#', -1)).toBe('F');
        });
    });

    describe('keyDistance', () => {
        it('counts a sharp-spelled key from its flat twin, not from index -1', () => {
            expect(keyDistance('F#', 'G')).toBe(1);
            expect(keyDistance('C#', 'C')).toBe(-1);
            expect(keyDistance('Gb', 'G')).toBe(keyDistance('F#', 'G'));
        });

        it('lands on the picked key when the chart is transposed by it', () => {
            for (const from of ['F#', 'C#', 'G#', 'D#', 'A#', 'Bb', 'C']) {
                for (const to of ['C', 'G', 'Eb', 'B']) {
                    expect(transposeKeyName(from, keyDistance(from, to))).toBe(to);
                }
            }
        });

        it('moves nothing for a key it cannot place', () => {
            expect(keyDistance('H', 'G')).toBe(0);
            expect(keyDistance('C', '')).toBe(0);
        });
    });

    describe('key names by mode', () => {
        it('offers each key the way it is usually written, 12 distinct pitch classes', () => {
            const major = keyNamesFor(false);
            const minor = keyNamesFor(true);
            expect(major).toContain('F#');
            expect(major).not.toContain('Gb');
            expect(minor).toEqual(expect.arrayContaining(['C#', 'F#', 'G#']));
            expect(minor).not.toContain('Db');
            expect(minor).not.toContain('Gb');
            expect(minor).not.toContain('Ab');
            for (const names of [major, minor]) {
                expect(new Set(names.map((name) => normalizeKey(name))).size).toBe(12);
            }
        });

        it('respells a key for the mode it turns to, and leaves a listed key alone', () => {
            expect(respellKeyForMode('Gb', true)).toBe('F#');
            expect(respellKeyForMode('Db', true)).toBe('C#');
            expect(respellKeyForMode('Ab', true)).toBe('G#');
            expect(respellKeyForMode('C#', false)).toBe('Db');
            expect(respellKeyForMode('F#', false)).toBe('F#');
            expect(respellKeyForMode('F#', true)).toBe('F#');
            expect(respellKeyForMode('Bb', true)).toBe('Bb');
            expect(respellKeyForMode('H', true)).toBe('H');
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
});
