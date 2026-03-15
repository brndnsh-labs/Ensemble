import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides, getDrumMotif } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Disco Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 120, songMode: false },
            groove: {
                genreFeel: 'Disco',
                creativity: true,
                lastDrumPreset: 'Disco',
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

    it('should pass an authenticity critique for a 128-bar Disco performance', () => {
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.75 },
            groove: { creativity: true, genreFeel: 'Disco' },
        });

        let kickFourOnFloor = 0;
        let snareBackbeat = 0;
        let offbeatOpenHats = 0;
        const totalBars = performance.length;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                const s = stepData.loopStep;

                // --- CRITIQUE: Four-on-the-floor (Kick on 0, 4, 8, 12) ---
                if (s % 4 === 0) {
                    if (stepData.instruments.Kick) {
                        kickFourOnFloor++;
                    }
                }

                // --- CRITIQUE: Backbeat (Snare on 4, 12) ---
                if (s === 4 || s === 12) {
                    if (stepData.instruments.Snare) {
                        snareBackbeat++;
                    }
                }

                // --- CRITIQUE: Offbeat Open Hats (steps 2, 6, 10, 14) ---
                if (s % 4 === 2) {
                    if (
                        stepData.instruments.Open ||
                        (stepData.instruments.HiHat && stepData.instruments.HiHat.sound === 'Open')
                    ) {
                        offbeatOpenHats++;
                    }
                }
            });
        });

        const kickScore = kickFourOnFloor / (totalBars * 4);
        const backbeatScore = snareBackbeat / (totalBars * 2);
        const offbeatScore = offbeatOpenHats / (totalBars * 4);

        console.log('\n--- DISCO DRUMMER CRITIQUE REPORT ---');
        console.log(`[Kick 4-on-Floor]       ${(kickScore * 100).toFixed(1)}% (Target: 100%)`);
        console.log(`[Snare Backbeat]        ${(backbeatScore * 100).toFixed(1)}% (Target: >95%)`);
        console.log(`[Offbeat Hat Presence]  ${(offbeatScore * 100).toFixed(1)}% (Target: >40%)`);
        console.log('------------------------------------\n');

        expect(kickScore).toBe(1.0);
        expect(backbeatScore).toBeGreaterThan(0.95);
        expect(offbeatScore).toBeGreaterThan(0.4); // At least Motif 0 plays them 100%, others vary
    });
});
