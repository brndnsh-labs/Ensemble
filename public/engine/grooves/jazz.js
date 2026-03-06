export const config = {
    entropyMultiplier: 0.15,
    blockAdjacentSnare: false,
    exemptFromPulseShaping: false,
    dillaFeel: false,
    backbeatCrack: false,
};

export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < 0.35) {
        return 0;
    }
    if (intensity < 0.6) {
        return seed < 0.75 ? 0 : 1;
    }
    if (intensity < 0.85) {
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

    const activeMotif = getMotif(sectionSeed, drumComplexity, playback.bandIntensity);

    if (inst.name === 'Open') {
        shouldPlay = false;
        const rideSteps = stepsPerBar === 12 ? [0, 2, 4, 6, 8, 10] : [0, 4, 6, 8, 12, 14];

        if (isTurnaround && loopStep > 7) {
            // Drop ride for fill
        } else if (rideSteps.includes(loopStep)) {
            const isSkipBeat = loopStep === 6 || loopStep === 14;
            let rideProb = 1.0;
            if (isSkipBeat) {
                rideProb = 0.6 + drumComplexity * 0.3;
            }

            if (Math.random() < rideProb) {
                shouldPlay = true;
                if (loopStep === 4 || loopStep === 12) {
                    velocity = 0.9 + playback.bandIntensity * 0.2;
                } else if (loopStep % 8 === 0) {
                    velocity = 0.8 + playback.bandIntensity * 0.15;
                } else {
                    velocity = 0.6 + drumComplexity * 0.1;
                }
            }
        }

        if (activeMotif === 1 && loopStep === 6) {
            velocity *= 1.2;
        }
        if (activeMotif === 2 && loopStep === 8) {
            velocity *= 1.2;
        }
        if (activeMotif === 3 && loopStep === 14) {
            velocity *= 1.2;
        }

        if (playback.bpm > 180 && (loopStep === 6 || loopStep === 14) && Math.random() < 0.4) {
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
            velocity = 0.15 + playback.bandIntensity * 0.1;
        }

        const barSeed = sectionSeed;
        if (isTurnaround && loopStep === 12) {
            shouldPlay = true;
            velocity = 0.9;
        } else if (activeMotif === 1 && loopStep === 6 && barSeed > 0.5) {
            shouldPlay = true;
            velocity = 0.7 + playback.bandIntensity * 0.2;
        } else if (activeMotif === 4 && [10, 14].includes(loopStep)) {
            shouldPlay = true;
            velocity = 0.8 + Math.random() * 0.2;
        } else if (activeMotif === 0) {
            let bombProb = playback.bandIntensity * 0.15;
            if (isSoloistBusy) {
                bombProb *= 1.5;
            }
            if (playback.bpm > 170) {
                bombProb *= 0.4;
            }

            if (Math.random() < bombProb && [6, 14, 15].includes(loopStep)) {
                shouldPlay = true;
                velocity = 0.8 + Math.random() * 0.3;
            }
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;

        if (isTurnaround) {
            if ([8, 10, 11, 14].includes(loopStep)) {
                if (Math.random() < 0.7) {
                    shouldPlay = true;
                    velocity = 0.6 + Math.random() * 0.4;
                    if (loopStep === 14) {
                        velocity = 1.1;
                    }
                }
            }
        } else {
            if (activeMotif === 1) {
                if (loopStep === 6) {
                    shouldPlay = true;
                    velocity = 0.7 + playback.bandIntensity * 0.3;
                }
            } else if (activeMotif === 2) {
                if (loopStep === 2 || loopStep === 8) {
                    shouldPlay = true;
                    velocity = 0.6 + playback.bandIntensity * 0.3;
                }
            } else if (activeMotif === 3) {
                if (loopStep === 14) {
                    shouldPlay = true;
                    velocity = 0.8 + playback.bandIntensity * 0.3;
                }
            } else if (activeMotif === 4) {
                if ([3, 7, 11].includes(loopStep)) {
                    shouldPlay = true;
                    velocity = 0.5 + Math.random() * 0.3;
                }
            } else {
                let compProb = 0.1 + drumComplexity * 0.3;
                if (!isSoloistBusy) {
                    compProb += 0.2;
                }
                if (playback.bpm > 175) {
                    compProb *= 0.5;
                }

                if (loopStep === 14 && Math.random() < 0.5 + compProb) {
                    shouldPlay = true;
                } else if (loopStep === 6 && Math.random() < 0.3 + compProb) {
                    shouldPlay = true;
                } else if ([3, 11, 15].includes(loopStep) && Math.random() < compProb * 0.4) {
                    shouldPlay = true;
                }

                if (shouldPlay) {
                    velocity = 0.25 + Math.random() * 0.3 + playback.bandIntensity * 0.2;
                }
            }
        }

        if (shouldPlay) {
            if (playback.bandIntensity < 0.4) {
                soundName = 'Sidestick';
                velocity *= 0.8;
            }
        }

        // 3. THE BIG FINISH (Ending Signaling)
        if (playback.songMode && playback.isEndingPending) {
            const endingStep = context.step % 16;
            if ([13, 15].includes(endingStep) && Math.random() < 0.7) {
                shouldPlay = true;
                velocity = 1.1;
                instTimeOffset -= 0.005;
            }
        }
    }

    if (shouldPlay && inst.name === 'Snare' && playback.bandIntensity < 0.35) {
        soundName = 'Sidestick';
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
