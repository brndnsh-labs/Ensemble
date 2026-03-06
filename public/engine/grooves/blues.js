import { DEFAULT_CONFIG, getStepIndices, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.08,
    blockAdjacentSnare: true,
    backbeatCrack: false,
};

export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0;
    }
    if (intensity < 0.6) {
        return seed < 0.8 ? 0 : 2;
    }
    if (intensity < INTENSITY_BANDS.HIGH) {
        if (seed < 0.5) {
            return 0;
        }
        if (seed < 0.8) {
            return 2;
        }
        return 1;
    }
    if (seed < 0.3) {
        return 0;
    }
    if (seed < 0.6) {
        return 2;
    }
    if (seed < 0.75) {
        return 1;
    }
    return 3;
}

export function applyOverrides(context, state) {
    const { inst, loopStep, playback, drumComplexity, sectionSeed, stepsPerBar } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    if (inst.name === 'Open' && loopStep === 0 && intensity > 0.8 && roll(0.25)) {
        shouldPlay = true;
        velocity = 1.2;
        soundName = 'Crash';
        return { shouldPlay, velocity, soundName, instTimeOffset };
    }

    if (inst.name === 'HiHat' || inst.name === 'Open') {
        shouldPlay = false;
        if (activeMotif === 0 || activeMotif === 2 || activeMotif === 3) {
            const patternSteps = getStepIndices(stepsPerBar, [0, 6 / 16, 8 / 16, 14 / 16]);
            if (patternSteps.includes(loopStep)) {
                shouldPlay = true;
                soundName = activeMotif === 2 ? 'Open' : 'HiHat';

                if (loopStep === patternSteps[1] || loopStep === patternSteps[3]) {
                    velocity = scaleVelocity(0.6, intensity, 0.1);
                } else if (loopStep === patternSteps[0] || loopStep === patternSteps[2]) {
                    velocity = scaleVelocity(0.85, intensity, 0.2);
                }
            }
        } else if (activeMotif === 1) {
            if (loopStep % 2 === 0) {
                shouldPlay = true;
                velocity = 0.9;
            }
        }
    } else if (inst.name === 'Kick') {
        shouldPlay = false;
        const kickSteps = getStepIndices(stepsPerBar, [0, 8 / 16]);
        if (kickSteps.includes(loopStep)) {
            shouldPlay = true;
        }

        const syncKick = getStepIndices(stepsPerBar, [6 / 16])[0];
        if (activeMotif === 3 && loopStep === syncKick) {
            shouldPlay = true;
        }

        if (shouldPlay) {
            velocity = 1.15;
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;
        const backbeats = getStepIndices(stepsPerBar, [4 / 16, 12 / 16]);
        if (backbeats.includes(loopStep)) {
            shouldPlay = true;
            velocity = 1.15;
        }

        if (intensity > 0.6) {
            const ghosts = getStepIndices(stepsPerBar, [3 / 16, 11 / 16]);
            if (activeMotif === 0 && ghosts.includes(loopStep) && roll(0.4)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.4, intensity, 0.1);
                instTimeOffset += 0.005;
            }

            if (activeMotif === 3) {
                const lateGhosts = getStepIndices(stepsPerBar, [10 / 16, 14 / 16]);
                if (loopStep === lateGhosts[1] && roll(0.6)) {
                    shouldPlay = true;
                    velocity = 0.7;
                }
                if (loopStep === lateGhosts[0] && roll(0.4)) {
                    shouldPlay = true;
                    velocity = 0.5;
                }
            }
        }
    }

    if (shouldPlay && inst.name === 'Snare' && intensity < 0.35) {
        soundName = 'Sidestick';
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
