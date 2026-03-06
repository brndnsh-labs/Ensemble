export const config = {
    entropyMultiplier: 0.08,
    blockAdjacentSnare: true,
    exemptFromPulseShaping: false,
    dillaFeel: false,
    backbeatCrack: false,
};

export function getMotif(seed, complexity, _intensity = 1.0) {
    if (complexity < 0.3) {
        return 0;
    }
    if (seed < 0.4) {
        return 0;
    }
    if (seed < 0.7) {
        return 1;
    }
    if (seed < 0.9) {
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

    if (inst.name === 'Snare') {
        shouldPlay = false;
        if (activeMotif === 2) {
            if (loopStep === 4 || loopStep === 12) {
                shouldPlay = true;
            }
        } else {
            if (loopStep === 8) {
                shouldPlay = true;
            }
        }

        soundName = playback.bandIntensity > 0.65 ? 'Snare' : 'Sidestick';
        if (shouldPlay) {
            velocity = 0.8 + Math.random() * 0.2;
        }
    } else if (inst.name === 'Kick') {
        shouldPlay = false;
        if (loopStep === 0) {
            shouldPlay = true;
        }
        if (activeMotif === 0 && loopStep === 6) {
            shouldPlay = true;
        }
        if (activeMotif === 2 && loopStep === 8) {
            shouldPlay = true;
        }
        if (shouldPlay) {
            velocity = 0.9;
        }
    } else if (inst.name === 'HiHat') {
        shouldPlay = true;
        velocity = loopStep % 2 === 0 ? 0.7 : 0.4;
        if (activeMotif === 1) {
            velocity *= 1.2;
        }
    }

    if (shouldPlay && inst.name === 'Snare') {
        soundName = playback.bandIntensity > 0.7 ? 'Snare' : 'Sidestick';
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
