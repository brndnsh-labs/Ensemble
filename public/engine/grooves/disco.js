import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.08,
    blockAdjacentSnare: true,
};

/**
 * Maps intensity to motif complexity for Disco.
 * 0: Classic Disco (Grounded/Offbeat Hats)
 * 1: Shimmering Hats (16th variations)
 * 2: Syncopated Snare/Hats Interplay
 * 3: Maximum Energy (Octave Cowbells/Percussion)
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

export function applyOverrides(context, state) {
    const {
        inst,
        playback,
        isBeatStart,
        isBackbeat,
        isOffbeat,
        isAOfBeat,
        beatIndex,
        drumComplexity,
        sectionSeed,
        isTurnaround,
        stepsPerBar,
        loopStep,
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);
    const isEighthNote = isBeatStart || isOffbeat;

    // --- 1. KICK (Strict 4-on-the-floor) ---
    if (inst.name === 'Kick') {
        shouldPlay = isBeatStart;
        if (shouldPlay) {
            // Scale velocity to drive the energy
            velocity =
                beatIndex === 0
                    ? scaleVelocity(1.2, intensity, 0.15)
                    : scaleVelocity(1.1, intensity, 0.1);
        }
    } else if (inst.name === 'Snare') {
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
    } else if (inst.name === 'HiHat' || inst.name === 'Open') {
        shouldPlay = false;

        // Core Offbeat Open Hat (The Disco "And")
        if (isOffbeat) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = scaleVelocity(1.1, intensity, 0.2);
        }

        // Motif 1: Shimmering 16th closed hats
        if (activeMotif === 1 || activeMotif === 3) {
            if (isEighthNote && soundName !== 'Open') {
                shouldPlay = true;
                soundName = 'HiHat';
                velocity = scaleVelocity(0.8, intensity, 0.15);
            }
        }

        // Motif 2: Syncopated hat barks
        if (activeMotif === 2) {
            if (isOffbeat && beatIndex === 3) {
                shouldPlay = true;
                soundName = 'Open';
                velocity = 1.2;
            }
        }
    } else if (inst.name === 'Perc' || inst.name.includes('Cowbell')) {
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
        if (inst.name === 'Snare' && intensity < 0.35) {
            soundName = 'Sidestick';
        }
        if (inst.name === 'Open') {
            // Ensure the open hat has that "shimmer"
            velocity *= 1.15;
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
