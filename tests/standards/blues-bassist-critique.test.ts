// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Blues Bassist Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5 },
            groove: {
                genreFeel: 'Blues',
                lastDrumPreset: 'Blues Shuffle',
                instruments: [],
            },
            arranger: {
                timeSignature: '4/4',
                totalSteps: numBars * 16,
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
            ...stateOverrides,
        };
        getState.mockReturnValue(mockState);

        const chordC7 = { rootMidi: 60, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };
        const tsConfig = TIME_SIGNATURES['4/4'];

        const performance = [];
        let prevFreq = 0;
        for (let globalStep = 0; globalStep < numBars * 16; globalStep++) {
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);
            const active = isBassActive(getState(), 'blues', globalStep, globalStep % 16, info, {});

            if (active) {
                const note = getBassNote(
                    getState(),
                    chordC7,
                    null,
                    info.beatIndex,
                    prevFreq,
                    48,
                    'blues',
                    0,
                    globalStep,
                    globalStep % 16,
                    {},
                    info,
                );
                if (note) {
                    performance.push({
                        step: globalStep,
                        loopStep: globalStep % 16,
                        info,
                        note,
                    });
                    prevFreq = note.freq;
                }
            }
        }
        return performance;
    };

    it('should implement "The Box" pattern on a static C7 chord', () => {
        const performance = simulatePerformance(32, {
            playback: { bandIntensity: 0.5, complexity: 0.5 },
        });

        // The Box: Root (0), 5th (7), 6th (9), b7th (10)
        const pcs = performance
            .filter((p) => p.info.isBeatStart && !p.info.isOffbeat)
            .map((p) => p.note.midi % 12);

        const hasRoot = pcs.includes(0);
        const hasFifth = pcs.includes(7);
        const hasSixth = pcs.includes(9);
        const hasFlat7 = pcs.includes(10);

        console.log(`[Bassist Critique] Box Pattern PCs: ${[...new Set(pcs)].join(', ')}`);

        expect(hasRoot).toBe(true);
        expect(hasFifth).toBe(true);
        expect(hasSixth).toBe(true);
        expect(hasFlat7).toBe(true);
    });

    it('should implement the "Shuffle Lope" (isOffbeat) at high intensity', () => {
        const highIntensityPerf = simulatePerformance(32, {
            playback: { bandIntensity: 0.9, complexity: 0.9 },
        });

        const lopeHits = highIntensityPerf.filter((p) => p.info.isOffbeat);
        const quarterHits = highIntensityPerf.filter((p) => p.info.isBeatStart);

        console.log(
            `[Bassist Critique] Lope hits: ${lopeHits.length}, Quarter hits: ${quarterHits.length}`,
        );

        // shuffleProb = 0.9^1.2 + 0.9*0.3 = 1.15 → 100% offbeat fire (4/bar × 32 = 128).
        // Quarter notes always fire via isQuarter branch (4/bar × 32 = 128).
        expect(quarterHits.length).toBe(128);
        expect(lopeHits.length).toBe(128);
    });

    it('should strictly repeat pitch on the shuffle upbeat', () => {
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.9, complexity: 0.9 },
        });

        let checked = 0;
        performance.forEach((p, i) => {
            if (p.info.isOffbeat && i > 0) {
                const prev = performance[i - 1];
                if (prev?.info.isBeatStart) {
                    expect(p.note.midi).toBe(prev.note.midi);
                    checked++;
                }
            }
        });
        // Engine reality at intensity 0.9: 64 offbeats over 16 bars, each preceded by
        // a quarter-note hit. Tighten to assert nearly all pairs were validated.
        expect(checked).toBeGreaterThan(60);
    });

    it('should maintain consistent duration ratios (long-short)', () => {
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.9, complexity: 0.9 },
        });

        let longSum = 0;
        let shortSum = 0;
        let count = 0;
        performance.forEach((p, i) => {
            if (p.info.isOffbeat && i > 0) {
                const prev = performance[i - 1];
                if (prev?.info.isBeatStart) {
                    longSum += prev.note.durationSteps;
                    shortSum += p.note.durationSteps;
                    count++;
                }
            }
        });

        const avgLong = longSum / count;
        const avgShort = shortSum / count;

        console.log(
            `[Bassist Critique] Avg Long Duration: ${avgLong.toFixed(2)}, Avg Short: ${avgShort.toFixed(2)}`,
        );

        // Engine reality: quarter dur = stepsPerBeat * 0.45 = 1.8; upbeat dur = 0.8.
        // Tighten the ratios with documented expectations.
        expect(avgLong).toBeGreaterThan(1.75);
        expect(avgLong).toBeLessThan(1.85);
        expect(avgShort).toBeGreaterThan(0.75);
        expect(avgShort).toBeLessThan(0.85);
    });

    it('should clip kick-triggered blues notes to 0.4 beats', () => {
        const state = {
            playback: { bandIntensity: 0.6, complexity: 0.5 },
            groove: {
                genreFeel: 'Blues',
                lastDrumPreset: 'Blues Shuffle',
                measures: 1,
                instruments: [{ name: 'Kick', steps: [1] }],
            },
            arranger: { timeSignature: '4/4', totalSteps: 16 },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        };
        getState.mockReturnValue(state);

        const chordC7 = { rootMidi: 60, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };
        const tsConfig = TIME_SIGNATURES['4/4'];
        const info = getStepInfo(0, tsConfig, [], TIME_SIGNATURES);

        expect(isBassActive(state, 'blues', 0, 0, info, {})).toBe(true);
        const note = getBassNote(
            state,
            chordC7,
            null,
            info.beatIndex,
            null,
            48,
            'blues',
            0,
            0,
            0,
            {},
            info,
        );

        expect(note.durationSteps).toBeCloseTo(tsConfig.stepsPerBeat * 0.4);
    });

    it('should remain strictly quarter-note based at low intensity', () => {
        const lowIntensityPerf = simulatePerformance(32, {
            playback: { bandIntensity: 0.1, complexity: 0.1 },
        });

        const lopeHits = lowIntensityPerf.filter((p) => p.info.isOffbeat);

        console.log(`[Bassist Critique] Low Intensity Lope hits: ${lopeHits.length}`);

        // The "Lope" offbeat branch of the `style === 'blues'` block in
        // checkBassActiveStyle (bass-styles.ts) hard-gates `bandIntensity < 0.3`
        // → returns false. Deterministic 0.
        expect(lopeHits.length).toBe(0);
    });

    it('should scale offbeat lope hits monotonically with intensity', () => {
        // shuffleProb = bandIntensity^1.2 + complexity*0.3, gated at intensity >= 0.3.
        // Expect: 0 at 0.1, partial at 0.5, full at 0.9.
        const trials = [
            { intensity: 0.1, complexity: 0.3 },
            { intensity: 0.5, complexity: 0.3 },
            { intensity: 0.9, complexity: 0.3 },
        ];
        const counts = trials.map(({ intensity, complexity }) => {
            const perf = simulatePerformance(32, {
                playback: { bandIntensity: intensity, complexity },
            });
            return perf.filter((p) => p.info.isOffbeat).length;
        });

        console.log(`[Bassist Critique] Lope scaling: ${counts.join(' → ')}`);
        expect(counts[0]).toBe(0);
        expect(counts[1]).toBeGreaterThan(40); // ~0.5^1.2+0.09 = 0.52 → ~67/128
        expect(counts[1]).toBeLessThan(90);
        expect(counts[2]).toBeGreaterThan(120); // ~full
    });
});
