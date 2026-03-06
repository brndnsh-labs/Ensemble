import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

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
    const {
        inst,
        playback,
        isDownbeat,
        isBeatStart,
        isBackbeat,
        isOffbeat,
        isAOfBeat,
        beatIndex,
        drumComplexity,
        sectionSeed,
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    if (inst.name === 'Open' && isDownbeat && intensity > 0.8 && roll(0.25)) {
        shouldPlay = true;
        velocity = 1.2;
        soundName = 'Crash';
        return { shouldPlay, velocity, soundName, instTimeOffset };
    }

    if (inst.name === 'HiHat' || inst.name === 'Open') {
        shouldPlay = false;
        if (activeMotif === 0 || activeMotif === 2 || activeMotif === 3) {
            if (
                (isBeatStart && (beatIndex === 0 || beatIndex === 2)) ||
                (isOffbeat && (beatIndex === 1 || beatIndex === 3))
            ) {
                shouldPlay = true;
                soundName = activeMotif === 2 ? 'Open' : 'HiHat';

                if (isOffbeat) {
                    velocity = scaleVelocity(0.6, intensity, 0.1);
                } else {
                    velocity = scaleVelocity(0.85, intensity, 0.2);
                }
            }
        } else if (activeMotif === 1) {
            if (isBeatStart || isOffbeat) {
                shouldPlay = true;
                velocity = 0.9;
            }
        }
    } else if (inst.name === 'Kick') {
        shouldPlay = false;
        if (isBeatStart && !isBackbeat) {
            shouldPlay = true;
        }

        if (activeMotif === 3 && isOffbeat && beatIndex === 1) {
            shouldPlay = true;
        }

        if (shouldPlay) {
            velocity = 1.15;
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;
        if (isBackbeat) {
            shouldPlay = true;
            velocity = 1.15;
        }

        if (intensity > 0.6) {
            if (
                activeMotif === 0 &&
                isAOfBeat &&
                (beatIndex === 0 || beatIndex === 2) &&
                roll(0.4)
            ) {
                shouldPlay = true;
                velocity = scaleVelocity(0.4, intensity, 0.1);
                instTimeOffset += 0.005;
            }

            if (activeMotif === 3) {
                if (isOffbeat && beatIndex === 3 && roll(0.6)) {
                    shouldPlay = true;
                    velocity = 0.7;
                }
                if (isOffbeat && beatIndex === 2 && roll(0.4)) {
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
