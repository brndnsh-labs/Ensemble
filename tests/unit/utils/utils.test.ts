/* eslint-disable */
import { describe, expect, it } from 'vitest';
import { clampFreq, createSoftClipCurve } from '../../../public/engine/audio-graph-utils.js';
import { compressSections, tryDecompressSections } from '../../../public/state/share-codec.js';

/** A valid payload's sections (a rejected one reads as none). */
const decompressSections = (str: string) => tryDecompressSections(str) ?? [];

import {
    getFrequency,
    getMidi,
    keyDistance,
    normalizeKey,
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

        // why (#1258): the decoder's output went straight into state with no
        // `validateSections` pass, so its section-meter guard is the only one on the `?s=`
        // path — and it checked LENGTH, not membership, so '__proto__' (9 chars),
        // 'toString' (8) and 'valueOf' (7) all slipped under `length < 10`. Two readers of
        // one field disagreeing on its keyspace is the defect; `validateSections` requires
        // table membership, so this now does too.
        it.each(['__proto__', 'toString', 'valueOf', 'constructor', 'not-a-meter'])(
            'drops a section timeSignature of %s on the ?s= path',
            (bad) => {
                const compressed = compressSections([
                    { id: '1', label: 'Verse', value: 'C', timeSignature: bad },
                ]);

                expect(decompressSections(compressed)[0].timeSignature).toBe('');
            },
        );

        // #1132: the `?s=` reader must agree with `validateSections` on the key's keyspace —
        // a normalized KEY_ORDER member, else ''.
        it.each(['constructor', '__proto__', 'toString', 'H', '<b>C</b>'])(
            'drops a section key of %s on the ?s= path',
            (bad) => {
                const compressed = compressSections([
                    { id: '1', label: 'Verse', value: 'C', key: bad },
                ]);

                expect(decompressSections(compressed)[0].key).toBe('');
            },
        );

        it('keeps a valid section key, normalized like validateSections (the accept direction)', () => {
            const compressed = compressSections([
                { id: '1', label: 'A', value: 'C', key: 'Eb' },
                { id: '2', label: 'B', value: 'C', key: 'C#' },
            ]);
            const [a, b] = decompressSections(compressed);

            expect(a.key).toBe('Eb');
            expect(b.key).toBe('Db');
        });

        it('still preserves a valid section timeSignature (the accept direction)', () => {
            const compressed = compressSections([
                { id: '1', label: 'Verse', value: 'C', timeSignature: '7/8' },
            ]);

            expect(decompressSections(compressed)[0].timeSignature).toBe('7/8');
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
