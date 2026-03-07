import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides, getDrumMotif } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

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
            motifs.add(getDrumMotif(((i * 137 + 42) % 256) / 256, 'Ska-Punk', 0.8));
        }
        expect(motifs.has(0)).toBe(true);
        expect(motifs.has(1)).toBe(true);
    });

    describe('Apply Groove Overrides - Ska-Punk Patterns', () => {
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
