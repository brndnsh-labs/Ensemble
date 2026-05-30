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

describe('Neo-Soul Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 90, songMode: false },
            groove: {
                genreFeel: 'Neo-Soul',
                lastDrumPreset: 'Neo-Soul',
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

        console.log(
            `[Neo-Soul Critique] Avg Snare Drag: ${avgSnareDrag.toFixed(4)}s (Target: >0.010s)`,
        );
        console.log(
            `[Neo-Soul Critique] Avg Hat Push:   ${avgHatPush.toFixed(4)}s (Target: <-0.012s)`,
        );
        console.log(
            `[Neo-Soul Critique] Pocket Width:   ${pocketWidth.toFixed(4)}s (Target: >0.025s)`,
        );

        // Engine sets snareDrag = 0.006 + intensity*0.012. At intensity 0.8 = 0.0156s.
        // Drunken jitter on backbeats has multiplier 0.3 → ±0.003. Floor 0.010 leaves
        // ~5ms headroom against engine deterministic delivery.
        expect(avgSnareDrag).toBeGreaterThan(0.01);
        // Engine sets hiHatPush = -0.008 - intensity*0.012. At intensity 0.8 = -0.0176s
        // before phrase-seed micro-adjustments. Observed avg ~-0.0154s.
        expect(avgHatPush).toBeLessThan(-0.012);
        // Combined width characterizes the "behind the beat" feel that defines D'Angelo
        // / Questlove pockets. Engine delivers ~0.030s at intensity 0.8.
        expect(pocketWidth).toBeGreaterThan(0.025);
    });

    it('should pass ghost note density targets at high intensity', () => {
        const performance = simulatePerformance(128, {
            playback: { bandIntensity: 0.9 },
            groove: { genreFeel: 'Neo-Soul' },
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

        console.log(
            `[Neo-Soul Critique] Snare Ghost Density: ${ghostDensity.toFixed(2)} hits/bar (Target: >2.0)`,
        );
        // Engine fires ghost on `isAOfBeat` for motifs 1 & 3 (every 'a' of every beat
        // when those motifs are active). At intensity 0.9 & high seed range motifs 1/3
        // dominate; engine delivers ~2.8/bar.
        expect(ghostDensity).toBeGreaterThan(2.0);
    });

    it('should hold backbeat snare on every bar at moderate-to-high intensity', () => {
        // All four motifs play snare on backbeats. Intensity must be >= 0.35 to avoid
        // the sidestick routing; we run at 0.7 to sit well above all gates.
        const numBars = 64;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.7 },
        });
        let backbeatHits = 0;
        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                const s = stepData.loopStep;
                if ((s === 4 || s === 12) && stepData.instruments.Snare) {
                    backbeatHits++;
                }
            });
        });
        const score = backbeatHits / (numBars * 2);
        console.log(
            `[Neo-Soul Backbeat] ${(score * 100).toFixed(1)}% at intensity 0.7 (Target: 100%)`,
        );
        expect(score).toBe(1.0);
    });

    it('should route snare to sidestick below intensity 0.35', () => {
        // Engine routes snare → sidestick when intensity < INTENSITY_BANDS.LOW (0.35).
        // Verify the timbre escalation lane fires.
        const numBars = 32;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.3 },
        });
        let snareCount = 0;
        let sidestickCount = 0;
        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                const snare = stepData.instruments.Snare;
                if (snare) {
                    if (snare.sound === 'Sidestick') {
                        sidestickCount++;
                    } else {
                        snareCount++;
                    }
                }
            });
        });
        console.log(
            `[Neo-Soul Low-Intensity Routing] Sidestick: ${sidestickCount}, Snare: ${snareCount} (Target: Sidestick dominates)`,
        );
        expect(sidestickCount).toBeGreaterThan(0);
        // Sidestick should be the dominant snare voice at intensity 0.3.
        expect(sidestickCount).toBeGreaterThan(snareCount);
    });

    it('should widen the pocket monotonically with intensity', () => {
        // Phase 2 intensity check. Engine: snareDrag = 0.006 + intensity*0.012 and
        // hiHatPush = -0.008 - intensity*0.012. Pocket width should scale with
        // intensity from ~0.014s at 0.0 to ~0.038s at 1.0.
        const measureWidth = (intensityValue) => {
            const perf = simulatePerformance(32, {
                playback: { bandIntensity: intensityValue },
            });
            let dragSum = 0;
            let dragCount = 0;
            let pushSum = 0;
            let pushCount = 0;
            perf.forEach((bar) =>
                bar.forEach((stepData) => {
                    const snare = stepData.instruments.Snare;
                    const hat = stepData.instruments.HiHat;
                    if (snare && snare.offset > 0) {
                        dragSum += snare.offset;
                        dragCount++;
                    }
                    if (hat && hat.offset < 0) {
                        pushSum += hat.offset;
                        pushCount++;
                    }
                }),
            );
            return dragSum / (dragCount || 1) - pushSum / (pushCount || 1);
        };

        const lowWidth = measureWidth(0.4);
        const highWidth = measureWidth(0.95);
        console.log(
            `[Neo-Soul Pocket Scaling] Low (0.4): ${lowWidth.toFixed(4)}s → High (0.95): ${highWidth.toFixed(4)}s`,
        );
        // Engine adds ~0.024s of additional drag+push spread between intensity 0.4
        // and 0.95. Threshold >1.3x catches the scaling even under jitter.
        expect(highWidth).toBeGreaterThan(lowWidth * 1.3);
    });
});
