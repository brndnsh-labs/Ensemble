import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.04, // Rock solid timing
    blockAdjacentSnare: false,
    backbeatCrack: false,
};

/**
 * Motifs for Country:
 * 0: Traditional Two-Step (Kick on 1/3, Snare on 2/4)
 * 1: Train Beat Light (Brushes/Ghost 16ths)
 * 2: Full Heavy Train Beat
 */
export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0;
    }
    if (intensity < 0.6) {
        return seed < 0.6 ? 0 : 1;
    }
    if (seed < 0.3) {
        return 0;
    }
    if (seed < 0.8) {
        return 1;
    }
    return 2;
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
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset } = state;
    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    if (inst.name === 'Snare') {
        shouldPlay = false;

        // Train Beat snare is consistent 16ths
        if (activeMotif > 0) {
            shouldPlay = true;

            if (isBackbeat) {
                // Strong accent on 2 and 4
                soundName = intensity > 0.4 ? 'Snare' : 'Sidestick';
                velocity = scaleVelocity(0.95, intensity, 0.1);
            } else if (isBeatStart) {
                // Quarter note foundation (non-backbeat)
                soundName = 'Snare';
                velocity = scaleVelocity(0.4, intensity, 0.15);
            } else if (isOffbeat) {
                // Eighth note offbeats
                soundName = 'Snare';
                velocity = scaleVelocity(0.35, intensity, 0.15);
            } else if (isEOfBeat || isAOfBeat) {
                // The "chicka" ghosts (16ths)
                // Probability scales with intensity
                const ghostProb = 0.5 + intensity * 0.5;
                if (roll(ghostProb)) {
                    shouldPlay = true;
                    soundName = 'Snare';
                    velocity = scaleVelocity(0.2, intensity, 0.1);
                } else {
                    shouldPlay = false;
                }
            }
        } else {
            // Motif 0: Standard Two-Step
            if (isBackbeat) {
                shouldPlay = true;
                soundName = intensity < 0.4 ? 'Sidestick' : 'Snare';
                velocity = scaleVelocity(0.9, intensity, 0.1);
            }
        }
    } else if (inst.name === 'Kick') {
        shouldPlay = false;

        // Foundation: 1 and 3
        if (isDownbeat || (isBeatStart && beatIndex === 2)) {
            shouldPlay = true;
            velocity = isDownbeat ? 1.25 : 1.1;
        }
        // Four-on-the-floor drive at high intensity
        else if (isBeatStart && intensity > 0.8 && roll(0.8)) {
            shouldPlay = true;
            velocity = scaleVelocity(0.6, intensity, 0.1); // Feathered
        }
    } else if (inst.name === 'HiHat' || inst.name === 'Open') {
        shouldPlay = false;

        // Hats are secondary in a train beat
        if (activeMotif === 0) {
            // Simple eighths for two-step
            if (isBeatStart || isOffbeat) {
                shouldPlay = true;
                velocity = isBeatStart ? 0.8 : 0.6;
                soundName = 'HiHat';
            }
        } else {
            // Quarter note "clicks" to cut through the snare
            if (isBeatStart) {
                shouldPlay = true;
                velocity = 0.75;
                soundName = intensity > 0.75 ? 'Open' : 'HiHat';
            }
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
