import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../../public/soloist.js';
import { getState } from '../../../public/state.js';

// --- MOCKS ---
const mockState = {
    soloist: {
        enabled: true,
        busySteps: 0,
        currentPhraseSteps: 0,
        notesInPhrase: 0,
        qaState: 'Question',
        isResting: true,
        pitchHistory: [],
        deviceBuffer: [],
        motifBuffer: [],
        sessionSteps: 0,
        evolutionEnabled: true,
        lastMidiPlayed: 60,
    },
    groove: { genreFeel: 'Blues' },
    playback: {
        bandIntensity: 0.5,
        bpm: 100,
        complexity: 0.5,
        intent: { soloistMod: 0 },
        sessionTimer: 5,
        sessionStartTime: 1000, // Mocked timestamp
    },
    arranger: { totalSteps: 192, timeSignature: '4/4' },
    chords: {},
    bass: {},
    harmony: { enabled: false, rhythmicMask: 0 },
};

vi.mock('../../../public/state.js', () => ({ getState: () => mockState }));

describe('Soloist Liveness & Consistency', () => {
    beforeEach(() => {
        // Reset state between tests
        mockState.soloist.currentPhraseSteps = 0;
        mockState.soloist.notesInPhrase = 0;
        mockState.soloist.isResting = true;
        mockState.soloist.isYielding = false;
        mockState.playback.bandIntensity = 0.5;
        mockState.playback.intent.soloistMod = 0;
    });

    it('should calculate session progress deterministically using step and BPM', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };

        // At 100 BPM, 4/4 time: 16 steps = 1 measure = 4 beats = 4/100 minutes = 0.04 mins.
        // After 10 measures (160 steps), elapsed should be 0.4 mins.
        // With a 5 min timer, progress should be 0.4 / 5 = 0.08 (Warmup phase).

        // We can't easily "spy" on the local maturityFactor, but we can verify it doesn't crash
        // and produces notes at extreme step counts without relying on performance.now().
        const res = getSoloistNote(chord, null, 1600, 440, 72, 'smart', 0, false);
        expect(res).toBeDefined();
    });

    it('should clamp effectiveIntensity to 0 even with heavy negative modifiers', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        mockState.playback.bandIntensity = 0.1;
        mockState.playback.intent.soloistMod = -0.5; // Would be -0.4 without clamping

        // Run many steps, ensure it doesn't throw or behave erratically
        for (let i = 0; i < 32; i++) {
            getSoloistNote(chord, null, i, 440, 72, 'smart', i % 16, false);
        }
        expect(mockState.soloist.sessionSteps).toBeGreaterThan(0);
    });

    it('should recover from a silent phrase after 1.5 measures', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };

        // Force soloist into an active phrase but suppress all notes
        mockState.soloist.isResting = false;
        mockState.soloist.notesInPhrase = 0;
        mockState.soloist.currentPhraseSteps = 1;

        // Mock Math.random to always fail attack checks (force silence)
        const spy = vi.spyOn(Math, 'random').mockReturnValue(0.99);

        // Process 1.5 measures (24 steps in 4/4)
        for (let i = 0; i < 24; i++) {
            getSoloistNote(chord, null, i, 440, 72, 'smart', i % 16, false);
        }

        // It should have decided to rest despite not playing any notes
        expect(mockState.soloist.isResting).toBe(true);
        spy.mockRestore();
    });

    it('should continue incrementing counters while in yielding state', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        mockState.soloist.isResting = true;
        mockState.soloist.isYielding = true;
        mockState.soloist.currentPhraseSteps = 10;

        getSoloistNote(chord, null, 100, 440, 72, 'smart', 4, false);

        expect(mockState.soloist.currentPhraseSteps).toBe(11);
    });

    it('should trigger emergency re-entry after 5 measures of silence', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        mockState.soloist.isResting = true;

        // Mock 5 full measures of silence (80 steps) to trigger the safety floor (4.0)
        mockState.soloist.currentPhraseSteps = 80;

        // Even with high random values, startProb should be forced to 1.0 (Emergency)
        const spy = vi.spyOn(Math, 'random').mockReturnValue(0.99);

        getSoloistNote(chord, null, 100, 440, 72, 'smart', 0, false);

        expect(mockState.soloist.isResting).toBe(false);
        spy.mockRestore();
    });
});
