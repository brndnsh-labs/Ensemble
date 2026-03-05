import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../public/soloist.js';
import * as stateModule from '../../public/state.js';

vi.mock('../../public/state.js');
vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: { '4/4': { beats: 4, stepsPerBeat: 4 } },
}));

vi.mock('../../public/soloist-config.js', () => ({
    GENRE_STYLE_MAPPING: { Funk: 'funk', Jazz: 'bird', Smart: 'funk' },
    STYLE_CONFIG: {
        funk: { restBase: 1.0, maxNotesPerPhrase: 32 },
    },
    STYLE_EMPHASIS: {
        funk: [1.0, 0.4, 0.7, 0.4, 0.9, 0.4, 0.7, 0.4, 1.0, 0.4, 0.7, 0.4, 0.9, 0.4, 0.7, 0.4],
    },
}));

describe('Soloist Phrasing Refinements v2.7.1', () => {
    const createMockState = () => ({
        soloist: {
            enabled: true,
            busySteps: 0,
            isResting: false,
            activeSteps: 100,
            restSteps: 0,
            lastAttackStep: -100,
            deviceBuffer: [],
            motifBuffer: [],
            hookBuffer: [],
            pitchHistory: [],
            notesInPhrase: 0,
            sessionSteps: 0,
            style: 'funk',
        },
        groove: { genreFeel: 'Funk' },
        playback: {
            bandIntensity: 0.5,
            bpm: 120,
            intent: {},
        },
        arranger: { totalSteps: 64, timeSignature: '4/4' },
    });

    it('should scale attack probability during the warm-up period (0-64 steps)', () => {
        const localState = createMockState();
        vi.spyOn(stateModule, 'getState').mockReturnValue(localState);
        const randomSpy = vi.spyOn(Math, 'random');

        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        localState.playback.bandIntensity = 0.5; // Scale = 1.5
        localState.soloist.sessionSteps = 0; // WarmupScale = 0.5
        // Final attackProb = 1.0 (emphasis) * 1.5 (intensity) * 0.5 (warmup) = 0.75

        // Random 0.8 > 0.75 -> null
        randomSpy.mockReturnValue(0.8);
        expect(getSoloistNote(chord, null, 16, 440, 60, 'funk', 0, false)).toBeNull();

        // Now move sessionSteps to 64 (end of warmup)
        // WarmupScale = 1.0. Final attackProb = 1.5.
        // Random 0.8 < 1.5 -> Note
        localState.soloist.sessionSteps = 64;
        expect(getSoloistNote(chord, null, 16, 440, 60, 'funk', 0, false)).not.toBeNull();

        randomSpy.mockRestore();
    });

    it('should defer resting until a strong rhythmic resolution point', () => {
        const localState = createMockState();
        vi.spyOn(stateModule, 'getState').mockReturnValue(localState);
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };

        localState.soloist.isResting = false;
        localState.soloist.activeSteps = 0; // Should want to rest

        // Step 0: Not a resolution point
        getSoloistNote(chord, null, 0, 440, 60, 'funk', 0, false);
        expect(localState.soloist.isResting).toBe(false);

        // Step 15: Resolution point
        getSoloistNote(chord, null, 15, 440, 60, 'funk', 15, false);
        expect(localState.soloist.isResting).toBe(true);
    });

    it('should apply fatigue multiplier to rest duration after a busy phrase', () => {
        const localState = createMockState();
        vi.spyOn(stateModule, 'getState').mockReturnValue(localState);
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5); // Fixed random
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };

        localState.soloist.isResting = false;
        localState.soloist.activeSteps = 0;
        localState.soloist.notesInPhrase = 20; // Busy phrase! 1.0 + 20*0.05 = 2.0x fatigue

        // Force resolution
        getSoloistNote(chord, null, 15, 440, 60, 'funk', 15, false);

        // restSteps = measureSteps (16) * multiplier (1.25 for int 0.5) * fatigue (2.0) * random (~1.0)
        // Expected ~40 steps.
        const highFatigueRest = localState.soloist.restSteps;
        expect(highFatigueRest).toBeGreaterThan(30);

        // Compare with low-heat phrase
        localState.soloist.isResting = false;
        localState.soloist.activeSteps = 0;
        localState.soloist.notesInPhrase = 0;
        getSoloistNote(chord, null, 31, 440, 60, 'funk', 15, false);

        const lowFatigueRest = localState.soloist.restSteps;
        expect(highFatigueRest).toBeGreaterThan(lowFatigueRest);

        randomSpy.mockRestore();
    });

    it('should continue decrementing restSteps while in resting state', () => {
        const localState = createMockState();
        vi.spyOn(stateModule, 'getState').mockReturnValue(localState);
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };

        localState.soloist.isResting = true;
        localState.soloist.restSteps = 10;

        getSoloistNote(chord, null, 100, 440, 72, 'funk', 4, false);

        expect(localState.soloist.restSteps).toBe(9);
    });

    it('should maintain liveness even with extreme intensity modifiers', () => {
        const localState = createMockState();
        vi.spyOn(stateModule, 'getState').mockReturnValue(localState);
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };

        // Test heavy negative modifier robustness (from old liveness test)
        localState.playback.bandIntensity = 0.05;
        // The engine should clamp or handle low probability without crashing
        for (let i = 0; i < 32; i++) {
            const res = getSoloistNote(chord, null, i, 440, 72, 'funk', i % 16, false);
            expect(res).toBeDefined(); // Can be null, but shouldn't throw
        }
        expect(localState.soloist.sessionSteps).toBeGreaterThan(0);
    });
});
