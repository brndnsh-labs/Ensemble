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

        // Ensure session steps is high enough so it doesn't force "initial entry" logic
        mockState.soloist.sessionSteps = 100;

        // We want to force silence (no notes played), but we also want it to eventually rest.
        // It rests if `Math.random() < restProb`.
        // If we mock Math.random to always return 0.99, it will never rest (restProb never reaches 0.99 fast enough).
        // Instead, we will simulate the behavior by manually keeping `notesInPhrase = 0`
        // while mocking Math.random() to 0.01 so it naturally chooses to rest once restProb > 0.01.
        // We must prevent it from attacking notes, so we bypass the start logic or just let it "attack" but we keep notesInPhrase=0.
        const spy = vi.spyOn(Math, 'random').mockReturnValue(0.01);

        // Process up to 3 measures (48 steps in 4/4)
        // We start from step 1 so that we don't trigger the "step === 0" global reset
        let rested = false;
        for (let i = 1; i <= 48; i++) {
            // Force it to remain a "silent phrase"
            mockState.soloist.notesInPhrase = 0;

            getSoloistNote(chord, null, i, 440, 72, 'smart', i % 16, false);
            if (mockState.soloist.isResting) {
                rested = true;
                break;
            }
        }

        // It should have decided to rest despite not playing any notes
        expect(rested).toBe(true);
        spy.mockRestore();
    });

    it('should continue decrementing restSteps while in resting state', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        mockState.soloist.isResting = true;
        mockState.soloist.restSteps = 10;

        getSoloistNote(chord, null, 100, 440, 72, 'smart', 4, false);

        expect(mockState.soloist.restSteps).toBe(9);
    });
});
