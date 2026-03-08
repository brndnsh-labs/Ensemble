import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.1,
    blockAdjacentSnare: true,
    backbeatCrack: true,
    exemptFromPulseShaping: true, // Trap hats need exact velocities
};

export function getMotif(seed, complexity, _intensity = 1.0) {
    if (complexity < 0.3) {
        return 0; // Simple boom bap
    }
    if (seed < 0.33) {
        return 1; // Trap style 1
    }
    if (seed < 0.66) {
        return 2; // Trap style 2
    }
    return 3; // Heavily syncopated
}

export function applyOverrides(context, state) {
    const {
        inst,
        playback,
        isDownbeat,
        isBeatStart,
        isBackbeat,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        beatIndex,
        drumComplexity,
        sectionSeed,
        stepsPerBar,
        loopStep,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset } = state;
    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);
    const safeIsOffbeat = isOffbeat !== undefined ? isOffbeat : loopStep % (stepsPerBar / 8) === 2;
    const isEighthNote = isBeatStart || safeIsOffbeat;
    const subdivision = stepsPerBar / 4;

    if (inst.name === 'Kick') {
        shouldPlay = false;
        // Sparse kicks
        if (isDownbeat) {
            shouldPlay = true;
        } else if (activeMotif === 0) {
            if (loopStep === subdivision * 2.5) {
                // 'and' of 3
                shouldPlay = true;
            }
        } else if (activeMotif === 1) {
            if (loopStep === subdivision * 1.5 || loopStep === subdivision * 2.5) {
                shouldPlay = true;
            }
        } else if (activeMotif >= 2) {
            if (
                loopStep === subdivision * 1.75 ||
                loopStep === subdivision * 2.5 ||
                loopStep === subdivision * 3.25
            ) {
                shouldPlay = true;
            }
        }
        if (shouldPlay) {
            velocity = scaleVelocity(0.9, intensity, 0.2);
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;
        soundName = intensity < 0.4 ? 'Sidestick' : 'Snare';

        if (isBackbeat) {
            shouldPlay = true;
            velocity = 1.0;
        } else if (activeMotif === 3 && loopStep === subdivision * 3.75) {
            // syncopated snare hit
            shouldPlay = true;
            velocity = 0.7;
        }
    } else if (inst.name === 'HiHat' || inst.name === 'Open') {
        // Trap-style hats
        shouldPlay = isEighthNote;
        velocity = isBeatStart ? 0.8 : 0.6;
        soundName = 'HiHat';

        if (activeMotif > 0 && intensity > 0.4) {
            // Add 16th notes
            if (!shouldPlay && (isEOfBeat || isAOfBeat)) {
                if (activeMotif === 1 && beatIndex === 2) {
                    shouldPlay = true;
                }
                if (activeMotif === 2 && (beatIndex === 1 || beatIndex === 3)) {
                    shouldPlay = true;
                }
                if (activeMotif === 3) {
                    shouldPlay = true; // full 16ths in some beats
                }
            }
            // Add 32nd note rolls (simulated by playing very fast/low vel)
            if (shouldPlay && roll(0.1)) {
                velocity = 0.9; // Accent the start of a roll
            }
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
