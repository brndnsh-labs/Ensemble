import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.05,
    blockAdjacentSnare: false,
    backbeatCrack: false,
};

export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0; // Simple Two-Step
    }
    if (intensity < 0.6) {
        return seed < 0.5 ? 0 : 1; // 1 = Train Beat Light
    }
    if (seed < 0.3) {
        return 0;
    }
    if (seed < 0.7) {
        return 1; // Train Beat
    }
    return 2; // Driving Train Beat
}

export function applyOverrides(context, state) {
    const {
        inst,
        playback,
        isDownbeat,
        isBeatStart,
        isBackbeat,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        beatIndex,
        drumComplexity,
        sectionSeed,
        stepsPerBar,
        loopStep,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset } = state;
    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);
    const safeIsOffbeat = isOffbeat !== undefined ? isOffbeat : loopStep % (stepsPerBar / 8) === 2;
    const isEighthNote = isBeatStart || safeIsOffbeat;

    if (inst.name === 'Snare') {
        shouldPlay = false;
        soundName = intensity < 0.5 ? 'Sidestick' : 'Snare';

        if (activeMotif === 0) {
            // Standard 2-step backbeat
            if (isBackbeat) {
                shouldPlay = true;
                velocity = scaleVelocity(0.85, intensity, 0.15);
            }
        } else {
            // Train beat
            if (isBackbeat) {
                shouldPlay = true;
                velocity = scaleVelocity(0.9, intensity, 0.1);
            } else if (isBeatStart) {
                // Ghost note on beat
                shouldPlay = true;
                velocity = scaleVelocity(0.3, intensity, 0.2);
            } else if (isEOfBeat || isAOfBeat) {
                // Ghost notes on e and a
                shouldPlay = true;
                velocity = scaleVelocity(0.2, intensity, 0.15);
                soundName = 'Snare'; // Train beat brushes/ghosts usually snare
            } else if (safeIsOffbeat) {
                // Ghost on offbeat
                shouldPlay = true;
                velocity = scaleVelocity(0.4, intensity, 0.2);
            }
        }
    } else if (inst.name === 'Kick') {
        shouldPlay = false;
        if (isDownbeat || (isBeatStart && beatIndex === 2)) {
            shouldPlay = true; // 1 and 3
        } else if (activeMotif > 0 && isBeatStart && (beatIndex === 1 || beatIndex === 3)) {
            // 2 and 4 at higher intensity
            if (intensity > 0.6) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2 && safeIsOffbeat && roll(0.3)) {
            shouldPlay = true; // slight syncopation
        }

        if (shouldPlay) {
            velocity = isDownbeat ? 1.0 : 0.85;
        }
    } else if (inst.name === 'HiHat' || inst.name === 'Open') {
        shouldPlay = false;
        // In train beat, hats often just do 8ths or are ignored in favor of snare
        if (activeMotif === 0) {
            if (isEighthNote) {
                shouldPlay = true;
                velocity = isBeatStart ? 0.8 : 0.6;
                soundName = 'HiHat';
            }
        } else {
            // Train beat - hats play quarter notes or offbeats
            if (isBeatStart) {
                shouldPlay = true;
                velocity = 0.7;
                soundName = intensity > 0.7 ? 'Open' : 'HiHat';
            } else if (safeIsOffbeat && intensity > 0.5) {
                shouldPlay = true;
                velocity = 0.5;
                soundName = 'HiHat';
            }
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
