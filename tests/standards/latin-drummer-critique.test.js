import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides, getDrumMotif } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Latin Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 90, songMode: false },
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
        const latinInstruments = ['Kick', 'Snare', 'Shaker', 'Conga', 'Guiro'];
        for (let bar = 0; bar < numBars; bar++) {
            const barSteps = [];
            for (let step = 0; step < 16; step++) {
                const stepData = { step: bar * 16 + step, loopStep: step, instruments: {} };
                for (const instName of latinInstruments) {
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

    it('should pass an authenticity critique for a 128-bar Bossa Nova performance', () => {
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.5 },
            groove: { creativity: false, genreFeel: 'Bossa Nova' },
        });

        let validClaveBars = 0;
        let steadyKickHits = 0;
        let shakerHits = 0;
        const totalBars = performance.length;

        // 2-Bar Clave 3-2 Pattern
        const CLAVE_3_2_BAR1 = [0, 6, 12]; // 3-side
        const CLAVE_3_2_BAR2 = [2, 8]; // 2-side

        performance.forEach((bar, bIdx) => {
            const snareSteps = bar.filter((s) => s.instruments.Snare).map((s) => s.loopStep);
            const isBar1 = bIdx % 2 === 0;
            const target = isBar1 ? CLAVE_3_2_BAR1 : CLAVE_3_2_BAR2;

            const matches =
                target.length === snareSteps.length && target.every((v, i) => v === snareSteps[i]);
            if (matches) {
                validClaveBars++;
            }

            bar.forEach((stepData) => {
                const s = stepData.loopStep;

                // --- CRITIQUE: Surdo Kick (0, 8) with accents on 8 ---
                if ([0, 8].includes(s)) {
                    if (stepData.instruments.Kick) {
                        steadyKickHits++;
                    }
                }

                // --- CRITIQUE: Shaker (Constant 16ths) ---
                if (stepData.instruments.Shaker) {
                    shakerHits++;
                }
            });
        });

        const claveScore = validClaveBars / totalBars;
        const kickScore = steadyKickHits / (totalBars * 2);
        const shakerScore = shakerHits / (totalBars * 16);

        console.log('\n--- LATIN DRUMMER CRITIQUE REPORT (Bossa Nova) ---');
        console.log(`[Clave Integrity]       ${(claveScore * 100).toFixed(1)}% (Target: 100%)`);
        console.log(`[Surdo Kick Pulse]      ${(kickScore * 100).toFixed(1)}% (Target: 100%)`);
        console.log(`[Shaker Consistency]    ${(shakerScore * 100).toFixed(1)}% (Target: 100%)`);
        console.log('------------------------------------\n');

        expect(claveScore).toBe(1.0);
        expect(kickScore).toBe(1.0);
        expect(shakerScore).toBe(1.0);
    });
});
