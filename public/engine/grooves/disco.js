import {
    applyStandardBase,
    DEFAULT_CONFIG,
    INTENSITY_BANDS,
    roll,
    scaleVelocity,
} from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.08,
    blockAdjacentSnare: true,
};

/**
 * Maps intensity to motif complexity for Disco.
 * @param {number} seed
 * @param {number} complexity
 * @param {number} [intensity=1.0]
 * @returns {number}
 */
export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0; // Pure 4-on-the-floor foundation
    }

    // Stable seed ranges for core motifs
    if (seed < 0.25) {
        return 0; // Classic is always an option
    }
    if (seed < 0.55) {
        return 1; // Shimmering hats reachable at mid intensity
    }

    // For seeds > 0.55, allow high-energy styles at higher intensity
    if (intensity < 0.7) {
        return seed < 0.8 ? 0 : 1;
    }

    if (seed < 0.8) {
        return 2; // Syncopated interplay
    }
    return 3; // Octave Percussion
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
        isBeatStart,
        isBackbeat,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        beatIndex,
        drumComplexity,
        sectionSeed,
        isTurnaround,
        stepsPerBar,
        loopStep,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity, isEighthNote } = base;

    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- 1. KICK (Strict 4-on-the-floor) ---
    if (context.inst.name === 'Kick') {
        shouldPlay = isBeatStart;
        if (shouldPlay) {
            // Scale velocity to drive the energy
            velocity =
                beatIndex === 0
                    ? scaleVelocity(1.2, intensity, 0.15)
                    : scaleVelocity(1.1, intensity, 0.1);
        }
    } else if (context.inst.name === 'Snare') {
        shouldPlay = false;
        // Standard Disco backbeat
        if (isBackbeat) {
            shouldPlay = true;
            velocity = scaleVelocity(1.15, intensity, 0.1);
        }

        // --- Snare Ghosts & Turnarounds ---
        if (intensity > 0.7 && activeMotif >= 2) {
            // Occasional ghost note on "a" of the last beat
            if (isAOfBeat && beatIndex >= 3 && roll(0.4, intensity)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.3, intensity, 0.3);
            }
        }

        if (isTurnaround && intensity > 0.65) {
            // Energetic "Kick-Snare-Crash" finish on the last step of the bar
            if (loopStep === stepsPerBar - 1) {
                shouldPlay = true;
                velocity = 1.3;
                soundName = 'Snare'; // Full crack
            }
        }

        if (shouldPlay && intensity < INTENSITY_BANDS.LOW) {
            soundName = 'Sidestick';
        }
    } else if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
        shouldPlay = false;

        // Core Offbeat Open Hat (The Disco "And")
        // Strictly enforced across all motifs for the foundation
        if (isOffbeat) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = scaleVelocity(1.15, intensity, 0.1);
        }

        // Motif 1 & 3: Shimmering 16th closed hats
        if (activeMotif === 1 || activeMotif === 3) {
            // Fill in the quarter notes and syncopations around the open hat
            if (!isOffbeat && (isBeatStart || isEOfBeat || isAOfBeat)) {
                // High probability for texture, but lower velocity
                const shimmerProb = 0.6 + intensity * 0.4;
                if (roll(shimmerProb)) {
                    shouldPlay = true;
                    soundName = 'HiHat';
                    // Texture velocity: soft hiss
                    velocity = scaleVelocity(0.55, intensity, 0.1);
                }
            }
        }

        // Motif 2: Syncopated hat barks
        if (activeMotif === 2 && !shouldPlay) {
            if (isOffbeat && beatIndex === 3) {
                shouldPlay = true;
                soundName = 'Open';
                velocity = 1.25;
            }
        }
    } else if (context.inst.name === 'Perc' || context.inst.name.includes('Cowbell')) {
        // Motif 3: Octave Cowbells
        if (activeMotif === 3) {
            if (isEighthNote) {
                shouldPlay = true;
                velocity = scaleVelocity(0.8, intensity, 0.2);
                // Alternate High/Low cowbell sounds based on beat index
                soundName =
                    isBeatStart && (beatIndex === 0 || beatIndex === 2)
                        ? 'CowbellHigh'
                        : 'CowbellLow';
            }
            // Add extra syncopation at peak intensity
            if (intensity > 0.9 && !isEighthNote && roll(0.3)) {
                shouldPlay = true;
                velocity = 0.6;
                soundName = 'CowbellHigh';
            }
        }
    }

    // --- FINAL POLISH ---
    if (shouldPlay) {
        if (context.inst.name === 'Snare' && intensity < 0.35) {
            soundName = 'Sidestick';
        }
        if (context.inst.name === 'Open') {
            // Ensure the open hat has that "shimmer"
            velocity *= 1.15;
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
