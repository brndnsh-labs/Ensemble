// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';
import { sectionSweepArranger } from '../utils/groove-seed.js';

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
                lastDrumPreset: 'Jazz',
                instruments: [],
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
            // #791: each bar is its own section, so the engine's now-sticky
            // sectionSeed sweeps the motif vocabulary across the run
            // deterministically (restoring the per-bar motif variety the old
            // Math-formula fallback gave, but reproducibly).
            arranger: sectionSweepArranger(numBars),
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
            groove: { genreFeel: 'Jazz' },
        });

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
                    if ([0, 4, 8, 12].includes(s)) {
                        quarterRideHits++;
                    } else if ([6, 14].includes(s)) {
                        skipRideHits++;
                    }
                }

                // --- CRITIQUE: Foot Chick (pedal hi-hat on 2 and 4) ---
                // why: synth-audit Epic 4 S3 gave the foot chick its own
                // `HiHatPedal` articulation — the bedrock 2-and-4 pedal close
                // is now a real pedal voice, not a stick-closed `HiHat`.
                if ((s === 4 || s === 12) && stepData.instruments.HiHatPedal) {
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
        // Honest occupancy metrics — NOT the old `(quarter+skip)/rideHits`
        // tautology, which is identically 1.0 because rideHits only ever counts
        // the {0,4,8,12,6,14} positions it then re-buckets (a silently-removed
        // ride lane still scored 100%). Measure each lane against the number of
        // slots it COULD fill: 4 quarter-note slots/bar and 2 skip slots/bar.
        const quarterRideOccupancy = quarterRideHits / (totalBars * 4);
        const skipRideOccupancy = skipRideHits / (totalBars * 2);
        const footChickSolidity = footChickHits / (totalBars * 2);
        const kickFeatheringScore = kickFeatheringHits / (totalBars * 4);
        const compingDensity = (snareCompingHits + kickBombs) / totalBars;

        console.log('\n--- JAZZ DRUMMER CRITIQUE REPORT ---');
        console.log(
            `[Quarter Ride Occupancy]   ${(quarterRideOccupancy * 100).toFixed(1)}% (Target: >95%)`,
        );
        console.log(
            `[Skip Ride Occupancy]      ${(skipRideOccupancy * 100).toFixed(1)}% (Target: 40-98%)`,
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

        // CRITICAL: the quarter-note ride pulse is the bedrock of swing time —
        // the engine sets rideProb=1.0 on every beat (jazz.ts:101), so this is
        // deterministic at 100%. Measured 1.0 across 128 bars; threshold 0.95
        // gives a 5pt cushion and still fails outright if the quarter pulse is
        // dropped (a removed lane scores 0).
        expect(quarterRideOccupancy).toBeGreaterThan(0.95);

        // MUSICAL: the "skip" note (the and-of-2 / and-of-4) is a LIVING
        // ornament, not a metronome tick. Engine fires it at rideProb =
        // 0.6 + drumComplexity(0.8)*0.3 = 0.84; measured ~0.84 occupancy across
        // 128 bars (std ~0.023, so ~6 std inside both bounds). The band
        // (0.40, 0.98) asserts the skip note is genuinely present (a removed
        // skip lane → 0 → fails the floor) yet not mechanically every bar
        // (a hard-coded every-bar skip → 1.0 → fails the ceiling).
        expect(skipRideOccupancy).toBeGreaterThan(0.4);
        expect(skipRideOccupancy).toBeLessThan(0.98);

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

    it('should preserve "space" at intensity 0.3 (entropy floor)', () => {
        // why: drums.md P0 #2 / epic-drums-idiom S3 — at intensity 0.3 the
        // entropy phase used to sprinkle ~4% random snare hits, contaminating
        // jazz's intentional ride emptiness. S3 adds `suppressEntropyBelow: 0.45`
        // on jazz.config, gating the entire entropy block off below 0.45. At
        // intensity 0.3 the snare/sidestick lane should be silent OUTSIDE the
        // motif-driven comping positions — the only snare events allowed at
        // this intensity are the strategy's own gated comping hits.
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.3, bpm: 120, songMode: false },
        });

        // The jazz strategy fires snare on `isOffbeat` positions only (the "&"
        // of each beat — steps 2, 6, 10, 14 in 4/4 16th-step indexing). The
        // entropy block fires its snare sprinkle on `isSyncopated` steps —
        // `loopStep % 2 === 1`, i.e. steps 1,3,5,7,9,11,13,15 (the "e" and "a"
        // of each beat). Those odd-numbered positions are entropy-only landing
        // sites for the snare lane: no jazz strategy branch ever touches them.
        // Count snare/sidestick/brush hits there — with S3's floor active at
        // intensity ≤ 0.45, this must be zero. Counting all three sound names
        // captures the lane regardless of routing (intensity 0.3 + bpm 120
        // routes snare → Brush per jazz.ts:236).
        let oddStepCount = 0;
        let snareOnOddSteps = 0;
        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                const s = stepData.loopStep;
                if (s % 2 === 1) {
                    oddStepCount++;
                    if (
                        stepData.instruments.Snare ||
                        stepData.instruments.Sidestick ||
                        stepData.instruments.Brush
                    ) {
                        snareOnOddSteps++;
                    }
                }
            });
        });

        console.log(
            `[Jazz Space @ 0.3] Snare-lane hits on entropy-only odd steps: ` +
                `${snareOnOddSteps}/${oddStepCount} ` +
                `(Target: 0 — strategy plays snare only on even offbeats 2/6/10/14)`,
        );

        // Strategy snare never touches odd steps; entropy gate is off at 0.3,
        // so the odd-step snare lane must be silent across the 128-bar window.
        expect(snareOnOddSteps).toBe(0);
    });

    it('should increase comping density with intensity', () => {
        // #806: full comping density is a loop-2+ behavior — drumComplexity =
        // (motifComplexity/3) * chorusEvolutionScale(loopCount), so the Head (loop
        // 0) runs at half density. Compare intensities at the established-feel loop.
        const lowIntensityPerf = simulatePerformance(64, {
            playback: { bandIntensity: 0.2, currentLoopCount: 2 },
        });
        const highIntensityPerf = simulatePerformance(64, {
            playback: { bandIntensity: 0.9, currentLoopCount: 2 },
        });

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
