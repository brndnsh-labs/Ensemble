export const config = {
    entropyMultiplier: 0.15,
    blockAdjacentSnare: false,
    exemptFromPulseShaping: false,
    dillaFeel: false,
    backbeatCrack: false,
    isLatin: true,
};

export function getMotif(seed, complexity, _intensity = 1.0) {
    if (complexity < 0.3) {
        return 0;
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
    const { step, inst, loopStep, playback, groove, drumComplexity, sectionSeed, isTurnaround } =
        context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const activeMotif = getMotif(sectionSeed, drumComplexity, playback.bandIntensity);

    if (inst.name === 'Kick') {
        shouldPlay = false;
        if ([0, 3, 8, 11].includes(loopStep)) {
            shouldPlay = true;
            velocity = loopStep === 0 || loopStep === 8 ? 1.1 : 0.85;
        }
        if (activeMotif === 2) {
            if ([7, 15].includes(loopStep)) {
                shouldPlay = true;
            }
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;
        soundName = 'Sidestick';

        if (activeMotif === 0) {
            if ([0, 3, 6, 10, 13].includes(loopStep)) {
                shouldPlay = true;
            }
        } else if (activeMotif === 1) {
            if ([2, 5, 8, 11, 14].includes(loopStep)) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2) {
            if ([0, 4, 7, 8, 11, 13, 15].includes(loopStep)) {
                shouldPlay = true;
            }
        } else if (activeMotif === 3) {
            if ([0, 3, 6, 10, 12].includes(loopStep)) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = 0.9 + Math.random() * 0.2;
        }
    } else if (inst.name === 'Shaker') {
        shouldPlay = true;
        velocity = loopStep % 2 === 0 ? 0.8 : 0.5;
        if (loopStep % 4 === 0) {
            velocity *= 1.1;
        }
    } else if (inst.name === 'Conga') {
        const tumbaoSteps = [4, 11, 12, 15];
        if (tumbaoSteps.includes(loopStep)) {
            shouldPlay = true;
            if (loopStep === 12) {
                soundName = 'CongaHighSlap';
            } else if (loopStep === 15) {
                soundName = 'CongaHigh';
            } else {
                soundName = 'CongaHighMute';
            }
            velocity = 0.7;
        }
    } else if (inst.name === 'Guiro' && isTurnaround) {
        if (loopStep > 8) {
            shouldPlay = true;
            velocity = 0.6;
        }
    }

    if (shouldPlay && inst.name === 'Snare') {
        if (groove.lastDrumPreset === 'Bossa Nova') {
            soundName = 'Sidestick';
            const bossaStep = step % 32;
            if (
                playback.bandIntensity > 0.5 &&
                (bossaStep === 7 || bossaStep === 23) &&
                Math.random() < 0.2
            ) {
                shouldPlay = true;
                velocity = 0.6;
            }
            if (bossaStep === 31 && Math.random() < 0.2) {
                shouldPlay = true;
                velocity = 0.45;
            }
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
