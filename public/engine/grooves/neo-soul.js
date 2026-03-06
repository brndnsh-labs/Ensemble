export const config = {
    entropyMultiplier: 0.15,
    blockAdjacentSnare: false,
    exemptFromPulseShaping: false,
    dillaFeel: true,
    backbeatCrack: false,
};

export function getMotif(seed, complexity, _intensity = 1.0) {
    if (complexity < 0.3) {
        return 0;
    }
    if (seed < 0.3) {
        return 0;
    }
    if (seed < 0.6) {
        return 1;
    }
    if (seed < 0.8) {
        return 2;
    }
    return 3;
}

export function applyOverrides(context, state) {
    const { inst, loopStep, playback, drumComplexity, sectionSeed } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.name === 'HiHat' || inst.name === 'Open') {
        instTimeOffset -= 0.012;
    }
    if (inst.name === 'Snare') {
        instTimeOffset += 0.008;
    }

    if (inst.muted) {
        return state;
    }

    const activeMotif = getMotif(sectionSeed, drumComplexity, playback.bandIntensity);

    const drunkenFactor = playback.bandIntensity * 0.012;
    if (loopStep % 4 !== 0) {
        instTimeOffset += (Math.random() - 0.5) * drunkenFactor;
    }

    if (inst.name === 'HiHat' || inst.name === 'Open') {
        if (shouldPlay) {
            instTimeOffset -= 0.008;
            if (loopStep % 2 === 1) {
                velocity *= 0.75;
            }
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;
        instTimeOffset += 0.008;

        if (activeMotif === 1 || activeMotif === 3) {
            if (loopStep === 4 || loopStep === 12) {
                shouldPlay = true;
                velocity = 1.1;
            } else if ([3, 7, 11, 15].includes(loopStep)) {
                shouldPlay = true;
                velocity = 0.2 + Math.random() * 0.1;
            }
        } else {
            if (loopStep === 4 || loopStep === 12) {
                shouldPlay = true;
            }
        }

        if (shouldPlay && playback.bandIntensity < 0.35) {
            soundName = 'Sidestick';
        }
    } else if (inst.name === 'Kick') {
        shouldPlay = false;
        instTimeOffset += 0.005;

        if (activeMotif === 0) {
            if (loopStep === 0 || loopStep === 10) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2) {
            if ([0, 7, 10, 15].includes(loopStep)) {
                shouldPlay = true;
            }
        } else {
            if (loopStep === 0 || loopStep === 8) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = 1.1;
        }
    }

    if (shouldPlay) {
        velocity *= 0.75;
        if (inst.name === 'Snare' && playback.bandIntensity < 0.35) {
            soundName = 'Sidestick';
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
