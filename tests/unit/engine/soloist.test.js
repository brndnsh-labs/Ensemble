import { beforeEach, describe, expect, it, vi } from 'vitest';
// cspell:ignore tonicization
import { getSoloistNote } from '../../../public/engine/soloist.js';
import * as pitchEngine from '../../../public/engine/soloist-pitch-engine.js';
import { getScaleForChord } from '../../../public/engine/theory-scales.js';
import { getState } from '../../../public/state.js';

vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: {
            bandIntensity: 0.5,
            currentLoopCount: 0,
            bpm: 120,
            complexity: 0.5,
            intent: { soloistMod: 0 },
        },
        groove: { genreFeel: 'Jazz', pocket: 0 },
        soloist: {
            mode: 'guitar',
            isResting: true,
            busySteps: 0,
            sessionSeed: {
                loopLengthSteps: 16,
                notes: [
                    { step: 0, midi: 72, durationSteps: 4, velocity: 0.8, isAnchor: true },
                    { step: 8, midi: 74, durationSteps: 2, velocity: 0.9, isAnchor: true },
                ],
            },
            tension: 0,
            sessionSteps: 1000,
            pitchHistory: [],
            notesInPhrase: 0,
            currentPhraseSteps: 0,
            isPhraseActive: true,
            lastAttackStep: -100,
            motifBuffer: [],
            deviceBuffer: [],
            evolutionEnabled: false,
            activeSteps: 100,
            restSteps: 0,
            doubleStopProb: 0.1,
        },
        arranger: { timeSignature: '4/4', totalSteps: 16, stepMap: [], key: 'C', isMinor: false },
        chords: {},
        bass: {},
        harmony: { enabled: false, rhythmicMask: 0, complexity: 0.5, intent: { soloistMod: 0 } },
        vizState: {},
        midi: {},
        dispatch: vi.fn(),
    };
    return {
        getState: () => mockState,
        stateMap: mockState,
        dispatch: mockState.dispatch,
        subscribe: vi.fn(),
    };
});

vi.mock('../../../public/config.js', () => {
    const STYLE_CONFIG = {
        neo: {
            deviceProb: 1.0,
            cells: [0],
            allowedDevices: ['enclosure'],
            registerSoar: 5,
            restBase: 0.35,
            restGrowth: 0.08,
            doubleStopProb: 0.1,
            motifProb: 0.4,
            hookProb: 0.2,
        },
        shred: {
            deviceProb: 1.0,
            cells: [0],
            allowedDevices: ['run'],
            registerSoar: 5,
            restBase: 0.25,
            restGrowth: 0.05,
            doubleStopProb: 0.05,
            motifProb: 0.3,
            hookProb: 0.1,
        },
        blues: {
            deviceProb: 1.0,
            cells: [0],
            allowedDevices: ['slide'],
            registerSoar: 5,
            restBase: 0.4,
            restGrowth: 0.1,
            doubleStopProb: 0.35,
            motifProb: 0.5,
            hookProb: 0.3,
        },
        scalar: {
            deviceProb: 1.0,
            cells: [0],
            allowedDevices: ['run'],
            registerSoar: 5,
            restBase: 0.35,
            restGrowth: 0.08,
            doubleStopProb: 0.1,
            maxNotesPerPhrase: 16,
            motifProb: 0.4,
            hookProb: 0.2,
        },
        bird: {
            deviceProb: 1.0,
            cells: [0],
            allowedDevices: ['run'],
            registerSoar: 15,
            restBase: 0.3,
            restGrowth: 0.05,
            doubleStopProb: 0.05,
            maxNotesPerPhrase: 48,
            motifProb: 0.4,
            hookProb: 0.2,
        },
    };
    return {
        STYLE_CONFIG,
        TIME_SIGNATURES: {
            '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', grouping: [4] },
        },
        KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    };
});

// Partial spy on pitchEngine to allow both mocked and real behavior checks
vi.mock('../../../public/engine/soloist-pitch-engine.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        selectPitchAndDevices: vi.fn(actual.selectPitchAndDevices),
    };
});

