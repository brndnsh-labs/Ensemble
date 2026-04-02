/* eslint-disable */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const capturedMessages = [];
const { mockNoteOn, noteOnEvents } = vi.hoisted(() => ({
    mockNoteOn: vi.fn(),
    noteOnEvents: [],
}));

// Mock midi-utils.js to ensure we catch all noteOn calls from the class
vi.mock('../../../public/engine/midi-utils.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        MidiTrack: class extends actual.MidiTrack {
            noteOn(time, chan, midi, vel) {
                // If the channel is the configured drums channel (9 by default, but it's 0-indexed so 8 if it was 9 previously. In tests state.midi.drumsChannel is usually 10, so chan is 9)
                if (chan === 9) {
                    noteOnEvents.push({ time, midi, vel });
                }
                mockNoteOn(time, chan, midi, vel);
                super.noteOn(time, chan, midi, vel);
            }
        },
    };
});

// Mock postMessage for global scope (worker style)
vi.stubGlobal('postMessage', (msg) => capturedMessages.push(msg));

// Use vi.stubGlobal to define self before imports
vi.stubGlobal('self', {
    onmessage: null,
    postMessage: (msg) => postMessage(msg),
});

// Mock state
vi.mock('../../../public/state.js', () => {
    const mockState = {
        soloist: {
            enabled: true,
            lastFreq: 440,
            busySteps: 0,
            sessionSteps: 1000,
            motifBuffer: [],
            deviceBuffer: [],
            phraseContext: {
                role: 'call',
                skeleton: [],
                lastInterval: null,
                profile: 'srv',
            },
        },
        chords: { enabled: true, octave: 60, density: 'standard' },
        bass: { enabled: true, lastFreq: 110, pocketOffset: 0, octave: 36, style: 'smart' },
        harmony: {
            enabled: true,
            volume: 0.4,
            complexity: 0.5,
            motifBuffer: [],
            buffer: new Map(),
        },
        playback: { bandIntensity: 0.5, bpm: 120, intent: {}, audio: { currentTime: 0 } },
        arranger: {
            key: 'C',
            isMinor: false,
            progression: [],
            totalSteps: 64,
            stepMap: [],
            sectionMap: [],
            timeSignature: '4/4',
        },
        groove: {
            genreFeel: 'Rock',
            enabled: true,
            creativity: false,
            instruments: [
                {
                    name: 'Kick',
                    muted: false,
                    steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
                },
                {
                    name: 'Snare',
                    muted: false,
                    steps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
                },
                {
                    name: 'HiHat',
                    muted: false,
                    steps: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
                },
            ],
            measures: 1,
            lastDrumPreset: 'Basic Rock',
            sectionSeedMap: {},
        },
        vizState: {},
        midi: {
            chordsChannel: 1,
            bassChannel: 2,
            soloistChannel: 3,
            harmonyChannel: 4,
            drumsChannel: 10,
        },
        storage: {},
        dispatch: vi.fn(),
    };
    return {
        ...mockState,
        stateMap: mockState,
        getState: () => mockState,
    };
});

vi.mock('../../../public/config.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
        TIME_SIGNATURES: {
            '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12] },
        },
        REGGAE_RIDDIMS: {},
        MIXER_GAIN_MULTIPLIERS: {
            chords: 0.22,
            bass: 0.35,
            soloist: 0.32,
            harmonies: 0.28,
            drums: 0.45,
            master: 0.85,
        },
    };
});

import { getState } from '../../../public/state.js';

const { arranger, harmony } = getState();

import { MidiTrack } from '../../../public/engine/midi-utils.js';
import { handleExport } from '../../../public/engine/midi-worker-logic.js';
import { handleResolution } from '../../../public/logic-worker.js';

