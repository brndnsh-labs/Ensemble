import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBassNote, isBassActive } from '../../public/bass.js';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Disco Bassist Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 124 },
            groove: {
                genreFeel: 'Disco',
                creativity: true,
                lastDrumPreset: 'Disco',
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
            const active = isBassActive('disco', globalStep, globalStep % 16, info, {});

            if (active) {
                const note = getBassNote(
                    chordC,
                    null,
                    info.beatIndex,
                    prevFreq,
                    48,
                    'disco',
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

    it('should implement Root-Octave alternating at high intensity', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.9 } });

        let octaveAlternations = 0;
        let checks = 0;

        performance.forEach((p, i) => {
            if (p.info.isBeatStart && i + 1 < performance.length) {
                const next = performance[i + 1];
                if (next.info.mStep % 4 === 2) {
                    // The "and"
                    checks++;
                    const diff = Math.abs(next.note.midi - p.note.midi);
                    if (diff === 12) {
                        octaveAlternations++;
                    }
                }
            }
        });

        const score = octaveAlternations / (checks || 1);
        console.log(`[Disco Critique] Octave Alternation Score: ${(score * 100).toFixed(1)}%`);

        expect(score).toBeGreaterThan(0.8);
    });

    it('should implement the "Gallop" (16th skips) at maximum complexity', () => {
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.95, complexity: 0.95 },
        });

        const syncopatedHits = performance.filter((p) => p.info.mStep % 2 !== 0);
        console.log(`[Disco Critique] Syncopated (Gallop) Hits: ${syncopatedHits.length}`);

        // We expect at least some 16th note activity to drive the gallop
        expect(syncopatedHits.length).toBeGreaterThan(10);
    });

    it('should stay strictly within the bass spectral slot (28-51)', () => {
        const performance = simulatePerformance(32, { playback: { bandIntensity: 0.9 } });

        performance.forEach((p) => {
            expect(p.note.midi).toBeGreaterThanOrEqual(28);
            expect(p.note.midi).toBeLessThanOrEqual(51);
        });
    });
});
