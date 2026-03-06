import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Snare Creativity Integrity', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const mockState = {
        playback: { bandIntensity: 0.8, bpm: 90, songMode: false },
        groove: {
            genreFeel: 'Blues',
            creativity: true,
            lastDrumPreset: 'Blues',
            instruments: [],
        },
        soloist: { enabled: false, busySteps: 0 },
    };

    it('should have a reasonable number of snare hits in Blues even with creativity enabled', () => {
        getState.mockReturnValue(mockState);

        let totalExtraSnareHits = 0;
        const numBars = 100;

        for (let bar = 0; bar < numBars; bar++) {
            let barSnareHits = 0;
            for (let step = 0; step < 16; step++) {
                const params = {
                    step: bar * 16 + step,
                    inst: { name: 'Snare', muted: false, steps: [] },
                    stepVal: 0,
                    playback: mockState.playback,
                    groove: mockState.groove,
                    isDownbeat: step === 0,
                    isQuarter: step % 4 === 0,
                    isBackbeat: step === 4 || step === 12,
                    isGroupStart: step === 0 || step === 8,
                    beatIndex: Math.floor(step / 4),
                };

                const result = applyGrooveOverrides(params);
                if (result.shouldPlay) {
                    if (step !== 4 && step !== 12) {
                        barSnareHits++;
                    }
                }
            }
            totalExtraSnareHits += barSnareHits;
        }

        const averageExtraHits = totalExtraSnareHits / numBars;
        // With the fix, entropy is 0.08 * 0.8 = 0.064 prob on 6 syncopated steps (excluding 5 and 13) = 0.384.
        // Motif 0 adds 2 ghost notes (steps 3, 11) at 40% prob = 0.8.
        // Total expected extra hits for Motif 0 = 0.384 + 0.8 = 1.184.
        // This is below the 1.5 threshold.
        expect(averageExtraHits).toBeLessThan(1.5);
    });

    it('should avoid snare hits immediately after the backbeat (steps 5 and 13) in Blues', () => {
        getState.mockReturnValue(mockState);

        let hitsOnStep5Or13 = 0;
        const numBars = 200;

        for (let bar = 0; bar < numBars; bar++) {
            for (const step of [5, 13]) {
                const params = {
                    step: bar * 16 + step,
                    inst: { name: 'Snare', muted: false, steps: [] },
                    stepVal: 0,
                    playback: mockState.playback,
                    groove: mockState.groove,
                    isDownbeat: false,
                    isQuarter: false,
                    isBackbeat: false,
                    isGroupStart: false,
                };

                const result = applyGrooveOverrides(params);
                if (result.shouldPlay) {
                    hitsOnStep5Or13++;
                }
            }
        }

        const hitRate = hitsOnStep5Or13 / (numBars * 2);
        // Step 5 and 13 should be blocked for Blues, so rate should be exactly zero.
        expect(hitRate).toBe(0);
    });
});
