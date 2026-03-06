import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyGrooveOverrides, getDrumMotif } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Neo-Soul Groove Integrity', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const mockState = {
        playback: { bandIntensity: 0.6, bpm: 90, songMode: false },
        groove: {
            genreFeel: 'Neo-Soul',
            creativity: true,
            lastDrumPreset: 'Neo-Soul',
            instruments: [],
        },
        soloist: { enabled: false, busySteps: 0 },
    };

    it('should assign valid Neo-Soul Motifs', () => {
        const motifs = new Set();
        for (let i = 0; i < 20; i++) {
            motifs.add(getDrumMotif(((i * 137 + 42) % 256) / 256, 'Neo-Soul', 0.8));
        }
        expect(motifs.has(0)).toBe(true);
        expect(motifs.has(1)).toBe(true);
    });

    describe('Apply Groove Overrides - Neo-Soul Patterns', () => {
        const createParams = (step, instName, stepVal = 0) => {
            return {
                step,
                inst: { name: instName, muted: false, steps: [] },
                stepVal,
                playback: mockState.playback,
                groove: mockState.groove,
                isDownbeat: step % 16 === 0,
                isQuarter: step % 4 === 0,
                isBackbeat: step % 16 === 4 || step % 16 === 12,
                isGroupStart: step % 16 === 0 || step % 16 === 8,
                beatIndex: Math.floor((step % 16) / 4),
            };
        };

        it('should play structured ghost notes for Motif 1', () => {
            getState.mockReturnValue(mockState);
            let barIndexMotif1 = -1;
            for (let i = 0; i < 100; i++) {
                if (
                    getDrumMotif(((i * 137 + 42) % 256) / 256, 'Neo-Soul', 0.8) === 1 &&
                    i % 4 !== 3
                ) {
                    barIndexMotif1 = i;
                    break;
                }
            }
            if (barIndexMotif1 === -1) {
                return;
            }

            const ghostStep = barIndexMotif1 * 16 + 3; // 'e' of 1
            const result = applyGrooveOverrides(createParams(ghostStep, 'Snare'));
            expect(result.shouldPlay).toBe(true);
            expect(result.velocity).toBeLessThan(0.5);
        });

        it('should drag Snare timing slightly', () => {
            getState.mockReturnValue(mockState);
            const backbeat = 4;
            const result = applyGrooveOverrides(createParams(backbeat, 'Snare'));
            expect(result.instTimeOffset).toBeGreaterThan(0);
        });
    });
});
