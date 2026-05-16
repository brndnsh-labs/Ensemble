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

describe('Country Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 120, songMode: false },
            groove: {
                genreFeel: 'Country',
                creativity: true,
                lastDrumPreset: 'Country',
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
            groove: { creativity: true, genreFeel: 'Country' },
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
            `[Snare Continuity]      ${(snareContinuity * 100).toFixed(1)}% (averaged across motifs 0/1/2; Target: >65%)`,
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
        // (Two-Step, Light Train, Heavy Train). Engine delivers ~71% averaged. The
        // dedicated train-beat motif (2) delivers ~95% — covered by a separate test.
        expect(snareContinuity).toBeGreaterThan(0.65);
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
            groove: { creativity: true, genreFeel: 'Country' },
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

    it('should engage four-on-the-floor kick above intensity 0.8', () => {
        // Engine: foundation is downbeat + beat 3 (2 kicks/bar). Above intensity > 0.8,
        // beats 2 and 4 fire with roll(0.8) → expected ~1.6 extra kicks/bar.
        const numBars = 64;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.95 },
        });
        let kickHits = 0;
        performance.forEach((bar) =>
            bar.forEach((stepData) => stepData.instruments.Kick && kickHits++),
        );
        const density = kickHits / numBars;
        console.log(
            `[Country 4OTF] Kick density at intensity 0.95: ${density.toFixed(2)}/bar (Target: >3.0)`,
        );
        // Foundation 2 + ~1.6 extra ≈ 3.6/bar.
        expect(density).toBeGreaterThan(3.0);
    });

    it('should increase snare continuity with intensity', () => {
        // Engine: train-beat ghost prob = 0.5 + intensity * 0.5 (country.ts:74).
        // Plus motif selector lifts to motif 2 at higher intensity/seed → more 16ths.
        // Both endpoints sit above the intensity 0.4 sidestick boundary so the harness
        // filter (soundName === instName) records both runs consistently.
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
        // At intensity 0.5 motif 0/1 dominate (backbeat + light train). At intensity
        // 0.95 motif 2 dominates with 16th train. Conservative ratio threshold 1.5x.
        expect(highS).toBeGreaterThan(lowS * 1.5);
    });
});
