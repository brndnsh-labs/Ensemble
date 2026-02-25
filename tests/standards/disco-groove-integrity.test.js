import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyGrooveOverrides, getDrumMotif } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Disco Groove Integrity', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const mockState = {
        playback: { bandIntensity: 0.7, bpm: 120, songMode: false },
        groove: {
            genreFeel: 'Disco',
            creativity: true,
            lastDrumPreset: 'Disco',
            instruments: [],
        },
        soloist: { enabled: false, busySteps: 0 },
    };

    it('should assign valid Disco Motifs', () => {
        const motifs = new Set();
        for (let i = 0; i < 20; i++) {
            motifs.add(getDrumMotif(i, 'Disco', true, 0.8));
        }
        expect(motifs.has(0)).toBe(true);
        expect(motifs.has(1)).toBe(true);
    });

    describe('Apply Groove Overrides - Disco Patterns', () => {
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
            };
        };

        it('should maintain Four-on-the-Floor Kick', () => {
            getState.mockReturnValue(mockState);
            const kickSteps = [0, 4, 8, 12];
            for (const step of kickSteps) {
                const result = applyGrooveOverrides(createParams(step, 'Kick'));
                expect(result.shouldPlay).toBe(true);
            }
        });

        it('should play characteristic offbeat Hi-Hats for Motif 0', () => {
            getState.mockReturnValue(mockState);
            let barIndexMotif0 = -1;
            for (let i = 0; i < 100; i++) {
                if (getDrumMotif(i, 'Disco', true, 0.8) === 0 && i % 4 !== 3) {
                    barIndexMotif0 = i;
                    break;
                }
            }
            if (barIndexMotif0 === -1) {
                return;
            }

            // Offbeats are 2, 6, 10, 14
            const offbeats = [2, 6, 10, 14].map((s) => barIndexMotif0 * 16 + s);
            for (const step of offbeats) {
                const result = applyGrooveOverrides(createParams(step, 'HiHat'));
                expect(result.shouldPlay).toBe(true);
                expect(result.soundName).toBe('Open');
            }
        });

        it('should trigger snare fills on turnarounds', () => {
            getState.mockReturnValue(mockState);
            const turnaroundBarIndex = 3;
            const step15 = turnaroundBarIndex * 16 + 15;

            const mockMath = vi.spyOn(Math, 'random').mockReturnValue(0.1);
            const result = applyGrooveOverrides(createParams(step15, 'Snare'));
            expect(result.shouldPlay).toBe(true);
            expect(result.velocity).toBeGreaterThan(0.3);
            mockMath.mockRestore();
        });
    });
});
