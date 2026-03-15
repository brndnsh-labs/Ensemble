import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Metal Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 140, songMode: false },
            groove: {
                genreFeel: 'Metal',
                creativity: true,
                lastDrumPreset: 'Metal (Speed)',
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
                        };
                    }
                }
                barSteps.push(stepData);
            }
            history.push(barSteps);
        }
        return history;
    };

    it('should implement high-speed Double Kick at maximum intensity', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.95 } });

        let kickHits = 0;
        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                if (stepData.instruments.Kick) {
                    kickHits++;
                }
            });
        });

        const totalSteps = 16 * 16;
        const kickDensity = kickHits / totalSteps;
        console.log(
            `[Metal Critique] Kick Density at Max Intensity: ${(kickDensity * 100).toFixed(1)}%`,
        );

        // Double kick should be nearly continuous at max intensity
        expect(kickDensity).toBeGreaterThan(0.7);
    });

    it('should pass a Blast Beat alignment check at max intensity', () => {
        const performance = simulatePerformance(128, {
            playback: { bandIntensity: 0.95 },
            groove: { creativity: true, genreFeel: 'Metal' },
        });

        let blastBars = 0;
        performance.forEach((bar) => {
            // A blast beat has snare and kick on most 16th or 8th subdivisions
            let snareKickLocks = 0;
            bar.forEach((stepData) => {
                if (stepData.instruments.Snare && stepData.instruments.Kick) {
                    snareKickLocks++;
                }
            });
            // We expect at least some bars to exhibit blast behavior
            if (snareKickLocks >= 4) {
                blastBars++;
            }
        });

        console.log(`[Metal Critique] Blast Beat segments observed: ${blastBars}/128 bars`);
        expect(blastBars).toBeGreaterThan(5);
    });
});
