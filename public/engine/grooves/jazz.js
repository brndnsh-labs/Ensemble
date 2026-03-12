import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.05,
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
        playback,
        isBeatStart,
        isBackbeat,
        isOffbeat,
        beatIndex,
        drumComplexity,
        sectionSeed,
        isTurnaround,
        isSoloistBusy,
        stepsPerBar,
        loopStep,
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);
    const halfBarStep = Math.floor(stepsPerBar / 2);
    const lastBeatIndex = Math.max(1, Math.round(stepsPerBar / 4) - 1);

    if (inst.name === 'Open') {
        shouldPlay = false;
        const isSkipBeat = isOffbeat && beatIndex % 2 !== 0;
        const isRideStep = isBeatStart || isSkipBeat;

        if (isTurnaround && loopStep >= halfBarStep) {
            // Drop ride for fill
        } else if (isRideStep) {
            const rideProb = isSkipBeat ? 0.6 + drumComplexity * 0.3 : 1.0;

            if (roll(rideProb)) {
                shouldPlay = true;
                if (isBackbeat) {
                    velocity = scaleVelocity(0.9, intensity, 0.2);
                } else if (isBeatStart && beatIndex % 2 === 0) {
                    velocity = scaleVelocity(0.8, intensity, 0.15);
                } else {
                    velocity = 0.6 + drumComplexity * 0.1;
                }
            }
        }

        if (
            (activeMotif === 1 && isOffbeat && beatIndex === 1) ||
            (activeMotif === 2 && isBeatStart && beatIndex === 2) ||
            (activeMotif === 3 && isOffbeat && beatIndex === lastBeatIndex)
        ) {
            velocity *= 1.2;
        }

        if (playback.bpm > 180 && isSkipBeat && roll(0.4)) {
            shouldPlay = false;
        }
    } else if (inst.name === 'HiHat') {
        shouldPlay = false;
        if (isBackbeat) {
            shouldPlay = true;
            velocity = 1.0;
        }
    } else if (inst.name === 'Kick') {
        shouldPlay = false;
        if (isBeatStart) {
            shouldPlay = true;
            velocity = scaleVelocity(0.15, intensity, 0.1);
        }

        if (isTurnaround && isBeatStart && beatIndex === lastBeatIndex) {
            shouldPlay = true;
            velocity = 0.9;
        } else if (activeMotif === 1 && isOffbeat && beatIndex === 1 && sectionSeed > 0.5) {
            shouldPlay = true;
            velocity = scaleVelocity(0.7, intensity, 0.2);
        } else if (activeMotif === 4 && isOffbeat && beatIndex >= 2) {
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

            if (roll(bombProb) && isOffbeat && beatIndex % 2 !== 0) {
                shouldPlay = true;
                velocity = scaleVelocity(0.8, Math.random(), 0.3);
            }
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;

        if (isTurnaround) {
            if (
                ((isBeatStart || isOffbeat) && beatIndex === lastBeatIndex - 1) ||
                (isOffbeat && beatIndex === lastBeatIndex)
            ) {
                if (roll(0.7)) {
                    shouldPlay = true;
                    velocity = scaleVelocity(0.6, Math.random(), 0.4);
                    if (isOffbeat && beatIndex === lastBeatIndex) {
                        velocity = 1.1;
                    }
                }
            }
        } else {
            if (activeMotif === 1 && isOffbeat && beatIndex === 1) {
                shouldPlay = true;
                velocity = scaleVelocity(0.7, intensity, 0.3);
            } else if (
                activeMotif === 2 &&
                ((isOffbeat && beatIndex === 0) || (isBeatStart && beatIndex === 2))
            ) {
                shouldPlay = true;
                velocity = scaleVelocity(0.6, intensity, 0.3);
            } else if (activeMotif === 3 && isOffbeat && beatIndex === lastBeatIndex) {
                shouldPlay = true;
                velocity = scaleVelocity(0.8, intensity, 0.3);
            } else if (activeMotif === 4 && isOffbeat && beatIndex < lastBeatIndex) {
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
                    (isOffbeat && beatIndex === lastBeatIndex && roll(0.5 + compProb)) ||
                    (isOffbeat && beatIndex === 1 && roll(0.3 + compProb)) ||
                    (isOffbeat && beatIndex !== 1 && roll(compProb * 0.4))
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
            if (isOffbeat && beatIndex === lastBeatIndex && roll(0.7)) {
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
