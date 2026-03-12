import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Hip Hop Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 90, songMode: false },
            groove: {
                genreFeel: 'Hip Hop',
                creativity: true,
                lastDrumPreset: 'Hip Hop',
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
                    const result = applyGrooveOverrides(params);
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

    it('should pass an authenticity critique for a 128-bar Hip Hop performance', () => {
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.8 },
            groove: { creativity: true, genreFeel: 'Hip Hop' },
        });

        let backbeatHits = 0;
        let _kickHits = 0;
        let syncopatedKickHits = 0;
        let hiHatHits = 0;
        const totalBars = performance.length;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                const s = stepData.loopStep;

                if (s === 4 || s === 12) {
                    if (stepData.instruments.Snare) {
                        backbeatHits++;
                    }
                }

                if (stepData.instruments.Kick) {
                    _kickHits++;
                    if (s !== 0 && s !== 8) {
                        syncopatedKickHits++;
                    }
                }

                if (stepData.instruments.HiHat) {
                    hiHatHits++;
                }
            });
        });

        const backbeatScore = backbeatHits / (totalBars * 2);
        const syncopatedKickRatio = syncopatedKickHits / totalBars;

        console.log('\n--- HIP HOP DRUMMER CRITIQUE REPORT ---');
        console.log(`[Backbeat Consistency]  ${(backbeatScore * 100).toFixed(1)}% (Target: 100%)`);
        console.log(`[Kick Syncopation]      ${syncopatedKickRatio.toFixed(2)} hits/bar`);
        console.log(`[HiHat Density]         ${(hiHatHits / totalBars).toFixed(2)} hits/bar`);
        console.log('---------------------------------------\n');

        expect(backbeatScore).toBeGreaterThan(0.95);
        expect(syncopatedKickRatio).toBeGreaterThan(0.5); // Should have some syncopation
    });
});
