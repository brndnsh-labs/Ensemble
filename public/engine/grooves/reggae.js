import {
    applyStandardBase,
    DEFAULT_CONFIG,
    INTENSITY_BANDS,
    roll,
    scaleVelocity,
} from './utils.js';

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
    const { base, muted } = applyStandardBase(context, state);
    if (muted) {
        return base;
    }

    const {
        drumComplexity,
        sectionSeed,
        isTurnaround,
        isDownbeat,
        isPulseStart,
        isBeatStart,
        isBackbeat,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity } = base;

    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- Lay-back: Reggae is consistently behind the beat ---
    instTimeOffset += 0.008 + intensity * 0.005;

    // --- 1. KICK & SNARE ---
    if (context.inst.name === 'Kick') {
        shouldPlay = false;

        if (activeMotif === 0) {
            // One Drop: Kick only on the backbeat
            if (isBackbeat && isBeatStart) {
                shouldPlay = true;
            }
        } else if (activeMotif === 1) {
            // Steppers: Kick on every beat (or pulse)
            if (isPulseStart) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2) {
            // Rockers: Syncopated
            if (
                isPulseStart ||
                (isOffbeat && !isBackbeat && !isDownbeat) ||
                (isAOfBeat && isBackbeat)
            ) {
                shouldPlay = true;
            }
        } else {
            // Dub: Heavy syncopation
            if (isDownbeat || (isAOfBeat && !isBackbeat)) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = scaleVelocity(1.15, intensity, 0.1);
        }
    } else if (context.inst.name === 'Snare') {
        shouldPlay = false;

        // Universal Reggae Backbeat
        if (isBackbeat && isBeatStart) {
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
            if (isAOfBeat && roll(0.6)) {
                shouldPlay = true;
                soundName = 'Sidestick';
                velocity = 0.85;
            }
        }
    } else if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
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
        if (isOffbeat && isBackbeat && intensity > 0.65 && roll(0.4)) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.1;
        }
    }

    if (shouldPlay && context.inst.name === 'Snare' && intensity < 0.4) {
        soundName = 'Sidestick';
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
