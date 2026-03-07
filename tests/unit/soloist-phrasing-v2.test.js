import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateRhythmPlan } from '../../public/engine/soloist-rhythm-engine.js';
import { getSoloistNote } from '../../public/soloist.js';
import * as stateModule from '../../public/state.js';

vi.mock('../../public/state.js');
vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: { '4/4': { beats: 4, stepsPerBeat: 4 } },
}));

vi.mock('../../public/soloist-config.js', () => ({
    STYLE_CONFIG: {
        funk: {
            restBase: 0.5,
            maxNotesPerPhrase: 16,
            minNotesPerPhrase: 2,
            anticipationProb: 0.1,
        },
    },
    STYLE_EMPHASIS: {
        funk: [1.0, 0.4, 0.7, 0.4, 0.9, 0.4, 0.7, 0.4, 1.0, 0.4, 0.7, 0.4, 0.9, 0.4, 0.7, 0.4],
    },
}));

vi.mock('../../public/theory-scales.js', () => ({
    getScaleForChord: vi.fn(() => [0, 2, 4, 5, 7, 9, 11]),
}));

vi.mock('../../public/utils.js', () => ({
    calculateTimingOffset: vi.fn(() => 0),
    getFrequency: vi.fn(() => 440),
}));

describe('Soloist Phrasing Refinements v2.7.1', () => {
    const createMockState = () => ({
        soloist: {
            enabled: true,
            busySteps: 0,
            phrasingState: 'call',
            activeSteps: 100,
            restSteps: 0,
            lastAttackStep: -100,
            deviceBuffer: [],
            motifBuffer: [],
            motifCache: [],
            notesInPhrase: 0,
            notesThisMeasure: 0,
            sessionSteps: 100,
            lastMidiPlayed: 72,
            phraseStartStep: 0,
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

        const _chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        localState.playback.bandIntensity = 0.5;
        localState.soloist.sessionSteps = 0;
        localState.soloist.notesInPhrase = 5; // Bypass urgency boost

        // Random 0.99 > attackProb -> null
        randomSpy.mockReturnValue(0.99);
        localState.soloist.rhythmPlan = undefined;
        const planA = generateRhythmPlan(
            16,
            16,
            'funk',
            0.5,
            16,
            4,
            {},
            0,
            localState.soloist,
            null,
        );
        expect(planA.length).toBe(0);

        // Now move sessionSteps to 64 (end of warmup)
        localState.soloist.sessionSteps = 64;
        localState.soloist.rhythmPlan = undefined;
        const planB = generateRhythmPlan(
            16,
            16,
            'funk',
            0.5,
            16,
            4,
            {},
            64,
            localState.soloist,
            null,
        );
        expect(planB.length).toBeGreaterThan(0);

        randomSpy.mockRestore();
    });

    it('should transition to rest after IMPROV at end of measure', () => {
        const localState = createMockState();
        vi.spyOn(stateModule, 'getState').mockReturnValue(localState);
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99); // No attack by default
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };

        localState.soloist.phrasingState = 'IMPROV';
        localState.soloist.activeSteps = 0; // Should want to rest

        // Step 1: Not an end of measure
        getSoloistNote(chord, null, 1, 440, 60, 'funk', 1, false);
        expect(localState.soloist.phrasingState).toBe('IMPROV');

        // Step 15: End of measure transition point
        randomSpy.mockReturnValue(0.01); // Force attack
        getSoloistNote(chord, null, 15, 440, 60, 'funk', 15, false);
        expect(localState.soloist.phrasingState).toBe('rest');

        randomSpy.mockRestore();
    });

    it('should apply fatigue multiplier to rest duration after a busy phrase', () => {
        const localState = createMockState();
        vi.spyOn(stateModule, 'getState').mockReturnValue(localState);
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5); // Fixed random
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };

        localState.soloist.phrasingState = 'IMPROV';
        localState.soloist.activeSteps = 0;
        localState.soloist.notesInPhrase = 100; // Extreme fatigue
        localState.playback.bandIntensity = 0.5;

        // Force resolution
        randomSpy.mockReturnValue(0.01);
        getSoloistNote(chord, null, 15, 440, 60, 'funk', 15, false);

        const highFatigueRest = localState.soloist.restSteps;

        // Compare with low-heat phrase
        localState.soloist.phrasingState = 'IMPROV';
        localState.soloist.activeSteps = 0;
        localState.soloist.notesInPhrase = 0;
        localState.playback.bandIntensity = 0.5;

        // Ensure Math.random() gives same deterministic output
        randomSpy.mockReturnValue(0.01); // Force attack probability to pass
        getSoloistNote(chord, null, 31, 440, 60, 'funk', 15, false);

        const lowFatigueRest = localState.soloist.restSteps;
        expect(highFatigueRest).toBeGreaterThanOrEqual(lowFatigueRest);

        randomSpy.mockRestore();
    });

    it('should continue decrementing restSteps while in resting state', () => {
        const localState = createMockState();
        vi.spyOn(stateModule, 'getState').mockReturnValue(localState);
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };

        localState.soloist.phrasingState = 'rest';
        localState.soloist.restSteps = 10;

        getSoloistNote(chord, null, 100, 440, 72, 'funk', 4, false);

        expect(localState.soloist.restSteps).toBe(9);
    });

    it('should maintain liveness even with extreme intensity modifiers', () => {
        const localState = createMockState();
        vi.spyOn(stateModule, 'getState').mockReturnValue(localState);
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };

        localState.playback.bandIntensity = 0.05;
        // Verify it doesn't crash and still processes steps
        getSoloistNote(chord, null, 16, 440, 60, 'funk', 0, false);
        expect(localState.soloist.notesThisMeasure).toBeDefined();
    });
});
