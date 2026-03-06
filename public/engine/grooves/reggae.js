export const config = {
    entropyMultiplier: 0.15,
    blockAdjacentSnare: false,
    exemptFromPulseShaping: false,
    dillaFeel: false,
    backbeatCrack: false,
};

export function getMotif(seed, complexity, _intensity = 1.0) {
    if (complexity < 0.3) {
        return 0;
    }
    if (seed < 0.85) {
        return 0;
    }
    if (seed < 0.92) {
        return 1;
    }
    if (seed < 0.97) {
        return 2;
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

    if (inst.name === 'Kick') {
        shouldPlay = false;
        if (activeMotif === 0) {
            if (loopStep === 8) {
                shouldPlay = true;
            }
        } else if (activeMotif === 1) {
            if (loopStep % 4 === 0) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2) {
            if ([0, 6, 8, 14].includes(loopStep)) {
                shouldPlay = true;
            }
        } else {
            if (loopStep === 8) {
                shouldPlay = true;
            }
        }
        if (shouldPlay) {
            velocity = 1.15;
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;
        if (loopStep === 8) {
            shouldPlay = true;
            velocity = 1.2;
        }
        if (activeMotif === 3 && [0, 4, 12, 15].includes(loopStep) && Math.random() < 0.3) {
            shouldPlay = true;
            velocity = 0.4;
        }
        if (shouldPlay) {
            soundName = 'Sidestick';
        }
    } else if (inst.name === 'HiHat' || inst.name === 'Open') {
        shouldPlay = loopStep % 2 === 0;
        if (shouldPlay) {
            velocity = loopStep % 4 === 0 ? 0.9 : 0.7;
        }
    }

    if (shouldPlay && inst.name === 'Snare' && playback.bandIntensity < 0.35) {
        soundName = 'Sidestick';
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
