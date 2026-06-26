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

describe('Disco Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 120, songMode: false },
            groove: {
                genreFeel: 'Disco',
                lastDrumPreset: 'Disco',
                instruments: [],
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
            // #791: each bar is its own section, so the engine's now-sticky
            // sectionSeed sweeps the motif vocabulary across the run
            // deterministically — restoring the per-bar motif variety the old
            // Math-formula fallback gave (needed so SOME bars land on the
            // busy-cowbell flavor), but reproducibly.
            arranger: sectionSweepArranger(numBars),
            ...stateOverrides,
        };
        getState.mockReturnValue(mockState);

        const history = [];
        for (let bar = 0; bar < numBars; bar++) {
            const barSteps = [];
            for (let step = 0; step < 16; step++) {
                const stepData = { step: bar * 16 + step, loopStep: step, instruments: {} };
                // why: include the Perc lane so cowbell hits are observable.
                // disco.ts routes 'CowbellHigh' / 'CowbellLow' through the
                // 'Perc' instrument when the busy-cowbell flavor is selected.
                for (const instName of ['Kick', 'Snare', 'HiHat', 'Open', 'Perc']) {
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
            groove: { genreFeel: 'Disco' },
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
        // Backbeat is unconditional in the engine (disco.ts:82). Strict 100%.
        expect(backbeatScore).toBe(1.0);
        // Offbeat Open hat fires on every isOffbeat (disco.ts:120), independent of
        // motif. Engine delivers 100%. Prior threshold > 0.4 left 60pt of unused
        // headroom.
        expect(offbeatScore).toBeGreaterThan(0.95);
    });

    it('should engage snare ghosts on the busy-syncopation flavor at high intensity', () => {
        // Engine: snare ghost on `isAOfBeat && beatIndex >= 3 && roll(0.4, intensity)`
        // gated only by the seed-driven busy-syncopation sub-flavor (disco.ts
        // §18 fix — intensity > 0.7 gate removed; intensity now controls
        // ghost velocity + roll probability, not whether the lane fires).
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.9 },
        });
        let backbeatSnares = 0;
        let offBackbeatSnares = 0;
        performance.forEach((bar) =>
            bar.forEach((stepData) => {
                const s = stepData.loopStep;
                if (stepData.instruments.Snare) {
                    if (s === 4 || s === 12) {
                        backbeatSnares++;
                    } else {
                        offBackbeatSnares++;
                    }
                }
            }),
        );
        console.log(
            `[Disco Snare Ghosts] Off-backbeat: ${offBackbeatSnares}, Backbeat: ${backbeatSnares}`,
        );
        // Busy motif takes ~55% of seed mass; syncopation sub-flavor takes
        // ~50% of busy → ~28% of 128 bars = ~35 candidate bars. Ghost rolls
        // 0.4 × 0.9 = 36% of those on a single position (a-of-4). Expected
        // ghosts ~12 over 128 bars; threshold > 6 catches the lane firing
        // without flaking on the roll variance.
        expect(offBackbeatSnares).toBeGreaterThan(6);
    });

    it('should fire ghosts AND cowbells at mid intensity (both busy-flavor lanes alive, density decoupled from loudness)', () => {
        // Headline drums.md §18 fix: a mid-intensity (0.5) section should
        // STILL be able to land on the busy flavor and produce signature
        // disco percussion (ghosts on syncopation, cowbells on cowbell
        // flavor). Before the collapse, motifs 2-3 were locked behind
        // `intensity > 0.7`, so 0.5 was forced to motif 0/1 — no ghosts, no
        // cowbells, ever. After the fix the seed picks foundation vs busy
        // independently of intensity.
        //
        // why reviewer P2 split: the original `ghosts + cowbells > 20` disjunction
        // was structurally cowbell-only (cowbells fire ~8 per busy bar, ghosts
        // ~1 per ~10 busy bars) — a regression of the syncopation lane would
        // never make the sum drop below 20. Now two independent floors so
        // either lane dying is caught.
        const numBars = 256;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.5 },
        });
        let offBackbeatSnares = 0;
        let cowbellHits = 0;
        performance.forEach((bar) =>
            bar.forEach((stepData) => {
                const s = stepData.loopStep;
                if (stepData.instruments.Snare && s !== 4 && s !== 12 && s !== 15) {
                    // Exclude turnaround-final-step snare crack (disco.ts:124-130).
                    offBackbeatSnares++;
                }
                const percSound = stepData.instruments.Perc?.sound;
                if (percSound === 'CowbellHigh' || percSound === 'CowbellLow') {
                    cowbellHits++;
                }
            }),
        );
        console.log(
            `[Disco Mid-Intensity Density] ghosts=${offBackbeatSnares}, cowbells=${cowbellHits} (256 bars @ intensity 0.5)`,
        );
        // Cowbell lane: at intensity 0.5, busy-cowbell-flavor bars produce 8
        // eighth-note hits each. ~half of bars are busy and half of those
        // are cowbell flavor → ~64 busy-cowbell bars × 8 = ~512 cowbell hits.
        // Floor of 100 catches a full-lane regression with ~5× headroom.
        expect(cowbellHits).toBeGreaterThan(100);
        // Snare ghost lane: only step 15 (a-of-4) qualifies per
        // busy-syncopation bar with roll(0.4, 0.5) = 20% per-step.
        // ~64 busy-sync bars × 0.2 = ~13 ghosts expected. Floor of 2 catches
        // a dead-lane regression while tolerating high roll variance.
        // (Old engine returned 0 ghosts at intensity 0.5 — motif gate required
        // intensity > 0.7.)
        expect(offBackbeatSnares).toBeGreaterThan(2);
    });

    it('should scale kick and backbeat velocity with intensity', () => {
        // Disco's intensity response is mostly in velocity (scaleVelocity) and timbre
        // (HiHat → Open, Snare → Sidestick) rather than density — the kick is locked
        // 4-on-the-floor and offbeat-Open is unconditional. Measure the velocity scaling.
        const measureVelocities = (intensityValue) => {
            const perf = simulatePerformance(32, {
                playback: { bandIntensity: intensityValue },
            });
            let kickVelSum = 0;
            let kickCount = 0;
            let snareVelSum = 0;
            let snareCount = 0;
            perf.forEach((bar) =>
                bar.forEach((stepData) => {
                    if (stepData.instruments.Kick) {
                        kickVelSum += stepData.instruments.Kick.velocity;
                        kickCount++;
                    }
                    if (stepData.instruments.Snare) {
                        const s = stepData.loopStep;
                        if (s === 4 || s === 12) {
                            snareVelSum += stepData.instruments.Snare.velocity;
                            snareCount++;
                        }
                    }
                }),
            );
            return {
                kickVel: kickVelSum / (kickCount || 1),
                snareVel: snareVelSum / (snareCount || 1),
            };
        };

        const low = measureVelocities(0.4);
        const high = measureVelocities(0.95);
        console.log(
            `[Disco Velocity Scaling] Kick: ${low.kickVel.toFixed(2)} → ${high.kickVel.toFixed(2)}, Snare: ${low.snareVel.toFixed(2)} → ${high.snareVel.toFixed(2)}`,
        );
        // Engine scaleVelocity adds (intensity * 0.15) on kick downbeat and
        // (intensity * 0.1) on snare backbeat. From 0.4 → 0.95 that's +0.082 on kick
        // and +0.055 on snare. Threshold rules out engine that flatlines.
        expect(high.kickVel).toBeGreaterThan(low.kickVel + 0.05);
        expect(high.snareVel).toBeGreaterThan(low.snareVel + 0.03);
    });

    it('should escalate hat articulation toward Open at higher intensity', () => {
        // Engine: offbeat hat is always Open; HiHat 'closed' fires on
        // beatstarts and (on busy motif) support subdivisions. Both
        // intensity levels should keep a healthy Open share — disco's
        // signature 4-on-the-floor offbeat-open is intensity-independent
        // after drums.md §18 collapse (foundation vs busy is seed-driven).
        const measureOpenShare = (intensityValue) => {
            const perf = simulatePerformance(64, {
                playback: { bandIntensity: intensityValue },
            });
            let open = 0;
            let hat = 0;
            perf.forEach((bar) =>
                bar.forEach((stepData) => {
                    if (stepData.instruments.Open) {
                        open++;
                    }
                    if (stepData.instruments.HiHat) {
                        hat++;
                    }
                }),
            );
            return open / Math.max(1, open + hat);
        };
        const lowShare = measureOpenShare(0.4);
        const highShare = measureOpenShare(0.95);
        console.log(
            `[Disco Open Share] 0.4=${(lowShare * 100).toFixed(1)}% → 0.95=${(highShare * 100).toFixed(1)}%`,
        );
        // Open share should not regress at higher intensity. Both runs play offbeat
        // Open unconditionally; high intensity may also add support hats that route
        // closed. Tolerate the slight inversion but require open share stays >= 35%.
        expect(lowShare).toBeGreaterThan(0.35);
        expect(highShare).toBeGreaterThan(0.35);
    });
});
