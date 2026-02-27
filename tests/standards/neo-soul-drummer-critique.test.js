import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Neo-Soul Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 90, songMode: false },
            groove: {
                genreFeel: 'Neo-Soul',
                creativity: true,
                lastDrumPreset: 'Neo-Soul',
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

    it('should pass an authenticity critique for a 128-bar Neo-Soul performance', () => {
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.7 },
            groove: { creativity: true, genreFeel: 'Neo-Soul' },
        });

        let snareBackbeats = 0;
        let snareDragging = 0;
        let hatPushing = 0;
        let totalSnareHits = 0;
        let totalHatHits = 0;
        const totalBars = performance.length;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                const s = stepData.loopStep;

                // --- CRITIQUE: Snare Backbeat (4, 12) & Dragging ---
                if (stepData.instruments.Snare) {
                    totalSnareHits++;
                    if (s === 4 || s === 12) {
                        snareBackbeats++;
                    }
                    if (stepData.instruments.Snare.offset > 0) {
                        snareDragging++;
                    }
                }

                // --- CRITIQUE: HiHat/Open Pushing ---
                const hat = stepData.instruments.HiHat || stepData.instruments.Open;
                if (hat) {
                    totalHatHits++;
                    if (hat.offset < 0) {
                        hatPushing++;
                    }
                }
            });
        });

        const backbeatScore = snareBackbeats / (totalBars * 2);
        const snareDragScore = snareDragging / (totalSnareHits || 1);
        const hatPushScore = hatPushing / (totalHatHits || 1);

        console.log('\n--- NEO-SOUL DRUMMER CRITIQUE REPORT ---');
        console.log(`[Backbeat Solidity]     ${(backbeatScore * 100).toFixed(1)}% (Target: 100%)`);
        console.log(`[Snare "Dilla" Drag]    ${(snareDragScore * 100).toFixed(1)}% (Target: >90%)`);
        console.log(`[HiHat "Forward" Push]  ${(hatPushScore * 100).toFixed(1)}% (Target: >90%)`);
        console.log('------------------------------------\n');

        expect(backbeatScore).toBe(1.0);
        expect(snareDragScore).toBeGreaterThan(0.9);
        expect(hatPushScore).toBeGreaterThan(0.9);
    });
});
