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
        },
        groove: { genreFeel: 'Funk' },
        playback: { bandIntensity: 0.8, complexity: 0.8, bpm: 120, intent: {} },
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

        let hitsWithDrum = 0;
        let hitsWithoutDrum = 0;
        const iterations = 5000;

        // Run with drum hits
        for (let i = 0; i < iterations; i++) {
            mockState.soloist.busySteps = 0;
            mockState.soloist.lastAttackStep = -10;
            const context = { stepCoordination: { kickHit: true, snareHit: false } };
            const res = getSoloistNote(chord, null, 0, 440, 60, 'funk', 0, false, context);
            if (res) {
                hitsWithDrum++;
            }
        }

        // Run without drum hits
        for (let i = 0; i < iterations; i++) {
            mockState.soloist.busySteps = 0;
            mockState.soloist.lastAttackStep = -10;
            const context = { stepCoordination: { kickHit: false, snareHit: false } };
            const res = getSoloistNote(chord, null, 0, 440, 60, 'funk', 0, false, context);
            if (res) {
                hitsWithoutDrum++;
            }
        }

        console.log(`Funk Hits - With Drum: ${hitsWithDrum}, Without: ${hitsWithoutDrum}`);
        expect(hitsWithDrum).toBeGreaterThan(hitsWithoutDrum);
    });

    it('should be less likely to attack on downbeat in Jazz style at high intensity (Interlocking)', () => {
        const chord = { rootMidi: 60, intervals: [0, 4, 7], beats: 4 };

        let hitsNormal = 0;
        let hitsDownbeatCoord = 0;
        const iterations = 5000;

        // Normal offbeat (step 3)
        for (let i = 0; i < iterations; i++) {
            mockState.soloist.busySteps = 0;
            mockState.soloist.lastAttackStep = -10;
            const res = getSoloistNote(chord, null, 3, 440, 60, 'bird', 3, false, {});
            if (res) {
                hitsNormal++;
            }
        }

        // Downbeat (step 0) at high intensity
        mockState.playback.bandIntensity = 0.9;
        mockState.groove.genreFeel = 'Jazz';
        for (let i = 0; i < iterations; i++) {
            mockState.soloist.busySteps = 0;
            mockState.soloist.lastAttackStep = -10;
            const res = getSoloistNote(chord, null, 0, 440, 60, 'bird', 0, false, {});
            if (res) {
                hitsDownbeatCoord++;
            }
        }

        console.log(`Jazz Hits - Offbeat (3): ${hitsNormal}, Downbeat (0): ${hitsDownbeatCoord}`);
        expect(hitsNormal).toBeGreaterThan(hitsDownbeatCoord);
    });
});
