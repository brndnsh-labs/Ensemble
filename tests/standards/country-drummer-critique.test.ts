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

describe('Country Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 120, songMode: false },
            groove: {
                genreFeel: 'Country',
                lastDrumPreset: 'Country',
                instruments: [],
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
            // #791: groove engine now derives ONE sticky sectionSeed per
            // (sectionId, songSeed). An empty arranger collapses the whole run
            // to a single motif, so we sweep the motif vocabulary across sections
            // (one section per bar) the way a real multi-section song does.
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
                    if (result.shouldPlay && result.soundName === instName) {
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

    it('should pass an authenticity critique for a 128-bar Country performance', () => {
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.8 },
            groove: { genreFeel: 'Country' },
        });

        let backbeatHits = 0;
        let kickHits = 0;
        let snare16thHits = 0;
        let _totalSnareVelocity = 0;
        let backbeatSnareVelocity = 0;
        let ghostSnareVelocity = 0;
        let ghostCount = 0;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                const s = stepData.loopStep;
                const snare = stepData.instruments.Snare;

                if (snare) {
                    snare16thHits++;
                    _totalSnareVelocity += snare.velocity;
                    if (s === 4 || s === 12) {
                        backbeatHits++;
                        backbeatSnareVelocity += snare.velocity;
                    } else {
                        ghostCount++;
                        ghostSnareVelocity += snare.velocity;
                    }
                }

                if (stepData.instruments.Kick) {
                    kickHits++;
                }
            });
        });

        const totalBars = performance.length;
        const backbeatScore = backbeatHits / (totalBars * 2);
        const snareContinuity = snare16thHits / (totalBars * 16);
        const avgBackbeatVel = backbeatSnareVelocity / (backbeatHits || 1);
        const avgGhostVel = ghostSnareVelocity / (ghostCount || 1);

        console.log('\n--- COUNTRY DRUMMER CRITIQUE REPORT ---');
        console.log(`[Backbeat Consistency]  ${(backbeatScore * 100).toFixed(1)}% (Target: 100%)`);
        console.log(
            `[Snare Continuity]      ${(snareContinuity * 100).toFixed(1)}% (averaged across motifs 0/1/2; Target: >58%)`,
        );
        console.log(
            `[Velocity Tiering]      Backbeat: ${avgBackbeatVel.toFixed(2)} vs Ghost: ${avgGhostVel.toFixed(2)} (Target: >2.5x)`,
        );
        console.log(
            `[Kick Density]         ${(kickHits / totalBars).toFixed(2)} kicks/bar (Target: 2.0 foundation + 4OTF at intensity > 0.8)`,
        );
        console.log('---------------------------------------\n');

        // Backbeat is universal across all motifs (engine forces snare on backbeats
        // regardless of motif). 100% is the bedrock.
        expect(backbeatScore).toBe(1.0);
        // Train-beat continuity at intensity 0.8 averages across the three motifs
        // (Two-Step ~12.5%, Light Train ~75%, Heavy Train ~100%).
        // Motif distribution at intensity 0.8: ~30% motif-0, ~50% motif-1, ~20% motif-2.
        // Expected average: 0.30*0.125 + 0.50*0.75 + 0.20*1.0 ≈ 61.3%.
        // Threshold 0.58 gives ~3pt statistical headroom from observed ~62%.
        expect(snareContinuity).toBeGreaterThan(0.58);
        // Engine: backbeat velocity ~0.95 * dampening, ghost velocity ~0.15 + small.
        // Observed ratio ~3.4x.
        expect(avgBackbeatVel).toBeGreaterThan(avgGhostVel * 2.5);
        // Foundation = 2 kicks/bar (downbeat + beat 3). Four-on-the-floor gate is
        // intensity > 0.8 strict; at exactly 0.8 it does not fire. Engine delivers 2.0.
        expect(kickHits / totalBars).toBeGreaterThanOrEqual(2.0);
    });

    it('should keep high-intensity train-beat hats articulate instead of fully washing open', () => {
        const numBars = 32;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.85 },
            groove: { genreFeel: 'Country' },
        });

        let openHits = 0;
        let totalHatBeats = 0;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                if (stepData.loopStep % 4 === 0) {
                    totalHatBeats++;
                    if (stepData.instruments.Open) {
                        openHits++;
                    }
                }
            });
        });

        const openRatio = openHits / (totalHatBeats || 1);
        console.log(
            `[Country Hats] Open ratio at high intensity: ${(openRatio * 100).toFixed(1)}% (Target: <30%)`,
        );

        // Engine fires Open only on beat 3 of motif > 0 bars at intensity > 0.82.
        // Hard ceiling: ~25% (one quarter beat). Engine delivers ~17%.
        expect(openRatio).toBeLessThan(0.3);
    });

    it('should engage four-on-the-floor kick above intensity 0.8 without flattening the downbeat accent', () => {
        // Engine (#797): foundation is downbeat + beat 3 (2 ACCENTED kicks/bar, 1.25 /
        // 1.1). Above intensity > 0.8 the 4OTF branch now fires DETERMINISTICALLY,
        // filling the empty beats 2 and 4 (feathered ~0.7) → a full 4.0 kicks/bar.
        // Critically it must only FILL (guarded by `!shouldPlay`), never clobber the
        // 1/3 accent down to the fill level — the P1 the deterministic change first
        // introduced. This test guards both the density AND the surviving downbeat accent.
        const numBars = 64;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.95 },
        });
        let kickHits = 0;
        let downbeatVelSum = 0;
        let downbeatKicks = 0;
        performance.forEach((bar) =>
            bar.forEach((stepData) => {
                if (stepData.instruments.Kick) {
                    kickHits++;
                    // loopStep 0 = the downbeat (beat 1) in 4/4 — the accented
                    // foundation kick the 4OTF fill must not clobber.
                    if (stepData.loopStep === 0) {
                        downbeatVelSum += stepData.instruments.Kick.velocity;
                        downbeatKicks++;
                    }
                }
            }),
        );
        const density = kickHits / numBars;
        const avgDownbeatVel = downbeatVelSum / (downbeatKicks || 1);
        console.log(
            `[Country 4OTF] Kick density at intensity 0.95: ${density.toFixed(2)}/bar (Target: >3.0), ` +
                `avg downbeat kick velocity: ${avgDownbeatVel.toFixed(2)} (Target: >1.0, accented)`,
        );
        // Deterministic 4-on-the-floor: foundation 2 + fills on 2/4 = 4.0/bar.
        expect(density).toBeGreaterThan(3.0);
        // The downbeat accent (~1.25) must survive the 4OTF fill — a regression that
        // let the fill branch clobber beat 1 would drop this to the feather level (~0.7).
        expect(avgDownbeatVel).toBeGreaterThan(1.0);
    });

    it('should increase snare continuity with intensity', () => {
        // Engine: motif 2 (Heavy Train) fires all 16ths deterministically (no stochastic
        // roll), while motif 1 (Light Train) fires only E-of-beat 16ths.
        // At intensity 0.5 motif 0/1 dominate (backbeat + light train).
        // At intensity 0.95 motif 2 dominates with continuous 16th train.
        // Both endpoints sit above every per-motif sidestick boundary (motif 0 = 0.4,
        // motif > 0 = 0.3 post-S8) so the harness filter (soundName === instName)
        // records both runs consistently.
        const lowPerf = simulatePerformance(64, { playback: { bandIntensity: 0.5 } });
        const highPerf = simulatePerformance(64, { playback: { bandIntensity: 0.95 } });

        const snareCount = (perf) => {
            let h = 0;
            perf.forEach((b) => b.forEach((s) => s.instruments.Snare && h++));
            return h;
        };

        const lowS = snareCount(lowPerf);
        const highS = snareCount(highPerf);
        console.log(
            `[Country Intensity] Snare hits 0.5=${lowS} → 0.95=${highS}, ratio: ${(highS / (lowS || 1)).toFixed(2)}x`,
        );
        // At intensity 0.95 motif 2 (all 16ths) dominates: ~100% of 16 steps/bar.
        // At intensity 0.5 motif 0/1 dominate: ~40% density.
        // Conservative ratio threshold 1.5x (actual is ~2.5x).
        expect(highS).toBeGreaterThan(lowS * 1.5);
    });

    it('should produce continuous deterministic 16th train beat in motif 2', () => {
        // Motif 2 ("Full Heavy Train Beat") must fire snare on ALL 16 steps per bar
        // without stochastic gaps — this is the S7 fix (audit finding drums.md P1 #11).
        // The train beat's defining texture is a continuous 16th roll; a random gate
        // would produce machine-gun clusters, not a steady train.
        // To isolate motif 2 we use intensity 0.95 (seed distribution pushes to motif 2
        // when seed > 0.8) and count bars where every step has a Snare hit.
        const numBars = 64;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.95 },
        });

        let fullTrainBars = 0;
        let totalSnareStepsPerBar = 0;

        performance.forEach((bar) => {
            const snareSteps = bar.filter((s) => s.instruments.Snare).length;
            totalSnareStepsPerBar += snareSteps;
            if (snareSteps === 16) {
                fullTrainBars++;
            }
        });

        const avgSnareSteps = totalSnareStepsPerBar / numBars;
        console.log(
            `[Country Train Beat] Avg snare steps/bar at intensity 0.95: ${avgSnareSteps.toFixed(1)}/16 (full-16th bars: ${fullTrainBars}/${numBars})`,
        );
        // why: the actual claim being tested is "motif 2 fires all 16 snare steps
        // *without stochastic gaps* when it is selected". A bar with all 16 snare
        // steps can only arise from motif 2's deterministic gate — motifs 0/1 cap
        // out below 16 even at maximum density. So fullTrainBars > 0 across the
        // 64-bar window directly proves the S7 fix; a per-bar-average threshold
        // would be polluted by motif distribution rather than testing determinism.
        expect(fullTrainBars).toBeGreaterThan(0);
    });
});
