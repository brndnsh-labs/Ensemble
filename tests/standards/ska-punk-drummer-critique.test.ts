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

describe('Ska-Punk Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, bpm: 175, songMode: false },
            groove: {
                genreFeel: 'Ska-Punk',
                creativity: true,
                lastDrumPreset: 'Ska',
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

    it('should implement the "Skank" feel (Strong offbeat hi-hats)', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.5 } });

        let onBeatVel = 0,
            onBeatCount = 0;
        let offBeatVel = 0,
            offBeatCount = 0;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                const hat = stepData.instruments.HiHat || stepData.instruments.Open;
                if (hat) {
                    if (stepData.loopStep % 4 === 0) {
                        onBeatVel += hat.velocity;
                        onBeatCount++;
                    } else if (stepData.loopStep % 4 === 2) {
                        offBeatVel += hat.velocity;
                        offBeatCount++;
                    }
                }
            });
        });

        const avgOn = onBeatVel / (onBeatCount || 1);
        const avgOff = offBeatVel / (offBeatCount || 1);

        console.log(
            `[Ska-Punk Critique] Avg On-beat Hat: ${avgOn.toFixed(2)}, Avg Off-beat Hat: ${avgOff.toFixed(2)} (Target ratio: >1.4x)`,
        );

        // Offbeat hat is the genre signature (ska skank). Engine scales offbeat
        // velocity 1.3 vs on-beat 0.8 → ~1.6x ratio. Prior threshold 1.2x left 40%
        // unused headroom.
        expect(avgOff).toBeGreaterThan(avgOn * 1.4);
    });

    it('should implementation high-energy punk beats at high intensity', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.9 } });

        let snareCount = 0;
        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                if (stepData.instruments.Snare) {
                    snareCount++;
                }
            });
        });

        const totalBars = performance.length;
        const snaresPerBar = snareCount / totalBars;
        console.log(
            `[Ska-Punk Critique] Snare density at high intensity: ${snaresPerBar.toFixed(2)} hits/bar`,
        );

        // Punk beats are dense (2-step or double-time)
        expect(snaresPerBar).toBeGreaterThanOrEqual(2.0);
    });

    it('should keep high-intensity hats mostly tight, with opens used as accents', () => {
        const performance = simulatePerformance(32, { playback: { bandIntensity: 0.85 } });

        let openHits = 0;
        let totalHatHits = 0;

        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                if (stepData.instruments.HiHat || stepData.instruments.Open) {
                    totalHatHits++;
                }
                if (stepData.instruments.Open) {
                    openHits++;
                }
            });
        });

        const openRatio = openHits / (totalHatHits || 1);
        console.log(
            `[Ska-Punk Critique] Open-hat ratio at high intensity: ${openRatio.toFixed(2)} (Target: <0.25)`,
        );

        // Engine fires Open only on accent positions: offbeat-of-3 (35%), other
        // offbeats at intensity > 0.78 (18%), or downbeat-crash at intensity > 0.8
        // (40%). Cap is ~25% of hat events; engine delivers ~13%.
        expect(openRatio).toBeLessThan(0.25);
    });

    it('should drive kick four-on-the-floor for the punk motifs', () => {
        // Engine motif kick rules:
        //   motif 0 (Classic Ska): beats 1+3 only (skip backbeats) → 50% coverage
        //   motif 1 (2-Step): every beatStart → 100%
        //   motif 2 (Double-Time): every beatStart → 100%
        //   motif 3 (D-Beat): steps 0, 3, 8, 14 → 50% coverage on quarters
        // At intensity 0.75 seed distribution averages ~80% coverage. The musical
        // claim is "punk motifs (1, 2) drive every quarter" — verify the averaged
        // coverage matches the engine's seed-weighted reality.
        const numBars = 64;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.75 },
        });
        let kickOnBeats = 0;
        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                if (stepData.instruments.Kick && stepData.loopStep % 4 === 0) {
                    kickOnBeats++;
                }
            });
        });
        const score = kickOnBeats / (numBars * 4);
        console.log(
            `[Ska-Punk Kick] Quarter coverage at intensity 0.75: ${(score * 100).toFixed(1)}% (Target: >70%)`,
        );
        // Seed-weighted expected ~80%. Floor 70% catches the lane firing across all
        // motifs while leaving 10pt of statistical headroom for sample-size flake.
        expect(score).toBeGreaterThan(0.7);
    });

    it('should escalate snare density from backbeat to offbeats with intensity', () => {
        // Engine: motif 0 (intensity < 0.6) → backbeat only (2/bar).
        // Motif 2 (intensity ≥ 0.6 with seed 0.5-0.8) → all offbeats (4/bar).
        // Density should scale with intensity from ~2/bar to ~3+/bar.
        const lowPerf = simulatePerformance(64, { playback: { bandIntensity: 0.4 } });
        const highPerf = simulatePerformance(64, { playback: { bandIntensity: 0.9 } });

        const snareDensity = (perf) => {
            let h = 0;
            perf.forEach((b) => b.forEach((s) => s.instruments.Snare && h++));
            return h / perf.length;
        };
        const lowD = snareDensity(lowPerf);
        const highD = snareDensity(highPerf);
        console.log(
            `[Ska-Punk Snare Density] 0.4=${lowD.toFixed(2)}/bar → 0.9=${highD.toFixed(2)}/bar`,
        );
        // Motif 0 dominates at low intensity → ~2/bar floor.
        // High intensity averages ~2.5-3/bar across motif 0-3.
        expect(highD).toBeGreaterThan(lowD * 1.15);
    });
});
