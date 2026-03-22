import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Reggae Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 90, songMode: false },
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
                const info = getStepInfo(
                    bar * 16 + step,
                    TIME_SIGNATURES['4/4'],
                    [],
                    TIME_SIGNATURES,
                );
                const stepData = {
                    step: bar * 16 + step,
                    loopStep: step,
                    instruments: {},
                    isDownbeat: info.isMeasureStart,
                    isPulseStart: info.isPulseStart,
                    isBeatStart: info.isBeatStart,
                    isBackbeat: info.isBackbeat,
                    beatIndex: info.beatIndex,
                };
                for (const instName of ['Kick', 'Snare', 'HiHat', 'Open']) {
                    const params = {
                        step: bar * 16 + step,
                        inst: { name: instName, muted: false, steps: [] },
                        stepVal: 0,
                        playback: mockState.playback,
                        groove: mockState.groove,
                        isDownbeat: info.isMeasureStart,
                        isPulseStart: info.isPulseStart,
                        isBeatStart: info.isBeatStart,
                        isBackbeat: info.isBackbeat,
                        isGroupStart: info.isGroupStart,
                        beatIndex: info.beatIndex,
                        isOffbeat: info.isOffbeat,
                        isEOfBeat: info.isEOfBeat,
                        isAOfBeat: info.isAOfBeat,
                        tsConfig: info.tsConfig,
                        isTurnaround: false,
                        stepsPerBar: 16,
                        loopStep: step,
                    };
                    const result = applyGrooveOverrides(getState(), params);
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

    it('should implement "One Drop" feel at low intensity', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.3 } });

        let kickOnDownbeat = 0;
        let kickOnBackbeat = 0;
        let snareOnBackbeat = 0;
        let backbeatCount = 0;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                if (stepData.isBackbeat && stepData.isBeatStart) {
                    backbeatCount++;
                    if (stepData.instruments.Kick) {
                        kickOnBackbeat++;
                    }
                    if (stepData.instruments.Snare) {
                        snareOnBackbeat++;
                    }
                } else if (stepData.isDownbeat) {
                    if (stepData.instruments.Kick) {
                        kickOnDownbeat++;
                    }
                }
            });
        });

        console.log(
            `[Reggae Critique] Kick on Downbeat: ${kickOnDownbeat}, Kick/Snare on Backbeat: ${kickOnBackbeat}/${snareOnBackbeat}`,
        );

        // One Drop: No kick on 1, Kick and Snare TOGETHER on backbeat
        expect(kickOnDownbeat).toBe(0);
        expect(kickOnBackbeat).toBe(backbeatCount);
        expect(snareOnBackbeat).toBe(backbeatCount);
    });

    it('should implement "Steppers" feel at high intensity', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.9 } });

        let kickHits = 0;
        let pulseCount = 0;
        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                if (stepData.isPulseStart) {
                    pulseCount++;
                    if (stepData.instruments.Kick) {
                        kickHits++;
                    }
                }
            });
        });

        const kickScore = kickHits / pulseCount;
        console.log(
            `[Reggae Critique] Steppers Kick Consistency: ${(kickScore * 100).toFixed(1)}%`,
        );

        // Steppers: 4-on-the-floor kick
        expect(kickScore).toBeGreaterThan(0.8);
    });
});
