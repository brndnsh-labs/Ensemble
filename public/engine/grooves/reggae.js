import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
};

/**
 * Maps intensity to motif complexity for Reggae.
 * 0: True One Drop (Kick/Snare on 3 only)
 * 1: Steppers (4-on-the-floor kick)
 * 2: Rockers (Syncopated Kick doubling)
 * 3: Dub/Rub-a-Dub (Busy Snare/Experimentation)
 * @param {number} seed
 * @param {number} complexity
 * @param {number} [intensity=1.0]
 * @returns {number}
 */
export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0; // Solid One Drop
    }

    if (intensity < 0.7) {
        if (seed < 0.6) {
            return 0;
        }
        return 1; // Steppers
    }

    // High Intensity
    if (seed < 0.1) {
        return 0; // One Drop
    }
    if (seed < 0.6) {
        return 1; // Steppers
    }
    if (seed < 0.85) {
        return 2; // Rockers
    }
    return 3; // Dub
}

/**
 * @param {any} context
 * @param {import('../../types.js').EnsembleState & any} state
 * @returns {any}
 */
export function applyOverrides(context, state) {
    const {
        inst,
        playback,
        drumComplexity,
        sectionSeed,
        isTurnaround,
        isDownbeat,
        isBeatStart,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        beatIndex,
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- Lay-back: Reggae is consistently behind the beat ---
    instTimeOffset += 0.008 + intensity * 0.005;

    // --- 1. KICK & SNARE ---
    if (inst.name === 'Kick') {
        shouldPlay = false;

        if (activeMotif === 0) {
            // One Drop: Kick only on Beat 3
            if (isBeatStart && beatIndex === 2) {
                shouldPlay = true;
            }
        } else if (activeMotif === 1) {
            // Steppers: Kick on every beat
            if (isBeatStart) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2) {
            // Rockers: Syncopated
            if (isBeatStart || (isOffbeat && beatIndex === 1) || (isAOfBeat && beatIndex === 3)) {
                shouldPlay = true;
            }
        } else {
            // Dub: Heavy syncopation
            if (isDownbeat || (isAOfBeat && beatIndex % 2 === 0)) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = scaleVelocity(1.15, intensity, 0.1);
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;

        // Universal Reggae Backbeat on 3
        if (isBeatStart && beatIndex === 2) {
            shouldPlay = true;
            soundName = intensity > 0.7 ? 'Snare' : 'Sidestick';
            velocity = scaleVelocity(1.2, intensity, 0.1);
        }

        // Dub/Rub-a-Dub Chatter
        if (activeMotif === 3 && !shouldPlay) {
            if (isAOfBeat && roll(0.4, intensity)) {
                shouldPlay = true;
                soundName = 'Sidestick';
                velocity = 0.5;
            }
        }

        // Turnaround Fills (Rimshot rolls)
        if (isTurnaround && intensity > 0.6 && !shouldPlay) {
            if (isAOfBeat && beatIndex >= 2 && roll(0.6)) {
                shouldPlay = true;
                soundName = 'Sidestick';
                velocity = 0.85;
            }
        }
    } else if (inst.name === 'HiHat' || inst.name === 'Open') {
        shouldPlay = false;

        // Standard 8th note hats
        if (isBeatStart || isOffbeat) {
            shouldPlay = true;
            soundName = 'HiHat';
            velocity = isBeatStart ? 0.85 : 0.65;

            // Subtle 16th note shuffle at high intensity
            if (intensity > 0.75 && (isAOfBeat || isEOfBeat) && roll(0.3)) {
                shouldPlay = true;
                velocity = 0.35;
            }
        }

        // Offbeat Open Barks
        if (isOffbeat && beatIndex === 3 && intensity > 0.65 && roll(0.4)) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.1;
        }
    }

    if (shouldPlay && inst.name === 'Snare' && intensity < 0.4) {
        soundName = 'Sidestick';
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
