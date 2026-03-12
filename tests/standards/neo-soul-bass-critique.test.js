import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBassNote, isBassActive } from '../../public/bass.js';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Neo-Soul Bassist Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 90 },
            groove: {
                genreFeel: 'Neo-Soul',
                creativity: true,
                lastDrumPreset: 'Neo-Soul',
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
            const active = isBassActive('neo', globalStep, globalStep % 16, info, {});

            if (active) {
                const note = getBassNote(
                    chordC,
                    null,
                    info.beatIndex,
                    prevFreq,
                    36,
                    'neo',
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

    it('should implement heavy "Lay-back" timing (positive timingOffset)', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.8 } });

        const lagNotes = performance.filter((p) => p.note.timingOffset > 0);
        const ratio = lagNotes.length / performance.length;

        console.log(`[Neo-Soul Critique] Lay-back Consistency: ${(ratio * 100).toFixed(1)}%`);
        expect(ratio).toBeGreaterThan(0.9);
    });

    it('should stay grounded in the deep register', () => {
        const performance = simulatePerformance(32, { playback: { bandIntensity: 0.5 } });

        const deepNotes = performance.filter((p) => p.note.midi <= 40);
        const ratio = deepNotes.length / performance.length;

        console.log(`[Neo-Soul Critique] Deep Register Ratio: ${(ratio * 100).toFixed(1)}%`);
        expect(ratio).toBeGreaterThan(0.75);
    });

    it('should implement syncopated "hammer-ons" at high complexity', () => {
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.9, complexity: 0.9 },
        });

        const syncopatedHits = performance.filter((p) => p.info.mStep % 4 !== 0);
        console.log(`[Neo-Soul Critique] Syncopated Hits: ${syncopatedHits.length}`);

        expect(syncopatedHits.length).toBeGreaterThan(5);
    });
});
