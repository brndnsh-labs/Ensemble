export const config = {
    entropyMultiplier: 0.08,
    blockAdjacentSnare: true,
    exemptFromPulseShaping: false,
    dillaFeel: false,
    backbeatCrack: true,
};

export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < 0.35) {
        return 0;
    }
    if (intensity < 0.6) {
        return seed < 0.75 ? 0 : 2;
    }
    if (intensity < 0.85) {
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
    const { inst, loopStep, playback, isDownbeat, drumComplexity, sectionSeed, isTurnaround } =
        context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const activeMotif = getMotif(sectionSeed, drumComplexity, playback.bandIntensity);

    if (inst.name === 'HiHat' || inst.name === 'Open') {
        if (isTurnaround && loopStep > 7) {
            shouldPlay = false;
        } else {
            if (loopStep % 2 === 0) {
                shouldPlay = true;
                velocity = loopStep % 4 === 0 ? 1.05 : 0.85;

                if (playback.bandIntensity > 0.7) {
                    soundName = 'Open';
                    velocity *= 1.1;
                } else {
                    soundName = 'HiHat';
                }
            }
        }
    } else if (inst.name === 'Kick') {
        shouldPlay = false;
        if (loopStep === 0 || loopStep === 8) {
            shouldPlay = true;
        } else if (activeMotif === 1) {
            if (loopStep === 6 || loopStep === 10) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2) {
            if (loopStep === 10) {
                shouldPlay = true;
            }
        } else if (activeMotif === 3) {
            if (loopStep === 6 || loopStep === 14) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = isDownbeat ? 1.25 : 1.1;
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;

        if (loopStep === 4 || loopStep === 12) {
            shouldPlay = true;
        }

        if (isTurnaround && loopStep > 7) {
            if ([8, 10, 14].includes(loopStep) && Math.random() < 0.4) {
                shouldPlay = true;
                velocity = 0.8 + Math.random() * 0.2;
            }
        } else {
            if (!shouldPlay && (loopStep === 7 || loopStep === 9)) {
                if (
                    playback.bandIntensity > 0.4 &&
                    playback.bandIntensity < 0.75 &&
                    Math.random() < 0.08
                ) {
                    shouldPlay = true;
                    velocity = 0.25;
                }
            }
        }

        if (shouldPlay) {
            if (loopStep === 4 || loopStep === 12) {
                velocity = 1.15;
            }
            if (playback.bandIntensity < 0.25) {
                soundName = 'Sidestick';
            }
        }
    } else if (inst.name.includes('Tom')) {
        if (isTurnaround && loopStep > 7) {
            if ([8, 10, 12, 14].includes(loopStep) && Math.random() < 0.6) {
                shouldPlay = true;
                velocity = 1.1;
            }
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
