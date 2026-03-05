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
    it('should be more likely to attack when a drum hit is detected in Funk style', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };
        const spy = vi.spyOn(Math, 'random');

        mockState.playback.bandIntensity = 0.5;
        mockState.groove.genreFeel = 'Funk';
        mockState.soloist.busySteps = 0;
        mockState.soloist.lastAttackStep = -100;
        mockState.soloist.currentPhraseSteps = 0;
        mockState.soloist.notesInPhrase = 0;
        mockState.soloist.isResting = false;

        // Forced high random (0.9). 
        // With drum hit (+0.3 boost), it should pass if the base prob is > 0.6.
        // In Funk at 0.5 intensity, base prob is roughly 1.0 (emphasis) * 1.7 (intensity scale) = 1.7.
        // Even with lyrical damping (~0.7), it should be > 1.0.
        spy.mockReturnValue(0.95);

        const contextWithDrum = { stepCoordination: { kickHit: true, snareHit: false } };
        const resWith = getSoloistNote(chord, null, 0, 440, 60, 'funk', 0, false, contextWithDrum);
        
        const contextWithoutDrum = { stepCoordination: { kickHit: false, snareHit: false } };
        const resWithout = getSoloistNote(chord, null, 0, 440, 60, 'funk', 0, false, contextWithoutDrum);

        expect(resWith).not.toBeNull();
        // Since base attack prob is already > 1.0 at this intensity, 
        // we need to lower intensity to see the boost's importance.
        mockState.playback.bandIntensity = 0.1; 
        // @note: At 0.1 intensity, intensityScale is (0.2 + 0.3) = 0.5.
        // baseAttackProb (1.0) * 0.5 = 0.5.
        // 0.5 + 0.3 (kick) = 0.8.
        // 0.5 without kick.
        spy.mockReturnValue(0.7); 
        
        const resWithLow = getSoloistNote(chord, null, 0, 440, 60, 'funk', 0, false, contextWithDrum);
        const resWithoutLow = getSoloistNote(chord, null, 0, 440, 60, 'funk', 0, false, contextWithoutDrum);
        
        expect(resWithLow).not.toBeNull();
        expect(resWithoutLow).toBeNull();

        spy.mockRestore();
    });

    it('should be less likely to attack on downbeat in Jazz style at high intensity (Interlocking)', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };

        let hitsNormal = 0;
        let hitsDownbeatCoord = 0;
        const iterations = 20000;

        // Normal offbeat (step 3)
        // Use high intensity to ensure the reduction factor is significant
        mockState.playback.bandIntensity = 0.8;
        mockState.groove.genreFeel = 'Jazz';
        for (let i = 0; i < iterations; i++) {
            mockState.soloist.busySteps = 0;
            mockState.soloist.lastAttackStep = -100;
            mockState.soloist.currentPhraseSteps = 0;
            mockState.soloist.notesInPhrase = 0;
            mockState.soloist.isResting = false;
            const res = getSoloistNote(chord, null, i * 4 + 3, 440, 60, 'bird', 3, false, {});
            if (res) {
                hitsNormal++;
            }
        }

        // Downbeat (step 0) at high intensity
        for (let i = 0; i < iterations; i++) {
            mockState.soloist.busySteps = 0;
            mockState.soloist.lastAttackStep = -100;
            mockState.soloist.currentPhraseSteps = 0;
            mockState.soloist.notesInPhrase = 0;
            mockState.soloist.isResting = false;
            const res = getSoloistNote(chord, null, i * 4, 440, 72, 'bird', 0, false, {});
            if (res) {
                hitsDownbeatCoord++;
            }
        }

        console.log(`Jazz Hits - Offbeat (3): ${hitsNormal}, Downbeat (0): ${hitsDownbeatCoord}`);
        expect(hitsNormal).toBeGreaterThan(hitsDownbeatCoord);
    });
});
