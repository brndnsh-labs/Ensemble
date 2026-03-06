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
    const { inst, loopStep, playback, drumComplexity, sectionSeed, isTurnaround } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const activeMotif = getMotif(sectionSeed, drumComplexity, playback.bandIntensity);

    if (inst.name === 'Kick') {
        shouldPlay = loopStep % 4 === 0;
        if (shouldPlay) {
            velocity = loopStep === 0 ? 1.2 : 1.1;
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;
        if (isTurnaround && loopStep > 12) {
            shouldPlay = true;
            velocity = 0.4 + Math.random() * 0.4;
        } else {
            if (loopStep === 4 || loopStep === 12) {
                shouldPlay = true;
                velocity = 1.15;
            }
        }
    } else if (inst.name === 'HiHat' || inst.name === 'Open') {
        shouldPlay = false;
        if (activeMotif === 0) {
            if (loopStep % 4 === 2) {
                shouldPlay = true;
                soundName = 'Open';
                velocity = 1.1;
            }
        } else if (activeMotif === 1) {
            if (loopStep % 2 === 0) {
                shouldPlay = true;
                soundName = 'HiHat';
                velocity = 0.9;
            }
            if (loopStep === 14) {
                shouldPlay = true;
                soundName = 'Open';
                velocity = 1.1;
            }
        } else if (activeMotif === 2) {
            if (loopStep % 4 === 2) {
                shouldPlay = true;
                soundName = 'Open';
            } else if (loopStep % 2 === 1) {
                shouldPlay = true;
                soundName = 'HiHat';
                velocity = 0.6;
            }
        }
    } else if (inst.name === 'Perc' || inst.name.includes('Cowbell')) {
        if (activeMotif === 3) {
            if (loopStep % 4 === 0) {
                shouldPlay = true;
                velocity = 0.8;
            }
        }
    }

    if (shouldPlay) {
        if (inst.name === 'Snare' && playback.bandIntensity < 0.35) {
            soundName = 'Sidestick';
        }
        if (inst.name === 'Open') {
            velocity *= 1.15;
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
