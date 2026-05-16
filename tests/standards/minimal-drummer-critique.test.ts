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

describe('Minimal Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.3, bpm: 120, songMode: false },
            groove: {
                genreFeel: 'Minimal',
                creativity: true,
                lastDrumPreset: 'Minimal',
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

    const densityAt = (intensityValue, numBars = 128) => {
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: intensityValue },
        });
        let totalHits = 0;
        performance.forEach((bar) => {
            bar.forEach((stepData) => {
                totalHits += Object.keys(stepData.instruments).length;
            });
        });
        return { density: totalHits / numBars, performance };
    };

    it('should hold downbeat kick and downbeat hat on every bar (motif 0 floor)', () => {
        // Motif 0 (intensity < 0.3) fires kick on isDownbeat and hat on isDownbeat —
        // both unconditional. Sidestick backbeats fire too but the harness filters
        // them (soundName='Sidestick' !== instName='Snare').
        const { performance } = densityAt(0.2);
        let kickOnOne = 0;
        let hatOnOne = 0;
        performance.forEach((bar) => {
            const dn = bar[0];
            if (dn.instruments.Kick) {
                kickOnOne++;
            }
            if (dn.instruments.HiHat || dn.instruments.Open) {
                hatOnOne++;
            }
        });
        console.log(
            `[Minimal Floor] Kick on 1: ${kickOnOne}/${performance.length}, Hat on 1: ${hatOnOne}/${performance.length}`,
        );
        expect(kickOnOne).toBe(performance.length);
        expect(hatOnOne).toBe(performance.length);
    });

    it('should escalate density monotonically through motif 0 → 1 → 2', () => {
        // Engine motif tiers (minimal.ts:13-20):
        //   intensity < 0.3 → motif 0 (kick+hat on downbeat only)
        //   0.3 <= intensity < 0.7 → motif 1 (kick on 1+3, hat on all beats)
        //   intensity >= 0.7 → motif 2 (kick on 1+3+& of 2, hat on all beats + offbeats)
        const motif0 = densityAt(0.2);
        const motif1 = densityAt(0.5);
        const motif2 = densityAt(0.85);
        console.log(
            `[Minimal Density] 0.2 (motif 0): ${motif0.density.toFixed(2)}/bar → 0.5 (motif 1): ${motif1.density.toFixed(2)}/bar → 0.85 (motif 2): ${motif2.density.toFixed(2)}/bar`,
        );
        // Strict monotonic escalation across the three engine tiers. Prior single
        // test (range 0.5-8) collapsed all motifs into one assertion that always
        // passed regardless of whether the tier system worked.
        expect(motif1.density).toBeGreaterThan(motif0.density);
        expect(motif2.density).toBeGreaterThan(motif1.density);
        // Motif 0 floor ~2/bar (kick+hat on downbeat); motif 2 ceiling ~10-12/bar.
        expect(motif0.density).toBeLessThan(4);
        expect(motif2.density).toBeGreaterThan(8);
    });

    it('should route snare to Snare at intensity >= 0.8 and Sidestick below', () => {
        // Engine: minimal.ts:66-70 routes via `intensity < 0.8 ? Sidestick : Snare`.
        // Harness filter only records when soundName === instName. So at intensity
        // 0.85 we expect to see Snare events recorded; at 0.5 we should not.
        const midPerf = simulatePerformance(64, {
            playback: { bandIntensity: 0.5 },
        }).flat();
        const highPerf = simulatePerformance(64, {
            playback: { bandIntensity: 0.85 },
        }).flat();

        const snareHits = (steps) => steps.filter((s) => s.instruments.Snare).length;
        const midSnares = snareHits(midPerf);
        const highSnares = snareHits(highPerf);
        console.log(
            `[Minimal Snare Routing] Snare hits: 0.5 (sidestick path)=${midSnares}, 0.85 (snare path)=${highSnares}`,
        );
        // At intensity 0.5 only entropy-mode snares could survive the filter, and
        // those fire with soundName='Sidestick' too (entropy uses < 0.4 cutoff which
        // 0.5 misses → 'Snare'; but motif 0/1 backbeats route Sidestick).
        // Entropy can fire ~0.04 'Snare' events per bar at intensity 0.5 on
        // syncopated positions. Threshold floor on high path catches the lane firing.
        expect(highSnares).toBeGreaterThan(midSnares);
        expect(highSnares).toBeGreaterThan(60); // 64 bars * 2 backbeats * ~0.5 == ~64
    });
});
