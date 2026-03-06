import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

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
        playback,
        isDownbeat,
        isBeatStart,
        isBackbeat,
        isOffbeat,
        beatIndex,
        drumComplexity,
        sectionSeed,
        isTurnaround,
        stepsPerBar,
        loopStep,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    const halfBarStep = Math.floor(stepsPerBar / 2);
    const isEighthNote = isBeatStart || isOffbeat;

    if (inst.name === 'HiHat' || inst.name === 'Open') {
        if (isTurnaround && loopStep >= halfBarStep) {
            shouldPlay = false;
        } else {
            if (isEighthNote) {
                shouldPlay = true;
                velocity = isBeatStart ? 1.05 : 0.85;

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
        if (isBeatStart && !isBackbeat) {
            shouldPlay = true;
        } else if (activeMotif === 1) {
            if (isOffbeat && (beatIndex === 1 || beatIndex === 2)) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2) {
            if (isOffbeat && beatIndex === 2) {
                shouldPlay = true;
            }
        } else if (activeMotif === 3) {
            if (isOffbeat && (beatIndex === 1 || beatIndex === 3)) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = isDownbeat ? 1.25 : 1.1;
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;

        if (isBackbeat) {
            shouldPlay = true;
        }

        if (isTurnaround && loopStep >= halfBarStep) {
            if (isEighthNote && roll(0.4)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.8, Math.random(), 0.2);
            }
        } else {
            if (!shouldPlay && !isEighthNote && (beatIndex === 1 || beatIndex === 2)) {
                if (intensity > 0.4 && intensity < 0.75 && roll(0.08)) {
                    shouldPlay = true;
                    velocity = 0.25;
                }
            }
        }

        if (shouldPlay) {
            if (isBackbeat) {
                velocity = 1.15;
            }
            if (intensity < 0.25) {
                soundName = 'Sidestick';
            }
        }
    } else if (inst.name.includes('Tom')) {
        if (isTurnaround && loopStep >= halfBarStep) {
            if (isEighthNote && roll(0.6)) {
                shouldPlay = true;
                velocity = 1.1;
            }
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
