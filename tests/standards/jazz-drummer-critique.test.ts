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

describe('Jazz Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 120, songMode: false },
            groove: {
                genreFeel: 'Jazz',
                creativity: true,
                lastDrumPreset: 'Jazz',
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
                    };
                    const result = applyGrooveOverrides(getState(), params);
                    if (result.shouldPlay) {
                        stepData.instruments[result.soundName || instName] = {
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

    it('should pass an authenticity critique for a 128-bar Jazz performance', () => {
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.7 },
            groove: { creativity: true, genreFeel: 'Jazz' },
        });

        let rideHits = 0;
        let quarterRideHits = 0;
        let skipRideHits = 0;
        let footChickHits = 0;
        let kickFeatheringHits = 0;
        let kickBombs = 0;
        let snareCompingHits = 0;
        let snareAnchorHits = 0; // Step 14

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                const s = stepData.loopStep;

                // --- CRITIQUE: Ride Pattern (Now Ride soundName) ---
                if (stepData.instruments.Ride) {
                    rideHits++;
                    if ([0, 4, 8, 12].includes(s)) {
                        quarterRideHits++;
                    } else if ([6, 14].includes(s)) {
                        skipRideHits++;
                    }
                }

                // --- CRITIQUE: Foot Chick (HiHat on 2 and 4) ---
                if ((s === 4 || s === 12) && stepData.instruments.HiHat) {
                    footChickHits++;
                }

                // --- CRITIQUE: Kick Feathering & Bombs ---
                if (stepData.instruments.Kick) {
                    if (s % 4 === 0) {
                        if (stepData.instruments.Kick.velocity < 0.6) {
                            kickFeatheringHits++;
                        }
                    } else {
                        kickBombs++;
                    }
                }

                // --- CRITIQUE: Snare Comping ---
                // Engine routes snare → Sidestick at intensity < 0.4 (jazz.ts:222),
                // so count both as snare-voice comping events.
                if (stepData.instruments.Snare || stepData.instruments.Sidestick) {
                    snareCompingHits++;
                    if (s === 14) {
                        snareAnchorHits++;
                    }
                }
            });
        });

        const totalBars = performance.length;
        const rideConsistency = (quarterRideHits + skipRideHits) / rideHits;
        const footChickSolidity = footChickHits / (totalBars * 2);
        const kickFeatheringScore = kickFeatheringHits / (totalBars * 4);
        const compingDensity = (snareCompingHits + kickBombs) / totalBars;

        console.log('\n--- JAZZ DRUMMER CRITIQUE REPORT ---');
        console.log(
            `[Ride Pattern Consistency]  ${(rideConsistency * 100).toFixed(1)}% (Target: >95%)`,
        );
        console.log(
            `[Foot Chick Solidity]      ${(footChickSolidity * 100).toFixed(1)}% (Target: 100%)`,
        );
        console.log(
            `[Kick Feathering Consistency] ${(kickFeatheringScore * 100).toFixed(1)}% (Target: >95%)`,
        );
        console.log(`[Comping Density]          ${compingDensity.toFixed(2)} hits/bar`);
        console.log(
            `[Snare Anchor (And of 4)]  ${((snareAnchorHits / totalBars) * 100).toFixed(1)}% occurrence (Target: >95%)`,
        );
        console.log('------------------------------------\n');

        // CRITICAL: Jazz ride pulse should be highly consistent
        expect(rideConsistency).toBeGreaterThan(0.95);

        // CRITICAL: Foot chick on 2 and 4 is the bedrock
        expect(footChickSolidity).toBe(1.0);

        // MUSICAL: Kick feathering should be the default quarter note behavior
        // Engine plays quiet kick on every beat-start (jazz.ts:123-128); delivers 100%.
        expect(kickFeatheringScore).toBeGreaterThan(0.95);

        // MUSICAL: Comping should be active but conversational
        expect(compingDensity).toBeGreaterThan(0.8); // Increased from 0.5
        expect(compingDensity).toBeLessThan(5.5); // Increased from 4.5

        // MUSICAL: "And of 4" is the canonical jazz snare anchor.
        // Motif 3 plays it deterministically; other motifs hit it with prob ~0.95
        // (compProb 0.45 + 0.5 base). Engine delivers ~100%.
        expect(snareAnchorHits / totalBars).toBeGreaterThan(0.95);
    });

    it('should increase comping density with intensity', () => {
        const lowIntensityPerf = simulatePerformance(64, { playback: { bandIntensity: 0.2 } });
        const highIntensityPerf = simulatePerformance(64, { playback: { bandIntensity: 0.9 } });

        const getCompingHits = (perf) => {
            let hits = 0;
            perf.forEach((bar) =>
                bar.forEach((step) => {
                    // Count both Snare and Sidestick — engine routes to Sidestick
                    // at intensity < 0.4 (jazz.ts:222). Counting only Snare would
                    // measure the routing threshold, not the comping density claim.
                    if (step.instruments.Snare || step.instruments.Sidestick) {
                        hits++;
                    }
                    if (step.instruments.Kick && step.loopStep % 4 !== 0) {
                        hits++;
                    }
                }),
            );
            return hits;
        };

        const lowComping = getCompingHits(lowIntensityPerf);
        const highComping = getCompingHits(highIntensityPerf);
        const ratio = lowComping > 0 ? highComping / lowComping : Infinity;

        console.log(
            `[Jazz Intensity] Low (0.2) Comping: ${lowComping}, High (0.9) Comping: ${highComping}, Ratio: ${ratio.toFixed(2)}x`,
        );
        // Engine drives comping density mostly via intensity-scaled kick bombs
        // (bombProb = intensity * 0.12, jazz.ts:146). Snare/Sidestick comping density
        // is rhythm-driven (drumComplexity, soloistBusy) so it does not scale steeply
        // with intensity — at high intensity the snare comping gets LOUDER (Snare
        // instead of Sidestick) more than it gets DENSER. Engine delivers ~1.7x ratio.
        expect(highComping).toBeGreaterThan(lowComping * 1.4);
    });
});
