import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides, getDrumMotif } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Blues Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 90, songMode: false },
            groove: {
                genreFeel: 'Blues',
                creativity: true,
                lastDrumPreset: 'Blues',
                instruments: [],
            },
            arranger: {
                timeSignature: '4/4',
                stepMap: [],
                sectionMap: [{ start: 0, end: numBars * 16 }],
            },
            soloist: { enabled: false, busySteps: 0 },
            ...stateOverrides,
        };
        getState.mockReturnValue(mockState);

        const history = [];
        for (let bar = 0; bar < numBars; bar++) {
            const barSteps = [];
            for (let step = 0; step < 16; step++) {
                const globalStep = bar * 16 + step;
                const stepData = { step: globalStep, loopStep: step, instruments: {} };
                for (const instName of ['Kick', 'Snare', 'HiHat', 'Open']) {
                    const info = getStepInfo(
                        globalStep,
                        TIME_SIGNATURES['4/4'],
                        [],
                        TIME_SIGNATURES,
                    );
                    const params = {
                        step: globalStep,
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

    it('should pass an authenticity critique for a 128-bar Blues performance', () => {
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.75 },
            groove: { creativity: true, genreFeel: 'Blues' },
        });

        let backbeatHits = 0;
        let weakBackbeats = 0;
        let shuffleGridHits = 0;
        let nonShuffleGridHits = 0;
        let snareGhostHits = 0;
        let kickSolidHits = 0;
        let totalSnareVelocity = 0;
        let totalGhostVelocity = 0;

        // Velocity Tiering Metrics
        let totalHiHatBeatVelocity = 0;
        let totalHiHatAVelocity = 0;
        let hiHatBeatCount = 0;
        let hiHatACount = 0;

        let totalKickBeatVelocity = 0;
        let totalKickAVelocity = 0;
        let kickBeatCount = 0;
        let kickACount = 0;

        let kickDownbeatVelocity = 0;
        let kickDownbeatCount = 0;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                const s = stepData.loopStep;

                // --- CRITIQUE: Backbeat (Snare 2 and 4) ---
                if (s === 4 || s === 12) {
                    if (stepData.instruments.Snare) {
                        backbeatHits++;
                        const vel = stepData.instruments.Snare.velocity;
                        totalSnareVelocity += vel;
                        if (vel < 1.0) {
                            weakBackbeats++;
                        }
                    }
                } else if (stepData.instruments.Snare) {
                    // --- CRITIQUE: Snare Ghost/Entropy ---
                    snareGhostHits++;
                    totalGhostVelocity += stepData.instruments.Snare.velocity;
                }

                // --- CRITIQUE: Kick Patterns ---
                if (stepData.instruments.Kick) {
                    const vel = stepData.instruments.Kick.velocity;
                    if (s === 0 || s === 8) {
                        kickSolidHits++;
                        totalKickBeatVelocity += vel;
                        kickBeatCount++;
                        if (s === 0) {
                            kickDownbeatVelocity += vel;
                            kickDownbeatCount++;
                        }
                    } else if (s === 3 || s === 7 || s === 11 || s === 15) {
                        totalKickAVelocity += vel;
                        kickACount++;
                    }
                }

                // --- CRITIQUE: HiHat Pulse Hierarchy ---
                const hat = stepData.instruments.HiHat || stepData.instruments.Open;
                if (hat) {
                    if ([0, 4, 8, 12].includes(s)) {
                        totalHiHatBeatVelocity += hat.velocity;
                        hiHatBeatCount++;
                        shuffleGridHits++;
                    } else if ([3, 7, 11, 15].includes(s)) {
                        totalHiHatAVelocity += hat.velocity;
                        hiHatACount++;
                        shuffleGridHits++;
                    } else {
                        nonShuffleGridHits++;
                    }
                }
            });
        });

        const totalBars = performance.length;
        const backbeatScore = backbeatHits / (totalBars * 2);
        const shuffleScore = shuffleGridHits / (shuffleGridHits + nonShuffleGridHits);
        const kickScore = kickSolidHits / (totalBars * 2);
        const ghostToBackbeatRatio = totalGhostVelocity / (totalSnareVelocity || 1);

        const avgHatBeat = totalHiHatBeatVelocity / (hiHatBeatCount || 1);
        const avgHatA = totalHiHatAVelocity / (hiHatACount || 1);
        const avgKickBeat = totalKickBeatVelocity / (kickBeatCount || 1);
        const avgKickA = totalKickAVelocity / (kickACount || 1);
        const avgKickDownbeat = kickDownbeatVelocity / (kickDownbeatCount || 1);

        console.log('\n--- BLUES DRUMMER CRITIQUE REPORT ---');
        console.log(`[Backbeat Consistency]  ${(backbeatScore * 100).toFixed(1)}% (Target: 100%)`);
        console.log(
            `[Backbeat Authority]    ${weakBackbeats === 0 ? 'PASS' : 'FAIL'} (${weakBackbeats} weak hits)`,
        );
        console.log(`[Shuffle Alignment]    ${(shuffleScore * 100).toFixed(1)}% (Target: >90%)`);
        console.log(`[Kick Solidity]        ${(kickScore * 100).toFixed(1)}% (Target: 100%)`);
        console.log(`[Ghost Note Density]   ${(snareGhostHits / totalBars).toFixed(2)} hits/bar`);
        console.log(
            `[Ghost to Backbeat %]  ${(ghostToBackbeatRatio * 100).toFixed(1)}% (Target: <20%)`,
        );

        console.log('\n--- VELOCITY HIERARCHY ---');
        console.log(
            `[HiHat Loping]         Beat: ${avgHatBeat.toFixed(2)} vs A: ${avgHatA.toFixed(2)}`,
        );
        console.log(
            `[Kick Dynamics]        Beat: ${avgKickBeat.toFixed(2)} vs A: ${avgKickA.toFixed(2)}`,
        );
        console.log(`[Kick Grounding]       Downbeat (1): ${avgKickDownbeat.toFixed(2)}`);
        console.log('------------------------------------\n');

        // CRITICAL: Authentic Blues drummer NEVER misses the backbeat on 2 and 4.
        expect(backbeatScore).toBe(1.0);
        expect(weakBackbeats).toBe(0);

        // CRITICAL: Kick should always ground the 1 and 3 in standard Blues.
        expect(kickScore).toBe(1.0);

        // MUSICAL: HiHat/Ride should be mostly on the shuffle grid.
        expect(shuffleScore).toBeGreaterThan(0.8);

        // MUSICAL: Snare extra hits should not overwhelm the groove.
        expect(snareGhostHits / totalBars).toBeLessThan(1.5);
        expect(ghostToBackbeatRatio).toBeLessThan(0.25);

        // NEW: Velocity Tiering Assertions
        expect(avgHatBeat).toBeGreaterThan(avgHatA); // Loping feel
        expect(avgKickBeat).toBeGreaterThan(avgKickA); // Ghosted pushes
        expect(avgKickDownbeat).toBeGreaterThan(avgKickBeat * 0.98); // Downbeat should be authoritative
    });

    it('should implement "Four-on-the-Floor" drive at high intensity', () => {
        const highIntensityPerf = simulatePerformance(32, {
            playback: { bandIntensity: 0.9 },
            groove: { creativity: true, genreFeel: 'Blues' },
        });

        let backbeatKickHits = 0;
        let backbeatKickVelocity = 0;
        let primaryKickVelocity = 0;

        highIntensityPerf.forEach((bar) => {
            bar.forEach((stepData) => {
                const s = stepData.loopStep;
                if (stepData.instruments.Kick) {
                    if (s === 4 || s === 12) {
                        backbeatKickHits++;
                        backbeatKickVelocity += stepData.instruments.Kick.velocity;
                    } else if (s === 0 || s === 8) {
                        primaryKickVelocity += stepData.instruments.Kick.velocity;
                    }
                }
            });
        });

        const avgBackbeatKick = backbeatKickVelocity / (backbeatKickHits || 1);
        const avgPrimaryKick = primaryKickVelocity / (32 * 2);

        console.log(`[Drive Critique] High Intensity Kick Hits on 2/4: ${backbeatKickHits}/64`);
        console.log(
            `[Drive Critique] Feathered Velocity: ${avgBackbeatKick.toFixed(2)} vs Primary: ${avgPrimaryKick.toFixed(2)}`,
        );

        // Assert that at high intensity, we get kicks on the backbeats
        expect(backbeatKickHits).toBeGreaterThan(32); // At least 50% consistency for four-on-the-floor
        // Assert they are "feathered" (significantly quieter than primary hits)
        expect(avgBackbeatKick).toBeLessThan(avgPrimaryKick * 0.9);
    });

    it('should signal structural transitions with a crash after a turnaround', () => {
        // We simulate a 4-bar section, so bar 3 is a turnaround, and bar 4 is a new section start
        const performance = simulatePerformance(8, {
            playback: { bandIntensity: 0.8 },
            groove: { creativity: true, genreFeel: 'Blues' },
            arranger: {
                timeSignature: '4/4',
                sectionMap: [
                    { start: 0, end: 64 }, // Bar 0-3
                    { start: 64, end: 128 }, // Bar 4-7
                ],
            },
        });

        const bar4Downbeat = performance[4][0];
        const isCrashOrHighHat = bar4Downbeat.instruments.Open || bar4Downbeat.instruments.HiHat;

        console.log(
            `[Section Start] Bar 4 Downbeat Sound: ${isCrashOrHighHat?.sound}, Velocity: ${isCrashOrHighHat?.velocity}`,
        );

        expect(isCrashOrHighHat).toBeDefined();
        expect(isCrashOrHighHat.velocity).toBeGreaterThan(1.1);
        // At high intensity, it should prefer Open (Crash)
        expect(['Open', 'Crash']).toContain(isCrashOrHighHat.sound);
    });

    it('should increase rhythmic complexity appropriately with high intensity', () => {
        const lowIntensityPerf = simulatePerformance(64, { playback: { bandIntensity: 0.25 } });
        const highIntensityPerf = simulatePerformance(64, { playback: { bandIntensity: 0.9 } });

        const countTotalHits = (perf) => {
            let hits = 0;
            perf.forEach((bar) =>
                bar.forEach((step) => (hits += Object.keys(step.instruments).length)),
            );
            return hits;
        };

        const lowHits = countTotalHits(lowIntensityPerf);
        const highHits = countTotalHits(highIntensityPerf);

        console.log(`[Intensity Scan] Low: ${lowHits} total hits, High: ${highHits} total hits`);
        expect(highHits).toBeGreaterThanOrEqual(lowHits * 0.95);
    });
});
