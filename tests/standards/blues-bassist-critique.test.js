import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

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
                creativity: true,
                lastDrumPreset: 'Blues Shuffle',
                instruments: [],
            },
            arranger: {
                timeSignature: '4/4',
                totalSteps: numBars * 16,
            },
            soloist: { enabled: false, busySteps: 0 },
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
                performance.push({ step: globalStep, loopStep: globalStep % 16, info, note });
                prevFreq = note.freq;
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

        // At high intensity, we expect a significant amount of shuffle "ah" hits
        expect(lopeHits.length).toBeGreaterThan(50);
        expect(quarterHits.length).toBeGreaterThan(100);
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
        expect(checked).toBeGreaterThan(20);
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

        expect(avgLong).toBeGreaterThan(1.5); // Adjusted for the new 0.45 duration
        expect(avgShort).toBeLessThan(1.0);
    });

    it('should remain strictly quarter-note based at low intensity', () => {
        const lowIntensityPerf = simulatePerformance(32, {
            playback: { bandIntensity: 0.1, complexity: 0.1 },
        });

        const lopeHits = lowIntensityPerf.filter((p) => p.info.isOffbeat);

        console.log(`[Bassist Critique] Low Intensity Lope hits: ${lopeHits.length}`);

        // At low intensity, shuffle hits should be rare or zero
        expect(lopeHits.length).toBeLessThan(25);
    });
});
