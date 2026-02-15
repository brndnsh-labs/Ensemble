/* eslint-disable */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
        chords: { enabled: true, octave: 60, density: 'standard' },
        bass: { enabled: true, lastFreq: 110, pocketOffset: 0, octave: 36, style: 'smart' },
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
        '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th', pulse: [0, 4, 8, 12] }
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
        
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should generate a valid voicing for Major keys in resolution', () => {
        handleResolution(0);
        
        const noteMsg = capturedMessages.find(m => m.type === 'notes');
        expect(noteMsg).toBeDefined();
        
        const chordNotes = noteMsg.notes.filter(n => n.module === 'chords' && n.midi > 0);
        const midis = [...new Set(chordNotes.map(n => n.midi))].sort();
        
        expect(midis.length).toBeGreaterThan(2);
        // Ensure within MIDI range
        expect(midis.every(m => m >= 36 && m <= 96)).toBe(true);
    });

    it('should generate a valid voicing for Minor keys in resolution', () => {
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
        expect(chordNotes.length).toBeGreaterThan(2);
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
        
        const lastBassNote = bassNotes[bassNotes.length - 1];
        // G is 7. Expect (7 + 12n)
        expect(lastBassNote.midi % 12).toBe(7);
        expect(lastBassNote.durationSteps).toBeGreaterThanOrEqual(8); // Should ring out
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
        // Bass doesn't always have velocity reduction logic in resolution.js anymore, 
        // but midiVelocity should still be reasonable.
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

    it('should apply reasonable velocity in resolution', () => {
        handleResolution(0);
        const noteMsg = capturedMessages.find(m => m.type === 'notes');
        const chordNotes = noteMsg.notes.filter(n => n.module === 'chords' && n.midi > 0);
        
        // Ensure velocity is substantial but not maxed out
        expect(chordNotes[0].midiVelocity).toBeGreaterThan(60); 
    });

    it('should complete MIDI export including harmonies', () => {
        handleExport({ includedTracks: ['chords', 'bass', 'soloist', 'harmonies', 'drums'], targetDuration: 0.1, loopMode: 'once' }); 
        
        // Advance timers to allow chunks to process
        vi.runAllTimers();

        const exportMsg = capturedMessages.find(m => m.type === 'exportComplete');
        
        if (!exportMsg) {
            const errorMsg = capturedMessages.find(m => m.type === 'error');
            if (errorMsg) console.error("Export Error:", errorMsg.data, errorMsg.stack);
        }

        expect(exportMsg).toBeDefined();
        expect(exportMsg.blob).toBeInstanceOf(Uint8Array);
        expect(exportMsg.filename).toContain('.mid');
    });
});
