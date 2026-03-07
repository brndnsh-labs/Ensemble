import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides, getDrumMotif } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Blues Groove Integrity', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const mockState = {
        playback: { bandIntensity: 0.6, bpm: 90, songMode: false },
        groove: {
            genreFeel: 'Blues',
            creativity: true,
            lastDrumPreset: 'Blues',
            instruments: [],
        },
        soloist: { enabled: false, busySteps: 0 },
    };

    it('should assign valid Blues Motifs', () => {
        const motifs = new Set();
        for (let i = 0; i < 20; i++) {
            motifs.add(getDrumMotif(((i * 137 + 42) % 256) / 256, 'Blues', 0.8));
        }
        expect(motifs.has(0)).toBe(true);
        expect(motifs.has(1)).toBe(true);
    });

    describe('Apply Groove Overrides - Blues Patterns', () => {
        const createParams = (step, instName, stepVal = 0) => {
            const ts44 = TIME_SIGNATURES['4/4'];
            const info = getStepInfo(step, ts44, [], TIME_SIGNATURES);
            return {
                step,
                inst: { name: instName, muted: false, steps: [] },
                stepVal,
                playback: mockState.playback,
                groove: mockState.groove,
                isDownbeat: info.isMeasureStart,
                isBeatStart: info.isBeatStart,
                isBackbeat: info.isBackbeat,
                isGroupStart: info.isGroupStart,
                beatIndex: info.beatIndex,
                isOffbeat: info.isOffbeat,
                isEOfBeat: info.isEOfBeat,
                isAOfBeat: info.isAOfBeat,
            };
        };

        it('should play characteristic Shuffle pattern on Open (Ride) for Motif 0', () => {
            getState.mockReturnValue(mockState);
            let barIndexMotif0 = -1;
            for (let i = 0; i < 100; i++) {
                if (getDrumMotif(((i * 137 + 42) % 256) / 256, 'Blues', 0.8) === 0 && i % 4 !== 3) {
                    barIndexMotif0 = i;
                    break;
                }
            }
            if (barIndexMotif0 === -1) {
                return;
            }

            // Shuffle steps (1, 2-a, 3, 4-a): 0, 6, 8, 14
            const shuffleSteps = [0, 6, 8, 14].map((s) => barIndexMotif0 * 16 + s);
            for (const step of shuffleSteps) {
                const result = applyGrooveOverrides(createParams(step, 'Open'));
                expect(result.shouldPlay).toBe(true);
            }
        });
    });
});
