import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBassNote, isBassActive } from '../../public/bass.js';
import { TIME_SIGNATURES } from '../../public/config.js';
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
        for (let globalStep = 0; globalStep < numBars * 16; globalStep++) {
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);
            const active = isBassActive('blues', globalStep, globalStep % 16, info, {});

            if (active) {
                const note = getBassNote(
                    chordC7,
                    null,
                    info.beatIndex,
                    0,
                    48,
                    'blues',
                    0,
                    globalStep,
                    globalStep % 16,
                    {},
                    info,
                );
                performance.push({ step: globalStep, loopStep: globalStep % 16, info, note });
            }
        }
        return performance;
    };

    it('should implement "The Box" pattern on a static C7 chord', () => {
        const performance = simulatePerformance(32, { playback: { bandIntensity: 0.5 } });

        // The Box: Root (0), 5th (7), 6th (9), b7th (10)
        const pcs = performance
            .filter((p) => p.info.isBeatStart && !p.info.isAOfBeat)
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

    it('should implement the "Shuffle Lope" (isAOfBeat) at high intensity', () => {
        const highIntensityPerf = simulatePerformance(32, {
            playback: { bandIntensity: 0.9, complexity: 0.8 },
        });

        const lopeHits = highIntensityPerf.filter((p) => p.info.isAOfBeat);
        const quarterHits = highIntensityPerf.filter((p) => p.info.isBeatStart);

        console.log(
            `[Bassist Critique] Lope hits: ${lopeHits.length}, Quarter hits: ${quarterHits.length}`,
        );

        // At high intensity, we expect a significant amount of shuffle "ah" hits
        expect(lopeHits.length).toBeGreaterThan(10);
        expect(quarterHits.length).toBeGreaterThan(100); // 32 bars * 4 = 128
    });

    it('should remain strictly quarter-note based at low intensity', () => {
        const lowIntensityPerf = simulatePerformance(32, {
            playback: { bandIntensity: 0.1, complexity: 0.1 },
        });

        const lopeHits = lowIntensityPerf.filter((p) => p.info.isAOfBeat);

        console.log(`[Bassist Critique] Low Intensity Lope hits: ${lopeHits.length}`);

        // At low intensity, shuffle hits should be rare or zero
        expect(lopeHits.length).toBeLessThan(5);
    });
});
