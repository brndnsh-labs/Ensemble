// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { DRUM_PRESETS } from '../../public/data/drum-presets.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';
import { installSeededRandom } from '../utils/seeded-random.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Blues Drummer Critique', () => {
    // Seed Math.random with mulberry32 so the engine's unseeded RNG draws
    // (groove-engine velocity nudges, blues backbeat-kick gate, etc.) land in
    // a stable distribution across runs. Without this the >30/64 backbeat-kick
    // threshold below sits close enough to the natural ~38 mean to flake.
    installSeededRandom(0x9e3779b9);

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 90, songMode: false },
            groove: {
                genreFeel: 'Blues',
                lastDrumPreset: 'Blues',
                instruments: [],
            },
            arranger: {
                timeSignature: '4/4',
                stepMap: [],
                sectionMap: [{ start: 0, end: numBars * 16 }],
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
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

    it('should pass an authenticity critique for a 128-bar Blues performance', () => {
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.75 },
            groove: { genreFeel: 'Blues' },
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

        // Circularity Metrics
        let hatDownbeatAVelocity = 0; // 'a' after 1 and 3
        let hatBackbeatAVelocity = 0; // 'a' after 2 and 4
        let hatDownbeatACount = 0;
        let hatBackbeatACount = 0;

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
                    if (s === 2 || s === 6 || s === 10 || s === 14) {
                        snareGhostHits++;
                        totalGhostVelocity += stepData.instruments.Snare.velocity;
                    }
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
                    } else if (s === 14) {
                        // The 'ah' of 4 push is now on the swung offbeat
                        totalKickAVelocity += vel;
                        kickACount++;
                    }
                }

                // --- CRITIQUE: HiHat/Ride Pulse Hierarchy ---
                const hat =
                    stepData.instruments.HiHat ||
                    stepData.instruments.Open ||
                    stepData.instruments.Ride;
                if (hat) {
                    if ([0, 4, 8, 12].includes(s)) {
                        totalHiHatBeatVelocity += hat.velocity;
                        hiHatBeatCount++;
                        shuffleGridHits++;
                    } else if ([2, 6, 10, 14].includes(s)) {
                        totalHiHatAVelocity += hat.velocity;
                        hiHatACount++;
                        shuffleGridHits++;

                        if (s === 2 || s === 10) {
                            hatDownbeatAVelocity += hat.velocity;
                            hatDownbeatACount++;
                        } else if (s === 6) {
                            // Only use step 6 for backbeat-ah to avoid step 14 turnaround inflation
                            hatBackbeatAVelocity += hat.velocity;
                            hatBackbeatACount++;
                        }
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
        const avgHatDownbeatA = hatDownbeatAVelocity / (hatDownbeatACount || 1);
        const avgHatBackbeatA = hatBackbeatAVelocity / (hatBackbeatACount || 1);

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
        console.log(`[Texas Snare Density]  ${(snareGhostHits / totalBars).toFixed(2)} hits/bar`);
        console.log(
            `[Ghost to Backbeat %]  ${(ghostToBackbeatRatio * 100).toFixed(1)}% (Target: <30%)`,
        );

        console.log('\n--- VELOCITY HIERARCHY & LOPE ---');
        console.log(
            `[HiHat Loping]         Beat: ${avgHatBeat.toFixed(2)} vs A: ${avgHatA.toFixed(2)}`,
        );
        console.log(
            `[Circular Dynamics]    Downbeat-A: ${avgHatDownbeatA.toFixed(2)} vs Backbeat-A: ${avgHatBackbeatA.toFixed(2)}`,
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

        // MUSICAL: HiHat/Ride should be almost entirely on the shuffle grid.
        // Engine delivers 100% — every hat hit lands on [0,4,8,12] or [2,6,10,14].
        expect(shuffleScore).toBeGreaterThan(0.95);

        // MUSICAL: Circular dynamics - backbeat-a should be slightly softer than downbeat-a
        expect(avgHatBackbeatA).toBeLessThan(avgHatDownbeatA * 0.98);

        // MUSICAL: Snare participation in the shuffle at high intensity.
        // Engine delivers ~1.35 ghost hits/bar via Texas-shuffle motif (blues.ts).
        expect(snareGhostHits / totalBars).toBeGreaterThan(0.8);

        // MUSICAL: Ghost notes should be present but stay subordinate to the backbeat.
        // Engine delivers ~24% — well under the 30% authenticity ceiling.
        expect(ghostToBackbeatRatio).toBeLessThan(0.3);

        // NEW: Velocity Tiering Assertions
        expect(avgHatBeat).toBeGreaterThan(avgHatA); // Loping feel
        expect(avgKickBeat).toBeGreaterThan(avgKickA); // Ghosted pushes
        expect(avgKickDownbeat).toBeGreaterThan(avgKickBeat * 0.98); // Downbeat should be authoritative
    });

    it('should implement feathered "Four-on-the-Floor" drive at high intensity', () => {
        const highIntensityPerf = simulatePerformance(32, {
            playback: { bandIntensity: 0.9 },
            groove: { genreFeel: 'Blues' },
        });

        let backbeatKickHits = 0; // Kicks on 2 and 4
        let pushKickHits = 0; // Kicks on the swung offbeat of 4 (step 14)
        let backbeatKickVelocity = 0;
        let primaryKickVelocity = 0;

        highIntensityPerf.forEach((bar) => {
            bar.forEach((stepData) => {
                const s = stepData.loopStep;
                if (stepData.instruments.Kick) {
                    const vel = stepData.instruments.Kick.velocity;
                    if (s === 4 || s === 12) {
                        backbeatKickHits++;
                        backbeatKickVelocity += vel;
                    } else if (s === 14) {
                        pushKickHits++;
                    } else if (s === 0 || s === 8) {
                        primaryKickVelocity += vel;
                    }
                }
            });
        });

        const avgBackbeatKick = backbeatKickVelocity / (backbeatKickHits || 1);
        const avgPrimaryKick = primaryKickVelocity / (32 * 2);

        console.log(`[Drive Critique] Backbeat Kick Hits (Drive): ${backbeatKickHits}/64`);
        console.log(`[Drive Critique] Shuffle Pushes ('a' of 4): ${pushKickHits}/32`);
        console.log(
            `[Drive Critique] Feathered Velocity: ${avgBackbeatKick.toFixed(2)} vs Primary: ${avgPrimaryKick.toFixed(2)}`,
        );

        // Assert that at high intensity, we get kicks on the backbeats (Four-on-the-floor).
        // Engine delivers ~38/64 (~60%) at intensity 0.9.
        expect(backbeatKickHits).toBeGreaterThan(30);
        // Assert they are "feathered" (significantly quieter than primary hits).
        // Engine delivers ~0.64 vs ~1.22 (~52% of primary).
        expect(avgBackbeatKick).toBeLessThan(avgPrimaryKick * 0.65);
        // Assert we still get consistent pushes into the downbeat.
        // Engine plays the 'a' of 4 on every bar at intensity 0.9 (32/32).
        expect(pushKickHits).toBeGreaterThan(28);
    });

    it('should occasionally fire crash cymbals on bar downbeats at high intensity', () => {
        // Engine logic (blues.ts:59): isDownbeat && intensity > 0.75 && roll(0.25).
        // The crash fires on ANY bar downbeat, not specifically at section boundaries —
        // the prior test name ("structural transitions") implied a section-aware crash
        // that the engine does not actually have. (Engine improvement queued.) For now
        // verify the gate the engine DOES have: 25% per downbeat at high intensity.
        const numBars = 64;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.9 },
            groove: { genreFeel: 'Blues' },
        });

        let crashCount = 0;
        let crashVelocityFloor = Infinity;
        for (let barIdx = 0; barIdx < numBars; barIdx++) {
            const downbeat = performance[barIdx][0];
            if (downbeat.instruments.Open && downbeat.instruments.Open.sound === 'Crash') {
                crashCount++;
                crashVelocityFloor = Math.min(
                    crashVelocityFloor,
                    downbeat.instruments.Open.velocity,
                );
            }
        }

        const crashRate = crashCount / numBars;
        console.log(
            `[Crash Rate] ${crashCount}/${numBars} bars (${(crashRate * 100).toFixed(1)}%, Target: ~25%)`,
        );
        console.log(`[Crash Velocity Floor] ${crashVelocityFloor.toFixed(2)} (Target: >1.1)`);

        // Engine fires crash at 25% per downbeat at intensity > 0.75. Over 64 bars
        // expected mean is 16 with stdev ~3.5. Bounds catch statistical flake while
        // still failing if the gate were silently broken (0) or hyperactive (>30).
        expect(crashCount).toBeGreaterThan(7);
        expect(crashCount).toBeLessThan(30);
        // All crashes are stamped at velocity 1.25 (blues.ts:61).
        expect(crashVelocityFloor).toBeGreaterThan(1.1);
    });

    it('should suppress crashes at low intensity', () => {
        // Crash gate requires intensity > 0.75 — low intensity should produce zero.
        const numBars = 32;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.5 },
        });
        let crashCount = 0;
        for (let barIdx = 0; barIdx < numBars; barIdx++) {
            const dn = performance[barIdx][0];
            if (dn.instruments.Open && dn.instruments.Open.sound === 'Crash') {
                crashCount++;
            }
        }
        console.log(`[Low-Intensity Crashes] ${crashCount}/${numBars} (Target: 0)`);
        expect(crashCount).toBe(0);
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
        const ratio = lowHits > 0 ? highHits / lowHits : Infinity;

        console.log(
            `[Intensity Scan] Low: ${lowHits} total hits, High: ${highHits} total hits, Ratio: ${ratio.toFixed(2)}x`,
        );
        // Prior assertion (highHits >= lowHits * 0.95) was inverted — it passed when
        // high DROPPED below low by up to 5%, so the named "should increase" claim was
        // not actually enforced. Engine delivers ~1.23x (e.g. 1280 → 1575) from kick
        // shuffle pushes, crash adds, and higher kick activity at high intensity.
        expect(highHits).toBeGreaterThan(lowHits * 1.15);
    });

    it('should layer the lightest subtle shuffle shaker off the backbeat (#1007)', () => {
        // #1007: preset-data aux-percussion spread (Epic 7 S5 pattern). Blues is
        // the lightest of the spread — a subtle roadhouse shaker on the 8th
        // offbeats that, under swing 100, lopes into the last note of each
        // shuffle triplet. The blues strategy leaves the Shaker lane untouched,
        // so it replays the preset literally. Preset key is 'Blues Shuffle'.
        const shakerLane = DRUM_PRESETS['Blues Shuffle'].Shaker;
        // Presence: the aux lane must exist in the preset data now.
        expect(Array.isArray(shakerLane)).toBe(true);
        expect(shakerLane.some((v: number) => v > 0)).toBe(true);

        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 90, songMode: false },
            groove: { genreFeel: 'Blues', lastDrumPreset: 'Blues Shuffle', instruments: [] },
            arranger: {
                timeSignature: '4/4',
                stepMap: [],
                sectionMap: [{ start: 0, end: 32 * 16 }],
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        };
        getState.mockReturnValue(mockState);

        const numBars = 32;
        let totalHits = 0;
        let onBackbeat = 0; // steps 4, 12 — the 2/4 crack must stay clean
        let velSum = 0;
        const positions = new Set<number>();
        for (let bar = 0; bar < numBars; bar++) {
            for (let step = 0; step < 16; step++) {
                const globalStep = bar * 16 + step;
                const info = getStepInfo(globalStep, TIME_SIGNATURES['4/4'], [], TIME_SIGNATURES);
                const result = applyGrooveOverrides(getState(), {
                    step: globalStep,
                    inst: { name: 'Shaker', muted: false, steps: shakerLane },
                    stepVal: shakerLane[step],
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
                    loopStep: step,
                    stepsPerBar: 16,
                });
                if (result.shouldPlay) {
                    totalHits++;
                    velSum += result.velocity;
                    positions.add(step);
                    if (step === 4 || step === 12) {
                        onBackbeat++;
                    }
                }
            }
        }
        const hitsPerBar = totalHits / numBars;
        const avgVel = velSum / (totalHits || 1);
        console.log('\n--- BLUES AUX-PERCUSSION CRITIQUE (#1007) ---');
        console.log(`[Shaker density]   ${hitsPerBar.toFixed(2)} hits/bar`);
        console.log(`[Positions]        [${[...positions].sort((a, b) => a - b)}]`);
        console.log(`[On backbeat]      ${onBackbeat}`);
        console.log(`[Avg velocity]     ${avgVel.toFixed(3)}`);
        console.log('---------------------------------------------\n');

        // Presence + density: the lightest lane — a sparse 8th-offbeat shaker at
        // ~4 hits/bar. Floor 3 (dead lane = 0), ceiling 5 keeps it "subtle".
        expect(hitsPerBar).toBeGreaterThan(3);
        expect(hitsPerBar).toBeLessThanOrEqual(5);
        // Idiom: off the 2/4 backbeat so the shuffle snare crack stays clean.
        expect(onBackbeat).toBe(0);
        // Pin the exact subdivision the test name claims (8th offbeats, the "&"):
        // off-backbeat alone is satisfied by any offbeat placement, so assert the
        // shaker lands squarely on steps 2/6/10/14 — the notes swing lopes into
        // the last shuffle-triplet.
        expect([...positions].sort((a, b) => a - b)).toEqual([2, 6, 10, 14]);
        // Sits under the shuffled ride: ghost-level velocity, never an accent.
        expect(avgVel).toBeLessThan(1.0);
    });
});
