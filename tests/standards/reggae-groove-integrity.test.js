import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides, getDrumMotif } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Reggae Groove Integrity', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const mockState = {
        playback: { bandIntensity: 0.8, bpm: 75, songMode: false },
        groove: {
            genreFeel: 'Reggae',
            creativity: true,
            lastDrumPreset: 'Reggae',
            instruments: [],
        },
        soloist: { enabled: false, busySteps: 0 },
    };

    it('should assign valid Reggae Motifs', () => {
        const motifs = new Set();
        for (let i = 0; i < 20; i++) {
            motifs.add(getDrumMotif(((i * 137 + 42) % 256) / 256, 'Reggae', 0.8));
        }
        expect(motifs.has(0)).toBe(true);
        expect(motifs.has(1)).toBe(true);
    });

    describe('Apply Groove Overrides - Reggae Patterns', () => {
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

        it('should play One Drop: Kick only on beat 3 for Motif 0', () => {
            getState.mockReturnValue(mockState);
            let barIndexMotif0 = -1;
            for (let i = 0; i < 100; i++) {
                if (
                    getDrumMotif(((i * 137 + 42) % 256) / 256, 'Reggae', 0.8) === 0 &&
                    i % 4 !== 3
                ) {
                    barIndexMotif0 = i;
                    break;
                }
            }
            if (barIndexMotif0 === -1) {
                return;
            }

            const beat1 = barIndexMotif0 * 16 + 0;
            const beat3 = barIndexMotif0 * 16 + 8;

            const result1 = applyGrooveOverrides(createParams(beat1, 'Kick'));
            const result3 = applyGrooveOverrides(createParams(beat3, 'Kick'));

            expect(result1.shouldPlay).toBe(false);
            expect(result3.shouldPlay).toBe(true);
        });

        it('should play Steppers: Kick on every beat for Motif 1', () => {
            getState.mockReturnValue(mockState);
            let barIndexMotif1 = -1;
            for (let i = 0; i < 100; i++) {
                if (
                    getDrumMotif(((i * 137 + 42) % 256) / 256, 'Reggae', 0.8) === 1 &&
                    i % 4 !== 3
                ) {
                    barIndexMotif1 = i;
                    break;
                }
            }
            if (barIndexMotif1 === -1) {
                return;
            }

            const kickSteps = [0, 4, 8, 12].map((s) => barIndexMotif1 * 16 + s);
            for (const step of kickSteps) {
                const result = applyGrooveOverrides(createParams(step, 'Kick'));
                expect(result.shouldPlay).toBe(true);
            }
        });
    });
});
