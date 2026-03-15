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

        let kickOnOne = 0;
        let kickOnThree = 0;
        let snareOnThree = 0;

        performance.forEach((bar) => {
            if (bar[0].instruments.Kick) {
                kickOnOne++;
            }
            if (bar[8].instruments.Kick) {
                kickOnThree++;
            }
            if (bar[8].instruments.Snare) {
                snareOnThree++;
            }
        });

        const totalBars = performance.length;
        console.log(
            `[Reggae Critique] Kick on 1: ${kickOnOne}, Kick/Snare on 3: ${kickOnThree}/${snareOnThree}`,
        );

        // One Drop: No kick on 1, Kick and Snare TOGETHER on 3
        expect(kickOnOne).toBe(0);
        expect(kickOnThree).toBe(totalBars);
        expect(snareOnThree).toBe(totalBars);
    });

    it('should implement "Steppers" feel at high intensity', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.9 } });

        let kickHits = 0;
        performance.forEach((bar) => {
            [0, 4, 8, 12].forEach((s) => {
                if (bar[s].instruments.Kick) {
                    kickHits++;
                }
            });
        });

        const totalBars = performance.length;
        const kickScore = kickHits / (totalBars * 4);
        console.log(
            `[Reggae Critique] Steppers Kick Consistency: ${(kickScore * 100).toFixed(1)}%`,
        );

        // Steppers: 4-on-the-floor kick
        expect(kickScore).toBeGreaterThan(0.8);
    });
});