describe('Soloist Engine', () => {
    const chordC = { rootMidi: 60, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = getState();
        mockState.playback.currentLoopCount = 0;
        mockState.playback.bandIntensity = 0.5;
        mockState.soloist.isResting = true;
        mockState.soloist.busySteps = 0;
        mockState.soloist.lastAttackStep = -100;
        mockState.soloist.deviceBuffer = [];
        mockState.soloist.notesInPhrase = 0;
    });

    describe('Head Mode (Loop 0) & Seed Following', () => {
        it('should bypass rhythm engine on Loop 0 and yield seed notes directly', () => {
            const randomMock = vi.spyOn(Math, 'random').mockReturnValue(0);
            getSoloistNote(mockState, chordC, null, 0, 261.63, 72, 'scalar', 0, {});

            expect(pitchEngine.selectPitchAndDevices).toHaveBeenCalled();
            const callArgs = pitchEngine.selectPitchAndDevices.mock.calls[0];
            const pseudoRhythmNode = callArgs[2];

            expect(pseudoRhythmNode.isHeadBypass).toBe(true);
            expect(pseudoRhythmNode.targetMidi).toBe(72);
            randomMock.mockRestore();
        });

        it('should honor the seeded pitch during strict head playback', () => {
            const randomMock = vi.spyOn(Math, 'random').mockReturnValue(0);
            const result = getSoloistNote(mockState, chordC, null, 0, 261.63, 72, 'scalar', 0, {});
            const primary = Array.isArray(result) ? result[result.length - 1] : result;

            expect(primary).not.toBeNull();
            expect(primary.midi).toBe(72);
            expect(primary.device).toBeUndefined();
            randomMock.mockRestore();
        });

        it('should resolve smart soloist playback through the selected genre feel', () => {
            mockState.groove.genreFeel = 'Jazz';
            const randomMock = vi.spyOn(Math, 'random').mockReturnValue(0);
            getSoloistNote(mockState, chordC, null, 0, 261.63, 72, 'smart', 0, {});

            expect(pitchEngine.selectPitchAndDevices).toHaveBeenCalled();
            const callArgs = pitchEngine.selectPitchAndDevices.mock.calls[0];
            expect(callArgs[5]).toBe('bird');
            randomMock.mockRestore();
        });

        it('should rest if no seed note exists at current step in Loop 0', () => {
            const result = getSoloistNote(mockState, chordC, null, 1, 261.63, 72, 'scalar', 1, {});
            expect(result).toBeNull();
        });

        it('should use themed improvisation on Loop 1 at medium intensity', () => {
            mockState.playback.currentLoopCount = 1;
            mockState.playback.bandIntensity = 0.5;
            mockState.soloist.isResting = false;

            const randomMock = vi.spyOn(Math, 'random').mockReturnValue(0);
            getSoloistNote(mockState, chordC, null, 0, 261.63, 72, 'scalar', 0, {});

            expect(pitchEngine.selectPitchAndDevices).toHaveBeenCalled();
            const callArgs = pitchEngine.selectPitchAndDevices.mock.calls[0];
            const pseudoRhythmNode = callArgs[2];

            expect(pseudoRhythmNode.isHeadBypass).toBe(true);
            expect(pseudoRhythmNode.targetMidi).toBe(72);
            randomMock.mockRestore();
        });

        it('should attach paraphrase response hints to loop-1 head bypass notes', () => {
            mockState.playback.currentLoopCount = 1;
            mockState.playback.bandIntensity = 0.5;
            mockState.soloist.isResting = false;

            const randomMock = vi.spyOn(Math, 'random').mockReturnValue(0);
            getSoloistNote(mockState, chordC, null, 0, 261.63, 72, 'scalar', 0, {});

            expect(pitchEngine.selectPitchAndDevices).toHaveBeenCalled();
            const callArgs = pitchEngine.selectPitchAndDevices.mock.calls[0];
            const pseudoRhythmNode = callArgs[2];

            expect(pseudoRhythmNode.responsePitchClass).toBe(0);
            expect(pseudoRhythmNode.responseDirection).toBe(1);
            expect(pseudoRhythmNode.responseEntryTarget).toBe(true);
            expect(pseudoRhythmNode.responseCadenceTarget).toBe(true);
            expect(pseudoRhythmNode.responseMode).toBe('paraphrase');
            randomMock.mockRestore();
        });

        it('should keep loop 1 tied to the theme even when anchor-scale randomness would fail', () => {
            mockState.playback.currentLoopCount = 1;
            mockState.playback.bandIntensity = 0.5;
            mockState.soloist.isResting = false;

            const randomMock = vi.spyOn(Math, 'random').mockReturnValue(0.99);
            getSoloistNote(mockState, chordC, null, 0, 261.63, 72, 'scalar', 0, {});

            expect(pitchEngine.selectPitchAndDevices).toHaveBeenCalled();
            const callArgs = pitchEngine.selectPitchAndDevices.mock.calls[0];
            const pseudoRhythmNode = callArgs[2];

            expect(pseudoRhythmNode.isHeadBypass).toBe(true);
            expect(pseudoRhythmNode.targetMidi).toBe(72);
            randomMock.mockRestore();
        });

        it('should keep seeded anchor moments theme-aware on later loops', () => {
            mockState.playback.currentLoopCount = 3;
            mockState.playback.bandIntensity = 0.85;
            mockState.soloist.isResting = false;

            const randomMock = vi.spyOn(Math, 'random').mockReturnValue(0.99);
            getSoloistNote(mockState, chordC, null, 0, 261.63, 72, 'scalar', 0, {});

            expect(pitchEngine.selectPitchAndDevices).toHaveBeenCalled();
            const callArgs = pitchEngine.selectPitchAndDevices.mock.calls[0];
            const pseudoRhythmNode = callArgs[2];

            expect(pseudoRhythmNode.isHeadBypass).toBe(true);
            expect(pseudoRhythmNode.targetMidi).toBe(72);
            randomMock.mockRestore();
        });
    });

    describe('Core Generation & Phrasing', () => {
        it('should generate a note object when playing in generative mode', () => {
            mockState.playback.currentLoopCount = 3;
            mockState.soloist.isResting = false;
            let note = null;
            for (let i = 0; i < 100; i++) {
                note = getSoloistNote(mockState, chordC, null, i * 4, 440, 72, 'scalar', 0, {
                    bypassRhythm: true,
                });
                if (note) {
                    break;
                }
            }
            expect(note).not.toBeNull();
        });

        it('should respect the note budget', () => {
            mockState.playback.currentLoopCount = 3;
            mockState.soloist.notesInPhrase = 20;
            let rests = 0;
            for (let i = 0; i < 100; i++) {
                if (!getSoloistNote(mockState, chordC, null, i + 32, 440, 72, 'scalar', i % 4)) {
                    rests++;
                }
            }
            expect(rests).toBeGreaterThan(15);
        });
    });

    describe('Style-Specific Logic', () => {
        it('should prioritize Bebop phrasing for Bird style', () => {
            mockState.playback.currentLoopCount = 3;
            const durations = [];
            for (let i = 0; i < 200; i++) {
                mockState.soloist.busySteps = 0;
                mockState.soloist.lastAttackStep = -100;
                const result = getSoloistNote(mockState, chordC, null, i * 4, 440, 72, 'bird', 0, {
                    bypassRhythm: true,
                });
                if (result) {
                    const notes = Array.isArray(result) ? result : [result];
                    notes.forEach((n) => durations.push(n.durationSteps));
                }
            }
            const shortNotes = durations.filter((d) => d <= 2).length;
            expect(shortNotes / durations.length).toBeGreaterThan(0.6);
        });

        it('should generate staccato notes for Funk', () => {
            mockState.groove.genreFeel = 'Funk';
            mockState.playback.currentLoopCount = 3;
            let shortNotes = 0;
            let played = 0;
            for (let i = 0; i < 100; i++) {
                mockState.soloist.busySteps = 0;
                mockState.soloist.lastAttackStep = -100;
                const noteResult = getSoloistNote(
                    mockState,
                    chordC,
                    chordC,
                    i * 4,
                    261.63,
                    72,
                    'smart',
                    0,
                    {
                        bypassRhythm: true,
                    },
                );
                if (noteResult) {
                    played++;
                    const primary = Array.isArray(noteResult)
                        ? noteResult[noteResult.length - 1]
                        : noteResult;
                    if (primary.durationSteps <= 2) {
                        shortNotes++;
                    }
                }
            }
            if (played > 0) {
                // At 0.5 intensity, Funk should have a good amount of short notes
                expect(shortNotes / played).toBeGreaterThanOrEqual(0.3);
            }
        });
    });

    describe('Scale Selection & Harmonic Integrity', () => {
        it('should select Altered scale when tension is high', () => {
            mockState.soloist.tension = 0.8;
            expect(getScaleForChord(mockState, chordC, null, 'bird')).toEqual([
                0, 1, 3, 4, 6, 8, 10,
            ]);
        });

        it('should select Phrygian Dominant for V7 to an explicitly minor tonicization', () => {
            mockState.soloist.tension = 0;
            // G7 (67) to Cm (60). 60 - 67 = -7 = +5 semitones.
            const G7 = { rootMidi: 67, intervals: [0, 4, 7, 10], quality: '7' };
            const Cm = {
                rootMidi: 60,
                intervals: [0, 3, 7],
                quality: 'minor',
                key: 'C',
                keyIsMinor: true,
            };
            expect(getScaleForChord(mockState, G7, Cm, 'bird')).toEqual([0, 1, 4, 5, 7, 8, 10]);
        });
    });

    describe('Double Stop Generation', () => {
        it('should return an array of notes when double stops are triggered', () => {
            mockState.playback.currentLoopCount = 3;
            mockState.soloist.mode = 'guitar';
            mockState.soloist.doubleStopProb = 1.0;
            let arrayFound = false;
            for (let i = 0; i < 2000; i++) {
                mockState.soloist.busySteps = 0;
                mockState.soloist.lastAttackStep = -100;
                const res = getSoloistNote(mockState, chordC, null, i * 4, 440, 72, 'blues', 0, {
                    bypassRhythm: true,
                });
                if (Array.isArray(res) && res.length > 1) {
                    arrayFound = true;
                    break;
                }
            }
            expect(arrayFound).toBe(true);
        });
    });
});
