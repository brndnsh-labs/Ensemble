import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Reggae Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 75, songMode: false },
            groove: {
                genreFeel: 'Reggae',
                creativity: true,
                lastDrumPreset: 'Reggae',
                instruments: [],
            },
            soloist: { enabled: false, busySteps: 0 },
            ...stateOverrides,
        };
        getState.mockReturnValue(mockState);

        const history = [];
        for (let bar = 0; bar < numBars; bar++) {
            const barSteps = [];
            for (let step = 0; step < 16; step++) {
                const stepData = { step: bar * 16 + step, loopStep: step, instruments: {} };
                for (const instName of ['Kick', 'Snare', 'HiHat', 'Open']) {
                    const params = {
                        step: bar * 16 + step,
                        inst: { name: instName, muted: false, steps: [] },
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
                        stepData.instruments[instName] = {
                            velocity: result.velocity,
                            sound: result.soundName,
                        };
                    }
                }
                barSteps.push(stepData);
            }
            history.push(barSteps);
        }
        return history;
    };

    it('should pass an authenticity critique for a 128-bar Reggae performance', () => {
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.6 },
            groove: { creativity: true, genreFeel: 'Reggae' },
        });

        let kickOnOne = 0;
        let oneDropHits = 0; // Kick + Snare on 8 (Beat 3)
        let eighthNoteHats = 0;
        let totalHats = 0;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                const s = stepData.loopStep;

                // --- CRITIQUE: One Drop (Kick/Snare on Beat 3, step 8) ---
                if (s === 8) {
                    if (stepData.instruments.Kick && stepData.instruments.Snare) {
                        oneDropHits++;
                    }
                }

                // --- CRITIQUE: One Drop Kick Exclusion (No kick on 1, step 0) ---
                if (s === 0 && stepData.instruments.Kick) {
                    kickOnOne++;
                }

                // --- CRITIQUE: Eighth Note Hats ---
                if (stepData.instruments.HiHat) {
                    totalHats++;
                    if (s % 2 === 0) {
                        eighthNoteHats++;
                    }
                }
            });
        });

        const totalBars = performance.length;
        const oneDropScore = oneDropHits / totalBars;
        const kickOneExclusionScore = 1 - kickOnOne / totalBars;
        const hatConsistency = eighthNoteHats / (totalHats || 1);

        console.log('\n--- REGGAE DRUMMER CRITIQUE REPORT ---');
        console.log(`[One Drop Solidity]     ${(oneDropScore * 100).toFixed(1)}% (Target: >80%)`);
        console.log(
            `[Kick On One Exclusion] ${(kickOneExclusionScore * 100).toFixed(1)}% (Target: >85%)`,
        );
        console.log(`[Hat Pulse Consistency] ${(hatConsistency * 100).toFixed(1)}% (Target: 100%)`);
        console.log('------------------------------------\n');

        // Reggae "One Drop" is the default feel.
        expect(oneDropScore).toBeGreaterThan(0.8);
        expect(kickOneExclusionScore).toBeGreaterThan(0.85);
        expect(hatConsistency).toBe(1.0);
    });
});
