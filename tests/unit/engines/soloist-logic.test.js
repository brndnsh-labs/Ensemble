/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock state
vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: { bandIntensity: 0.6, bpm: 120, complexity: 0.5, intent: { soloistMod: 0 } },
        groove: { genreFeel: 'Rock' },
        soloist: {
            busySteps: 0,
            tension: 0,
            mode: 'monophonic',
            sessionSteps: 1000,
            pitchHistory: [],
            notesInPhrase: 0,
            currentPhraseSteps: 0,
            isResting: false,
            isPhraseActive: true,
            lastAttackStep: -100,
            motifBuffer: [],
            deviceBuffer: [],
            evolutionEnabled: false,
        },
        harmony: { enabled: false, rhythmicMask: 0, complexity: 0.5, intent: { soloistMod: 0 } },
        arranger: { timeSignature: '4/4', totalSteps: 64 },
        chords: {},
        bass: {},
        vizState: {},
        midi: {},
        storage: {},
        dispatch: vi.fn(),
    };
    return {
        ...mockState,
        getState: () => mockState,
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
        KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
        TIME_SIGNATURES: {
            '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', grouping: [4] },
        },
    };
});

import { clearHarmonyMemory } from '../../../public/harmonies.js';
import { getSoloistNote } from '../../../public/soloist.js';
import { getState } from '../../../public/state.js';
import { getScaleForChord } from '../../../public/theory-scales.js';
import { getFrequency } from '../../../public/utils.js';

const { soloist, groove } = getState();

