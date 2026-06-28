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

describe('Reggae Groove Integrity', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const mockState = {
        playback: { bandIntensity: 0.8, bpm: 75, songMode: false },
        groove: {
            genreFeel: 'Reggae',
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

        // #791: the engine now derives ONE sticky sectionSeed per
        // (sectionId, songSeed) instead of a per-bar formula. Drive a section
        // that actually plays the target motif under that deterministic seed
        // (via the shared sweep arranger) rather than replaying the old formula.
        const seedMock = { ...mockState, arranger: sectionSweepArranger(256) };

        it('should play a true One Drop: Kick on beat 3 only for Motif 0 (#794)', () => {
            getState.mockReturnValue(seedMock);
            const section = findSectionForMotif(0, 'Reggae');
            expect(section).toBeGreaterThanOrEqual(0);

            const ts44 = TIME_SIGNATURES['4/4'];
            for (let step = 0; step < 16; step++) {
                const info = getStepInfo(step, ts44, [], TIME_SIGNATURES);
                const absStep = section * 16 + step;
                const result = applyGrooveOverrides(getState(), createParams(absStep, 'Kick'));

                // True One Drop: a single kick on beat 3 (beatIndex===2), beats 1/2/4 empty.
                if (info.beatIndex === 2 && info.isBeatStart) {
                    expect(result.shouldPlay).toBe(true);
                } else {
                    expect(result.shouldPlay).toBe(false);
                }
            }
        });

        it('should play Steppers: Kick on every pulse start for Motif 1', () => {
            getState.mockReturnValue(seedMock);
            const section = findSectionForMotif(1, 'Reggae');
            expect(section).toBeGreaterThanOrEqual(0);

            const ts44 = TIME_SIGNATURES['4/4'];
            for (let step = 0; step < 16; step++) {
                const info = getStepInfo(step, ts44, [], TIME_SIGNATURES);
                const absStep = section * 16 + step;
                const result = applyGrooveOverrides(getState(), createParams(absStep, 'Kick'));

                if (info.isPulseStart) {
                    expect(result.shouldPlay).toBe(true);
                }
            }
        });
    });
});
