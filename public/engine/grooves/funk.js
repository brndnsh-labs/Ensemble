export const config = {
    entropyMultiplier: 0.15,
    blockAdjacentSnare: false,
    exemptFromPulseShaping: false,
    dillaFeel: false,
    backbeatCrack: true,
};

export function getMotif(seed, complexity, _intensity = 1.0) {
    if (complexity < 0.3) {
        return 0;
    }
    if (seed < 0.25) {
        return 1;
    }
    if (seed < 0.5) {
        return 2;
    }
    if (seed < 0.75) {
        return 3;
    }
    return 0;
}

export function applyOverrides(context, state) {
    const { inst, loopStep, playback, stepVal, drumComplexity, sectionSeed, isTurnaround } =
        context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const activeMotif = getMotif(sectionSeed, drumComplexity, playback.bandIntensity);

    if (inst.name === 'Kick' && loopStep === 0 && playback.bandIntensity > 0.8) {
        shouldPlay = true;
        velocity = 1.3;
    }

    if (inst.name === 'HiHat' || inst.name === 'Open') {
        if (isTurnaround && loopStep === 14) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.15;
        } else if (shouldPlay) {
            if (loopStep % 4 === 0) {
                velocity *= 1.1;
            } else if (loopStep % 2 === 1) {
                velocity *= 0.8;
            }

            if (activeMotif === 3 && [6, 10].includes(loopStep) && Math.random() < 0.3) {
                soundName = 'Open';
                velocity *= 1.1;
            }
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;

        if (activeMotif === 0) {
            if (loopStep === 4 || loopStep === 12) {
                shouldPlay = true;
            }
            if (stepVal === 0 && loopStep === 7) {
                shouldPlay = true;
                velocity = 0.12;
            }
        } else if (activeMotif === 1) {
            if (loopStep === 4 || loopStep === 12) {
                shouldPlay = true;
            } else if ([3, 7, 10, 11].includes(loopStep)) {
                shouldPlay = true;
                velocity = 0.06 + Math.random() * 0.1;
            }
        } else if (activeMotif === 2) {
            if (loopStep === 4) {
                shouldPlay = true;
            }
            if (loopStep === 14) {
                shouldPlay = true;
                velocity = 1.1;
            }
            if ([7, 9].includes(loopStep)) {
                shouldPlay = true;
                velocity = 0.1;
            }
        } else if (activeMotif === 3) {
            if (loopStep === 4 || loopStep === 12) {
                shouldPlay = true;
                velocity = 1.15;
            } else if ([2, 5, 9, 14].includes(loopStep)) {
                shouldPlay = true;
                velocity = 0.1;
            }
        }

        if (shouldPlay) {
            if (loopStep === 4 || loopStep === 12 || loopStep === 14) {
                velocity = Math.max(velocity, 1.1);
            }
            if (playback.bandIntensity < 0.4 && velocity > 0.8) {
                soundName = 'Sidestick';
            }
        }
    } else if (inst.name === 'Kick') {
        shouldPlay = false;

        if (activeMotif === 0) {
            if (loopStep === 0 || loopStep === 8) {
                shouldPlay = true;
            }
            if (loopStep === 10 && drumComplexity > 0.5) {
                shouldPlay = true;
            }
        } else if (activeMotif === 1) {
            if (loopStep === 0 || loopStep === 6 || loopStep === 10) {
                shouldPlay = true;
            }
            if (loopStep === 13 && Math.random() < 0.5) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2) {
            if (loopStep === 0 || loopStep === 8 || loopStep === 11) {
                shouldPlay = true;
            }
        } else if (activeMotif === 3) {
            if (loopStep === 0 || loopStep === 3 || loopStep === 7 || loopStep === 10) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = 1.1 + Math.random() * 0.1;
        }
    }

    if (shouldPlay) {
        if (inst.name === 'HiHat' || inst.name === 'Open') {
            if (stepVal === 2 && playback.bandIntensity > 0.6) {
                velocity = 1.0;
            } else if (stepVal !== 2 && soundName !== 'Open') {
                velocity = Math.min(velocity, 0.75);
            }
        }
        if (inst.name === 'Snare') {
            if (playback.bandIntensity < 0.35) {
                soundName = 'Sidestick';
            }
            if (loopStep === 4 || loopStep === 12) {
                instTimeOffset -= 0.004; // Drive the backbeat slightly
            }
        }
        if (stepVal === 2) {
            velocity *= 1.1;
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
