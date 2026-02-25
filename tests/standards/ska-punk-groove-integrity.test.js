import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyGrooveOverrides, getDrumMotif } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Ska-Punk Groove Integrity', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const mockState = {
        playback: { bandIntensity: 0.8, bpm: 180, songMode: false },
        groove: {
            genreFeel: 'Ska-Punk',
            creativity: true,
            lastDrumPreset: 'Ska-Punk',
            instruments: [],
        },
        soloist: { enabled: false, busySteps: 0 },
    };

    it('should assign valid Ska-Punk Motifs', () => {
        const motifs = new Set();
        for (let i = 0; i < 20; i++) {
            motifs.add(getDrumMotif(i, 'Ska-Punk', true, 0.8));
        }
        expect(motifs.has(0)).toBe(true);
        expect(motifs.has(1)).toBe(true);
    });

    describe('Apply Groove Overrides - Ska-Punk Patterns', () => {
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

        it('should strongly accent offbeat Hi-Hats', () => {
            getState.mockReturnValue(mockState);
            const offbeat = 2;
            const downbeat = 0;

            const resultOff = applyGrooveOverrides(createParams(offbeat, 'HiHat', 1));
            const resultDown = applyGrooveOverrides(createParams(downbeat, 'HiHat', 1));

            expect(resultOff.velocity).toBeGreaterThan(resultDown.velocity);
        });
    });
});
