import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

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

    it('should implement the "Pocket Width" (Snare drag vs HiHat rush)', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.8 } });

        let snareDragSum = 0;
        let snareCount = 0;
        let hatPushSum = 0;
        let hatCount = 0;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                const snare = stepData.instruments.Snare;
                const hat = stepData.instruments.HiHat;

                if (snare && snare.offset > 0) {
                    snareDragSum += snare.offset;
                    snareCount++;
                }
                if (hat && hat.offset < 0) {
                    hatPushSum += hat.offset;
                    hatCount++;
                }
            });
        });

        const avgSnareDrag = snareDragSum / snareCount;
        const avgHatPush = hatPushSum / hatCount;
        const pocketWidth = avgSnareDrag - avgHatPush; // since push is negative

        console.log(`[Neo-Soul Critique] Avg Snare Drag: ${avgSnareDrag.toFixed(4)}s`);
        console.log(`[Neo-Soul Critique] Avg Hat Push:   ${avgHatPush.toFixed(4)}s`);
        console.log(`[Neo-Soul Critique] Pocket Width:   ${pocketWidth.toFixed(4)}s`);

        expect(avgSnareDrag).toBeGreaterThan(0.005);
        expect(avgHatPush).toBeLessThan(-0.005);
        expect(pocketWidth).toBeGreaterThan(0.015);
    });

    it('should pass ghost note density targets at high intensity', () => {
        const performance = simulatePerformance(128, {
            playback: { bandIntensity: 0.9 },
            groove: { creativity: true, genreFeel: 'Neo-Soul' },
        });

        let snareGhostHits = 0;
        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                const snare = stepData.instruments.Snare;
                if (snare && snare.velocity < 0.6) {
                    snareGhostHits++;
                }
            });
        });

        const totalBars = performance.length;
        const ghostDensity = snareGhostHits / totalBars;

        console.log(`[Neo-Soul Critique] Snare Ghost Density: ${ghostDensity.toFixed(2)} hits/bar`);
        expect(ghostDensity).toBeGreaterThan(1.0);
    });
});
