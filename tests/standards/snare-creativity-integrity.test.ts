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

describe('Snare Creativity Integrity', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const mockState = {
        playback: { bandIntensity: 0.8, bpm: 90, songMode: false },
        groove: {
            genreFeel: 'Blues',
            creativity: true,
            lastDrumPreset: 'Blues',
            instruments: [],
        },
        arranger: { timeSignature: '4/4', stepMap: [] },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
    };

    it('should have a reasonable number of snare hits in Blues even with creativity enabled', () => {
        getState.mockReturnValue(mockState);

        let totalExtraSnareHits = 0;
        const numBars = 100;
        const ts44 = TIME_SIGNATURES['4/4'];

        for (let bar = 0; bar < numBars; bar++) {
            let barSnareHits = 0;
            for (let step = 0; step < 16; step++) {
                const globalStep = bar * 16 + step;
                const info = getStepInfo(globalStep, ts44, [], TIME_SIGNATURES);
                const params = {
                    step: globalStep,
                    inst: { name: 'Snare', muted: false, steps: [] },
                    stepVal: 0,
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

                const result = applyGrooveOverrides(getState(), params);
                if (result.shouldPlay) {
                    if (step !== 4 && step !== 12) {
                        barSnareHits++;
                    }
                }
            }
            totalExtraSnareHits += barSnareHits;
        }

        const averageExtraHits = totalExtraSnareHits / numBars;
        console.log(
            `[Snare Creativity] Blues extra snare hits/bar (excluding backbeats): ${averageExtraHits.toFixed(2)} (Target: <2.0)`,
        );
        // Texas-shuffle ghosts at intensity 0.8 fire on isOffbeat positions. Engine
        // delivers ~1.3-1.5/bar including the entropy phase.
        expect(averageExtraHits).toBeLessThan(2.0);
        // Also assert a positive floor — a Blues engine that emits ZERO ghost snares
        // at intensity 0.8 has lost its Texas shuffle character. Catches regression
        // in the snare lane gating.
        expect(averageExtraHits).toBeGreaterThan(0.5);
    });

    it('should avoid snare hits immediately after the backbeat (steps 5 and 13) in Blues', () => {
        getState.mockReturnValue(mockState);

        let hitsOnStep5Or13 = 0;
        const numBars = 200;
        const ts44 = TIME_SIGNATURES['4/4'];

        for (let bar = 0; bar < numBars; bar++) {
            for (const step of [5, 13]) {
                const globalStep = bar * 16 + step;
                const info = getStepInfo(globalStep, ts44, [], TIME_SIGNATURES);
                const params = {
                    step: globalStep,
                    inst: { name: 'Snare', muted: false, steps: [] },
                    stepVal: 0,
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

                const result = applyGrooveOverrides(getState(), params);
                if (result.shouldPlay) {
                    hitsOnStep5Or13++;
                }
            }
        }

        const hitRate = hitsOnStep5Or13 / (numBars * 2);
        // Step 5 and 13 should be blocked for Blues, so rate should be exactly zero.
        expect(hitRate).toBe(0);
    });
});
