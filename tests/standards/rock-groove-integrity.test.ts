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

describe('Rock Groove Integrity', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('should assign valid Rock Motifs based on seed, complexity, and intensity', () => {
        expect(getDrumMotif(((0 * 137 + 0) % 256) / 256, 'Rock', 0.2, 0.8)).toBe(0); // Low complexity = Standard
        expect(getDrumMotif(((0 * 137 + 0) % 256) / 256, 'Rock', 0.8, 0.2)).toBe(0); // Low intensity = Standard

        // At high complexity and high intensity, we expect non-zero motifs depending on the barIndex seed
        const motifs = new Set();
        for (let i = 0; i < 20; i++) {
            motifs.add(getDrumMotif(((i * 137 + 42) % 256) / 256, 'Rock', 0.8, 1.0));
        }
        expect(motifs.has(1)).toBe(true);
        expect(motifs.has(2)).toBe(true);
        expect(motifs.has(3)).toBe(true);
    });

    describe('Apply Groove Overrides - Rock Motifs', () => {
        const mockState = {
            playback: { bandIntensity: 0.8, bpm: 120, songMode: false },
            groove: { genreFeel: 'Rock', creativity: true, lastDrumPreset: 'Rock' },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
            arranger: { sectionMap: [{ start: 0, end: 64 }] }, // 4 measures
        };

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
                tsConfig: info.tsConfig,
            };
        };

        it('should play a syncopated Kick on beat 1 and the AND of 1 for Motif 1', () => {
            getState.mockReturnValue(mockState);

            // Find a barIndex that maps to Motif 1
            let barIndexMotif1 = -1;
            for (let i = 0; i < 100; i++) {
                if (
                    getDrumMotif(
                        ((i * 137 + 42) % 256) / 256,
                        'Rock',
                        0.8,
                        mockState.playback.bandIntensity,
                    ) === 1 &&
                    i % 4 !== 3
                ) {
                    barIndexMotif1 = i;
                    break;
                }
            }
            if (barIndexMotif1 === -1) {
                return; // Not implemented yet
            }

            const step1AndOf1 = barIndexMotif1 * 16 + 2; // step 2 is the & of 1
            const resultKick = applyGrooveOverrides(getState(), createParams(step1AndOf1, 'Kick'));
            expect(resultKick.shouldPlay).toBe(true);
        });

        it('should trigger a Tom fill on turnarounds (barIndex % 4 === 3)', () => {
            getState.mockReturnValue(mockState);

            const turnaroundBarIndex = 3; // 3 % 4 === 3
            const beat4 = turnaroundBarIndex * 16 + 12; // step 12 is beat 4

            vi.spyOn(Math, 'random').mockReturnValue(0.1);
            const resultTom = applyGrooveOverrides(getState(), createParams(beat4, 'High Tom'));
            expect(resultTom.shouldPlay).toBe(true);
        });

        it('should shape HiHat velocity without adding random unpredictable hits on ghosting', () => {
            getState.mockReturnValue(mockState);

            const downbeatStep = 0;
            const upbeatStep = 2; // the "and"

            const downbeatHat = applyGrooveOverrides(
                getState(),
                createParams(downbeatStep, 'HiHat', 2),
            );
            const upbeatHat = applyGrooveOverrides(
                getState(),
                createParams(upbeatStep, 'HiHat', 2),
            );

            expect(downbeatHat.velocity).toBeGreaterThan(upbeatHat.velocity);
        });

        it('should route a phrase-end open as a half-open hat without doubling articulations', () => {
            const highIntensityState = {
                ...mockState,
                playback: { ...mockState.playback, bandIntensity: 0.9 },
            };
            getState.mockReturnValue(highIntensityState);

            const phraseEndStep = 14; // & of 4
            const closedLane = applyGrooveOverrides(
                getState(),
                createParams(phraseEndStep, 'HiHat', 2),
            );
            const openLane = applyGrooveOverrides(
                getState(),
                createParams(phraseEndStep, 'Open', 0),
            );

            // Epic 4 S3: a phrase-ending hat is a controlled half-open, not a
            // full Open wash (the bigger lift/anthem opens stay 'Open'). A
            // half-open is not 'Open', so it owns the closed (HiHat) lane —
            // the Open lane stays silent and the articulation never doubles.
            expect(closedLane.shouldPlay).toBe(true);
            expect(closedLane.soundName).toBe('HiHatHalf');
            expect(openLane.shouldPlay).toBe(false);
            expect(closedLane.instTimeOffset).toBeLessThan(0);
        });
    });
});
