import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
};

export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0;
    }
    if (intensity < 0.6) {
        return seed < 0.75 ? 0 : 1;
    }
    if (intensity < INTENSITY_BANDS.HIGH) {
        if (seed < 0.3) {
            return 0;
        }
        if (seed < 0.6) {
            return 1;
        }
        if (seed < 0.85) {
            return 2;
        }
        return 3;
    }
    if (seed < 0.2) {
        return 0;
    }
    if (seed < 0.4) {
        return 1;
    }
    if (seed < 0.6) {
        return 2;
    }
    if (seed < 0.8) {
        return 3;
    }
    return 4;
}

export function applyOverrides(context, state) {
    const {
        inst,
        loopStep,
        playback,
        stepsPerBar,
        drumComplexity,
        sectionSeed,
        isTurnaround,
        isSoloistBusy,
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    if (inst.name === 'Open') {
        shouldPlay = false;
        const rideSteps = stepsPerBar === 12 ? [0, 2, 4, 6, 8, 10] : [0, 4, 6, 8, 12, 14];

        if (isTurnaround && loopStep > 7) {
            // Drop ride for fill
        } else if (rideSteps.includes(loopStep)) {
            const isSkipBeat = loopStep === 6 || loopStep === 14;
            const rideProb = isSkipBeat ? 0.6 + drumComplexity * 0.3 : 1.0;

            if (roll(rideProb)) {
                shouldPlay = true;
                if (loopStep === 4 || loopStep === 12) {
                    velocity = scaleVelocity(0.9, intensity, 0.2);
                } else if (loopStep % 8 === 0) {
                    velocity = scaleVelocity(0.8, intensity, 0.15);
                } else {
                    velocity = 0.6 + drumComplexity * 0.1;
                }
            }
        }

        if (
            (activeMotif === 1 && loopStep === 6) ||
            (activeMotif === 2 && loopStep === 8) ||
            (activeMotif === 3 && loopStep === 14)
        ) {
            velocity *= 1.2;
        }

        if (playback.bpm > 180 && (loopStep === 6 || loopStep === 14) && roll(0.4)) {
            shouldPlay = false;
        }
    } else if (inst.name === 'HiHat') {
        shouldPlay = false;
        const pedalSteps = stepsPerBar === 12 ? [6] : [4, 12];
        if (pedalSteps.includes(loopStep)) {
            shouldPlay = true;
            velocity = 1.0;
        }
    } else if (inst.name === 'Kick') {
        shouldPlay = false;
        const heartbeatSteps = stepsPerBar === 12 ? [0, 6] : [0, 4, 8, 12];
        if (heartbeatSteps.includes(loopStep)) {
            shouldPlay = true;
            velocity = scaleVelocity(0.15, intensity, 0.1);
        }

        if (isTurnaround && loopStep === 12) {
            shouldPlay = true;
            velocity = 0.9;
        } else if (activeMotif === 1 && loopStep === 6 && sectionSeed > 0.5) {
            shouldPlay = true;
            velocity = scaleVelocity(0.7, intensity, 0.2);
        } else if (activeMotif === 4 && [10, 14].includes(loopStep)) {
            shouldPlay = true;
            velocity = scaleVelocity(0.8, Math.random(), 0.2);
        } else if (activeMotif === 0) {
            let bombProb = intensity * 0.15;
            if (isSoloistBusy) {
                bombProb *= 1.5;
            }
            if (playback.bpm > 170) {
                bombProb *= 0.4;
            }

            if (roll(bombProb) && [6, 14, 15].includes(loopStep)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.8, Math.random(), 0.3);
            }
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;

        if (isTurnaround) {
            if ([8, 10, 11, 14].includes(loopStep) && roll(0.7)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.6, Math.random(), 0.4);
                if (loopStep === 14) {
                    velocity = 1.1;
                }
            }
        } else {
            if (activeMotif === 1 && loopStep === 6) {
                shouldPlay = true;
                velocity = scaleVelocity(0.7, intensity, 0.3);
            } else if (activeMotif === 2 && [2, 8].includes(loopStep)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.6, intensity, 0.3);
            } else if (activeMotif === 3 && loopStep === 14) {
                shouldPlay = true;
                velocity = scaleVelocity(0.8, intensity, 0.3);
            } else if (activeMotif === 4 && [3, 7, 11].includes(loopStep)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.5, Math.random(), 0.3);
            } else {
                let compProb = 0.1 + drumComplexity * 0.3;
                if (!isSoloistBusy) {
                    compProb += 0.2;
                }
                if (playback.bpm > 175) {
                    compProb *= 0.5;
                }

                if (
                    (loopStep === 14 && roll(0.5 + compProb)) ||
                    (loopStep === 6 && roll(0.3 + compProb)) ||
                    ([3, 11, 15].includes(loopStep) && roll(compProb * 0.4))
                ) {
                    shouldPlay = true;
                    velocity = 0.25 + Math.random() * 0.3 + intensity * 0.2;
                }
            }
        }

        if (shouldPlay && intensity < 0.4) {
            soundName = 'Sidestick';
            velocity *= 0.8;
        }

        // 3. THE BIG FINISH (Ending Signaling)
        if (playback.songMode && playback.isEndingPending) {
            if ([13, 15].includes(context.step % 16) && roll(0.7)) {
                shouldPlay = true;
                velocity = 1.1;
                instTimeOffset -= 0.005;
            }
        }
    }

    if (shouldPlay && inst.name === 'Snare' && intensity < 0.35) {
        soundName = 'Sidestick';
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
