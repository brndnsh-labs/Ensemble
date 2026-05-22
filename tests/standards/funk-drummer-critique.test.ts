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
                        beatIndex: info.beatIndex,
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
                        (result.soundName === 'Open' || result.soundName?.startsWith('HiHat'))
                    ) {
                        // HiHat-lane articulation overrides: a switch to a full
                        // Open, or to an Epic 4 S3 in-between hat
                        // (HiHatHalf/Quarter — the funk "bark" — or HiHatPedal).
                        // All fold into the HiHat timekeeping slot.
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
                    // A strong hit lands on:
                    //   - a literal backbeat (steps 4, 12), OR
                    //   - the "e" of a backbeat (steps 5, 13 — motif-2
                    //     displacement +1), OR
                    //   - the "&" of a backbeat (steps 6, 14 — motif-2
                    //     displacement +2 / full offbeat shift).
                    // The motif-2 displacement is STRUCTURAL (drums.md P1 #9):
                    // the snare moves for a whole 2-bar phrase, then returns.
                    const onBackbeatTuple = stepData.beatIndex === 1 || stepData.beatIndex === 3;
                    const isStrongCandidate =
                        stepData.isBackbeat ||
                        (onBackbeatTuple && (stepData.isEOfBeat || stepData.isOffbeat));
                    if (isStrongCandidate) {
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

    it('motif-2 backbeat displacement is structural per bar, not stochastic per step', () => {
        // drums.md P1 #9: real funk displacement (Stubblefield, Garibaldi)
        // commits to ONE displacement amount for the whole gesture, then
        // returns. The OLD code used `roll(0.5)` per step which scattered
        // snare hits randomly across {4, 6, 12, 14} within a single bar.
        // Per-bar structural test: within any single bar, the strong snare
        // hits should land at EXACTLY ONE step in each backbeat region —
        // {4 OR 5 OR 6} for beat-1's backbeat, {12 OR 13 OR 14} for beat-3's.
        // Never two simultaneous strong hits in the same backbeat region.
        // (Phrase-level consistency across 2 bars is the engine's contract
        // but is hard to verify from outside since the fixture's per-bar
        // sectionSeed can roll the motif from 2→1→2 mid-phrase. The per-bar
        // assertion is the cleaner test of "structural, not scattered".)
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.8 },
            groove: { creativity: true, genreFeel: 'Funk' },
        });

        const allowedSlots = [4, 5, 6, 12, 13, 14];
        const slotCounts = new Map();
        for (const s of allowedSlots) {
            slotCounts.set(s, 0);
        }
        let barsWithScatterInBackbeatRegion = 0;
        let barsWithBeat1Displacement = 0;
        let barsWithBeat3Displacement = 0;
        let barsWithAnyBackbeat = 0;
        performance.forEach((bar) => {
            const strongInB1Region = [];
            const strongInB3Region = [];
            bar.forEach((stepData) => {
                const snare = stepData.instruments.Snare;
                if (snare && snare.velocity > 0.8) {
                    const s = stepData.loopStep;
                    if (s >= 4 && s <= 6) {
                        strongInB1Region.push(s);
                    } else if (s >= 12 && s <= 14) {
                        strongInB3Region.push(s);
                    }
                    if (allowedSlots.includes(s)) {
                        slotCounts.set(s, (slotCounts.get(s) || 0) + 1);
                    }
                }
            });
            // Scatter check: more than one distinct slot fired within the
            // same backbeat region in the same bar.
            if (new Set(strongInB1Region).size > 1 || new Set(strongInB3Region).size > 1) {
                barsWithScatterInBackbeatRegion++;
            }
            if (strongInB1Region.length > 0 || strongInB3Region.length > 0) {
                barsWithAnyBackbeat++;
            }
            // Displacement counters (any non-{4} hit in b1 region).
            if (strongInB1Region.some((s) => s !== 4)) {
                barsWithBeat1Displacement++;
            }
            if (strongInB3Region.some((s) => s !== 12)) {
                barsWithBeat3Displacement++;
            }
        });

        console.log('\n--- FUNK MOTIF-2 DISPLACEMENT CRITIQUE ---');
        console.log(`[Slot distribution]     ${JSON.stringify([...slotCounts])}`);
        console.log(`[Bars w/ scatter]       ${barsWithScatterInBackbeatRegion}/${numBars}`);
        console.log(`[Bars w/ B1 displaced]  ${barsWithBeat1Displacement}`);
        console.log(`[Bars w/ B3 displaced]  ${barsWithBeat3Displacement}`);
        console.log(`[Bars w/ any backbeat]  ${barsWithAnyBackbeat}`);
        console.log('------------------------------------------\n');

        // CRITICAL: structural means NO scatter. The OLD engine fired
        // `roll(0.5)` per step on every backbeat AND `roll(0.8 * intensity)`
        // on every offbeat — so a single bar could fire vel 1.15 at step 4
        // AND vel 1.1 at step 6. New engine picks one slot per backbeat
        // region per phrase. Engine delivers 0 scattered bars; pinned at 0.
        expect(barsWithScatterInBackbeatRegion).toBe(0);

        // CRITICAL: displacement must actually happen. At intensity 0.8 with
        // creativity:true, motif 2 fires for ~25% of bars (~32 of 128); of
        // those ~60% pick a non-zero displacement bucket → ~19 displaced
        // bars per backbeat region. Threshold pinned at 5 to absorb
        // seed-sample variance from the per-bar sectionSeed cycle.
        expect(barsWithBeat1Displacement).toBeGreaterThanOrEqual(5);
        expect(barsWithBeat3Displacement).toBeGreaterThanOrEqual(5);

        // CRITICAL: most bars still land on canonical {4, 12} — the
        // displacement is an OCCASIONAL gesture (motif-2 minority of bars,
        // and 40% of motif-2 bars also pick the "normal" bucket).
        const normalBackbeatBars =
            barsWithAnyBackbeat - Math.max(barsWithBeat1Displacement, barsWithBeat3Displacement);
        expect(normalBackbeatBars).toBeGreaterThan(barsWithBeat1Displacement);
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
