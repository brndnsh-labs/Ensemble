import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Country Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 120, songMode: false },
            groove: {
                genreFeel: 'Country',
                creativity: true,
                lastDrumPreset: 'Country',
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
                    const result = applyGrooveOverrides(params);
                    if (result.shouldPlay && result.soundName === instName) {
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

    it('should pass an authenticity critique for a 128-bar Country performance', () => {
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.75 },
            groove: { creativity: true, genreFeel: 'Country' },
        });

        let backbeatHits = 0;
        let kickHits = 0;
        let trainBeatSnareHits = 0;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                const s = stepData.loopStep;

                if (s === 4 || s === 12) {
                    if (stepData.instruments.Snare) {
                        backbeatHits++;
                    }
                } else if (stepData.instruments.Snare) {
                    trainBeatSnareHits++;
                }

                if (stepData.instruments.Kick) {
                    kickHits++;
                }
            });
        });

        const totalBars = performance.length;
        const backbeatScore = backbeatHits / (totalBars * 2);

        console.log('\n--- COUNTRY DRUMMER CRITIQUE REPORT ---');
        console.log(`[Backbeat Consistency]  ${(backbeatScore * 100).toFixed(1)}%`);
        console.log(`[Train Beat/Ghost Snares] ${trainBeatSnareHits} total hits`);
        console.log(`[Kick Density]         ${(kickHits / totalBars).toFixed(2)} kicks/bar`);
        console.log('---------------------------------------\n');

        expect(backbeatScore).toBeGreaterThan(0.9);
        expect(trainBeatSnareHits).toBeGreaterThan(100); // Expecting train beat elements
        expect(kickHits / totalBars).toBeGreaterThan(1.5);
    });
});
