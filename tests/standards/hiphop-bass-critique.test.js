import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBassNote, isBassActive } from '../../public/bass.js';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Hip Hop Bassist Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 90 },
            groove: {
                genreFeel: 'Hip Hop',
                creativity: true,
                lastDrumPreset: 'Hip Hop',
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

            // Re-mock before active check to ensure internal isBassActive sees correct intensity
            getState.mockReturnValue(mockState);
            const active = isBassActive('hiphop', globalStep, globalStep % 16, info, {});

            if (active) {
                const note = getBassNote(
                    chordC,
                    null,
                    info.beatIndex,
                    prevFreq,
                    36,
                    'hiphop',
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

    it('should stay grounded in the ultra-deep sub register', () => {
        const performance = simulatePerformance(32, { playback: { bandIntensity: 0.5 } });

        const deepNotes = performance.filter((p) => p.note.midi <= 38);
        const ratio = deepNotes.length / (performance.length || 1);

        console.log(`[Hip Hop Critique] Sub Register Ratio: ${(ratio * 100).toFixed(1)}%`);
        expect(ratio).toBeGreaterThan(0.85);
    });

    it('should implement long sustains for sub-chugs', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.3 } });

        let totalDuration = 0;
        performance.forEach((p) => {
            totalDuration += p.note.durationSteps;
        });

        const avgDuration = totalDuration / (performance.length || 1);
        console.log(`[Hip Hop Critique] Avg Note Duration: ${avgDuration.toFixed(2)} steps`);

        expect(avgDuration).toBeGreaterThan(2.0);
    });
});
