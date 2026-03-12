import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.04, // Even tighter for a rock-solid shuffle pocket
    blockAdjacentSnare: true,
    backbeatCrack: false,
};

/**
 * Motifs represent different "feels" within the Blues Shuffle universe.
 * 0: Standard tight shuffle (closed hats)
 * 1: Driving shuffle (consistent kick push on 4)
 * 2: Heavy shuffle (open hats/ride focus)
 * 3: Texas Double Shuffle (controlled snare ghosting)
 */
export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0;
    }
    if (intensity < 0.6) {
        return seed < 0.75 ? 0 : 1;
    }
    if (intensity < INTENSITY_BANDS.HIGH) {
        if (seed < 0.5) {
            return 0;
        }
        if (seed < 0.8) {
            return 1;
        }
        return 2;
    }
    // High intensity
    if (seed < 0.3) {
        return 1;
    }
    if (seed < 0.7) {
        return 2;
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
    const beatsPerMeasure = stepsPerBar / 4;
    const lastBeatIndex = beatsPerMeasure - 1;

    // --- Crashes ---
    if (inst.name === 'Open' && isDownbeat && intensity > 0.75 && roll(0.25)) {
        shouldPlay = true;
        velocity = 1.25;
        soundName = 'Crash';
        return { shouldPlay, velocity, soundName, instTimeOffset };
    }

    // --- HiHat / Ride (The Shuffle Engine) ---
    if (inst.name === 'HiHat' || inst.name === 'Open') {
        shouldPlay = false;

        // The core shuffle pattern: downbeats and the delayed 'a'
        if (isBeatStart || isAOfBeat) {
            shouldPlay = true;

            if (activeMotif >= 2 || intensity > 0.85) {
                soundName = 'Ride';
            } else {
                soundName = 'HiHat';
            }

            if (isBeatStart) {
                velocity = scaleVelocity(0.9, intensity, 0.15);
            } else {
                // The 'a' is always lighter to create the "loping" feel
                velocity = scaleVelocity(0.5, intensity, 0.1);
            }

            // Turnaround Open Hat on the 'a' of 4
            if (isAOfBeat && beatIndex === lastBeatIndex && activeMotif >= 1 && roll(0.4)) {
                soundName = 'Open';
                velocity = scaleVelocity(0.7, intensity, 0.1);
            }
        }
    }
    // --- Kick Drum (Simplified Anchor) ---
    else if (inst.name === 'Kick') {
        shouldPlay = false;

        // Strictly 1 and 3 for the main weight
        if (isBeatStart && !isBackbeat) {
            shouldPlay = true;
            velocity = isDownbeat ? 1.3 : 1.15;
        }

        // The Shuffle Push (ONLY on the 'a' of 4)
        // Feathered to lead into the downbeat without being "nervous"
        if (isAOfBeat && beatIndex === lastBeatIndex && activeMotif >= 1) {
            shouldPlay = true;
            velocity = scaleVelocity(0.65, intensity, 0.1);
        }
    }
    // --- Snare (The Pocket) ---
    else if (inst.name === 'Snare') {
        shouldPlay = false;

        // Solid backbeat on 2 and 4
        if (isBackbeat) {
            shouldPlay = true;
            velocity = 1.2;
        }

        // Texas Double Shuffle (Motif 3) - Snare follows the hi-hat shuffle
        if (activeMotif === 3) {
            if (isAOfBeat && !isBackbeat) {
                // Reduced probability to keep it from getting too cluttered
                if (roll(0.7, intensity)) {
                    shouldPlay = true;
                    velocity = scaleVelocity(0.35, intensity, 0.1);
                    instTimeOffset += 0.008; // Lay it back more
                }
            }
        } else if (activeMotif >= 2) {
            // Very occasional ghost notes at high intensity
            if (isAOfBeat && (beatIndex === 0 || beatIndex === 2) && roll(0.3, intensity)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.3, intensity, 0.1);
            }
        }
    }

    // Use Sidestick for low intensity backbeats
    if (shouldPlay && inst.name === 'Snare' && isBackbeat && intensity < 0.3) {
        soundName = 'Sidestick';
        velocity = scaleVelocity(0.95, intensity, 0.05);
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
