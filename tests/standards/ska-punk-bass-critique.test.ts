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

describe('Ska-Punk Bassist Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 175 },
            groove: {
                genreFeel: 'Ska-Punk',
                creativity: true,
                lastDrumPreset: 'Ska',
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

        const chordC = { rootMidi: 48, intervals: [0, 4, 7], quality: 'maj', beats: 4 };
        const tsConfig = TIME_SIGNATURES['4/4'];

        const performance = [];
        let prevFreq = 0;
        for (let globalStep = 0; globalStep < numBars * 16; globalStep++) {
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);
            const active = isBassActive(
                getState(),
                'walking-ska',
                globalStep,
                globalStep % 16,
                info,
                {},
            );

            if (active) {
                const note = getBassNote(
                    getState(),
                    chordC,
                    null,
                    info.beatIndex,
                    prevFreq,
                    48,
                    'walking-ska',
                    0,
                    globalStep,
                    globalStep % 16,
                    {},
                    info,
                );
                if (note) {
                    performance.push({ step: globalStep, loopStep: globalStep % 16, info, note });
                    prevFreq = note.freq;
                }
            }
        }
        return performance;
    };

    it('should maintain high eighth-note density at high intensity', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.9 } });

        const eighthHits = performance.filter((p) => p.loopStep % 2 === 0);
        const totalPossible = 16 * 8;
        const ratio = eighthHits.length / totalPossible;

        console.log(`[Ska-Punk Critique] 8th Note Density: ${(ratio * 100).toFixed(1)}%`);
        expect(ratio).toBeGreaterThan(0.85);
    });

    it('should use non-root tones for a melodic feel', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.75 } });

        let rootHits = 0;
        performance.forEach((p) => {
            if (p.note.midi % 12 === 0) {
                rootHits++;
            }
        });

        const rootRatio = rootHits / performance.length;
        console.log(`[Ska-Punk Critique] Root Ratio: ${(rootRatio * 100).toFixed(1)}%`);

        // Walking ska should be melodic, not just pedaling roots
        expect(rootRatio).toBeLessThan(0.7);
    });
});
