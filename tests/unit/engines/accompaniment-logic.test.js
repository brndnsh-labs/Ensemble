/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock state
vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: {
            bandIntensity: 0.5,
            bpm: 120,
            complexity: 0.5,
            intent: { syncopation: 0, anticipation: 0, layBack: 0 },
        },
        groove: { genreFeel: 'Rock', lastDrumPreset: 'Basic Rock' },
        chords: { enabled: true, style: 'smart', density: 'standard', octave: 60 },
        bass: { enabled: true },
        soloist: { enabled: false, busySteps: 0 },
        arranger: { timeSignature: '4/4', progression: [] },
        harmony: {},
        vizState: {},
        midi: {},
        storage: {},
        dispatch: vi.fn(),
    };
    return {
        ...mockState,
        stateMap: mockState,
        getState: () => mockState,
    };
});
vi.mock('../../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': {
            beats: 4,
            stepsPerBeat: 4,
            subdivision: '16th',
            pulse: [0, 4, 8, 12],
            grouping: [2, 2],
        },
        '3/4': { beats: 3, stepsPerBeat: 4, subdivision: '16th' },
    },
}));

import {
    compingState,
    generateCompingPattern,
    getAccompanimentNotes,
} from '../../../public/accompaniment.js';
import { TIME_SIGNATURES } from '../../../public/config.js';
import { getState } from '../../../public/state.js';

const { arranger, playback, chords, bass, groove } = getState();

describe('Accompaniment Engine Logic', () => {
    const mockChord = {
        rootMidi: 60,
        freqs: [261.63, 329.63, 392.0, 493.88], // Cmaj7
        quality: 'maj7',
        is7th: true,
        beats: 4,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        arranger.progression = [mockChord];
        arranger.timeSignature = '4/4';
        compingState.lockedUntil = 0;
        compingState.lastChordIndex = -1;
        chords.enabled = true;
        chords.style = 'smart';
        groove.genreFeel = 'Rock';
        bass.enabled = false;
        playback.bandIntensity = 0.5;
        playback.complexity = 0.5;
    });

    describe('Generation & Styles', () => {
        it('should generate notes on the downbeat (step 0) by default', () => {
            const notes = getAccompanimentNotes(mockChord, 0, 0, 0, {
                isBeatStart: true,
                isGroupStart: true,
            });
            expect(notes.length).toBeGreaterThan(0);
            expect(notes[0].midi).toBe(60);
        });

        it('should only play on the start of the chord in "pad" style', () => {
            chords.style = 'pad';
            expect(
                getAccompanimentNotes(mockChord, 0, 0, 0, { isBeatStart: true }).filter(
                    (n) => n.midi > 0,
                ).length,
            ).toBeGreaterThan(0);
            expect(
                getAccompanimentNotes(mockChord, 4, 4, 4, { isBeatStart: true }).filter(
                    (n) => n.midi > 0,
                ).length,
            ).toBe(0);
        });

        it('should generate CC 64 (Sustain) events on new chords', () => {
            const notes = getAccompanimentNotes(mockChord, 0, 0, 0, { isBeatStart: true });
            const sustainEvents = notes[0].ccEvents.filter((e) => e.controller === 64);
            expect(sustainEvents.some((e) => e.value === 0)).toBe(true);
            expect(sustainEvents.some((e) => e.value === 127)).toBe(true);
        });
    });

    describe('Genre-specific Logic', () => {
        it('should use short durations for Funk and disable sustain for Reggae', () => {
            groove.genreFeel = 'Funk';
            const funkNotes = getAccompanimentNotes(mockChord, 0, 0, 0, {
                isBeatStart: true,
            }).filter((n) => n.midi > 0);
            if (funkNotes.length > 0) {
                expect([0.8, 0.4, 0.35, 0.2, 0.1]).toContain(funkNotes[0].durationSteps);
            }

            groove.genreFeel = 'Reggae';
            const reggaeNotes = getAccompanimentNotes(mockChord, 0, 0, 0, { isBeatStart: true });
            expect(
                reggaeNotes[0].ccEvents
                    .filter((e) => e.controller === 64)
                    .every((e) => e.value === 0),
            ).toBe(true);
        });

        it('should perform rootless reduction when bass is enabled', () => {
            const notesNormal = getAccompanimentNotes(mockChord, 0, 0, 0, {
                isBeatStart: true,
                isGroupStart: true,
            });
            bass.enabled = true;
            const notesRootless = getAccompanimentNotes(mockChord, 16, 0, 0, {
                isBeatStart: true,
                isGroupStart: true,
            });
            expect(notesRootless.length).toBeLessThan(notesNormal.length);
        });
    });

    describe('Procedural Pattern Generation', () => {
        it('should generate a 16-step pattern and increase density with intensity', () => {
            const ts44 = TIME_SIGNATURES['4/4'];
            const pattern = generateCompingPattern('Rock', 'balanced', ts44, 16);
            expect(pattern).toHaveLength(16);

            const sparse = generateCompingPattern('Rock', 'sparse', ts44, 16).filter(
                (n) => n === 1,
            ).length;
            const active = generateCompingPattern('Rock', 'active', ts44, 16).filter(
                (n) => n === 1,
            ).length;
            expect(active).toBeGreaterThanOrEqual(sparse);
        });

        it('should generate Jazz Charleston rhythm', () => {
            let foundCharleston = false;
            const ts44 = TIME_SIGNATURES['4/4'];
            for (let i = 0; i < 100; i++) {
                const p = generateCompingPattern('Jazz', 'balanced', ts44, 16);
                if (p[0] === 1 && p[6] === 1) {
                    foundCharleston = true;
                    break;
                }
            }
            expect(foundCharleston).toBe(true);
        });
    });

    describe('Piano/Bass Collision Avoidance', () => {
        it('should shift piano voicings up to avoid masking the bass', () => {
            const chord = {
                rootMidi: 48, // C3
                freqs: [130.81, 164.81, 196.0], // C3, E3, G3
                intervals: [0, 4, 7],
                quality: 'maj',
                beats: 4,
            };

            // Set bass to play a C2 (MIDI 36)
            bass.lastFreq = 65.41; // C2
            const bassMidi = 36;

            // Try multiple times to ensure we get a hit (it's probabilistic)
            let notes = [];
            playback.bandIntensity = 0.6; // Higher intensity for more reliable hits
            for (let i = 0; i < 1000; i++) {
                compingState.lockedUntil = 0;
                notes = getAccompanimentNotes(chord, i * 16, 0, 0, {
                    isBeatStart: true,
                    isGroupStart: true,
                });
                if (notes.some((n) => n.midi > 0)) {
                    break;
                }
            }

            const pianoMidis = notes.filter((n) => n.midi > 0).map((n) => n.midi);
            expect(pianoMidis.length).toBeGreaterThan(0);
            expect(pianoMidis[0]).toBeGreaterThanOrEqual(bassMidi + 12);
        });
    });
});
