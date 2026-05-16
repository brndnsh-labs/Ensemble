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
            `[Metal Critique] Kick Density at Max Intensity: ${(kickDensity * 100).toFixed(1)}% (Target: >85%)`,
        );

        // At intensity 0.95 the motif selector lands on motif 3 or 4 — both fire kick
        // on every 16th (metal.ts:83-86). Engine delivers ~92%.
        expect(kickDensity).toBeGreaterThan(0.85);
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

        console.log(
            `[Metal Critique] Blast Beat segments observed: ${blastBars}/128 bars (Target: >30)`,
        );
        // Engine selects motif 4 (Blast Beat) at intensity > 0.85 when sectionSeed > 0.6
        // (getMotif: picks[0.25,2],[0.6,3], 4). Over 128 random sectionSeeds expected
        // motif-4 bars ≈ 51. Engine delivers ~53. Prior threshold >5 was a no-op.
        expect(blastBars).toBeGreaterThan(30);
    });

    it('should hold the backbeat at moderate intensity (non-blast motifs)', () => {
        // At intensity 0.6, motif selector lands on motif 1, 2, or 3 — none of which
        // override the backbeat. Engine fires snare on every step 4 / 12.
        const numBars = 64;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.6 },
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

        const backbeatScore = backbeatHits / (numBars * 2);
        console.log(
            `[Metal Backbeat] ${(backbeatScore * 100).toFixed(1)}% at intensity 0.6 (Target: 100%)`,
        );
        expect(backbeatScore).toBe(1.0);
    });

    it('should ride eighth-pulse cymbals at high intensity', () => {
        // Engine fires HiHat/Open on every eighth (metal.ts:138). At intensity > 0.75
        // it switches to Ride/Open; at > 0.5 to Open; else HiHat. Density should be
        // ~100% of eighth positions regardless of timbre.
        const numBars = 32;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.9 },
        });
        let cymbalHits = 0;
        const eighthSteps = [0, 2, 4, 6, 8, 10, 12, 14];
        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                if (eighthSteps.includes(stepData.loopStep)) {
                    if (stepData.instruments.HiHat || stepData.instruments.Open) {
                        cymbalHits++;
                    }
                }
            });
        });
        const cymbalScore = cymbalHits / (numBars * 8);
        console.log(
            `[Metal Cymbal Pulse] ${(cymbalScore * 100).toFixed(1)}% eighth coverage at intensity 0.9 (Target: >95%)`,
        );
        expect(cymbalScore).toBeGreaterThan(0.95);
    });

    it('should increase kick density monotonically with intensity', () => {
        // Phase 2 intensity-response check. Engine: motif selector escalates
        // 0 → 1 → 2 → 3 → 4 as intensity rises, each adding more kick hits.
        const lowPerf = simulatePerformance(64, { playback: { bandIntensity: 0.3 } });
        const midPerf = simulatePerformance(64, { playback: { bandIntensity: 0.6 } });
        const highPerf = simulatePerformance(64, { playback: { bandIntensity: 0.95 } });

        const kickCount = (perf) => {
            let h = 0;
            perf.forEach((b) => b.forEach((s) => s.instruments.Kick && h++));
            return h;
        };

        const lowK = kickCount(lowPerf);
        const midK = kickCount(midPerf);
        const highK = kickCount(highPerf);

        console.log(`[Metal Intensity] Kicks 0.3=${lowK} → 0.6=${midK} → 0.95=${highK}`);
        // Motif 0 fires kick on every beat + & of 3 (5/16). Motif 3/4 fire on all 16.
        // Expected ratio high/low ≈ 16/5 ≈ 3.2x. Conservative threshold 2x.
        expect(midK).toBeGreaterThan(lowK);
        expect(highK).toBeGreaterThan(midK);
        expect(highK).toBeGreaterThan(lowK * 2);
    });
});
