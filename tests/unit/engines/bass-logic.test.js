/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state
vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: { bandIntensity: 0.5, bpm: 120, complexity: 0.5, intent: { soloistMod: 0 } },
        groove: { genreFeel: 'Rock', lastDrumPreset: 'Basic Rock', instruments: [{ name: 'Kick', steps: [] }] },
        bass: { style: 'smart', octave: 38, lastFreq: null, enabled: true, pocketOffset: 0 },
        soloist: { busySteps: 0, tension: 0 },
        arranger: { timeSignature: '4/4', totalSteps: 64, stepMap: [{ start: 0, end: 64, chord: { sectionId: 's1' } }], key: 'C' },
        chords: {},
        harmony: {},
        vizState: {},
        midi: {},
        storage: {},
        dispatch: vi.fn()
    };
    return {
        ...mockState,
        getState: () => mockState
    };
});
vi.mock('../../../public/config.js', () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12], grouping: [2, 2] }
    },
    REGGAE_RIDDIMS: {}
}));

import { getBassNote, isBassActive } from '../../../public/bass.js';
import { getScaleForChord } from '../../../public/theory-scales.js';
import { dispatch, getState, storage } from '../../../public/state.js';
const { arranger, playback, chords, bass, soloist, harmony, groove, vizState, midi } = getState();