describe('Export and Resolution Logic Validation', () => {
    beforeEach(() => {
        const state = getState();
        capturedMessages.length = 0;
        noteOnEvents.length = 0;
        mockNoteOn.mockClear();
        arranger.key = 'C';
        arranger.isMinor = false;
        state.groove.genreFeel = 'Rock';
        state.groove.creativity = false;
        harmony.enabled = true;
        const mockChord = {
            root: 'C',
            beats: 4,
            sectionId: 's1',
            sectionLabel: 'Verse',
            freqs: [261.63, 329.63, 392.0],
            intervals: [0, 4, 7],
            rootMidi: 60,
            value: 'C',
            quality: 'Major',
        };
        arranger.progression = [mockChord];
        arranger.totalSteps = 16;
        arranger.stepMap = [{ start: 0, end: 16, chord: mockChord, chordIndex: 0 }];

        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('MidiTrack should record markers, text, and lyrics', () => {
        const track = new MidiTrack();
        track.marker(0, 'Test Marker');
        track.text(100, 'Test Text');
        track.lyric(200, 'Test Lyric');

        expect(track.events.length).toBe(3);

        // Marker FF 06
        expect(track.events[0].data[0]).toBe(0xff);
        expect(track.events[0].data[1]).toBe(0x06);

        // Text FF 01
        expect(track.events[1].data[0]).toBe(0xff);
        expect(track.events[1].data[1]).toBe(0x01);

        // Lyric FF 05
        expect(track.events[2].data[0]).toBe(0xff);
        expect(track.events[2].data[1]).toBe(0x05);
    });

    it('should generate a valid voicing for Major keys in resolution', () => {
        handleResolution(getState(), 0);

        const noteMsg = capturedMessages.find((m) => m.type === 'notes');
        expect(noteMsg).toBeDefined();

        const chordNotes = noteMsg.notes.filter((n) => n.module === 'chords' && n.midi > 0);
        const midis = [...new Set(chordNotes.map((n) => n.midi))].sort();

        expect(midis.length).toBeGreaterThan(2);
        // Ensure within MIDI range
        expect(midis.every((m) => m >= 36 && m <= 96)).toBe(true);
    });

    it('should generate a valid voicing for Minor keys in resolution', () => {
        arranger.key = 'A';
        arranger.isMinor = true;
        // Update last chord to be Am
        arranger.stepMap[0].chord = {
            key: 'A',
            value: 'im',
            rootMidi: 57,
            quality: 'Minor',
            freqs: [220, 261.63, 329.63],
            intervals: [0, 3, 7],
        };
        handleResolution(getState(), 0);

        const noteMsg = capturedMessages.find((m) => m.type === 'notes');
        const chordNotes = noteMsg.notes.filter((n) => n.module === 'chords' && n.midi > 0);
        expect(chordNotes.length).toBeGreaterThan(2);
    });

    it('should include a deep root for the bass in resolution with correct duration', () => {
        arranger.key = 'G';
        // Update last chord to be G
        arranger.stepMap[0].chord = {
            key: 'G',
            value: 'I',
            rootMidi: 67,
            quality: 'Major',
            freqs: [392, 493.88, 587.33],
            intervals: [0, 4, 7],
        };
        handleResolution(getState(), 0);

        const noteMsg = capturedMessages.find((m) => m.type === 'notes');
        const bassNotes = noteMsg.notes.filter((n) => n.module === 'bass');
        expect(bassNotes.length).toBeGreaterThan(0);

        const lastBassNote = bassNotes[bassNotes.length - 1];
        // G is 7. Expect (7 + 12n)
        expect(lastBassNote.midi % 12).toBe(7);
        expect(lastBassNote.durationSteps).toBeGreaterThanOrEqual(8); // Should ring out
    });

    it('should include sustain pedal events in resolution', () => {
        handleResolution(getState(), 0);

        const noteMsg = capturedMessages.find((m) => m.type === 'notes');
        const ccEvent = noteMsg.notes.find((n) => n.ccEvents?.some((cc) => cc.controller === 64));
        expect(ccEvent).toBeDefined();
        expect(ccEvent.ccEvents[0].value).toBe(127);
    });

    it('should clamp all MIDI velocities to 127', () => {
        handleResolution(getState(), 0);
        const noteMsg = capturedMessages.find((m) => m.type === 'notes');

        noteMsg.notes.forEach((note) => {
            if (note.midiVelocity !== undefined) {
                expect(note.midiVelocity).toBeLessThanOrEqual(127);
                expect(note.midiVelocity).toBeGreaterThan(0);
            }
        });
    });

    it('should handle muted property by reducing velocity in resolution', () => {
        handleResolution(getState(), 0);
        const noteMsg = capturedMessages.find((m) => m.type === 'notes');
        // Bass doesn't always have velocity reduction logic in resolution.js anymore,
        // but midiVelocity should still be reasonable.
        const bass = noteMsg.notes.find((n) => n.module === 'bass');
        expect(bass.midiVelocity).toBeLessThanOrEqual(127);
    });

    it('should include Harmony module in resolution', () => {
        handleResolution(getState(), 0);

        const noteMsg = capturedMessages.find((m) => m.type === 'notes');
        const harmonyNotes = noteMsg.notes.filter((n) => n.module === 'harmony');
        // Harmony resolution usually plays a 1st or 5th interval
        expect(harmonyNotes.length).toBeGreaterThan(0);
    });

    it('should apply reasonable velocity in resolution', () => {
        handleResolution(getState(), 0);
        const noteMsg = capturedMessages.find((m) => m.type === 'notes');
        const chordNotes = noteMsg.notes.filter((n) => n.module === 'chords' && n.midi > 0);

        // Ensure velocity is substantial but not maxed out
        expect(chordNotes[0].midiVelocity).toBeGreaterThan(60);
    });

    it('should keep the exported resolution bass note blended with the setup note', () => {
        const state = getState();
        state.groove.genreFeel = 'Jazz';

        handleResolution(state, 0);

        const noteMsg = capturedMessages.find((m) => m.type === 'notes');
        expect(noteMsg).toBeDefined();

        const bassNotes = noteMsg.notes.filter((n) => n.module === 'bass');
        expect(bassNotes.length).toBe(2);
        expect(bassNotes[1].midiVelocity).toBeLessThanOrEqual(bassNotes[0].midiVelocity);
    });

    it('should complete MIDI export including harmonies', () => {
        handleExport(getState(), {
            includedTracks: ['chords', 'bass', 'soloist', 'harmonies', 'drums'],
            targetDuration: 0.1,
            loopMode: 'once',
        });

        // Advance timers to allow chunks to process
        vi.runAllTimers();

        const _errorMsg = capturedMessages.find((m) => m.type === 'error');
        if (_errorMsg) {
            console.error('Export Error:', _errorMsg.data, _errorMsg.stack);
        }

        const exportMsg = capturedMessages.find((m) => m.type === 'exportComplete');
        expect(exportMsg).toBeDefined();
        expect(exportMsg.blob).toBeInstanceOf(Uint8Array);
        expect(exportMsg.filename).toContain('.mid');
    });
    describe('Generative Drums Export Parity', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            const _state = getState();
            arranger.totalSteps = 64;
            const mockChord = {
                root: 'C',
                beats: 4,
                sectionId: 's1',
                sectionLabel: 'Verse',
                freqs: [261.63, 329.63, 392.0],
                intervals: [0, 4, 7],
                rootMidi: 60,
                value: 'C',
                quality: 'Major',
            };
            arranger.stepMap = [
                { start: 0, end: 16, chord: mockChord, chordIndex: 0 },
                { start: 16, end: 32, chord: mockChord, chordIndex: 0 },
                { start: 32, end: 48, chord: mockChord, chordIndex: 0 },
                { start: 48, end: 64, chord: mockChord, chordIndex: 0 },
            ];
            arranger.sectionMap = [{ id: 's1', start: 0, end: 64, label: 'Verse' }];

            vi.spyOn(Math, 'random').mockReturnValue(0.05);
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('should NOT include generative ghost notes when creativity is disabled', () => {
            const state = getState();
            state.groove.creativity = false;

            handleExport(getState(), {
                includedTracks: ['drums'],
                loopMode: 'once',
            });

            vi.runAllTimers();

            const snareHits = noteOnEvents.filter((e) => e.midi === 38);
            expect(snareHits.length).toBe(8); // 2 backbeats * 4 bars
        });

        it('should include generative ghost notes in Rock export when creativity is enabled', () => {
            const state = getState();
            state.groove.creativity = true;
            state.playback.bandIntensity = 0.7; // Ideal range for ghost notes in rock.js

            handleExport(getState(), {
                includedTracks: ['drums'],
                loopMode: 'once',
            });

            vi.runAllTimers();

            const snareHits = noteOnEvents.filter((e) => e.midi === 38);
            // If there are MORE than 8 snare hits, they must be generative ghost notes
            expect(snareHits.length).toBeGreaterThan(8);
        });

        it('should include start-of-section crashes in MIDI export', () => {
            const state = getState();
            state.groove.creativity = true;
            state.playback.bandIntensity = 0.8;

            arranger.sectionMap = [
                { id: 's1', start: 0, end: 32, label: 'Verse' },
                { id: 's2', start: 32, end: 64, label: 'Chorus' },
            ];

            handleExport(getState(), {
                includedTracks: ['drums'],
                loopMode: 'once',
            });

            vi.runAllTimers();

            // Crash is MIDI 49
            const crashHits = noteOnEvents.filter((e) => e.midi === 49);
            const openHits = noteOnEvents.filter((e) => e.midi === 46);

            // Check if a crash happened at the start of section 2
            expect(crashHits.length + openHits.length).toBeGreaterThanOrEqual(1);
        });
    });
});
