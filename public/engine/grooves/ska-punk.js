export const config = {
    entropyMultiplier: 0.15,
    blockAdjacentSnare: false,
    exemptFromPulseShaping: true,
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
    const { inst, loopStep, playback, drumComplexity, sectionSeed, isTurnaround } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const activeMotif = getMotif(sectionSeed, drumComplexity, playback.bandIntensity);

    instTimeOffset -= 0.005;

    if (inst.name === 'HiHat' || inst.name === 'Open') {
        shouldPlay = false;
        if (loopStep % 4 === 2) {
            shouldPlay = true;
            velocity = 1.35;
            if (playback.bandIntensity > 0.6 && Math.random() < 0.3) {
                soundName = 'Open';
            }
        } else if (activeMotif === 1 && loopStep % 2 === 0) {
            shouldPlay = true;
            velocity = 0.85;
        }
    } else if (inst.name === 'Kick') {
        shouldPlay = false;
        if (activeMotif === 1) {
            if (loopStep % 4 === 0) {
                shouldPlay = true;
            }
        } else {
            if ([0, 6, 8].includes(loopStep)) {
                shouldPlay = true;
            }
        }
        if (shouldPlay) {
            velocity = 1.2;
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;
        if (isTurnaround && loopStep > 12) {
            shouldPlay = true;
            velocity = 1.1;
        } else {
            if (loopStep === 4 || loopStep === 12) {
                shouldPlay = true;
                velocity = 1.15;
            }
        }
    }

    if (shouldPlay && inst.name === 'Snare' && playback.bandIntensity < 0.35) {
        soundName = 'Sidestick';
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