describe('Soloist Engine Logic', () => {
    const chordC = { rootMidi: 60, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };
    const _chordF = { rootMidi: 65, intervals: [0, 4, 7], quality: 'major', beats: 4 };

    beforeEach(() => {
        clearHarmonyMemory();
        soloist.isResting = false;
        soloist.currentPhraseSteps = 1;
        soloist.notesInPhrase = 0;
        soloist.busySteps = 0;
        soloist.deviceBuffer = [];
        soloist.lastInterval = 0;
        soloist.sessionSteps = 1000;
        soloist.tension = 0;
        soloist.currentCell = [1, 1, 1, 1];
        soloist.deterministic = false;
        groove.genreFeel = 'Rock';
    });

    describe('Core Generation & Phrasing', () => {
        it('should generate a note object when playing', () => {
            let note = null;
            for (let i = 0; i < 100; i++) {
                soloist.isResting = false;
                soloist.busySteps = 0;
                soloist.lastAttackStep = -100;
                note = getSoloistNote(chordC, null, i * 4, 440, 72, 'scalar', 0, false, {
                    bypassRhythm: true,
                });
                if (note) {
                    break;
                }
            }
            expect(note).not.toBeNull();
            const primary = Array.isArray(note) ? note[note.length - 1] : note;
            expect(primary).toHaveProperty('midi');
        });

        it('should respect the note budget', () => {
            soloist.notesInPhrase = 20;
            let rests = 0;
            for (let i = 0; i < 100; i++) {
                if (!getSoloistNote(chordC, null, i + 32, 440, 72, 'scalar', i % 4)) {
                    rests++;
                }
            }
            // With restBase 0.35, we expect a decent amount of rests even if budget is high
            expect(rests).toBeGreaterThan(15);
        });
    });

    describe('Melodic Devices', () => {
        it('should trigger melodic devices (Enclosures, Runs, Slides)', () => {
            const deviceTests = [
                { style: 'neo', label: 'Quartal/Enclosure' },
                { style: 'blues', label: 'Slide' },
                { style: 'shred', label: 'Run' },
            ];

            // Some devices like Quartal/GuitarDouble require polyphonic mode
            soloist.mode = 'polyphonic';

            deviceTests.forEach((t) => {
                let triggered = false;
                for (let i = 0; i < 500; i++) {
                    soloist.deviceBuffer = [];
                    soloist.busySteps = 0;
                    soloist.isResting = false;
                    soloist.currentPhraseSteps = 0;
                    soloist.lastAttackStep = -100;
                    const res = getSoloistNote(chordC, null, i * 4, 440, 72, t.style, 0, false, {
                        bypassRhythm: true,
                    });
                    // Check buffer OR immediate double stop result (Quartal/GuitarDouble)
                    if (
                        soloist.deviceBuffer.length > 0 ||
                        (Array.isArray(res) && res.some((n) => n.isDoubleStop))
                    ) {
                        triggered = true;
                        break;
                    }
                }
                expect(triggered, `Failed to trigger ${t.label} for ${t.style}`).toBe(true);
            });
        });
    });

    describe('Style-Specific Logic', () => {
        it('should prioritize Bebop phrasing for Bird style', () => {
            const durations = [];
            for (let i = 0; i < 200; i++) {
                soloist.isResting = false;
                soloist.busySteps = 0;
                soloist.lastAttackStep = -100;
                const result = getSoloistNote(chordC, null, i * 4, 440, 72, 'bird', 0, false, {
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
            groove.genreFeel = 'Funk';
            getState().playback.currentLoopCount = 3; // Avoid Head Mode extensions
            let shortNotes = 0;
            let played = 0;
            for (let i = 0; i < 100; i++) {
                soloist.isResting = false;
                soloist.busySteps = 0;
                soloist.lastAttackStep = -100;
                const noteResult = getSoloistNote(
                    chordC,
                    chordC,
                    i * 4,
                    261.63,
                    72,
                    'smart',
                    0,
                    false,
                    { bypassRhythm: true },
                );
                if (noteResult) {
                    played++;
                    const primary = Array.isArray(noteResult)
                        ? noteResult[noteResult.length - 1]
                        : noteResult;
                    if (primary.durationSteps <= 1) {
                        shortNotes++;
                    }
                }
            }
            if (played > 0) {
                expect(shortNotes / played).toBeGreaterThanOrEqual(0.5);
            }
        });
    });

    describe('Integrity & Overlaps', () => {
        it('should respect double stop toggle', () => {
            soloist.doubleStopProb = 0;
            let arrayFound = false;
            for (let i = 0; i < 500; i++) {
                soloist.isResting = false;
                soloist.busySteps = 0;
                soloist.lastAttackStep = -100;
                if (
                    Array.isArray(
                        getSoloistNote(chordC, null, i * 4, 440, 72, 'blues', i % 16, false, {
                            bypassRhythm: true,
                        }),
                    )
                ) {
                    arrayFound = true;
                    break;
                }
            }
            expect(arrayFound).toBe(false);
            soloist.doubleStopProb = 1.0; // Reset
        });

        it('should limit overlapping notes', () => {
            const activeNotes = [];
            let maxOverlaps = 0;
            for (let step = 0; step < 200; step++) {
                for (let i = activeNotes.length - 1; i >= 0; i--) {
                    if (activeNotes[i].endStep <= step) {
                        activeNotes.splice(i, 1);
                    }
                }
                const result = getSoloistNote(
                    chordC,
                    null,
                    step + 16,
                    440,
                    72,
                    'scalar',
                    step % 16,
                );
                if (result) {
                    const notes = Array.isArray(result) ? result : [result];
                    notes.forEach((n) => activeNotes.push({ endStep: step + n.durationSteps }));
                }
                maxOverlaps = Math.max(maxOverlaps, activeNotes.length);
            }
            expect(maxOverlaps).toBeLessThanOrEqual(3);
        });
    });

    describe('Scale Selection & Harmonic Integrity', () => {
        it('should select Altered scale when tension is high', () => {
            soloist.tension = 0.8;
            expect(getScaleForChord(chordC, null, 'bird')).toEqual([0, 1, 3, 4, 6, 8, 10]);
        });

        it('should select Phrygian Dominant for V7 to minor resolution', () => {
            const G7 = { rootMidi: 67, intervals: [0, 4, 7, 10], quality: '7' };
            const Cm = { rootMidi: 60, intervals: [0, 3, 7], quality: 'minor' };
            expect(getScaleForChord(G7, Cm, 'bird')).toEqual([0, 1, 4, 5, 7, 8, 10]);
        });

        it('should use Aeolian for vi chord in Neo-Soul to avoid clashes', () => {
            const viChord = { rootMidi: 57, quality: 'minor', intervals: [0, 3, 7], key: 'C' };
            const scale = getScaleForChord(viChord, null, 'neo');
            // UPDATED: Better Theory engine prefers Dorian (9) for Neo-Soul minor chords for color
            expect(scale).toContain(9);
            expect(scale).not.toContain(8);
        });

        it('should treat m9 as minor in Funk/Neo-Soul context (avoid Major 3rd)', () => {
            const m9Chord = {
                rootMidi: 60,
                quality: 'm9',
                intervals: [0, 3, 7, 10, 14],
                isMinor: true,
            };
            const scale = getScaleForChord(m9Chord, null, 'funk');
            expect(scale).toContain(3); // Minor 3rd
            expect(scale).not.toContain(4); // No Major 3rd
        });

        it('should treat m11 as minor in Neo-Soul context', () => {
            const m11Chord = {
                rootMidi: 60,
                quality: 'm11',
                intervals: [0, 3, 7, 10, 14, 17],
                isMinor: true,
            };
            const scale = getScaleForChord(m11Chord, null, 'neo');
            expect(scale).toContain(3);
            expect(scale).toContain(10);
            expect(scale).not.toContain(4);
        });

        it('should treat IV13 as Dominant (Mixolydian) in Funk', () => {
            const IV13 = {
                rootMidi: 65,
                quality: '13',
                intervals: [0, 4, 7, 10, 14, 21],
                isMinor: false,
            }; // F13
            const scale = getScaleForChord(IV13, null, 'funk');
            expect(scale).toContain(4); // Major 3rd
            expect(scale).toContain(10); // Minor 7th
            expect(scale).toContain(9); // 13th (Major 6th)
        });

        it('should correctly handle m6 chords (Dorian/Melodic Minor)', () => {
            const m6Chord = { rootMidi: 60, quality: 'm6', intervals: [0, 3, 7, 9], isMinor: true };
            const scale = getScaleForChord(m6Chord, null, 'bird');
            expect(scale).toContain(3);
            expect(scale).toContain(9);
        });
    });

    describe('Neo-Soul Phrasing Logic', () => {
        it('should produce sustained notes and soulful scoops', () => {
            let sustained = 0,
                scoops = 0,
                total = 0;
            for (let i = 0; i < 500; i++) {
                soloist.isResting = false;
                soloist.busySteps = 0;
                soloist.notesInPhrase = 0;
                soloist.lastAttackStep = -100;
                const res = getSoloistNote(chordC, null, i * 4, 440, 72, 'neo', 0);
                if (res) {
                    total++;
                    if (res.durationSteps >= 4) {
                        sustained++;
                        if (res.bendStartInterval > 0) {
                            scoops++;
                        }
                    }
                }
            }
            expect(sustained / total).toBeGreaterThan(0.5);
            expect(scoops / sustained).toBeGreaterThan(0.1);
        });
    });

    describe('Session Maturity', () => {
        it('should become more active as session maturity increases', () => {
            const chord = { rootMidi: 60, quality: 'major', intervals: [0, 4, 7], beats: 4 };
            const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5); // Fixed randomness for phrased rest checks

            // Conservative start
            getState().playback.currentLoopCount = 0;
            soloist.sessionSteps = 0;
            soloist.busySteps = 0;
            let noteCountStart = 0;
            for (let i = 0; i < 1000; i++) {
                soloist.isResting = false;
                soloist.busySteps = 0;
                soloist.notesInPhrase = 0;
                soloist.currentPhraseSteps = 0;
                soloist.lastAttackStep = -100;
                if (getSoloistNote(chord, null, i * 4, 440, 72, 'scalar', 0)) {
                    noteCountStart++;
                }
            }

            // Matured start
            getState().playback.currentLoopCount = 3;
            soloist.sessionSteps = 10000;
            let noteCountLate = 0;
            for (let i = 0; i < 1000; i++) {
                soloist.isResting = false;
                soloist.busySteps = 0;
                soloist.notesInPhrase = 0;
                soloist.currentPhraseSteps = 0;
                soloist.lastAttackStep = -100;
                if (getSoloistNote(chord, null, i * 4, 440, 72, 'scalar', 0)) {
                    noteCountLate++;
                }
            }

            expect(noteCountLate).toBeGreaterThan(noteCountStart);
            spy.mockRestore();
        });
    });

    describe('Structural Awareness', () => {
        it('should be more likely to rest approaching the section boundary', () => {
            getState().playback.currentLoopCount = 3;
            const sectionInfo = { sectionStart: 0, sectionEnd: 64 };
            const chord = { rootMidi: 60, quality: 'major', intervals: [0, 4, 7], beats: 4 };
            const spy = vi.spyOn(Math, 'random').mockReturnValue(0.6); // Threshold for rest checks

            let midNoteCount = 0;
            for (let i = 0; i < 500; i++) {
                soloist.isResting = false;
                soloist.busySteps = 0;
                soloist.notesInPhrase = 0;
                soloist.currentPhraseSteps = 16;
                soloist.lastAttackStep = -100;
                if (getSoloistNote(chord, null, i * 4, 440, 72, 'scalar', 0, false, sectionInfo)) {
                    midNoteCount++;
                }
            }

            let endNoteCount = 0;
            for (let i = 0; i < 500; i++) {
                soloist.isResting = false;
                soloist.busySteps = 0;
                soloist.notesInPhrase = 0;
                soloist.currentPhraseSteps = 16;
                soloist.lastAttackStep = -100;
                if (getSoloistNote(chord, null, 62, 440, 72, 'scalar', 14, false, sectionInfo)) {
                    endNoteCount++;
                }
            }

            expect(midNoteCount).toBeGreaterThan(endNoteCount);
            spy.mockRestore();
        });
    });

    describe('Motif & Bend Integrity', () => {
        it('should generate positive bendStartInterval for scoops (starting below target)', () => {
            getState().playback.currentLoopCount = 3;
            const chord = { rootMidi: 60, quality: 'major', intervals: [0, 4, 7], beats: 4 };
            let scoops = 0;
            for (let i = 0; i < 500; i++) {
                soloist.isResting = false;
                soloist.busySteps = 0;
                soloist.notesInPhrase = 0;
                soloist.lastAttackStep = -100;
                const res = getSoloistNote(chord, null, i * 4, 440, 72, 'neo', 0, false, {
                    bypassRhythm: true,
                });
                if (res && res.bendStartInterval > 0) {
                    scoops++;
                }
            }
            expect(scoops).toBeGreaterThan(0);
        });

        it('should adjust bendStartInterval when nudging motif notes for scale compliance', () => {
            const recordedNote = {
                midi: 64,
                bendStartInterval: 1,
                durationSteps: 4,
                phraseStep: 1,
            };
            soloist.motifBuffer = [recordedNote];
            soloist.motifRoot = 0;
            soloist.isReplayingMotif = true;
            soloist.motifReplayIndex = 0;
            soloist.currentPhraseSteps = 0; // Will be incremented to 1 inside getSoloistNote
            soloist.isResting = false;

            const chordGm = { rootMidi: 67, quality: 'minor', intervals: [0, 3, 7], beats: 4 };
            const replayed = getSoloistNote(chordGm, null, 16, 440, 72, 'scalar', 0);

            // Gm scale: G(67), A(69), Bb(70), C(72), D(74), Eb(75), F(77)
            // Shift 0->67 is +67. 64+67 = 131... too high.
            // Let's use simpler test: Chord Gm root 67. Motif root C 60. Shift is +7.
            // 64+7 = 71 (B). B is NOT in G minor (Dorian). Nudge to 70 (Bb).
            // bendStart 1 nudged to 0.
            // The smart shift logic (shift > 6 -> shift -= 12) converts +7 to -5.
            // 64 - 5 = 59 (B). Nearest in Gm is Bb (58).
            expect(replayed.midi).toBe(58);
            expect(replayed.bendStartInterval).toBe(0);
        });
    });

    describe('Double Stop Generation', () => {
        it('should return an array of notes when double stops are triggered', () => {
            getState().playback.currentLoopCount = 3;
            soloist.mode = 'guitar';
            let arrayFound = false;
            for (let i = 0; i < 2000; i++) {
                soloist.isResting = false;
                soloist.busySteps = 0;
                soloist.notesInPhrase = 0;
                soloist.currentPhraseSteps = 0;
                soloist.lastAttackStep = -100;
                const res = getSoloistNote(chordC, null, i * 4, 440, 72, 'blues', 0, false, {
                    bypassRhythm: true,
                });
                if (Array.isArray(res)) {
                    arrayFound = true;
                    break;
                }
            }
            expect(arrayFound).toBe(true);
        });
    });

    describe('Melodic Variety & Repetition', () => {
        it('should not get stuck on F4 (65) in Standard Pop progression', () => {
            getState().playback.currentLoopCount = 3;
            // C | G | Am | F
            const prog = [
                { rootMidi: 60, intervals: [0, 4, 7], quality: 'major' }, // C
                { rootMidi: 67, intervals: [0, 4, 7, 10], quality: '7' }, // G7 (F is 7th)
                { rootMidi: 69, intervals: [0, 3, 7], quality: 'minor' }, // Am
                { rootMidi: 65, intervals: [0, 4, 7], quality: 'major' }, // F (F is Root)
            ];

            let f4Count = 0;
            let totalNoteCount = 0;
            let lastFreq = 261.63; // C4

            // Simulate 32 bars (8 loops of 4 bars), 16 steps each
            for (let bar = 0; bar < 32; bar++) {
                const chord = prog[bar % 4];
                const nextChord = prog[(bar + 1) % 4];

                for (let stepIdx = 0; stepIdx < 16; stepIdx++) {
                    soloist.isResting = false;
                    soloist.busySteps = 0;
                    // Note: We DON'T reset lastAttackStep here because we WANT the gap protection to work naturally across steps
                    const res = getSoloistNote(
                        chord,
                        nextChord,
                        stepIdx + bar * 16,
                        lastFreq,
                        64,
                        'scalar',
                        stepIdx,
                        false,
                        { bypassRhythm: true },
                    );
                    if (res) {
                        const note = Array.isArray(res) ? res[0] : res;
                        if (note.midi === 65) {
                            f4Count++;
                        }
                        totalNoteCount++;
                        lastFreq = getFrequency(note.midi);
                    }
                }
            }
            // If F4 is > 40% of notes, that's too repetitive
            if (totalNoteCount > 0) {
                expect(f4Count / totalNoteCount).toBeLessThan(0.4);
            }
        });
    });

    describe('Edge Cases', () => {
        it('should initialize an attack mid-beat (pickup logic)', () => {
            const chordC = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
            // Force start in resting state
            soloist.isResting = true;
            soloist.currentPhraseSteps = 0;
            soloist.lastAttackStep = -100;

            // Force Math.random to return 0.0 so startProb check passes
            const spy = vi.spyOn(Math, 'random').mockReturnValue(0.0);

            const res = getSoloistNote(chordC, null, 3, 440, 60, 'scalar', 3);

            expect(res).not.toBeNull();
            expect(soloist.lastAttackStep).toBe(3);
            spy.mockRestore();
        });

        it('should calculate voice leading without crashing for non-bird styles', () => {
            const chordC = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
            const chordF = { rootMidi: 65, intervals: [0, 4, 7], beats: 4 };

            // Approaching change: stepInChord = 14 (Last 2 steps of 16-step bar)
            // style 'scalar' previously skipped voice leading logic

            const res = getSoloistNote(chordC, chordF, 14, 440, 60, 'scalar', 14);

            // We just ensure it runs. Result might be null if it rests, but logic path is exercised.
            expect(res === null || typeof res === 'object').toBe(true);
        });
    });
});
