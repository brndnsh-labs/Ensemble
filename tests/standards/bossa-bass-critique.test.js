import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBassNote, isBassActive } from '../../public/bass.js';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Bossa Nova Bassist Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 120 },
            groove: {
                genreFeel: 'Bossa Nova',
                creativity: true,
                lastDrumPreset: 'Bossa Nova',
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

        const chordC = { rootMidi: 36, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };
        const tsConfig = TIME_SIGNATURES['4/4'];

        const performance = [];
        let prevFreq = 0;
        for (let globalStep = 0; globalStep < numBars * 16; globalStep++) {
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);
            const active = isBassActive('bossa', globalStep, globalStep % 16, info, {});

            if (active) {
                const note = getBassNote(
                    chordC,
                    null,
                    info.beatIndex,
                    prevFreq,
                    36,
                    'bossa',
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

    it('should implement the authentic Bossa rhythm (1, &2, 3, &4)', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.5 } });

        let correctSteps = 0;
        performance.forEach((p) => {
            const s = p.loopStep;
            if ([0, 6, 8, 14].includes(s)) {
                correctSteps++;
            }
        });

        const ratio = correctSteps / performance.length;
        console.log(`[Bossa Critique] Rhythmic Accuracy: ${(ratio * 100).toFixed(1)}%`);

        expect(ratio).toBeGreaterThan(0.9);
    });

    it('should alternate Root and Fifth between downbeats and upbeats', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.8 } });

        let rootHits = 0;
        let fifthHits = 0;

        performance.forEach((p) => {
            const pc = p.note.midi % 12;
            console.log(`Step ${p.loopStep}, PC ${pc}, MIDI ${p.note.midi}`);
            if (p.loopStep === 0 || p.loopStep === 8) {
                if (pc === 0) {
                    rootHits++;
                }
            } else if (p.loopStep === 6 || p.loopStep === 14) {
                if (pc === 7) {
                    fifthHits++;
                }
            }
        });

        console.log(
            `[Bossa Critique] Root Consistency: ${rootHits}/32, Fifth Consistency: ${fifthHits}/32`,
        );

        expect(rootHits).toBeGreaterThan(14);
        expect(fifthHits).toBeGreaterThan(14);
    });

    it('should implement "Lay-back" timing (positive timingOffset)', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.8 } });

        const lagNotes = performance.filter((p) => p.note.timingOffset > 0);
        const ratio = lagNotes.length / performance.length;

        console.log(`[Bossa Critique] Lay-back Consistency: ${(ratio * 100).toFixed(1)}%`);
        expect(ratio).toBeGreaterThan(0.9);
    });
});
