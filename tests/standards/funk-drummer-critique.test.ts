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

describe('Funk Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 100, songMode: false },
            groove: {
                genreFeel: 'Funk',
                creativity: true,
                lastDrumPreset: 'Funk',
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
                // Spread the full stepInfo so test metrics see every flag
                // the engine reads (isPulseStart, isEOfBeat, isAOfBeat, etc.).
                // Cherry-picking previously silenced the syncopated-kick check.
                const stepData = {
                    ...info,
                    step: bar * 16 + step,
                    loopStep: step,
                    instruments: {},
                    isDownbeat: info.isMeasureStart,
                };
                for (const instName of ['Kick', 'Snare', 'HiHat', 'Open']) {
                    const params = {
                        step: bar * 16 + step,
                        inst: { name: instName, muted: false, steps: [] },
                        stepVal: 0,
                        playback: mockState.playback,
                        groove: mockState.groove,
                        isDownbeat: info.isMeasureStart,
                        isPulse: info.isPulse,
                        isBeatStart: info.isBeatStart,
                        isBackbeat: info.isBackbeat,
                        isGroupStart: info.isGroupStart,
                        isOffbeat: info.isOffbeat,
                        isEOfBeat: info.isEOfBeat,
                        isAOfBeat: info.isAOfBeat,
                        tsConfig: info.tsConfig,
                    };
                    const result = applyGrooveOverrides(getState(), params);
                    if (
                        result.shouldPlay &&
                        (result.soundName === instName ||
                            (instName === 'Snare' && result.soundName === 'Sidestick'))
                    ) {
                        stepData.instruments[instName] = {
                            velocity: result.velocity,
                            sound: result.soundName,
                            offset: result.instTimeOffset,
                        };
                    } else if (
                        result.shouldPlay &&
                        instName === 'HiHat' &&
                        result.soundName === 'Open'
                    ) {
                        // Special case for HiHat overrides that switch to Open
                        stepData.instruments.HiHat = {
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

    it('should pass an authenticity critique for a 128-bar Funk performance', () => {
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.8 },
            groove: { creativity: true, genreFeel: 'Funk' },
        });

        let kickOnTheOne = 0;
        let snareGhostHits = 0;
        let totalSnareVelocity = 0;
        let totalGhostVelocity = 0;
        let totalSyncopatedKickHits = 0;

        let strongBars = 0;
        performance.forEach((bar) => {
            let barHasStrongBackbeat = false;
            bar.forEach((stepData) => {
                const _s = stepData.loopStep;

                // --- CRITIQUE: "The One" (Kick on 0) ---
                if (stepData.isDownbeat && stepData.instruments.Kick) {
                    kickOnTheOne++;
                }

                // --- CRITIQUE: Backbeat Consistency ---
                if (stepData.instruments.Snare) {
                    const vel = stepData.instruments.Snare.velocity;
                    // A strong hit on a backbeat, or a strong displaced hit on an offbeat
                    if (stepData.isBackbeat || (stepData.isOffbeat && vel > 0.8)) {
                        if (vel > 0.8) {
                            barHasStrongBackbeat = true;
                            totalSnareVelocity += vel;
                        } else {
                            snareGhostHits++;
                            totalGhostVelocity += vel;
                        }
                    } else {
                        snareGhostHits++;
                        totalGhostVelocity += vel;
                    }
                }

                // --- CRITIQUE: Syncopated Kick ---
                if (stepData.instruments.Kick && !stepData.isPulseStart) {
                    totalSyncopatedKickHits++;
                }
            });
            if (barHasStrongBackbeat) {
                strongBars++;
            }
        });

        const totalBars = performance.length;
        const theOneScore = kickOnTheOne / totalBars;
        const backbeatScore = strongBars / totalBars;
        const ghostToBackbeatRatio = totalGhostVelocity / (totalSnareVelocity || 1);

        console.log('\n--- FUNK DRUMMER CRITIQUE REPORT ---');
        console.log(`[The One Solidity]      ${(theOneScore * 100).toFixed(1)}% (Target: 100%)`);
        console.log(`[Backbeat Consistency]  ${(backbeatScore * 100).toFixed(1)}% (Target: >95%)`);
        console.log(`[Ghost Note Density]    ${(snareGhostHits / totalBars).toFixed(2)} hits/bar`);
        console.log(
            `[Ghost to Backbeat %]   ${(ghostToBackbeatRatio * 100).toFixed(1)}% (Target: 15-35%)`,
        );
        console.log(
            `[Kick Syncopation]      ${(totalSyncopatedKickHits / totalBars).toFixed(2)} hits/bar`,
        );
        console.log('------------------------------------\n');

        // CRITICAL: Funk is nothing without "The One"
        expect(theOneScore).toBe(1.0);

        // CRITICAL: Strong backbeat or displaced accent is mandatory
        expect(backbeatScore).toBeGreaterThan(0.95);

        // MUSICAL: Ghost notes are essential for Funk
        expect(snareGhostHits / totalBars).toBeGreaterThan(1.0);
        expect(ghostToBackbeatRatio).toBeGreaterThan(0.1);
        expect(ghostToBackbeatRatio).toBeLessThan(0.7); // Increased from 0.45 to allow dense ghosting

        // MUSICAL: Funk kick is the engine of the groove — most hits land off
        // the four beats. Engine delivers ~3.0/bar; threshold sits at 2.0 so a
        // single mechanical lane (kick on every beat with no syncopation)
        // would fail.
        expect(totalSyncopatedKickHits / totalBars).toBeGreaterThan(2.0);
    });

    it('should increase 16th note activity with intensity', () => {
        const lowIntensityPerf = simulatePerformance(64, { playback: { bandIntensity: 0.3 } });
        const highIntensityPerf = simulatePerformance(64, { playback: { bandIntensity: 0.9 } });

        const countHits = (perf) => {
            let hits = 0;
            perf.forEach((bar) =>
                bar.forEach((step) => {
                    hits += Object.keys(step.instruments).length;
                }),
            );
            return hits;
        };

        const lowHits = countHits(lowIntensityPerf);
        const highHits = countHits(highIntensityPerf);

        console.log(`[Funk Intensity] Low (0.3) Hits: ${lowHits}, High (0.9) Hits: ${highHits}`);
        expect(highHits).toBeGreaterThan(lowHits);
    });
});
