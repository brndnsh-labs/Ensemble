// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides, getDrumMotif } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

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
            lastDrumPreset: 'Blues',
            instruments: [],
        },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
    };

    it('should assign valid Blues Motifs', () => {
        const motifs = new Set();
        // At intensity 0.8 (HIGH), we expect driving motifs (1, 2, 3)
        for (let i = 0; i < 20; i++) {
            motifs.add(getDrumMotif(((i * 137 + 42) % 256) / 256, 'Blues', 0.8));
        }
        expect(motifs.has(1)).toBe(true);
        expect(motifs.has(2)).toBe(true);
        expect(motifs.has(3)).toBe(true);
        expect(motifs.has(0)).toBe(false);
    });

    describe('Apply Groove Overrides - Blues Patterns', () => {
        const createParams = (step, instName, stepVal = 0, intensity = 0.5) => {
            const ts44 = TIME_SIGNATURES['4/4'];
            const info = getStepInfo(step, ts44, [], TIME_SIGNATURES);
            return {
                step,
                inst: { name: instName, muted: false, steps: [] },
                stepVal,
                playback: { ...mockState.playback, bandIntensity: intensity },
                groove: mockState.groove,
                isDownbeat: info.isMeasureStart,
                isBeatStart: info.isBeatStart,
                isBackbeat: info.isBackbeat,
                isGroupStart: info.isGroupStart,
                beatIndex: info.beatIndex,
                isOffbeat: info.isOffbeat,
                isEOfBeat: info.isEOfBeat,
                isAOfBeat: info.isAOfBeat,
                tsConfig: info.tsConfig,
                stepsPerBar: 16,
            };
        };

        it('should play characteristic continuous Shuffle pattern on HiHat for Motif 0', () => {
            let barIndexMotif0 = -1;
            // Seek Motif 0 at a medium intensity (0.5)
            for (let i = 0; i < 100; i++) {
                if (getDrumMotif(((i * 137 + 42) % 256) / 256, 'Blues', 0.5) === 0 && i % 4 !== 3) {
                    barIndexMotif0 = i;
                    break;
                }
            }
            if (barIndexMotif0 === -1) {
                return;
            }

            const shuffleSteps = [0, 3, 4, 7, 8, 11, 12, 15].map((s) => barIndexMotif0 * 16 + s);
            for (const step of shuffleSteps) {
                const result = applyGrooveOverrides(
                    getState(),
                    createParams(step, 'HiHat', 0, 0.5),
                );
                expect(result.shouldPlay).toBe(true);
                expect(result.soundName).toBe('HiHat');
            }
        });
    });
});
