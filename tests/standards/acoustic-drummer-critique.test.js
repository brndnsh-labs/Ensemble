import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides, getDrumMotif } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Acoustic Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 90, songMode: false },
            groove: {
                genreFeel: 'Acoustic',
                creativity: true,
                lastDrumPreset: 'Acoustic',
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
                    const info = getStepInfo(
                        bar * 16 + step,
                        TIME_SIGNATURES['4/4'],
                        [],
                        TIME_SIGNATURES,
                    );
                    const params = {
                        step: bar * 16 + step,
                        inst: { name: instName, muted: false, steps: [] },
                        stepVal: 0,
                        playback: mockState.playback,
                        groove: mockState.groove,
                        isDownbeat: info.isMeasureStart,
                        isBeatStart: info.isBeatStart,
                        isBackbeat: info.isBackbeat,
                        isGroupStart: info.isGroupStart,
                        beatIndex: info.beatIndex,
                        isOffbeat: info.isOffbeat,
                        isEOfBeat: info.isEOfBeat,
                        isAOfBeat: info.isAOfBeat,
                        tsConfig: info.tsConfig,
                    };
                    const result = applyGrooveOverrides(getState(), params);
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

    it('should pass an authenticity critique for a 128-bar Acoustic performance', () => {
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.75 },
            groove: { creativity: true, genreFeel: 'Acoustic' },
        });

        let kickOnOne = 0;
        let _snareActive = 0;
        let highIntensitySnareSound = 0;
        let constantHats = 0;
        const totalBars = performance.length;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                const s = stepData.loopStep;

                // --- CRITIQUE: Kick on 1 (step 0) ---
                if (s === 0 && stepData.instruments.Kick) {
                    kickOnOne++;
                }

                // --- CRITIQUE: Snare/Sidestick Presence ---
                if (stepData.instruments.Snare) {
                    _snareActive++;
                    if (s % 4 === 0) {
                        if (stepData.instruments.Snare.sound === 'Snare') {
                            highIntensitySnareSound++;
                        }
                    }
                }

                // --- CRITIQUE: Constant Hats (Shaker feel) ---
                if (stepData.instruments.HiHat) {
                    constantHats++;
                }
            });
        });

        const kickScore = kickOnOne / totalBars;

        // Count how many snare hits occurred on main beats (quarter notes)
        let mainSnareHits = 0;
        performance.forEach((bar) => {
            bar.forEach((s) => {
                if (s.loopStep % 4 === 0 && s.instruments.Snare) {
                    mainSnareHits++;
                }
            });
        });

        const snareSoundScore = highIntensitySnareSound / (mainSnareHits || 1);
        const hatDensity = constantHats / (totalBars * 16);

        console.log('\n--- ACOUSTIC DRUMMER CRITIQUE REPORT ---');
        console.log(`[Kick Solidity]         ${(kickScore * 100).toFixed(1)}% (Target: 100%)`);
        console.log(
            `[High Intensity Snare]  ${(snareSoundScore * 100).toFixed(1)}% (Target: 100% at 0.75 intensity)`,
        );
        console.log(`[HiHat/Shaker Density]  ${(hatDensity * 100).toFixed(1)}% (Target: 100%)`);
        console.log('------------------------------------\n');

        expect(kickScore).toBe(1.0);
        expect(snareSoundScore).toBe(1.0);
        expect(hatDensity).toBe(1.0);
    });

    it('should use Sidestick sound at low intensity', () => {
        const performance = simulatePerformance(32, { playback: { bandIntensity: 0.3 } });

        let sidestickHits = 0;
        let snareHits = 0;

        performance.forEach((bar) =>
            bar.forEach((step) => {
                if (step.instruments.Snare) {
                    if (step.instruments.Snare.sound === 'Sidestick') {
                        sidestickHits++;
                    }
                    if (step.instruments.Snare.sound === 'Snare') {
                        snareHits++;
                    }
                }
            }),
        );

        console.log(
            `[Acoustic Dynamics] Low Intensity: ${sidestickHits} Sidesticks, ${snareHits} Snares`,
        );
        expect(sidestickHits).toBeGreaterThan(0);
        expect(snareHits).toBe(0);
    });
});
