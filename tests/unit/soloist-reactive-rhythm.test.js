import { describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../public/soloist.js';

// Use vi.hoisted to ensure mockState is available during vi.mock
const { mockState } = vi.hoisted(() => ({
    mockState: {
        soloist: {
            enabled: true,
            busySteps: 0,
            currentPhraseSteps: 0,
            notesInPhrase: 0,
            isResting: false,
            pitchHistory: [],
            deviceBuffer: [],
            motifBuffer: [],
            sessionSteps: 100,
            lastAttackStep: -100,
        },
        groove: { genreFeel: 'Funk' },
        playback: {
            bandIntensity: 0.8,
            complexity: 0.8,
            bpm: 120,
            intent: {},
            currentLoopCount: 1,
        },
        arranger: { totalSteps: 64, timeSignature: '4/4' },
    },
}));

vi.mock('../../public/state.js', () => ({ getState: () => mockState }));
vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: { '4/4': { beats: 4, stepsPerBeat: 4 } },
}));

describe('Soloist Rhythmic Reactive Alignment', () => {
    it.skip('should be more likely to attack when a drum hit is detected in Funk style', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        const spy = vi.spyOn(Math, 'random');

        mockState.playback.bandIntensity = 0.5;
        mockState.groove.genreFeel = 'Funk';
        mockState.soloist.busySteps = 0;
        mockState.soloist.lastAttackStep = -100;
        mockState.soloist.currentPhraseSteps = 0;
        mockState.soloist.notesInPhrase = 0;
        mockState.soloist.isResting = false;

        // Use bypassRhythm to ensure we are definitely playing for the test setup
        const contextWithDrum = {
            stepCoordination: { kickHit: true, snareHit: false },
            bypassRhythm: true,
        };
        const resWith = getSoloistNote(chord, null, 0, 440, 60, 'funk', 0, false, contextWithDrum);

        expect(resWith).not.toBeNull();

        // Now test the actual probabilistic logic at low intensity
        mockState.playback.bandIntensity = 0.05;
        mockState.soloist.isResting = false;

        // At 0.05 intensity, emphasis 1.0 (step 0), base prob ~0.22. +0.3 kick = 0.52.
        spy.mockReturnValue(0.4);

        const contextProbWithDrum = { stepCoordination: { kickHit: true, snareHit: false } };
        const resProbWith = getSoloistNote(
            chord,
            null,
            16,
            440,
            60,
            'funk',
            0,
            false,
            contextProbWithDrum,
        );

        const contextProbWithoutDrum = { stepCoordination: { kickHit: false, snareHit: false } };
        const resProbWithout = getSoloistNote(
            chord,
            null,
            32,
            440,
            60,
            'funk',
            0,
            false,
            contextProbWithoutDrum,
        );

        expect(resProbWith).not.toBeNull();
        expect(resProbWithout).toBeNull();

        spy.mockRestore();
    });

    it.skip('should be less likely to attack on downbeat in Jazz style at high intensity (Interlocking)', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };

        let hitsNormal = 0;
        let hitsDownbeatCoord = 0;
        const iterations = 20000;

        // Normal offbeat (step 3)
        // Use moderate intensity (0.6) where reduction starts working (>0.4)
        mockState.playback.bandIntensity = 0.6;
        mockState.groove.genreFeel = 'Jazz';
        for (let i = 0; i < iterations; i++) {
            mockState.soloist.busySteps = 0;
            mockState.soloist.lastAttackStep = -100;
            mockState.soloist.currentPhraseSteps = 0;
            mockState.soloist.notesInPhrase = 0;
            mockState.soloist.isResting = false;
            const res = getSoloistNote(chord, null, i * 16 + 3, 440, 60, 'bird', 3, false, {});
            if (res) {
                hitsNormal++;
            }
        }

        // Downbeat (step 0) at same intensity
        for (let i = 0; i < iterations; i++) {
            mockState.soloist.busySteps = 0;
            mockState.soloist.lastAttackStep = -100;
            mockState.soloist.currentPhraseSteps = 0;
            mockState.soloist.notesInPhrase = 0;
            mockState.soloist.isResting = false;
            const res = getSoloistNote(chord, null, i * 16, 440, 72, 'bird', 0, false, {});
            if (res) {
                hitsDownbeatCoord++;
            }
        }

        console.log(`Jazz Hits - Offbeat (3): ${hitsNormal}, Downbeat (0): ${hitsDownbeatCoord}`);
        expect(hitsNormal).toBeGreaterThan(hitsDownbeatCoord);
    });
});
