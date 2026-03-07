import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.06,
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
        isEOfBeat,
        isAOfBeat,
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
    // isOffbeat should be passed in context, fallback to manual check if missing
    const safeIsOffbeat = isOffbeat !== undefined ? isOffbeat : loopStep % (stepsPerBar / 8) === 2;
    const isEighthNote = isBeatStart || safeIsOffbeat;

    if (inst.name === 'HiHat' || inst.name === 'Open') {
        if (isTurnaround && loopStep >= halfBarStep) {
            shouldPlay = false;
        } else if (!shouldPlay) {
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
        if (!shouldPlay) {
            shouldPlay = false;
            if (isBeatStart && !isBackbeat) {
                shouldPlay = true;
            } else {
                if (activeMotif === 1) {
                    if (safeIsOffbeat && (beatIndex === 1 || beatIndex === 2)) {
                        shouldPlay = true;
                    }
                } else if (activeMotif === 2) {
                    if (safeIsOffbeat && beatIndex === 2) {
                        shouldPlay = true;
                    }
                } else if (activeMotif === 3) {
                    if (safeIsOffbeat && (beatIndex === 1 || beatIndex === 3)) {
                        shouldPlay = true;
                    }
                }
            }

            if (shouldPlay) {
                velocity = isDownbeat ? 1.25 : 1.1;
            }
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;

        if (isBackbeat) {
            shouldPlay = true;
        }

        if (isTurnaround && loopStep >= halfBarStep && drumComplexity > 0.5) {
            if (isEighthNote && roll(0.4)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.8, Math.random(), 0.2);
            }
        } else if (drumComplexity > 0.5) {
            if (!shouldPlay && ((isAOfBeat && beatIndex === 1) || (isEOfBeat && beatIndex === 2))) {
                // Restore intensity gate to prevent ghosting at max or min intensities
                if (intensity > 0.4 && intensity < 0.8 && roll(0.12)) {
                    shouldPlay = true;
                    velocity = scaleVelocity(0.25, Math.random(), 0.2);
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
        if (isTurnaround && loopStep >= halfBarStep && drumComplexity > 0.5) {
            if (isEighthNote && roll(0.6)) {
                shouldPlay = true;
                velocity = 1.1;
            }
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
