import { DEFAULT_CONFIG, getStepIndices, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

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
    const halfBar = Math.floor(stepsPerBar / 2);
    const isCompound = stepsPerBar % 3 === 0 && stepsPerBar !== 3;

    if (inst.name === 'Open') {
        shouldPlay = false;

        let rideSteps;
        let isSkipBeat = false;

        if (isCompound) {
            const macroBeat = stepsPerBar / 2;
            rideSteps = [];
            for (let i = 0; i < stepsPerBar; i += macroBeat / 3) {
                if (i % (macroBeat / 3) === 0) {
                    rideSteps.push(i);
                }
            }
        } else {
            rideSteps = getStepIndices(stepsPerBar, [0, 4 / 16, 6 / 16, 8 / 16, 12 / 16, 14 / 16]);
            const skipBeats = getStepIndices(stepsPerBar, [6 / 16, 14 / 16]);
            isSkipBeat = skipBeats.includes(loopStep);
        }

        if (isTurnaround && loopStep > halfBar - 1) {
            // Drop ride for fill
        } else if (rideSteps.includes(loopStep)) {
            const rideProb = isSkipBeat ? 0.6 + drumComplexity * 0.3 : 1.0;

            if (roll(rideProb)) {
                shouldPlay = true;
                const backbeats = getStepIndices(stepsPerBar, [4 / 16, 12 / 16]);

                if (backbeats.includes(loopStep)) {
                    velocity = scaleVelocity(0.9, intensity, 0.2);
                } else if (loopStep % halfBar === 0) {
                    velocity = scaleVelocity(0.8, intensity, 0.15);
                } else {
                    velocity = 0.6 + drumComplexity * 0.1;
                }
            }
        }

        const accents = getStepIndices(stepsPerBar, [6 / 16, 8 / 16, 14 / 16]);
        if (
            (activeMotif === 1 && loopStep === accents[0]) ||
            (activeMotif === 2 && loopStep === accents[1]) ||
            (activeMotif === 3 && loopStep === accents[2])
        ) {
            velocity *= 1.2;
        }

        const skipBeats = getStepIndices(stepsPerBar, [6 / 16, 14 / 16]);
        if (playback.bpm > 180 && skipBeats.includes(loopStep) && roll(0.4)) {
            shouldPlay = false;
        }
    } else if (inst.name === 'HiHat') {
        shouldPlay = false;
        const pedalSteps = isCompound
            ? [Math.floor(stepsPerBar / 2)]
            : getStepIndices(stepsPerBar, [4 / 16, 12 / 16]);

        if (pedalSteps.includes(loopStep)) {
            shouldPlay = true;
            velocity = 1.0;
        }
    } else if (inst.name === 'Kick') {
        shouldPlay = false;
        let heartbeatSteps;
        if (isCompound) {
            heartbeatSteps = [0, Math.floor(stepsPerBar / 2)];
        } else {
            heartbeatSteps = getStepIndices(stepsPerBar, [0, 4 / 16, 8 / 16, 12 / 16]);
        }

        if (heartbeatSteps.includes(loopStep)) {
            shouldPlay = true;
            velocity = scaleVelocity(0.15, intensity, 0.1);
        }

        const b12 = getStepIndices(stepsPerBar, [12 / 16])[0];
        const b6 = getStepIndices(stepsPerBar, [6 / 16])[0];

        if (isTurnaround && loopStep === b12) {
            shouldPlay = true;
            velocity = 0.9;
        } else if (activeMotif === 1 && loopStep === b6 && sectionSeed > 0.5) {
            shouldPlay = true;
            velocity = scaleVelocity(0.7, intensity, 0.2);
        } else if (activeMotif === 4) {
            const m4Kicks = getStepIndices(stepsPerBar, [10 / 16, 14 / 16]);
            if (m4Kicks.includes(loopStep)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.8, Math.random(), 0.2);
            }
        } else if (activeMotif === 0) {
            let bombProb = intensity * 0.15;
            if (isSoloistBusy) {
                bombProb *= 1.5;
            }
            if (playback.bpm > 170) {
                bombProb *= 0.4;
            }

            const bombs = getStepIndices(stepsPerBar, [6 / 16, 14 / 16, 15 / 16]);
            if (roll(bombProb) && bombs.includes(loopStep)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.8, Math.random(), 0.3);
            }
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;

        if (isTurnaround) {
            const fills = getStepIndices(stepsPerBar, [8 / 16, 10 / 16, 11 / 16, 14 / 16]);
            if (fills.includes(loopStep) && roll(0.7)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.6, Math.random(), 0.4);
                if (loopStep === fills[3]) {
                    velocity = 1.1;
                }
            }
        } else {
            const points = getStepIndices(stepsPerBar, [
                2 / 16,
                3 / 16,
                6 / 16,
                7 / 16,
                8 / 16,
                11 / 16,
                14 / 16,
                15 / 16,
            ]);

            if (activeMotif === 1 && loopStep === points[2]) {
                shouldPlay = true;
                velocity = scaleVelocity(0.7, intensity, 0.3);
            } else if (activeMotif === 2 && (loopStep === points[0] || loopStep === points[4])) {
                shouldPlay = true;
                velocity = scaleVelocity(0.6, intensity, 0.3);
            } else if (activeMotif === 3 && loopStep === points[6]) {
                shouldPlay = true;
                velocity = scaleVelocity(0.8, intensity, 0.3);
            } else if (
                activeMotif === 4 &&
                (loopStep === points[1] || loopStep === points[3] || loopStep === points[5])
            ) {
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
                    (loopStep === points[6] && roll(0.5 + compProb)) ||
                    (loopStep === points[2] && roll(0.3 + compProb)) ||
                    ((loopStep === points[1] || loopStep === points[5] || loopStep === points[7]) &&
                        roll(compProb * 0.4))
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
            const finishes = getStepIndices(stepsPerBar, [13 / 16, 15 / 16]);
            if (finishes.includes(context.step % stepsPerBar) && roll(0.7)) {
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
