// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides, getDrumMotif } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';
import { findSectionForMotif, sectionSweepArranger } from '../utils/groove-seed.js';

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
            groove: { genreFeel: 'Rock', lastDrumPreset: 'Rock' },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
            arranger: { sectionMap: [{ start: 0, end: 64 }] }, // 4 measures
        };

        const createParams = (step, instName, stepVal = 0, playback = mockState.playback) => {
            const ts44 = TIME_SIGNATURES['4/4'];
            const info = getStepInfo(step, ts44, [], TIME_SIGNATURES);
            return {
                step,
                inst: { name: instName, muted: false, steps: [] },
                stepVal,
                playback,
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
            // #791: the groove engine derives a sticky sectionSeed from the
            // arranger's (sectionId, songSeed) instead of a per-bar formula, so
            // we drive a sweep arranger and locate a section the engine actually
            // plays as Motif 1 (the driving double-kick). Intensity must match
            // what the engine reads (params.playback = mockState's 0.8) so the
            // predicted motif and the live motif agree.
            const sweepState = { ...mockState, arranger: sectionSweepArranger(256) };
            getState.mockReturnValue(sweepState);

            const section = findSectionForMotif(1, 'Rock', {
                intensity: mockState.playback.bandIntensity,
            });
            expect(section).toBeGreaterThanOrEqual(0);

            const step1AndOf1 = section * 16 + 2; // step 2 is the & of 1
            const resultKick = applyGrooveOverrides(getState(), createParams(step1AndOf1, 'Kick'));
            // Motif 1's double-kick fires the offbeat after every non-backbeat
            // pulse — the & of 1 is exactly that slot.
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
            // #791: drive a sweep arranger (sticky per-section seeds) so the
            // phrase-end articulation is exercised across the motif vocabulary.
            // The engine reads intensity from params.playback (not getState's
            // snapshot), so the high-intensity claim is carried on the params.
            const highPlayback = { ...mockState.playback, bandIntensity: 0.9 };
            const sweepState = { ...mockState, arranger: sectionSweepArranger(256) };
            getState.mockReturnValue(sweepState);

            const phraseEndStep = 14; // & of 4

            // Locate a section whose phrase-end (&4) routes to the controlled
            // half-open. The bigger lift/anthem sections deliberately stay full
            // 'Open' — those are a different gesture, not under test here.
            let section = -1;
            for (let i = 0; i < 256; i++) {
                const probe = applyGrooveOverrides(
                    getState(),
                    createParams(i * 16 + phraseEndStep, 'HiHat', 2, highPlayback),
                );
                if (probe.shouldPlay && probe.soundName === 'HiHatHalf') {
                    section = i;
                    break;
                }
            }
            expect(section).toBeGreaterThanOrEqual(0);

            const step = section * 16 + phraseEndStep;
            const closedLane = applyGrooveOverrides(
                getState(),
                createParams(step, 'HiHat', 2, highPlayback),
            );
            const openLane = applyGrooveOverrides(
                getState(),
                createParams(step, 'Open', 0, highPlayback),
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
