import { describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../public/soloist.js';
import * as stateModule from '../../public/state.js';

vi.mock('../../public/state.js');

// 1. Mock Config AND Style Maps to ensure complete isolation from other tests
vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: { '4/4': { beats: 4, stepsPerBeat: 4 } },
}));

vi.mock('../../public/soloist-config.js', () => ({
    GENRE_STYLE_MAPPING: { Funk: 'funk', Jazz: 'bird' },
    STYLE_CONFIG: {
        funk: { anticipationProb: 0, doubleStopProb: 0, deviceProb: 0 },
        bird: { anticipationProb: 0, doubleStopProb: 0, deviceProb: 0 },
    },
    STYLE_EMPHASIS: {
        funk: [1.0, 0.4, 0.7, 0.4, 0.9, 0.4, 0.7, 0.4, 1.0, 0.4, 0.7, 0.4, 0.9, 0.4, 0.7, 0.4],
        bird: [0.7, 0.5, 0.8, 1.0, 0.7, 0.5, 0.8, 1.0, 0.7, 0.5, 0.8, 1.0, 0.7, 0.5, 0.8, 1.0],
    },
}));

describe('Soloist Rhythmic Reactive Alignment', () => {
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
        },
        groove: { genreFeel: 'Funk' },
        playback: {
            bandIntensity: 0.5,
            bpm: 120,
            intent: {},
        },
        arranger: { totalSteps: 64, timeSignature: '4/4' },
    });

    it('should be more likely to attack when a drum hit is detected in Funk style', () => {
        const localState = createMockState();
        vi.spyOn(stateModule, 'getState').mockReturnValue(localState);
        const randomSpy = vi.spyOn(Math, 'random');

        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };

        // 1. Setup: bypass rhythm to ensure it works
        const contextBypass = { stepCoordination: { kickHit: true }, bypassRhythm: true };
        expect(
            getSoloistNote(chord, null, 0, 440, 60, 'funk', 0, false, contextBypass),
        ).not.toBeNull();

        // 2. Probabilistic check
        // At intensity 0.05: intensityScale = 0.6. emphasis[0] = 1.0. attackProb = 0.6.
        // With kickHit (+0.2): attackProb = 0.8.
        localState.playback.bandIntensity = 0.05;
        localState.soloist.busySteps = 0;
        localState.soloist.activeSteps = 999999;
        localState.soloist.sessionSteps = 64; // Bypass warm-up scaling

        // Force random to 0.7 for all calls
        randomSpy.mockReturnValue(0.7);

        // WITH drum hit: 0.7 < 0.8 (TRUE)
        const contextWith = { stepCoordination: { kickHit: true } };
        expect(
            getSoloistNote(chord, null, 16, 440, 60, 'funk', 0, false, contextWith),
        ).not.toBeNull();

        // WITHOUT drum hit: 0.7 < 0.6 (FALSE)
        localState.soloist.busySteps = 0;
        const contextWithout = { stepCoordination: { kickHit: false } };
        expect(
            getSoloistNote(chord, null, 32, 440, 60, 'funk', 0, false, contextWithout),
        ).toBeNull();

        randomSpy.mockRestore();
    });

    it('should be less likely to attack on downbeat in Jazz style at low intensity', () => {
        const localState = createMockState();
        vi.spyOn(stateModule, 'getState').mockReturnValue(localState);
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        localState.playback.bandIntensity = 0.01; // scale = 0.52
        localState.groove.genreFeel = 'Jazz';

        let hitsNormal = 0;
        let hitsDownbeat = 0;
        const iterations = 1000;

        // Offbeat (step 3): Emphasis 1.0. Prob = 1.0 * 0.52 = 0.52. (0.5 < 0.52 -> PLAY)
        // Downbeat (step 0): Emphasis 0.7. Prob = 0.7 * 0.52 = 0.364. (0.5 < 0.364 -> REST)

        for (let i = 0; i < iterations; i++) {
            localState.soloist.busySteps = 0;
            localState.soloist.activeSteps = 999999;
            if (getSoloistNote(chord, null, i * 16 + 3, 440, 60, 'bird', 3, false)) {
                hitsNormal++;
            }

            localState.soloist.busySteps = 0;
            localState.soloist.activeSteps = 999999;
            if (getSoloistNote(chord, null, i * 16, 440, 60, 'bird', 0, false)) {
                hitsDownbeat++;
            }
        }

        expect(hitsNormal).toBeGreaterThan(0);
        expect(hitsDownbeat).toBe(0);
        randomSpy.mockRestore();
    });
});
