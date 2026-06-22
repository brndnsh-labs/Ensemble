// @ts-nocheck
/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

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
        soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
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

import { TIME_SIGNATURES } from '../../../public/config.js';
import {
    compingState,
    generateCompingPattern,
    getAccompanimentNotes,
} from '../../../public/engine/accompaniment.js';
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
        compingState.lastVoicingMidis = [];
        chords.enabled = true;
        chords.style = 'smart';
        groove.genreFeel = 'Rock';
        bass.enabled = false;
        playback.bandIntensity = 0.5;
        playback.complexity = 0.5;
        playback.practiceMode = false;
    });

    describe('Generation & Styles', () => {
        it('should generate notes on the downbeat (step 0) by default', () => {
            const notes = getAccompanimentNotes(getState(), mockChord, 0, 0, 0, {
                isBeatStart: true,
                isGroupStart: true,
            });
            expect(notes.length).toBeGreaterThan(0);
            expect(notes[0].midi).toBe(60);
        });

        it('should only play on the start of the chord in "pad" style', () => {
            chords.style = 'pad';
            expect(
                getAccompanimentNotes(getState(), mockChord, 0, 0, 0, { isBeatStart: true }).filter(
                    (n) => n.midi > 0,
                ).length,
            ).toBeGreaterThan(0);
            expect(
                getAccompanimentNotes(getState(), mockChord, 4, 4, 4, { isBeatStart: true }).filter(
                    (n) => n.midi > 0,
                ).length,
            ).toBe(0);
        });

        it('should generate CC 64 (Sustain) events on new chords', () => {
            const notes = getAccompanimentNotes(getState(), mockChord, 0, 0, 0, {
                isBeatStart: true,
            });
            const sustainEvents = notes[0].ccEvents.filter((e) => e.controller === 64);
            expect(sustainEvents.some((e) => e.value === 0)).toBe(true);
            expect(sustainEvents.some((e) => e.value === 127)).toBe(true);
        });
    });

    describe('Genre-specific Logic', () => {
        it('should use short durations for Funk and disable sustain for Reggae', () => {
            groove.genreFeel = 'Funk';
            const funkNotes = getAccompanimentNotes(getState(), mockChord, 0, 0, 0, {
                isBeatStart: true,
            }).filter((n) => n.midi > 0);
            if (funkNotes.length > 0) {
                expect([0.8, 0.4, 0.35, 0.2, 0.1]).toContain(funkNotes[0].durationSteps);
            }

            groove.genreFeel = 'Reggae';
            const reggaeNotes = getAccompanimentNotes(getState(), mockChord, 0, 0, 0, {
                isBeatStart: true,
            });
            expect(
                reggaeNotes[0].ccEvents
                    .filter((e) => e.controller === 64)
                    .every((e) => e.value === 0),
            ).toBe(true);
        });

        it('should perform rootless reduction for stable chords when practice spacing is active', () => {
            const { playback, bass } = getState();
            bass.enabled = false;
            playback.practiceMode = false;

            const notesNormal = getAccompanimentNotes(getState(), mockChord, 0, 0, 0, {
                isBeatStart: true,
                isGroupStart: true,
            });

            playback.practiceMode = true; // This reserves the space even if bass is disabled

            const notesRootless = getAccompanimentNotes(getState(), mockChord, 16, 0, 0, {
                isBeatStart: true,
                isGroupStart: true,
            });
            expect(notesRootless.length).toBeLessThan(notesNormal.length);
        });

        it('should preserve guide tones when thinning rootless jazz turnaround dominants', () => {
            const turnaroundDominant = {
                rootMidi: 67,
                freqs: [246.94, 293.66, 349.23], // B3, D4, F4 -> rootless G7
                intervals: [4, 7, 10],
                quality: '7',
                is7th: true,
                beats: 2,
            };

            groove.genreFeel = 'Jazz';
            playback.practiceMode = true;
            playback.bandIntensity = 0.35;
            compingState.currentCell[0] = 1;
            compingState.lockedUntil = 100;

            const notes = getAccompanimentNotes(getState(), turnaroundDominant, 0, 0, 0, {
                isBeatStart: true,
                isGroupStart: true,
            }).filter((note) => note.midi > 0);

            const pitchClasses = notes.map((note) => note.midi % 12);
            expect(notes).toHaveLength(2);
            expect(pitchClasses).toContain(11); // B = 3rd of G7
            expect(pitchClasses).toContain(5); // F = b7 of G7
        });

        it('should keep dominant guide tones when slimming rich practice voicings', () => {
            const richTurnaroundDominant = {
                rootMidi: 67,
                freqs: [246.94, 349.23, 440, 659.26], // B3, F4, A4, E5
                intervals: [4, 10, 14, 21],
                quality: '7',
                is7th: true,
                beats: 2,
            };

            groove.genreFeel = 'Jazz';
            playback.practiceMode = true;
            playback.bandIntensity = 0.65;
            playback.complexity = 0.65;
            compingState.currentCell[0] = 1;
            compingState.lockedUntil = 100;

            const notes = getAccompanimentNotes(getState(), richTurnaroundDominant, 0, 0, 0, {
                isBeatStart: true,
                isGroupStart: true,
            }).filter((note) => note.midi > 0);

            const pitchClasses = notes.map((note) => note.midi % 12);
            expect(notes).toHaveLength(3);
            expect(pitchClasses).toContain(11); // B = 3rd of G7
            expect(pitchClasses).toContain(5); // F = b7 of G7
        });

        it('should keep half-diminished identity in practice mode', () => {
            const halfdimChord = {
                rootMidi: 64, // E
                freqs: [329.63, 392.0, 466.16, 587.33], // E4, G4, Bb4, D5
                intervals: [0, 3, 6, 10],
                quality: 'halfdim',
                is7th: true,
                beats: 4,
            };

            groove.genreFeel = 'Jazz';
            chords.style = 'jazz';
            playback.practiceMode = true;
            playback.bandIntensity = 0.35;
            bass.enabled = false;
            compingState.currentCell[0] = 1;
            compingState.lockedUntil = 100;

            const notes = getAccompanimentNotes(getState(), halfdimChord, 0, 0, 0, {
                isBeatStart: true,
                isGroupStart: true,
            }).filter((note) => note.midi > 0);

            const pitchClasses = notes.map((note) => note.midi % 12);
            expect(notes.length).toBeGreaterThanOrEqual(4);
            expect(pitchClasses).toContain(4); // E root
            expect(pitchClasses).toContain(10); // Bb = b5
            expect(pitchClasses).toContain(2); // D = b7
        });

        it('should favor smoother altered colors for Autumn Leaves style dominants', () => {
            const preDominant = {
                rootMidi: 57, // A
                freqs: [261.63, 311.13, 392.0], // C4, Eb4, G4
                intervals: [3, 10, 7],
                quality: 'halfdim',
                is7th: true,
                beats: 4,
            };
            const alteredDominant = {
                rootMidi: 50, // D
                freqs: [184.99, 261.63, 349.23, 466.16], // F#3, C4, F4, Bb4 (old harsh pocket)
                intervals: [4, 10, 15, 20],
                quality: '7alt',
                is7th: true,
                beats: 4,
            };
            const tonicMinor = {
                rootMidi: 55, // G
                freqs: [233.08, 293.66, 392.0], // Bb3, D4, G4
                intervals: [3, 7, 10],
                quality: 'minor',
                is7th: true,
                beats: 4,
            };

            groove.genreFeel = 'Jazz';
            chords.style = 'jazz';
            playback.practiceMode = true;
            bass.enabled = false;
            arranger.progression = [preDominant, alteredDominant, tonicMinor];
            compingState.currentCell = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0];
            compingState.lockedUntil = 100;

            getAccompanimentNotes(getState(), preDominant, 0, 0, 0, {
                isBeatStart: true,
                isGroupStart: true,
            });

            compingState.currentCell = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0];
            const notes = getAccompanimentNotes(getState(), alteredDominant, 16, 0, 0, {
                isBeatStart: true,
                isGroupStart: true,
            }).filter((note) => note.midi > 0);

            const pitchClasses = notes.map((note) => note.midi % 12);
            expect(pitchClasses).toContain(6); // F# = 3rd of D7
            expect(pitchClasses).toContain(0); // C = b7 of D7
            expect(pitchClasses.some((pitchClass) => pitchClass === 3 || pitchClass === 10)).toBe(
                true,
            ); // prefer b9 or b13 over exposed #9
            expect(pitchClasses).not.toContain(5); // avoid exposed #9 (F) at medium settings
        });

        it('should store jazz voicings for continuity between chord hits', () => {
            groove.genreFeel = 'Jazz';
            chords.style = 'jazz';
            playback.practiceMode = true;
            bass.enabled = false;

            getAccompanimentNotes(getState(), mockChord, 0, 0, 0, {
                isBeatStart: true,
                isGroupStart: true,
            });

            expect(compingState.lastVoicingMidis.length).toBeGreaterThan(0);
        });

        it('should shorten Rock durations when the comping cell is busy', () => {
            groove.genreFeel = 'Rock';
            compingState.currentCell = [1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
            compingState.lockedUntil = 100;

            const rockNote = getAccompanimentNotes(getState(), mockChord, 0, 0, 0, {
                isBeatStart: true,
                isGroupStart: true,
            }).find((note) => note.midi > 0);

            expect(rockNote).toBeDefined();
            expect(rockNote?.durationSteps).toBe(3);
        });

        it('should avoid two-beat Blues holds for balanced smart comping', () => {
            groove.genreFeel = 'Blues';
            compingState.currentCell = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0];
            compingState.lockedUntil = 100;

            const bluesNote = getAccompanimentNotes(getState(), mockChord, 0, 0, 0, {
                isBeatStart: true,
                isGroupStart: true,
            }).find((note) => note.midi > 0);

            expect(bluesNote).toBeDefined();
            expect(bluesNote?.durationSteps).toBe(4);
        });
    });

    describe('Procedural Pattern Generation', () => {
        it('should generate a 16-step pattern and increase density with intensity', () => {
            const ts44 = TIME_SIGNATURES['4/4'];
            const pattern = generateCompingPattern(getState(), 'Rock', 'balanced', ts44, 16);
            expect(pattern).toHaveLength(16);

            const sparse = generateCompingPattern(getState(), 'Rock', 'sparse', ts44, 16).filter(
                (n) => n === 1,
            ).length;
            const active = generateCompingPattern(getState(), 'Rock', 'active', ts44, 16).filter(
                (n) => n === 1,
            ).length;
            expect(active).toBeGreaterThanOrEqual(sparse);
        });

        it('should generate Jazz Charleston rhythm', () => {
            let foundCharleston = false;
            const ts44 = TIME_SIGNATURES['4/4'];
            for (let i = 0; i < 100; i++) {
                const p = generateCompingPattern(getState(), 'Jazz', 'balanced', ts44, 16);
                if (p[0] === 1 && p[6] === 1) {
                    foundCharleston = true;
                    break;
                }
            }
            expect(foundCharleston).toBe(true);
        });

        it('should offer multiple balanced Rock patterns at medium settings', () => {
            const ts44 = TIME_SIGNATURES['4/4'];
            playback.bandIntensity = 0.55;
            playback.complexity = 0.45;

            const patterns = new Set();
            for (let i = 0; i < 24; i++) {
                patterns.add(
                    generateCompingPattern(getState(), 'Rock', 'balanced', ts44, 16).join(''),
                );
            }

            expect(patterns.size).toBeGreaterThan(1);
        });

        it('should keep balanced Blues comping anchored on the downbeat', () => {
            const ts44 = TIME_SIGNATURES['4/4'];
            playback.bandIntensity = 0.55;
            playback.complexity = 0.45;

            for (let i = 0; i < 12; i++) {
                const pattern = generateCompingPattern(getState(), 'Blues', 'balanced', ts44, 16);
                expect(pattern[0]).toBe(1);
            }
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
                notes = getAccompanimentNotes(getState(), chord, i * 16, 0, 0, {
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

    // B2 (#707) — a comp voicing must never ring past the chord it belongs to.
    // The structural ceiling clamps durationSteps to the steps left in the chord
    // (minus a release margin), so successive chords stop overlapping — the
    // "previous measure is still playing" overlap the owner heard.
    describe('#707 B2 — duration clamped to chord length (no ring-over)', () => {
        const shortChord = {
            rootMidi: 60,
            freqs: [261.63, 329.63, 392.0],
            quality: 'maj',
            is7th: false,
            beats: 1, // 1 beat = 4 steps
        };

        it('clamps a default-2-beat comp on a 1-beat chord to within the chord', () => {
            // 'Country' is not special-cased in the duration chain, so it takes
            // the flat 2-beat (8-step) default — pre-#707 that rang two full beats
            // into the next chord. On a 1-beat chord the note must now fit in
            // 4 steps minus the 0.25 release margin = 3.75.
            groove.genreFeel = 'Country';
            playback.bandIntensity = 0.5;
            const notes = getAccompanimentNotes(getState(), shortChord, 0, 0, 0, {
                isBeatStart: true,
                isGroupStart: true,
            }).filter((n) => n.midi > 0);
            expect(notes.length).toBeGreaterThan(0);
            for (const n of notes) {
                expect(n.durationSteps).toBeLessThanOrEqual(3.75);
            }
        });

        it('never exceeds the steps remaining in the chord, across genres/positions', () => {
            // The invariant: durationSteps <= chord.beats*stepsPerBeat - stepInChord
            // for every produced note, at any strike position in any genre.
            const longChord = { ...shortChord, beats: 4 };
            for (const genre of ['Rock', 'Acoustic', 'Jazz', 'Blues', 'Country']) {
                groove.genreFeel = genre;
                for (const [step, stepInChord] of [
                    [0, 0],
                    [8, 8],
                    [12, 12],
                ]) {
                    const notes = getAccompanimentNotes(
                        getState(),
                        longChord,
                        step,
                        stepInChord,
                        step,
                        {
                            isBeatStart: true,
                            isGroupStart: stepInChord === 0,
                        },
                    ).filter((n) => n.midi > 0);
                    const stepsToChordEnd = longChord.beats * 4 - stepInChord;
                    for (const n of notes) {
                        expect(n.durationSteps).toBeLessThanOrEqual(stepsToChordEnd);
                    }
                }
            }
        });

        it('leaves a downbeat voicing on a long chord at its full genre duration', () => {
            // The clamp is a ceiling, not a fixed cut: a 4-beat chord struck on
            // its One keeps the genre's natural comp length (well under 15.75).
            groove.genreFeel = 'Rock';
            playback.bandIntensity = 0.5;
            const longChord = { ...shortChord, beats: 4 };
            const notes = getAccompanimentNotes(getState(), longChord, 0, 0, 0, {
                isBeatStart: true,
                isGroupStart: true,
            }).filter((n) => n.midi > 0);
            expect(notes.length).toBeGreaterThan(0);
            expect(notes[0].durationSteps).toBeGreaterThan(1);
            expect(notes[0].durationSteps).toBeLessThanOrEqual(15.75);
        });
    });
});
