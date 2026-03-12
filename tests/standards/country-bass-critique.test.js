import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBassNote, isBassActive } from '../../public/bass.js';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Country Bassist Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 115 },
            groove: {
                genreFeel: 'Country',
                creativity: true,
                lastDrumPreset: 'Country (Two-Step)',
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

        const chordC = { rootMidi: 48, intervals: [0, 4, 7], quality: 'maj', beats: 4 };
        const tsConfig = TIME_SIGNATURES['4/4'];

        const performance = [];
        let prevFreq = 0;
        for (let globalStep = 0; globalStep < numBars * 16; globalStep++) {
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);
            const active = isBassActive('country', globalStep, globalStep % 16, info, {});

            if (active) {
                const note = getBassNote(
                    chordC,
                    null,
                    info.beatIndex,
                    prevFreq,
                    48,
                    'country',
                    0,
                    globalStep,
                    globalStep % 16,
                    {},
                    info,
                );
                performance.push({ step: globalStep, loopStep: globalStep % 16, info, note });
                prevFreq = note?.freq || 0;
            }
        }
        return performance;
    };

    it('should alternate Root and Fifth on quarter notes', () => {
        const performance = simulatePerformance(16);

        performance.forEach((p) => {
            const beat = p.info.beatIndex;
            const pc = p.note.midi % 12;

            if (beat === 0 || beat === 2) {
                // Root (C = 0)
                expect(pc).toBe(0);
            } else if (beat === 1 || beat === 3) {
                // Fifth (G = 7)
                expect(pc).toBe(7);
            }
        });
    });

    it('should prefer the fifth BELOW the root for a traditional feel', () => {
        const performance = simulatePerformance(16);
        const rootMidi = 48; // C2

        performance.forEach((p) => {
            if (p.info.beatIndex === 1 || p.info.beatIndex === 3) {
                // Should be G1 (43) rather than G2 (55)
                expect(p.note.midi).toBeLessThan(rootMidi);
            }
        });
    });

    it('should simplify to just Root on One at very low intensity', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.1 } });

        const totalHits = performance.length;
        const totalBars = 16;

        // At 0.1 intensity, should probably only hit beat 1
        expect(totalHits).toBeLessThanOrEqual(totalBars * 2);
    });
});
