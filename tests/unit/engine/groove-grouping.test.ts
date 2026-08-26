import { describe, expect, it } from 'vitest';
import { checkBassActiveStyle } from '../../../public/engine/bass-styles.js';
import {
    applyOverrides as applyAcousticOverrides,
    getMotif as getAcousticMotif,
} from '../../../public/engine/grooves/acoustic.js';
import {
    applyOverrides as applyReggaeOverrides,
    getMotif as getReggaeMotif,
} from '../../../public/engine/grooves/reggae.js';
import type { DrumStepBase, GrooveContext } from '../../../public/engine/grooves/utils.js';
import { getEffectiveTimeSignature, getEffectiveTimeSignatures } from '../../../public/meter.js';
import type { StepInfo } from '../../../public/types.js';
import { getStepInfo } from '../../../public/utils.js';

type MotifSelector = (seed: number, complexity: number, intensity: number) => number;
type GrooveStrategy = (context: GrooveContext, state: DrumStepBase) => DrumStepBase;

function seedForMotif(selector: MotifSelector, target: number, intensity: number): number {
    for (let index = 0; index < 1000; index += 1) {
        const seed = index / 1000;
        if (selector(seed, 0.8, intensity) === target) {
            return seed;
        }
    }
    throw new Error(`No deterministic seed found for motif ${target}`);
}

function contextFor(
    stepInfo: StepInfo,
    instName: string,
    intensity: number,
    sectionSeed: number,
): GrooveContext {
    const stepsPerBar = stepInfo.tsConfig.beats * stepInfo.tsConfig.stepsPerBeat;
    return {
        step: stepInfo.mStep,
        inst: { name: instName, muted: false },
        stepVal: 0,
        playback: { bandIntensity: intensity, bpm: 75 },
        groove: {},
        isDownbeat: stepInfo.isMeasureStart,
        isBeatStart: stepInfo.isBeatStart,
        isPulse: stepInfo.isPulse === true,
        isPulseStart: stepInfo.isPulseStart === true,
        isGroupStart: stepInfo.isGroupStart,
        isBackbeat: stepInfo.isBackbeat,
        isOffbeat: stepInfo.isOffbeat,
        isEOfBeat: stepInfo.isEOfBeat,
        isAOfBeat: stepInfo.isAOfBeat,
        beatIndex: stepInfo.beatIndex,
        tsConfig: stepInfo.tsConfig,
        mStep: stepInfo.mStep,
        isCompound: stepInfo.isCompound === true,
        stepInGroup: stepInfo.stepInGroup,
        groupIndex: stepInfo.groupIndex,
        stepsPerBar,
        loopStep: stepInfo.mStep,
        drumComplexity: 0.8,
        motifIntensity: intensity,
        motifCeiling: Number.POSITIVE_INFINITY,
        orchestration: null,
        barIndex: 0,
        isFirstStepOfNewBar: stepInfo.isMeasureStart,
        sectionSeed,
        isTurnaround: false,
        isSoloistBusy: false,
        rollBaseSeed: 1,
    };
}

function groupedStepInfo(grouping: number[]): StepInfo[] {
    const ts = getEffectiveTimeSignature('5/4', grouping);
    const signatures = getEffectiveTimeSignatures('5/4', grouping);
    return Array.from({ length: ts.beats * ts.stepsPerBeat }, (_, step) =>
        getStepInfo(step, ts, [], signatures),
    );
}

function strategyHits(
    strategy: GrooveStrategy,
    grouping: number[],
    instName: string,
    intensity: number,
    sectionSeed: number,
): number[] {
    const initial: DrumStepBase = {
        shouldPlay: false,
        velocity: 0.9,
        soundName: instName,
        instTimeOffset: 0,
    };
    return groupedStepInfo(grouping)
        .filter(
            (info) =>
                strategy(contextFor(info, instName, intensity, sectionSeed), initial).shouldPlay,
        )
        .map((info) => info.mStep);
}

describe('authored grouping reaches groove accents', () => {
    it('moves the Acoustic half-time anchor between 5/4 groupings', () => {
        const intensity = 0.4;
        const motifZeroSeed = seedForMotif(getAcousticMotif, 0, intensity);

        expect(
            strategyHits(applyAcousticOverrides, [3, 2], 'Snare', intensity, motifZeroSeed),
        ).toEqual([12]);
        expect(
            strategyHits(applyAcousticOverrides, [2, 3], 'Snare', intensity, motifZeroSeed),
        ).toEqual([8]);
    });

    it('keeps Reggae One Drop kit and bass on the same authored group boundary', () => {
        const intensity = 0.4;
        const motifZeroSeed = seedForMotif(getReggaeMotif, 0, intensity);

        for (const [grouping, expectedStep] of [
            [[3, 2], 12],
            [[2, 3], 8],
        ] as const) {
            expect(
                strategyHits(applyReggaeOverrides, [...grouping], 'Kick', intensity, motifZeroSeed),
            ).toEqual([expectedStep]);
            expect(
                strategyHits(
                    applyReggaeOverrides,
                    [...grouping],
                    'Snare',
                    intensity,
                    motifZeroSeed,
                ),
            ).toEqual([expectedStep]);

            const bassHits = groupedStepInfo([...grouping])
                .filter((info) =>
                    checkBassActiveStyle(
                        'dub',
                        info.mStep,
                        info.mStep,
                        info,
                        info.tsConfig,
                        info.beatIndex,
                        info.isBeatStart,
                        info.isEighthBoundary,
                        { bandIntensity: intensity, currentLoopCount: 0 } as never,
                        {} as never,
                    ),
                )
                .map((info) => info.mStep);
            expect(bassHits).toEqual([expectedStep]);
        }
    });
});
