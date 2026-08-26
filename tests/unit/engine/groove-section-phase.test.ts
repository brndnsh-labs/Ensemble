// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../../public/config.js';
import * as Blues from '../../../public/engine/grooves/blues.js';
import * as Funk from '../../../public/engine/grooves/funk.js';
import * as Latin from '../../../public/engine/grooves/latin.js';
import { getEffectiveTimeSignature, getEffectiveTimeSignatures } from '../../../public/meter.js';
import { getStepInfo } from '../../../public/utils.js';

const baseState = {
    shouldPlay: false,
    velocity: 0.9,
    soundName: 'Snare',
    instTimeOffset: 0,
};

function contextFor({
    step,
    localStep,
    ts,
    instName = 'Snare',
    sectionSeed = 0.5,
    motifCeiling = Number.POSITIVE_INFINITY,
    signatures = TIME_SIGNATURES,
}) {
    const stepsPerBar = ts.beats * ts.stepsPerBeat;
    const mStep = localStep % stepsPerBar;
    const info = getStepInfo(mStep, ts, [], signatures);
    return {
        step,
        inst: { name: instName, muted: false },
        stepVal: 0,
        playback: { bandIntensity: 0.9 },
        groove: {},
        isDownbeat: info.isMeasureStart,
        isBeatStart: info.isBeatStart,
        isPulse: info.isPulse,
        isPulseStart: info.isPulseStart,
        isGroupStart: info.isGroupStart,
        isBackbeat: info.isBackbeat,
        isOffbeat: info.isOffbeat,
        isEOfBeat: info.isEOfBeat,
        isAOfBeat: info.isAOfBeat,
        beatIndex: info.beatIndex,
        tsConfig: info.tsConfig,
        mStep,
        isCompound: info.isCompound,
        stepInGroup: info.stepInGroup,
        groupIndex: info.groupIndex,
        stepsPerBar,
        loopStep: mStep,
        drumComplexity: 1,
        motifIntensity: 0.9,
        motifCeiling,
        orchestration: null,
        barIndex: Math.floor(localStep / stepsPerBar),
        isFirstStepOfNewBar: mStep === 0,
        sectionSeed,
        isTurnaround: false,
        isSoloistBusy: false,
    };
}

describe('groove section-local phase', () => {
    it('starts the 6/8 Latin Bembe timeline at an offset section seam on every loop', () => {
        const ts = TIME_SIGNATURES['6/8'];
        const render = (transportStart) =>
            Array.from({ length: 24 }, (_, localStep) => {
                const result = Latin.applyOverrides(
                    contextFor({ step: transportStart + localStep, localStep, ts }),
                    baseState,
                );
                return result.shouldPlay ? { localStep, soundName: result.soundName } : null;
            }).filter(Boolean);

        // 14-step 7/8 section precedes this two-bar 6/8 section; total form = 38.
        const firstLoop = render(14);
        const secondLoop = render(38 + 14);
        expect(firstLoop).toEqual(secondLoop);
        expect(firstLoop.map((hit) => hit.localStep)).toEqual([0, 4, 8, 10, 14, 18, 22]);
        expect(firstLoop.every((hit) => hit.soundName === 'AgogoHigh')).toBe(true);
    });

    it('classifies Blues ghost slots from local measure phase across loops', () => {
        const random = vi.spyOn(Math, 'random').mockReturnValue(0);
        const ts = TIME_SIGNATURES['4/4'];
        const sectionSeed = Array.from({ length: 100 }, (_, index) => index / 100).find(
            (seed) => Blues.getMotif(seed, 1, 0.9) >= 2,
        );
        const render = (localStep, step) =>
            Blues.applyOverrides(contextFor({ step, localStep, ts, sectionSeed }), baseState)
                .shouldPlay;

        expect(render(1, 14 + 1)).toBe(false);
        expect(render(1, 38 + 14 + 1)).toBe(false);
        expect(render(15, 14 + 15)).toBe(true);
        expect(render(15, 38 + 14 + 15)).toBe(true);
        random.mockRestore();
    });

    it('feeds custom 7/8 grouping pulses into the Funk kick strategy', () => {
        const canonical = TIME_SIGNATURES['7/8'];
        const custom = getEffectiveTimeSignature('7/8', [3, 2, 2]);
        const customSignatures = getEffectiveTimeSignatures('7/8', [3, 2, 2]);
        const kickAtStepFour = (ts, signatures) =>
            Funk.applyOverrides(
                contextFor({
                    step: 4,
                    localStep: 4,
                    ts,
                    signatures,
                    instName: 'Kick',
                    motifCeiling: 0,
                }),
                { ...baseState, soundName: 'Kick' },
            ).shouldPlay;

        // Canonical 2+2+3 has a pulse/backbeat at step 4. Moving the authored
        // groups to 3+2+2 moves the pulse away, so Funk must stop accenting it.
        expect(kickAtStepFour(canonical, TIME_SIGNATURES)).toBe(true);
        expect(kickAtStepFour(custom, customSignatures)).toBe(false);
    });
});
