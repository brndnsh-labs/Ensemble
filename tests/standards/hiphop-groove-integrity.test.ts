// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Hip Hop Groove Integrity', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const mockState = {
        playback: { bandIntensity: 0.85, bpm: 90, songMode: false },
        groove: {
            genreFeel: 'Hip Hop',
            lastDrumPreset: 'Hip Hop',
            instruments: [],
            sectionSeedMap: { 1: 0.75 },
        },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        arranger: {
            timeSignature: '4/4',
            sectionMap: [{ start: 0, end: 64 }],
            stepMap: [{ start: 0, end: 1000, chord: { sectionId: '1' } }],
        },
    };

    const createParams = (state, step, instName, stepVal = 0) => {
        const ts44 = TIME_SIGNATURES['4/4'];
        const info = getStepInfo(step, ts44, [], TIME_SIGNATURES);
        return {
            step,
            inst: { name: instName, muted: false, steps: [] },
            stepVal,
            playback: state.playback,
            groove: state.groove,
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

    it('should route trap phrase-release accents to the open lane without doubling the closed stream', () => {
        getState.mockReturnValue(mockState);

        const releaseState = {
            ...mockState,
            groove: { ...mockState.groove, sectionSeedMap: { 1: 0.65 } },
        };
        getState.mockReturnValue(releaseState);

        const releaseStep = 14; // & of 4
        const closedLane = applyGrooveOverrides(
            getState(),
            createParams(releaseState, releaseStep, 'HiHat'),
        );
        const openLane = applyGrooveOverrides(
            getState(),
            createParams(releaseState, releaseStep, 'Open'),
        );

        expect(closedLane.shouldPlay).toBe(false);
        expect(openLane.shouldPlay).toBe(true);
        expect(openLane.soundName).toBe('Open');
    });

    it('should keep boom bap offbeats on the closed lane when the phrase is not releasing', () => {
        const boomBapState = {
            ...mockState,
            playback: { ...mockState.playback, bandIntensity: 0.55 },
            groove: { ...mockState.groove, sectionSeedMap: { 1: 0.1 } },
        };
        getState.mockReturnValue(boomBapState);

        const offbeat = 6; // & of 2
        const closedLane = applyGrooveOverrides(
            getState(),
            createParams(boomBapState, offbeat, 'HiHat'),
        );
        const openLane = applyGrooveOverrides(
            getState(),
            createParams(boomBapState, offbeat, 'Open'),
        );

        expect(closedLane.shouldPlay).toBe(true);
        expect(closedLane.soundName).toBe('HiHat');
        expect(openLane.shouldPlay).toBe(false);
    });
});
