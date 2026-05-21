// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../../public/engine/soloist.js';
import { generateRhythmPlan } from '../../../public/engine/soloist-rhythm-engine.js';
import * as stateModule from '../../../public/state.js';
import { getState } from '../../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

vi.mock('../../../public/state.js');
vi.mock('../../../public/config.js', () => ({
    TIME_SIGNATURES: { '4/4': { beats: 4, stepsPerBeat: 4 } },
}));

vi.mock('../../../public/soloist-config.js', () => ({
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

vi.mock('../../../public/engine/theory-scales.js', () => ({
    getScaleForChord: vi.fn(() => [0, 2, 4, 5, 7, 9, 11]),
}));

vi.mock('../../../public/utils.js', () => ({
    calculateTimingOffset: vi.fn(() => 0),
    getFrequency: vi.fn(() => 440),
    applyBluesBends: vi.fn(),
}));

describe('Soloist Phrasing Refinements v2.7.1', () => {
    const createMockState = () => ({
        soloist: makeSoloistMock({
            enabled: true,
            busySteps: 0,
            phrasingState: 'call',
            activeSteps: 100,
            restSteps: 0,
            lastAttackStep: -100,
            deviceBuffer: [],
            motifBuffer: [],
            notesInPhrase: 0,
            notesThisMeasure: 0,
            sessionSteps: 100,
            lastMidiPlayed: 72,
            phraseStartStep: 0,
        }),
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

        const _chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        localState.playback.bandIntensity = 0.5;
        localState.soloist.session.sessionSteps = 0;
        localState.soloist.session.currentPhrase.notesInPhrase = 5; // Bypass urgency boost

        // Epic 12 S1: inject a constant 0.99 RNG via `generateRhythmPlan`'s
        // `random` parameter. During warm-up (sessionSteps=0) the attack prob
        // is scaled down below 0.99 everywhere → empty plan; at full warm-up
        // (sessionSteps=64) the downbeat/measure-end boosts push some steps'
        // attackProb above 0.99 → a non-empty plan.
        const fixedRandom = () => 0.99;
        localState.soloist.session.rhythm.plan = undefined;
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
            0,
            fixedRandom,
        );
        expect(planA.length).toBe(0);

        // Now move sessionSteps to 64 (end of warmup)
        localState.soloist.session.sessionSteps = 64;
        localState.soloist.session.rhythm.plan = undefined;
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
            0,
            fixedRandom,
        );
        expect(planB.length).toBeGreaterThan(0);
    });

    it('should transition to rest after IMPROV at end of measure', () => {
        const localState = createMockState();
        vi.spyOn(stateModule, 'getState').mockReturnValue(localState);
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99); // No attack by default
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };

        localState.soloist.session.phrasing.state = 'IMPROV';
        // The legacy flat-state engine inferred isResting from phrasingState
        // when undefined. With the C2 restructure both fields are concrete
        // defaults; set isResting explicitly to keep this behavioral test
        // exercising the active->rest transition rather than the rest branch.
        localState.soloist.session.phrasing.isResting = false;

        // Step 1: Not an end of measure
        localState.soloist.session.phrasing.activeSteps = 1; // Will decrement to 0, but not rest
        getSoloistNote(getState(), chord, null, 1, 440, 60, 'funk', 1);
        expect(localState.soloist.session.phrasing.state).toBe('IMPROV');

        // Step 15: End of measure transition point
        localState.soloist.session.phrasing.activeSteps = 1; // Force expiration exactly on resolution
        localState.soloist.session.phrasing.isResting = false;
        randomSpy.mockReturnValue(0.01); // Force attack
        getSoloistNote(getState(), chord, null, 15, 440, 60, 'funk', 15);
        expect(localState.soloist.session.phrasing.state).toBe('rest');

        randomSpy.mockRestore();
    });

    it('should apply fatigue multiplier to rest duration after a busy phrase', () => {
        const localState = createMockState();
        vi.spyOn(stateModule, 'getState').mockReturnValue(localState);
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5); // Fixed random
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };

        localState.soloist.session.phrasing.state = 'IMPROV';
        localState.soloist.session.phrasing.activeSteps = 0;
        localState.soloist.session.currentPhrase.notesInPhrase = 100; // Extreme fatigue
        localState.playback.bandIntensity = 0.5;

        // Force resolution
        randomSpy.mockReturnValue(0.01);
        getSoloistNote(getState(), chord, null, 15, 440, 60, 'funk', 15);

        const highFatigueRest = localState.soloist.session.phrasing.restSteps;

        // Compare with low-heat phrase
        localState.soloist.session.phrasing.state = 'IMPROV';
        localState.soloist.session.phrasing.activeSteps = 0;
        localState.soloist.session.currentPhrase.notesInPhrase = 0;
        localState.playback.bandIntensity = 0.5;

        // Ensure Math.random() gives same deterministic output
        randomSpy.mockReturnValue(0.01); // Force attack probability to pass
        getSoloistNote(getState(), chord, null, 31, 440, 60, 'funk', 15);

        const lowFatigueRest = localState.soloist.session.phrasing.restSteps;
        expect(highFatigueRest).toBeGreaterThanOrEqual(lowFatigueRest);

        randomSpy.mockRestore();
    });

    it('should continue decrementing restSteps while in resting state', () => {
        const localState = createMockState();
        vi.spyOn(stateModule, 'getState').mockReturnValue(localState);
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };

        localState.soloist.session.phrasing.state = 'rest';
        localState.soloist.session.phrasing.isResting = true;
        localState.soloist.session.phrasing.restSteps = 10;

        getSoloistNote(getState(), chord, null, 100, 440, 72, 'funk', 4);

        expect(localState.soloist.session.phrasing.restSteps).toBe(9);
    });

    it('should maintain liveness even with extreme intensity modifiers', () => {
        const localState = createMockState();
        vi.spyOn(stateModule, 'getState').mockReturnValue(localState);
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };

        localState.playback.bandIntensity = 0.05;
        // Verify it doesn't crash and still processes steps
        getSoloistNote(getState(), chord, null, 16, 440, 60, 'funk', 0);
        expect(localState.soloist.notesThisMeasure).toBeDefined();
    });
});
