export const config = {
    entropyMultiplier: 0.08,
    blockAdjacentSnare: true,
    exemptFromPulseShaping: false,
    dillaFeel: false,
    backbeatCrack: false,
};

export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < 0.35) {
        return 0;
    }
    if (intensity < 0.6) {
        return seed < 0.8 ? 0 : 2;
    }
    if (intensity < 0.85) {
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
    const { inst, loopStep, playback, drumComplexity, sectionSeed } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const activeMotif = getMotif(sectionSeed, drumComplexity, playback.bandIntensity);

    if (
        inst.name === 'Open' &&
        loopStep === 0 &&
        playback.bandIntensity > 0.8 &&
        Math.random() < 0.25
    ) {
        shouldPlay = true;
        velocity = 1.2;
        soundName = 'Crash';
        return { shouldPlay, velocity, soundName, instTimeOffset };
    }

    if (inst.name === 'HiHat' || inst.name === 'Open') {
        shouldPlay = false;
        if (activeMotif === 0 || activeMotif === 2 || activeMotif === 3) {
            if ([0, 6, 8, 14].includes(loopStep)) {
                shouldPlay = true;
                soundName = activeMotif === 2 ? 'Open' : 'HiHat';

                if (loopStep === 6 || loopStep === 14) {
                    velocity = 0.6 + playback.bandIntensity * 0.1;
                } else if (loopStep === 0 || loopStep === 8) {
                    velocity = 0.85 + playback.bandIntensity * 0.2;
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
        if (loopStep === 0 || loopStep === 8) {
            shouldPlay = true;
        }

        if (activeMotif === 3 && loopStep === 6) {
            shouldPlay = true;
        }

        if (shouldPlay) {
            velocity = 1.15;
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;
        if (loopStep === 4 || loopStep === 12) {
            shouldPlay = true;
            velocity = 1.15;
        }

        if (playback.bandIntensity > 0.6) {
            if (activeMotif === 0 && [3, 11].includes(loopStep) && Math.random() < 0.4) {
                shouldPlay = true;
                velocity = 0.4 + playback.bandIntensity * 0.1;
                instTimeOffset += 0.005;
            }

            if (activeMotif === 3) {
                if (loopStep === 14 && Math.random() < 0.6) {
                    shouldPlay = true;
                    velocity = 0.7;
                }
                if (loopStep === 10 && Math.random() < 0.4) {
                    shouldPlay = true;
                    velocity = 0.5;
                }
            }
        }
    }

    if (shouldPlay && inst.name === 'Snare' && playback.bandIntensity < 0.35) {
        soundName = 'Sidestick';
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
