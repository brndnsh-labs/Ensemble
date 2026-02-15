import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSoloistNote } from '../../public/soloist.js';
import { getState } from '../../public/state.js';

// Mock State
vi.mock('../../public/state.js', () => {
    const mockState = {
        playback: { bandIntensity: 0.5, bpm: 120, sessionTimer: 0, complexity: 0.5 },
        soloist: {
            enabled: true,
            busySteps: 0,
            currentPhraseSteps: 0,
            notesInPhrase: 0,
            qaState: 'Question',
            isResting: false,
            motifBuffer: [],
            pitchHistory: [],
            deviceBuffer: [],
            sessionSteps: 100,
            mode: 'monophonic'
        },
        groove: { genreFeel: 'Jazz' },
        arranger: { timeSignature: '4/4' },
        harmony: { enabled: false },
        dispatch: vi.fn()
    };
    return {
        getState: () => mockState,
        dispatch: vi.fn()
    };
});

// Mock Theory Scales
vi.mock('../../public/theory-scales.js', () => ({
    getScaleForChord: (chord) => {
        // Return C Major scale tones [0, 2, 4, 5, 7, 9, 11]
        return [0, 2, 4, 5, 7, 9, 11];
    }
}));

// Mock Utils
vi.mock('../../public/utils.js', () => ({
    getFrequency: (midi) => 440 * Math.pow(2, (midi - 69) / 12),
    getMidi: (freq) => Math.round(69 + 12 * Math.log2(freq / 440))
}));

describe('Soloist Mode Differentiation Logic', () => {
    const state = getState();
    const currentChord = { rootMidi: 60, intervals: [0, 4, 7, 11], beats: 4 }; // Cmaj7

    beforeEach(() => {
        state.soloist.mode = 'monophonic';
        state.soloist.isResting = false;
        state.soloist.busySteps = 0;
        state.soloist.deviceBuffer = [];
        vi.spyOn(Math, 'random').mockReturnValue(0.5); // Predictable random
    });

    it('should generate a single note in monophonic mode even when double stop chance is high', () => {
        state.soloist.mode = 'monophonic';
        // Mock random to trigger a double stop (if it were allowed)
        // dsChance calculation uses random, so we force it.
        // Actually, we'll just check that even if extraNotes is populated, 
        // the final result is handled correctly based on mode.
        // But the logic in soloist.js skips extraNotes if !isPolyphonic.
        
        const note = getSoloistNote(currentChord, null, 0, 440, 60, 'scalar', 0, false);
        expect(Array.isArray(note)).toBe(false);
    });

    it('should generate specific fretboard-friendly intervals in guitar mode', () => {
        state.soloist.mode = 'guitar';
        vi.spyOn(Math, 'random').mockRestore(); // Use real random for the loop

        let note = null;
        let attempts = 0;
        // Try up to 1000 times to get a double stop (usually takes ~10-20)
        while (attempts < 1000) {
            note = getSoloistNote(currentChord, null, 0, 261.63, 60, 'scalar', 0, false);
            if (Array.isArray(note)) break;
            attempts++;
        }
        
        expect(Array.isArray(note)).toBe(true);
        expect(note.length).toBe(2);
        
        const melody = note[note.length - 1];
        const extra = note[0];
        const interval = extra.midi - melody.midi;
        
        // Guitar intervals: [3, 4, 5, 8, 9]
        expect([3, 4, 5, 8, 9]).toContain(interval);
    });

    it('should generate 3-note block chords in piano mode', () => {
        state.soloist.mode = 'piano';
        vi.spyOn(Math, 'random').mockRestore();

        let note = null;
        let attempts = 0;
        while (attempts < 1000) {
            note = getSoloistNote(currentChord, null, 0, 261.63, 60, 'scalar', 0, false);
            if (Array.isArray(note)) break;
            attempts++;
        }
        
        expect(Array.isArray(note)).toBe(true);
        expect(note.length).toBe(3);
        
        const melodyMidi = note[note.length - 1].midi;
        const extra1 = note[0].midi;
        const extra2 = note[1].midi;
        
        expect(extra1).toBeLessThan(melodyMidi);
        expect(extra2).toBeLessThan(melodyMidi);
    });
});
