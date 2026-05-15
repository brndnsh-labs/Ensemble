// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Bossa Nova Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 120, songMode: false },
            groove: {
                genreFeel: 'Bossa Nova',
                creativity: true,
                lastDrumPreset: 'Bossa Nova',
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
                    isBeatStart: info.isBeatStart,
                    isBackbeat: info.isBackbeat,
                };
                for (const instName of ['Kick', 'Snare', 'HiHat', 'Open']) {
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

    it('should implement an authentic 2-bar Clave pattern', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.5 } });

        let patternA = '';
        let patternB = '';

        // Check first 2 bars of the 16
        for (let s = 0; s < 16; s++) {
            patternA += performance[0][s].instruments.Snare ? 'X' : '.';
            patternB += performance[1][s].instruments.Snare ? 'X' : '.';
        }

        console.log(`[Bossa Critique] Bar 1 Clave: ${patternA}`);
        console.log(`[Bossa Critique] Bar 2 Clave: ${patternB}`);

        // Authentic Bossa Clave: They should be DIFFERENT (2-bar pattern)
        expect(patternA).not.toBe(patternB);
    });

    it('should emphasize non-downbeat pulses in the Kick pattern (Surdo feel)', () => {
        const performance = simulatePerformance(32);

        let totalKickDownbeat = 0;
        let countKickDownbeat = 0;
        let totalKickOther = 0;
        let countKickOther = 0;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                if (stepData.instruments.Kick) {
                    if (stepData.isDownbeat) {
                        totalKickDownbeat += stepData.instruments.Kick.velocity;
                        countKickDownbeat++;
                    } else if (stepData.isBeatStart && !stepData.isBackbeat) {
                        totalKickOther += stepData.instruments.Kick.velocity;
                        countKickOther++;
                    }
                }
            });
        });

        const avgDownbeat = totalKickDownbeat / countKickDownbeat;
        const avgOther = totalKickOther / countKickOther;

        console.log(
            `[Bossa Critique] Avg Kick Downbeat: ${avgDownbeat.toFixed(2)}, Avg Kick Other: ${avgOther.toFixed(2)}`,
        );

        // In many Latin styles, the second half of the bar carries more weight
        expect(avgOther).toBeGreaterThan(avgDownbeat * 0.95);
    });
});
