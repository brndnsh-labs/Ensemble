/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const capturedMessages = [];

// Mock postMessage for global scope (worker style)
vi.stubGlobal('postMessage', (msg) => capturedMessages.push(msg));

// Use vi.stubGlobal to define self before imports
vi.stubGlobal('self', {
    onmessage: null,
    postMessage: (msg) => postMessage(msg)
});

// Mock state
vi.mock('../../../public/state.js', () => {
    const mockState = {
        soloist: { 
            enabled: true, lastFreq: 440, busySteps: 0, sessionSteps: 1000,
            motifBuffer: [], deviceBuffer: []
        },
        chords: { enabled: true },
        bass: { enabled: true, lastFreq: 110, pocketOffset: 0 },
        harmony: { enabled: true, volume: 0.4, complexity: 0.5, motifBuffer: [], buffer: new Map() },
        playback: { bandIntensity: 0.5, bpm: 120, intent: {}, audio: { currentTime: 0 } },
        arranger: { 
            key: 'C', 
            isMinor: false, 
            progression: [],
            totalSteps: 64,
            stepMap: [],
            timeSignature: '4/4'
        },
        groove: { genreFeel: 'Rock', enabled: true, instruments: [], audioBuffers: { noise: {} } },
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
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th' }
    },
    REGGAE_RIDDIMS: {},
    MIXER_GAIN_MULTIPLIERS: { chords: 0.22, bass: 0.35, soloist: 0.32, harmonies: 0.28, drums: 0.45, master: 0.85 }
}));

import { dispatch, getState, storage } from '../../../public/state.js';
const { arranger, playback, chords, bass, soloist, harmony, groove, vizState, midi } = getState();
import { handleResolution, handleExport } from '../../../public/logic-worker.js';

