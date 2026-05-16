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

describe('Acoustic Bassist Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 90 },
            groove: {
                genreFeel: 'Acoustic',
                creativity: true,
                lastDrumPreset: 'Acoustic',
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

        const chordC = { rootMidi: 36, intervals: [0, 4, 7], quality: 'maj', beats: 4 };
        const tsConfig = TIME_SIGNATURES['4/4'];

        const performance = [];
        let prevFreq = 0;
        for (let globalStep = 0; globalStep < numBars * 16; globalStep++) {
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);
            const active = isBassActive(getState(), 'smart', globalStep, globalStep % 16, info, {});

            if (active) {
                const note = getBassNote(
                    getState(),
                    chordC,
                    null,
                    info.beatIndex,
                    prevFreq,
                    36,
                    'smart',
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

    it('should stay grounded in harmonic support (Roots and Fifths)', () => {
        const performance = simulatePerformance(16);

        let validHits = 0;
        performance.forEach((p) => {
            const pc = p.note.midi % 12;
            if (pc === 0 || pc === 7) {
                validHits++;
            }
        });

        const ratio = validHits / (performance.length || 1);
        console.log(`[Acoustic Critique] Root/Fifth Grounding: ${(ratio * 100).toFixed(1)}%`);
        expect(ratio).toBeGreaterThan(0.9);
    });

    it('should use long sustains at low intensity (Half/Whole notes)', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.2 } });

        let longNotes = 0;
        performance.forEach((p) => {
            if (p.note.durationSteps >= 4) {
                longNotes++;
            }
        });

        const ratio = longNotes / (performance.length || 1);
        console.log(`[Acoustic Critique] Long Sustain Ratio: ${(ratio * 100).toFixed(1)}%`);
        expect(ratio).toBeGreaterThan(0.8);
    });

    it('should implement "Lay-back" timing (positive timingOffset)', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.5 } });

        const lagNotes = performance.filter((p) => p.note.timingOffset > 0);
        const ratio = lagNotes.length / (performance.length || 1);

        console.log(`[Acoustic Critique] Lay-back Consistency: ${(ratio * 100).toFixed(1)}%`);
        expect(ratio).toBeGreaterThan(0.9);
    });
});
