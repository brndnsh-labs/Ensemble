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
            phrasingState: 'call',
            activeSteps: 100,
            restSteps: 0,
            lastAttackStep: -100,
            deviceBuffer: [],
            motifBuffer: [],
            motifCache: [],
            hookBuffer: [],
            pitchHistory: [],
            recentNotes: [],
            lickDictionary: [],
            notesInPhrase: 0,
            sessionSteps: 0,
            style: 'funk',
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

        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        localState.playback.bandIntensity = 0.5; // Scale = 1.5
        localState.soloist.sessionSteps = 0; // WarmupScale = 0.5
        // Final attackProb = 1.0 (emphasis) * 1.5 (intensity) * 0.5 (warmup) = 0.75

        // Random 0.99 > 0.75 -> null (Need 0.99 to overcome the breathing offset which is ~0)
        randomSpy.mockReturnValue(0.99);
        expect(getSoloistNote(chord, null, 16, 440, 60, 'funk', 0, false)).toBeNull();

        // Now move sessionSteps to 64 (end of warmup)
        // WarmupScale = 1.0. Final attackProb = 1.5.
        // Random 0.99 < 1.5 -> Note
        localState.soloist.sessionSteps = 64;
        expect(getSoloistNote(chord, null, 16, 440, 60, 'funk', 0, false)).not.toBeNull();

        randomSpy.mockRestore();
    });

    it('should defer resolving until a strong rhythmic resolution point', () => {
        const localState = createMockState();
        vi.spyOn(stateModule, 'getState').mockReturnValue(localState);
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };

        localState.soloist.phrasingState = 'resolution';
        localState.soloist.activeSteps = 0; // Should want to rest

        // Step 1: Not an end of measure (avoiding step 0 hypermeasure reset)
        getSoloistNote(chord, null, 1, 440, 60, 'funk', 1, false);
        expect(localState.soloist.phrasingState).toBe('resolution');

        // Step 15: End of measure resolution point
        // Force a hit on the previous step so it acts as the resolution
        localState.soloist.lastAttackStep = 15;
        getSoloistNote(chord, null, 15, 440, 60, 'funk', 15, false);
        expect(localState.soloist.phrasingState).toBe('rest');
    });

    it('should apply fatigue multiplier to rest duration after a busy phrase', () => {
        const localState = createMockState();
        vi.spyOn(stateModule, 'getState').mockReturnValue(localState);
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5); // Fixed random
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };

        localState.soloist.phrasingState = 'resolution';
        localState.soloist.activeSteps = 0;
        localState.soloist.notesInPhrase = 20; // Busy phrase! 1.0 + 20*0.05 = 2.0x fatigue
        // Drop intensity even lower so the watchdog doesn't artificially clamp the longer rest
        // down to the same limit as the shorter rest
        localState.playback.bandIntensity = 0.05;

        // Force resolution
        localState.soloist.lastAttackStep = 15;
        getSoloistNote(chord, null, 15, 440, 60, 'funk', 15, false);

        const highFatigueRest = localState.soloist.restSteps;

        // Compare with low-heat phrase
        localState.soloist.phrasingState = 'resolution';
        localState.soloist.activeSteps = 0;
        localState.soloist.notesInPhrase = 0; // Low fatigue
        // Drop intensity slightly higher to allow differentiation in clamping if any
        localState.playback.bandIntensity = 0.2;

        // Ensure Math.random() gives same deterministic output
        randomSpy.mockReturnValue(0.5);
        localState.soloist.lastAttackStep = 31;
        getSoloistNote(chord, null, 31, 440, 60, 'funk', 15, false);

        const lowFatigueRest = localState.soloist.restSteps;
        expect(highFatigueRest).toBeGreaterThan(lowFatigueRest);

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
