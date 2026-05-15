import {
    applyStandardBase,
    DEFAULT_CONFIG,
    type DrumStepBase,
    type GrooveContext,
} from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.05,
};

export function getMotif(_sectionSeed: number, drumComplexity: number, intensity: number): number {
    if (drumComplexity <= 0.2 || intensity < 0.3) {
        return 0; // Ultralight
    }
    if (intensity < 0.7) {
        return 1; // Sparse
    }
    return 2; // Slightly more active
}

export function applyOverrides(context: GrooveContext, state: DrumStepBase): DrumStepBase {
    const result = applyStandardBase(context, state);
    if (result.muted) {
        return result.base;
    }
    const { base } = result;

    const {
        isDownbeat,
        isBeatStart,
        isBackbeat,
        isOffbeat,
        beatIndex,
        drumComplexity,
        sectionSeed,
        stepsPerBar,
        loopStep,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity } = base;

    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);
    const safeIsOffbeat = isOffbeat !== undefined ? isOffbeat : loopStep % (stepsPerBar / 8) === 2;

    if (context.inst.name === 'Kick') {
        shouldPlay = false;
        if (isDownbeat) {
            shouldPlay = true;
        } else if (activeMotif === 1 && isBeatStart && beatIndex === 2) {
            shouldPlay = true; // Beat 3
        } else if (activeMotif === 2) {
            if (isBeatStart && beatIndex === 2) {
                shouldPlay = true;
            } else if (isOffbeat && beatIndex === 1) {
                shouldPlay = true; // Syncopation
            }
        }
    } else if (context.inst.name === 'Snare') {
        shouldPlay = false;
        // Metronomic backbeat
        if (isBackbeat) {
            shouldPlay = true;
            velocity = 0.8;
            if (intensity < 0.8) {
                soundName = 'Sidestick';
            } else {
                soundName = 'Snare';
            }
        }
    } else if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
        shouldPlay = false;
        if (isDownbeat) {
            shouldPlay = true;
            velocity = 0.7;
        } else if (activeMotif === 1 && isBeatStart) {
            shouldPlay = true;
            velocity = 0.6;
        } else if (activeMotif === 2 && (isBeatStart || safeIsOffbeat)) {
            shouldPlay = true;
            velocity = 0.4;
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
