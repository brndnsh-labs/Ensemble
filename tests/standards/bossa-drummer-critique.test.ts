// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

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
                lastDrumPreset: 'Bossa Nova',
                instruments: [],
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
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
                        isPulse: info.isPulse,
                        isPulseStart: info.isPulseStart,
                        isBackbeat: info.isBackbeat,
                        isGroupStart: info.isGroupStart,
                        beatIndex: info.beatIndex,
                        isOffbeat: info.isOffbeat,
                        isEOfBeat: info.isEOfBeat,
                        isAOfBeat: info.isAOfBeat,
                        tsConfig: info.tsConfig,
                        mStep: info.mStep,
                        isCompound: info.isCompound,
                        stepInGroup: info.stepInGroup,
                        groupIndex: info.groupIndex,
                        isTurnaround: false,
                        stepsPerBar: 16,
                        loopStep: info.mStep,
                        sectionStep: bar * 16 + step,
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

    it('should implement an authentic 3-2 son clave pattern', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.5 } });

        // Authentic 3-2 son clave on a 16th-note grid:
        //   3-side (odd bars): steps 0, 6, 12   → "X.....X.....X..."
        //   2-side (even bars): steps 4, 8      → "....X...X......."
        const threeSide = new Set([0, 6, 12]);
        const twoSide = new Set([4, 8]);

        const renderPattern = (bar) => {
            let p = '';
            for (let s = 0; s < 16; s++) {
                p += bar[s].instruments.Snare ? 'X' : '.';
            }
            return p;
        };

        console.log(`[Bossa Critique] Bar 1 Clave: ${renderPattern(performance[0])}`);
        console.log(`[Bossa Critique] Bar 2 Clave: ${renderPattern(performance[1])}`);

        // Verify the 2-bar clave is stable across all 16 bars (no drift, no skipped hits)
        let threeSideHits = 0;
        let twoSideHits = 0;
        let threeSideStrays = 0; // hits on 3-side bars at non-clave positions
        let twoSideStrays = 0;

        for (let bar = 0; bar < performance.length; bar++) {
            const isThreeSide = bar % 2 === 0;
            for (let s = 0; s < 16; s++) {
                const hit = !!performance[bar][s].instruments.Snare;
                if (!hit) {
                    continue;
                }
                if (isThreeSide) {
                    if (threeSide.has(s)) {
                        threeSideHits++;
                    } else {
                        threeSideStrays++;
                    }
                } else {
                    if (twoSide.has(s)) {
                        twoSideHits++;
                    } else {
                        twoSideStrays++;
                    }
                }
            }
        }

        const threeSideBars = Math.ceil(performance.length / 2);
        const twoSideBars = Math.floor(performance.length / 2);

        // CRITICAL: every 3-side bar contributes exactly 3 clave hits, every 2-side bar contributes 2.
        // No strays at intensity 0.5 (embellishment gate is drumComplexity > 0.7 && intensity > 0.6).
        expect(threeSideHits).toBe(threeSideBars * 3);
        expect(twoSideHits).toBe(twoSideBars * 2);
        expect(threeSideStrays).toBe(0);
        expect(twoSideStrays).toBe(0);
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
