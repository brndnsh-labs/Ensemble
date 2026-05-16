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
        soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
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
                isPulse: info.isPulse,
                isPulseStart: info.isPulseStart,
                isBeatStart: info.isBeatStart,
                isBackbeat: info.isBackbeat,
                isGroupStart: info.isGroupStart,
                beatIndex: info.beatIndex,
                isOffbeat: info.isOffbeat,
                isEOfBeat: info.isEOfBeat,
                isAOfBeat: info.isAOfBeat,
                tsConfig: info.tsConfig,
            };
        };

        it('should play One Drop: Kick only on backbeat for Motif 0', () => {
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

            const ts44 = TIME_SIGNATURES['4/4'];
            for (let step = 0; step < 16; step++) {
                const info = getStepInfo(step, ts44, [], TIME_SIGNATURES);
                const absStep = barIndexMotif0 * 16 + step;
                const result = applyGrooveOverrides(getState(), createParams(absStep, 'Kick'));

                if (info.isBeatStart && info.isBackbeat) {
                    expect(result.shouldPlay).toBe(true);
                } else {
                    expect(result.shouldPlay).toBe(false);
                }
            }
        });

        it('should play Steppers: Kick on every pulse start for Motif 1', () => {
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

            const ts44 = TIME_SIGNATURES['4/4'];
            for (let step = 0; step < 16; step++) {
                const info = getStepInfo(step, ts44, [], TIME_SIGNATURES);
                const absStep = barIndexMotif1 * 16 + step;
                const result = applyGrooveOverrides(getState(), createParams(absStep, 'Kick'));

                if (info.isPulseStart) {
                    expect(result.shouldPlay).toBe(true);
                }
            }
        });
    });
});
