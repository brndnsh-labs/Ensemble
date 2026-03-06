import { DEFAULT_CONFIG, getStepIndices, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.08,
    blockAdjacentSnare: true,
    backbeatCrack: true,
};

export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0;
    }
    if (intensity < 0.6) {
        return seed < 0.75 ? 0 : 2;
    }
    if (intensity < INTENSITY_BANDS.HIGH) {
        if (seed < 0.4) {
            return 0;
        }
        if (seed < 0.7) {
            return 2;
        }
        return 1;
    }
    if (seed < 0.25) {
        return 0;
    }
    if (seed < 0.5) {
        return 1;
    }
    if (seed < 0.75) {
        return 2;
    }
    return 3;
}

export function applyOverrides(context, state) {
    const {
        inst,
        loopStep,
        playback,
        isDownbeat,
        drumComplexity,
        sectionSeed,
        isTurnaround,
        stepsPerBar,
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    const halfBar = Math.floor(stepsPerBar / 2);

    if (inst.name === 'HiHat' || inst.name === 'Open') {
        if (isTurnaround && loopStep > halfBar - 1) {
            shouldPlay = false;
        } else {
            if (loopStep % 2 === 0) {
                shouldPlay = true;
                velocity = loopStep % Math.floor(stepsPerBar / 4) === 0 ? 1.05 : 0.85;

                if (intensity > 0.7) {
                    soundName = 'Open';
                    velocity *= 1.1;
                } else {
                    soundName = 'HiHat';
                }
            }
        }
    } else if (inst.name === 'Kick') {
        shouldPlay = false;
        const kickSteps = getStepIndices(stepsPerBar, [0, 8 / 16]);
        const syncKicks = getStepIndices(stepsPerBar, [6 / 16, 10 / 16, 14 / 16]);

        if (kickSteps.includes(loopStep)) {
            shouldPlay = true;
        } else if (activeMotif === 1) {
            if (loopStep === syncKicks[0] || loopStep === syncKicks[1]) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2) {
            if (loopStep === syncKicks[1]) {
                shouldPlay = true;
            }
        } else if (activeMotif === 3) {
            if (loopStep === syncKicks[0] || loopStep === syncKicks[2]) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = isDownbeat ? 1.25 : 1.1;
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;
        const backbeats = getStepIndices(stepsPerBar, [4 / 16, 12 / 16]);

        if (backbeats.includes(loopStep)) {
            shouldPlay = true;
        }

        if (isTurnaround && loopStep > halfBar - 1) {
            const fills = getStepIndices(stepsPerBar, [8 / 16, 10 / 16, 14 / 16]);
            if (fills.includes(loopStep) && roll(0.4)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.8, Math.random(), 0.2);
            }
        } else {
            const ghosts = getStepIndices(stepsPerBar, [7 / 16, 9 / 16]);
            if (!shouldPlay && ghosts.includes(loopStep)) {
                if (intensity > 0.4 && intensity < 0.75 && roll(0.08)) {
                    shouldPlay = true;
                    velocity = 0.25;
                }
            }
        }

        if (shouldPlay) {
            if (backbeats.includes(loopStep)) {
                velocity = 1.15;
            }
            if (intensity < 0.25) {
                soundName = 'Sidestick';
            }
        }
    } else if (inst.name.includes('Tom')) {
        if (isTurnaround && loopStep > halfBar - 1) {
            const fills = getStepIndices(stepsPerBar, [8 / 16, 10 / 16, 12 / 16, 14 / 16]);
            if (fills.includes(loopStep) && roll(0.6)) {
                shouldPlay = true;
                velocity = 1.1;
            }
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
