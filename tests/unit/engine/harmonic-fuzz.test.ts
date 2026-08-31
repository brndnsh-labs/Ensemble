/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getState } from '../../../public/state.js';
import type { Mutable } from '../../../public/types.js';

const state = getState();
const arranger = state.arranger as Mutable<typeof state.arranger>;
const chords = state.chords as Mutable<typeof state.chords>;
const bass = state.bass as Mutable<typeof state.bass>;
const groove = state.groove as Mutable<typeof state.groove>;

import { getChordDetails, validateProgression } from '../../../public/engine/chords-engine.js';

// Mock dependencies
vi.mock('../../../public/ui.js', () => ({ ui: {} }));
vi.mock('../../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));

describe('Harmonic Fuzz Testing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        arranger.key = 'C';
        arranger.timeSignature = '4/4';
        chords.octave = 60;
        chords.density = 'standard';
        groove.genreFeel = 'Rock';
        bass.enabled = true;
    });

    const CHARS =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?/ ';

    function generateRandomString(length: number) {
        let result = '';
        for (let i = 0; i < length; i++) {
            result += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
        }
        return result;
    }

    it('should never throw when parsing random junk strings', () => {
        const ITERATIONS = 1000;
        const MAX_LENGTH = 50;

        for (let i = 0; i < ITERATIONS; i++) {
            const junk = generateRandomString(Math.floor(Math.random() * MAX_LENGTH));
            arranger.sections = [{ id: 'fuzz', label: 'Fuzz', value: junk }];

            // We want to ensure this call NEVER throws
            expect(() => {
                validateProgression(getState());
            }, `Failed on input: "${junk}"`).not.toThrow();

            // Additional sanity checks on the result
            arranger.progression.forEach((chord) => {
                expect(chord.freqs).toBeInstanceOf(Array);
                chord.freqs.forEach((f) => {
                    expect(typeof f).toBe('number');
                    expect(f).toBeGreaterThan(0);
                });
                expect(typeof chord.rootMidi).toBe('number');
            });
        }
    });

    it('should handle extremely long strings without performance death', () => {
        const longJunk = generateRandomString(5000);
        arranger.sections = [{ id: 'long', label: 'Long', value: longJunk }];

        const start = Date.now();
        validateProgression(getState());
        const duration = Date.now() - start;

        expect(duration).toBeLessThan(500); // Should be well under 500ms even for 5k chars
    });

    it('should gracefully handle edge-case chord suffixes in getChordDetails', () => {
        const edgeCases = [
            '',
            '!!!',
            '7alt#9b13',
            'maj7maj7',
            'm7m7',
            '---------',
            'øøø',
            'sus2sus4',
        ];

        edgeCases.forEach((suffix) => {
            expect(() => {
                const details = getChordDetails(suffix);
                expect(details).toHaveProperty('quality');
                expect(details).toHaveProperty('is7th');
            }).not.toThrow();
        });
    });

    it('should handle many bars and many chords per bar', () => {
        // 100 bars of "C | C C C C"
        const complexProg = new Array(100).fill('C | C C C C').join(' | ');
        arranger.sections = [{ id: 'complex', label: 'Complex', value: complexProg }];

        expect(() => {
            validateProgression(getState());
        }).not.toThrow();

        expect(arranger.progression.length).toBeGreaterThan(400);
    });

    it('should handle deep nesting or weird whitespace', () => {
        const weird = 'C    |     F\n\n\n   G \t\t  C';
        arranger.sections = [{ id: 'weird', label: 'Weird', value: weird }];

        validateProgression(getState());
        expect(arranger.progression.length).toBe(4);
        expect(arranger.progression[0].absName).toBe('C');
    });
});
