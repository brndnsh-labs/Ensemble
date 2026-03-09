import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.08,
    blockAdjacentSnare: true,
    backbeatCrack: false,
};

export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0;
    }
    if (intensity < 0.6) {
        return seed < 0.8 ? 0 : 2;
    }
    if (intensity < INTENSITY_BANDS.HIGH) {
        if (seed < 0.5) {
            return 0;
        }
        if (seed < 0.8) {
            return 2;
        }
        return 1;
    }
    if (seed < 0.3) {
        return 0;
    }
    if (seed < 0.6) {
        return 2;
    }
    if (seed < 0.75) {
        return 1;
    }
    return 3;
}

export function applyOverrides(context, state) {
    const {
        inst,
        playback,
        isDownbeat,
        isBeatStart,
        isBackbeat,
        isAOfBeat,
        beatIndex,
        drumComplexity,
        sectionSeed,
        stepsPerBar,
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    if (inst.name === 'Open' && isDownbeat && intensity > 0.8 && roll(0.25)) {
        shouldPlay = true;
        velocity = 1.2;
        soundName = 'Crash';
        return { shouldPlay, velocity, soundName, instTimeOffset };
    }

    if (inst.name === 'HiHat' || inst.name === 'Open') {
        if (!shouldPlay) {
            if (activeMotif === 0 || activeMotif === 2 || activeMotif === 3) {
                if (isBeatStart || isAOfBeat) {
                    shouldPlay = true;
                    soundName = activeMotif === 2 ? 'Open' : 'HiHat';

                    if (isAOfBeat) {
                        velocity = scaleVelocity(0.6, intensity, 0.1);
                    } else {
                        velocity = scaleVelocity(0.85, intensity, 0.2);
                    }
                }
            } else if (activeMotif === 1) {
                if (isBeatStart || isAOfBeat) {
                    shouldPlay = true;
                    velocity = 0.9;
                }
            }
        }
    } else if (inst.name === 'Kick') {
        shouldPlay = false;

        // Grounding Beats (1 and 3)
        if (isBeatStart && !isBackbeat) {
            shouldPlay = true;
            velocity = isDownbeat ? 1.25 : 1.15;
        }

        // Drive Beats (2 and 4) - "Four on the floor" for driving blues
        // We add these at medium-high intensity to increase momentum
        if (isBeatStart && isBackbeat && intensity > 0.55) {
            shouldPlay = true;
            velocity = scaleVelocity(0.75, intensity, 0.2); // Feathered
        }

        // Shuffle Pushes (The "and-a" of the shuffle)
        if (activeMotif >= 2) {
            const beatsPerMeasure = stepsPerBar / 4;
            const lastBeatIndex = beatsPerMeasure - 1;
            const midBeatIndex = Math.floor(beatsPerMeasure / 2) - 1;

            if (isAOfBeat && (beatIndex === lastBeatIndex || beatIndex === midBeatIndex)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.6, intensity, 0.15); // Ghosted push
            }
        }

        if (shouldPlay && !velocity) {
            velocity = 1.15;
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;
        if (isBackbeat) {
            shouldPlay = true;
            velocity = 1.15;
        }

        if (activeMotif >= 2) {
            const beatsPerMeasure = stepsPerBar / 4;
            const midBeatIndex = Math.floor(beatsPerMeasure / 2);
            // Targeting the beatIndex immediately preceding a backbeat.
            // In 4/4, backbeats are on index 1 and 3, so we trigger ghost notes
            // on the isAOfBeat of index 0 and 2.

            if (
                isAOfBeat &&
                (beatIndex === 0 || beatIndex === midBeatIndex) &&
                roll(0.6, intensity)
            ) {
                shouldPlay = true;
                velocity = scaleVelocity(0.4, intensity, 0.1);
                instTimeOffset += 0.005;
            }
        }
    }

    if (shouldPlay && inst.name === 'Snare' && intensity < 0.35) {
        soundName = 'Sidestick';
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