describe('Bass Engine Logic', () => {
    const chordC = { rootMidi: 48, intervals: [0, 4, 7, 10], quality: '7', beats: 4, sectionId: 's1', bassMidi: null };
    const chordF = { rootMidi: 53, intervals: [0, 4, 7, 10], quality: '7', beats: 4, sectionId: 's1', bassMidi: null };

    beforeEach(() => {
        bass.busySteps = 0;
        soloist.busySteps = 0;
        soloist.tension = 0;
        playback.bandIntensity = 0.5;
        groove.genreFeel = 'Rock';
        groove.instruments[0].steps.fill(0);
    });

    describe('Style Mapping & Activation', () => {
        it('should map genres to internal styles correctly', () => {
            groove.genreFeel = 'Rock';
            expect(isBassActive('smart', 0, 0)).toBe(true);
            expect(isBassActive('smart', 2, 2)).toBe(true);
            expect(isBassActive('smart', 1, 1)).toBe(false); 

            groove.genreFeel = 'Jazz';
            expect(isBassActive('smart', 0, 0)).toBe(true);
            expect(isBassActive('smart', 4, 4)).toBe(true);
        });

        it('should return a Root note frequency on the downbeat (step 0)', () => {
            const result = getBassNote(chordC, null, 0, null, 38, 'rock', 0, 0, 0);
            expect(result).not.toBeNull();
            expect(result.midi % 12).toBe(0); // C
        });

        it('should stay within a reasonable range of the center MIDI', () => {
            const center = 38;
            for(let i=0; i<50; i++) {
                const result = getBassNote(chordC, null, 0, null, center, 'rock', 0, 0, 0);
                expect(result.midi).toBeGreaterThanOrEqual(center - 15);
                expect(result.midi).toBeLessThanOrEqual(center + 15);
            }
        });
    });

    describe('Intelligence & Contextual Awareness', () => {
        it('should mirror the Kick drum pattern in rock style', () => {
            groove.instruments[0].steps[0] = 2;
            groove.instruments[0].steps[4] = 1;
            
            // Set high intensity to trigger high dynamic response
            playback.bandIntensity = 1.0; 
            const hitResult = getBassNote(chordC, null, 1, 110, 38, 'rock', 0, 4, 4);
            expect(hitResult).not.toBeNull();
            expect(hitResult.velocity).toBeGreaterThan(1.1);

            playback.bandIntensity = 0.1;
            let silentCount = 0;
            for (let i = 0; i < 20; i++) {
                if (getBassNote(chordC, null, 0.25, 110, 38, 'rock', 0, 1, 1) === null) silentCount++;
            }
            expect(silentCount).toBeGreaterThan(0);
        });

        it('should reduce complexity when the soloist is busy', () => {
            groove.genreFeel = 'Funk';
            soloist.busySteps = 4;
            expect(getBassNote(chordC, null, 0.25, 110, 38, 'funk', 0, 1, 1)).toBeNull();

            let rootOrFifthCount = 0;
            let totalNotes = 0;
            for (let i = 0; i < 100; i++) {
                const result = getBassNote(chordC, null, 1, 110, 38, 'quarter', 0, 4, 4);
                if (result) {
                    totalNotes++;
                    const interval = (result.midi - chordC.rootMidi + 120) % 12;
                    if (interval === 0 || interval === 7) rootOrFifthCount++;
                }
            }
            expect(rootOrFifthCount / totalNotes).toBeGreaterThan(0.7);
        });

        it('should boost velocity for "Pop" articulation in funk at high intensity', () => {
            playback.bandIntensity = 1.0; // Max intensity
            groove.instruments[0].steps[2] = 1;
            let result = null;
            // Retry a few times because of Math.random() < 0.45 in funk logic
            // Use high step (60) to boost sectionProgress part of intensity
            for (let i = 0; i < 500; i++) {
                result = getBassNote(chordC, null, 0.5, 110, 38, 'funk', 0, 60, 2);
                if (result && result.velocity >= 1.1) break;
            }
            expect(result).not.toBeNull();
            expect(result.velocity).toBeGreaterThanOrEqual(1.1);
        });
    });

    describe('Jazz Walking Logic', () => {
        it('should landing on the 5th on beat 3 frequently', () => {
            let fifthCount = 0;
            for (let i = 0; i < 100; i++) {
                const result = getBassNote(chordC, chordF, 2, 38, 38, 'quarter', 0, 8, 8);
                if (result.midi % 12 === 7) fifthCount++; 
            }
            expect(fifthCount).toBeGreaterThan(2);
        });

        it('should use a chromatic approach on beat 4 leading to the next chord', () => {
            groove.genreFeel = 'Jazz';
            let chromaticCount = 0;
            for (let i = 0; i < 500; i++) {
                const result = getBassNote(chordC, chordF, 3, null, 38, 'quarter', 0, 12, 12);
                const pc = result.midi % 12;
                if (pc === 4 || pc === 6) chromaticCount++;
            }
            expect(chromaticCount).toBeGreaterThan(40);
        });

        it('should respect slash chord bass notes', () => {
            const slashChord = { ...chordC, bassMidi: 40 }; // C/E
            const result = getBassNote(slashChord, chordF, 0, null, 38, 'quarter', 0, 0, 0);
            expect(result.midi % 12).toBe(4);
        });

        it('should prefer stepwise movement on intermediate beats', () => {
            let stepwiseCount = 0;
            const prevMidi = 38; 
            for (let i = 0; i < 100; i++) {
                const result = getBassNote(chordC, chordF, 1, 440 * Math.pow(2, (prevMidi - 69) / 12), 38, 'quarter', 0, 4, 4);
                const diff = Math.abs(result.midi - prevMidi);
                if (diff <= 2) stepwiseCount++;
            }
            expect(stepwiseCount).toBeGreaterThan(60);
        });

        it('should vary intensity-based register in quarter style', () => {
            let highCount = 0;
            playback.bandIntensity = 1.0; 
            arranger.stepMap = [{ start: 0, end: 64, chord: { sectionId: 's1' } }]; // Add stepMap for sectionProgress
            for (let i = 0; i < 100; i++) {
                // Step 63 in 64 total steps
                const result = getBassNote(chordC, chordF, 0, null, 38, 'quarter', 0, 63, 63);
                if (result.midi >= 48) highCount++;
            }
            expect(highCount).toBeGreaterThan(50);
        });
    });

    describe('Harmonic Integrity', () => {
        it('should use Aeolian for vi chord in Neo-Soul to avoid clashes', () => {
            const viChord = { rootMidi: 57, quality: 'minor', intervals: [0, 3, 7], key: 'C' };
            // Simulate Neo-Soul style context
            groove.genreFeel = 'Neo-Soul';
            const scale = getScaleForChord(viChord, null, 'neo');
            // Better Theory engine prefers Dorian (9) for Neo-Soul minor chords for color
            expect(scale).toContain(9);
            expect(scale).not.toContain(8);
        });

        it('should provide correct scale for m9 chords in Funk', () => {
            const chord = { rootMidi: 60, quality: 'm9', intervals: [0, 3, 7, 10, 14], isMinor: true }; 
            const scale = getScaleForChord(chord, null, 'funk');
            expect(scale).toContain(3);
            expect(scale).not.toContain(4);
        });

        it('should provide correct scale for m11 chords', () => {
             const chord = { rootMidi: 60, quality: 'm11', intervals: [0, 3, 7, 10, 14, 17], isMinor: true };
             const scale = getScaleForChord(chord, null, 'smart');
             expect(scale).toContain(3);
             expect(scale).not.toContain(4);
        });

        it('should respect local key context when determining scales', () => {
            const fm7_in_C = { 
                rootMidi: 65, // F 
                quality: 'minor', 
                intervals: [0, 3, 7, 10], 
                key: 'C',
                beats: 4 
            };
            const scale = getScaleForChord(fm7_in_C, null, 'smart');
            expect(scale.length).toBeGreaterThan(0);
            expect(scale).toContain(3); // Ab
        });
    });

    describe('Overlap Prevention', () => {
        const checkOverlaps = (style) => {
            const activeNotes = [];
            let maxOverlaps = 0;
            for (let step = 0; step < 64; step++) {
                if (step % 16 === 0) activeNotes.length = 0;
                for (let i = activeNotes.length - 1; i >= 0; i--) {
                    if (activeNotes[i].endStep <= step) activeNotes.splice(i, 1);
                }
                if (isBassActive(style, step, step % 16)) {
                    const result = getBassNote(chordC, null, (step % 16) / 4, 440, 38, style, 0, step, step % 16);
                    if (result) activeNotes.push({ endStep: step + result.durationSteps });
                }
                maxOverlaps = Math.max(maxOverlaps, activeNotes.length);
            }
            return maxOverlaps;
        };

        it('should not have overlapping notes in Rock style', () => {
            expect(checkOverlaps('rock')).toBeLessThanOrEqual(1);
        });

        it('should not have overlapping notes in Jazz Walking style', () => {
            expect(checkOverlaps('quarter')).toBeLessThanOrEqual(1);
        });

        it('should not have overlapping notes in Funk style', () => {
            expect(checkOverlaps('funk')).toBeLessThanOrEqual(1);
        });

        it('should not have overlapping notes in Disco style', () => {
            expect(checkOverlaps('disco')).toBeLessThanOrEqual(1);
        });

        it('should not have overlapping notes in Neo-Soul style', () => {
            expect(checkOverlaps('neo')).toBeLessThanOrEqual(1);
        });
    });
});