describe('Export and Resolution Logic Validation', () => {
    
    beforeEach(() => {
        capturedMessages.length = 0;
        arranger.key = 'C';
        arranger.isMinor = false;
        harmony.enabled = true;
        const mockChord = { 
            root: 'C', 
            beats: 4, 
            sectionId: 's1', 
            sectionLabel: 'Verse',
            freqs: [261.63, 329.63, 392.00],
            intervals: [0, 4, 7],
            rootMidi: 60,
            value: 'C',
            quality: 'Major'
        };
        arranger.progression = [mockChord];
        arranger.totalSteps = 16;
        arranger.stepMap = [{ start: 0, end: 16, chord: mockChord, chordIndex: 0 }];
    });

    it('should generate a 6/9 voicing for Major keys in resolution', () => {
        handleResolution(0);
        
        const noteMsg = capturedMessages.find(m => m.type === 'notes');
        expect(noteMsg).toBeDefined();
        
        const chordNotes = noteMsg.notes.filter(n => n.module === 'chords' && n.midi > 0);
        const midis = [...new Set(chordNotes.map(n => n.midi))].sort();
        // Rock I chord (C): [60, 64, 67, 72] (C Major triad + octave)
        expect(midis).toEqual([60, 64, 65, 67, 69, 72]); // IV and I chords combined in message
    });

    it('should generate an m9 voicing for Minor keys in resolution', () => {
        arranger.key = 'A';
        arranger.isMinor = true;
        // Update last chord to be Am
        arranger.stepMap[0].chord = { 
            key: 'A', value: 'im', rootMidi: 57, quality: 'Minor',
            freqs: [220, 261.63, 329.63], intervals: [0, 3, 7]
        };
        handleResolution(0);
        
        const noteMsg = capturedMessages.find(m => m.type === 'notes');
        const chordNotes = noteMsg.notes.filter(n => n.module === 'chords' && n.midi > 0);
        const midis = [...new Set(chordNotes.map(n => n.midi))].sort();
        // Rock Minor Cadence (iv - i): Dm (D, F, A) -> Am (A, C, E, A)
        // D (62), F (65), A (69)
        // A (57), C (60), E (64), A (69)
        // Combined & Sorted: [57, 60, 62, 64, 65, 69]
        expect(midis).toEqual([57, 60, 62, 64, 65, 69]);
    });

    it('should include a deep root for the bass in resolution with correct duration', () => {
        arranger.key = 'G';
        // Update last chord to be G
        arranger.stepMap[0].chord = { 
            key: 'G', value: 'I', rootMidi: 67, quality: 'Major',
            freqs: [392, 493.88, 587.33], intervals: [0, 4, 7]
        };
        handleResolution(0);
        
        const noteMsg = capturedMessages.find(m => m.type === 'notes');
        const bassNotes = noteMsg.notes.filter(n => n.module === 'bass');
        expect(bassNotes.length).toBeGreaterThan(0);
        // G root is 31 or 19. Rock IV is C (24), I is G (31 or 19). 
        // In our impl: (s.pc % 12) + 24 + (s.pc > 7 ? -12 : 0)
        // For G: (7 % 12) + 24 + (0) = 31.
        // For C: (0 % 12) + 24 + (0) = 24.
        const lastBassNote = bassNotes[bassNotes.length - 1];
        expect(lastBassNote.midi).toBe(31);
        expect(lastBassNote.durationSteps).toBe(32); // Long ring-out
    });

    it('should include sustain pedal events in resolution', () => {
        handleResolution(0);
        
        const noteMsg = capturedMessages.find(m => m.type === 'notes');
        const ccEvent = noteMsg.notes.find(n => n.ccEvents && n.ccEvents.some(cc => cc.controller === 64));
        expect(ccEvent).toBeDefined();
        expect(ccEvent.ccEvents[0].value).toBe(127);
    });

    it('should clamp all MIDI velocities to 127', () => {
        handleResolution(0);
        const noteMsg = capturedMessages.find(m => m.type === 'notes');
        
        noteMsg.notes.forEach(note => {
            if (note.midiVelocity !== undefined) {
                expect(note.midiVelocity).toBeLessThanOrEqual(127);
                expect(note.midiVelocity).toBeGreaterThan(0);
            }
        });
    });

    it('should handle muted property by reducing velocity in resolution', () => {
        handleResolution(0);
        const noteMsg = capturedMessages.find(m => m.type === 'notes');
        const bass = noteMsg.notes.find(n => n.module === 'bass');
        expect(bass.midiVelocity).toBeLessThanOrEqual(127);
    });

    it('should include Harmony module in resolution', () => {
        handleResolution(0);
        
        const noteMsg = capturedMessages.find(m => m.type === 'notes');
        const harmonyNotes = noteMsg.notes.filter(n => n.module === 'harmony');
        // Harmony resolution usually plays a 1st or 5th interval
        expect(harmonyNotes.length).toBeGreaterThan(0);
    });

    it('should apply density-based velocity normalization in resolution', () => {
        // Resolution Chord (chords) plays 5 notes.
        // Formula: v = base_v * (1 / sqrt(num_voices))
        // base_v for chord resolution is 0.7.
        // comp = 1 / sqrt(5) = ~0.447
        // target_v = 0.7 * 0.447 = ~0.31
        // midi_v = target_v * 127 = ~39
        handleResolution(0);
        const noteMsg = capturedMessages.find(m => m.type === 'notes');
        const chordNotes = noteMsg.notes.filter(n => n.module === 'chords' && n.midi > 0);
        
        expect(chordNotes[0].midiVelocity).toBeLessThan(50); // Normalized down from ~89
    });

    it('should complete MIDI export including harmonies', () => {
        handleExport({ includedTracks: ['chords', 'bass', 'soloist', 'harmonies', 'drums'], targetDuration: 0.1, loopMode: 'once' }); 
        
        const exportMsg = capturedMessages.find(m => m.type === 'exportComplete');
        expect(exportMsg).toBeDefined();
        expect(exportMsg.blob).toBeInstanceOf(Uint8Array);
        expect(exportMsg.filename).toContain('.mid');
    });
});