import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Ska-Punk Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 160, songMode: false },
            groove: {
                genreFeel: 'Ska-Punk',
                creativity: true,
                lastDrumPreset: 'Ska-Punk',
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
                            offset: result.instTimeOffset,
                        };
                    }
                }
                barSteps.push(stepData);
            }
            history.push(barSteps);
        }
        return history;
    };

    it('should pass an authenticity critique for a 128-bar Ska-Punk performance', () => {
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.8 },
            groove: { creativity: true, genreFeel: 'Ska-Punk' },
        });

        let backbeatSnare = 0;
        let upbeatHats = 0;
        let totalUpbeatVel = 0;
        let energeticPushes = 0;
        let totalHits = 0;
        const totalBars = performance.length;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                const s = stepData.loopStep;

                // --- CRITIQUE: Energetic Push (Negative Offset) ---
                Object.values(stepData.instruments).forEach((inst) => {
                    totalHits++;
                    if (inst.offset < 0) {
                        energeticPushes++;
                    }
                });

                // --- CRITIQUE: Backbeat Snare (4, 12) ---
                if ((s === 4 || s === 12) && stepData.instruments.Snare) {
                    backbeatSnare++;
                }

                // --- CRITIQUE: Upbeat Hat Emphasis (2, 6, 10, 14) ---
                if (s % 4 === 2) {
                    const hat = stepData.instruments.HiHat || stepData.instruments.Open;
                    if (hat) {
                        upbeatHats++;
                        totalUpbeatVel += hat.velocity;
                    }
                }
            });
        });

        const backbeatScore = backbeatSnare / (totalBars * 2);
        const upbeatHatScore = upbeatHats / (totalBars * 4);
        const averageUpbeatVel = totalUpbeatVel / (upbeatHats || 1);
        const pushScore = energeticPushes / (totalHits || 1);

        console.log('\n--- SKA-PUNK DRUMMER CRITIQUE REPORT ---');
        console.log(`[Backbeat Solidity]     ${(backbeatScore * 100).toFixed(1)}% (Target: >95%)`);
        console.log(`[Upbeat Hat Presence]   ${(upbeatHatScore * 100).toFixed(1)}% (Target: 100%)`);
        console.log(`[Upbeat Hat Emphasis]   ${averageUpbeatVel.toFixed(2)} vel (Target: >1.2)`);
        console.log(`[Energetic Push Score]  ${(pushScore * 100).toFixed(1)}% (Target: 100%)`);
        console.log('------------------------------------\n');

        expect(backbeatScore).toBeGreaterThan(0.95);
        expect(upbeatHatScore).toBe(1.0);
        expect(averageUpbeatVel).toBeGreaterThan(1.2);
        expect(pushScore).toBe(1.0);
    });
});
