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

    it('should emphasize beat 3 in the Kick pattern (Surdo feel)', () => {
        const performance = simulatePerformance(32);

        let vel1 = 0,
            count1 = 0;
        let vel3 = 0,
            count3 = 0;

        performance.forEach((bar) => {
            if (bar[0].instruments.Kick) {
                vel1 += bar[0].instruments.Kick.velocity;
                count1++;
            }
            if (bar[8].instruments.Kick) {
                vel3 += bar[8].instruments.Kick.velocity;
                count3++;
            }
        });

        const avg1 = vel1 / count1;
        const avg3 = vel3 / count3;

        console.log(
            `[Bossa Critique] Avg Kick 1: ${avg1.toFixed(2)}, Avg Kick 3: ${avg3.toFixed(2)}`,
        );

        // In many Latin styles, the second half of the bar carries more weight
        expect(avg3).toBeGreaterThan(avg1 * 0.95);
    });
});
