// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Ska-Punk Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 175, songMode: false },
            groove: {
                genreFeel: 'Ska-Punk',
                creativity: true,
                lastDrumPreset: 'Ska',
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

    it('should implement the "Skank" feel (Strong offbeat hi-hats)', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.5 } });

        let onBeatVel = 0,
            onBeatCount = 0;
        let offBeatVel = 0,
            offBeatCount = 0;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                const hat = stepData.instruments.HiHat || stepData.instruments.Open;
                if (hat) {
                    if (stepData.loopStep % 4 === 0) {
                        onBeatVel += hat.velocity;
                        onBeatCount++;
                    } else if (stepData.loopStep % 4 === 2) {
                        offBeatVel += hat.velocity;
                        offBeatCount++;
                    }
                }
            });
        });

        const avgOn = onBeatVel / (onBeatCount || 1);
        const avgOff = offBeatVel / (offBeatCount || 1);

        console.log(
            `[Ska-Punk Critique] Avg On-beat Hat: ${avgOn.toFixed(2)}, Avg Off-beat Hat: ${avgOff.toFixed(2)}`,
        );

        // Offbeat hats should be significantly stronger in Motif 0/Low Intensity
        expect(avgOff).toBeGreaterThan(avgOn * 1.2);
    });

    it('should implementation high-energy punk beats at high intensity', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.9 } });

        let snareCount = 0;
        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                if (stepData.instruments.Snare) {
                    snareCount++;
                }
            });
        });

        const totalBars = performance.length;
        const snaresPerBar = snareCount / totalBars;
        console.log(
            `[Ska-Punk Critique] Snare density at high intensity: ${snaresPerBar.toFixed(2)} hits/bar`,
        );

        // Punk beats are dense (2-step or double-time)
        expect(snaresPerBar).toBeGreaterThanOrEqual(2.0);
    });

    it('should keep high-intensity hats mostly tight, with opens used as accents', () => {
        const performance = simulatePerformance(32, { playback: { bandIntensity: 0.85 } });

        let openHits = 0;
        let totalHatHits = 0;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                if (stepData.instruments.HiHat || stepData.instruments.Open) {
                    totalHatHits++;
                }
                if (stepData.instruments.Open) {
                    openHits++;
                }
            });
        });

        const openRatio = openHits / (totalHatHits || 1);
        console.log(
            `[Ska-Punk Critique] Open-hat ratio at high intensity: ${openRatio.toFixed(2)}`,
        );

        expect(openRatio).toBeLessThan(0.35);
    });
});
