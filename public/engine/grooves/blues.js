import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.05, // Slightly tighter entropy for a solid shuffle pocket
    blockAdjacentSnare: true,
    backbeatCrack: false,
};

/**
 * Motifs represent different "feels" within the Blues Shuffle universe.
 * 0: Standard tight shuffle (closed hats)
 * 1: Driving shuffle (more kick pushes)
 * 2: Heavy shuffle (open hats/ride focus)
 * 3: Texas Double Shuffle (intense snare ghosting)
 */
export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0; // Keep it simple at low complexity/intensity
    }
    if (intensity < 0.6) {
        return seed < 0.7 ? 0 : 1;
    }
    if (intensity < INTENSITY_BANDS.HIGH) {
        if (seed < 0.4) {
            return 0;
        }
        if (seed < 0.7) {
            return 1;
        }
        if (seed < 0.9) {
            return 2;
        }
        return 3;
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
    if (inst.name === 'Open' && isDownbeat && intensity > 0.7 && roll(0.3)) {
        shouldPlay = true;
        velocity = 1.2;
        soundName = 'Crash';
        return { shouldPlay, velocity, soundName, instTimeOffset };
    }

    // --- HiHat / Ride (The Shuffle Engine) ---
    if (inst.name === 'HiHat' || inst.name === 'Open') {
        shouldPlay = false;

        // The core shuffle pattern: downbeats and the delayed 'a'
        if (isBeatStart || isAOfBeat) {
            shouldPlay = true;

            // Choose the voicing based on intensity and motif
            if (activeMotif >= 2 || intensity > 0.8) {
                // Heavier/Ride feel
                soundName = 'Ride';
            } else {
                // Standard closed shuffle
                soundName = 'HiHat';
            }

            // Dynamics: Strong on the beat, ghosted on the 'a'
            if (isBeatStart) {
                velocity = scaleVelocity(0.85, intensity, 0.2);
            } else {
                velocity = scaleVelocity(0.55, intensity, 0.15);
            }

            // Occasionally open the hat on the 'a' of 4 for a turnaround feel
            if (isAOfBeat && beatIndex === lastBeatIndex && activeMotif >= 1 && roll(0.5)) {
                soundName = 'Open';
                velocity = 0.8;
            }
        }
    }
    // --- Kick Drum (The Anchor) ---
    else if (inst.name === 'Kick') {
        shouldPlay = false;

        // Grounding Beats (1 and 3)
        if (isBeatStart && !isBackbeat) {
            shouldPlay = true;
            velocity = isDownbeat ? 1.25 : 1.15;
        }

        // The Shuffle Push (The 'a' leading into the downbeat)
        if (isAOfBeat && beatIndex === lastBeatIndex) {
            shouldPlay = true;
            velocity = scaleVelocity(0.7, intensity, 0.1); // Ghosted push
        }

        // Extra pushes for driving motifs
        if (activeMotif >= 1 && isAOfBeat && beatIndex === Math.floor(beatsPerMeasure / 2) - 1) {
            if (roll(0.6, intensity)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.6, intensity, 0.1);
            }
        }
    }
    // --- Snare (The Pocket) ---
    else if (inst.name === 'Snare') {
        shouldPlay = false;

        // Solid backbeat on 2 and 4
        if (isBackbeat) {
            shouldPlay = true;
            velocity = 1.15;
        }

        // Texas Double Shuffle (Motif 3) or complex ghosting
        if (activeMotif === 3) {
            // Ghost notes mimicking the hi-hat shuffle on the snare
            if (isAOfBeat && !isBackbeat && beatIndex !== lastBeatIndex) {
                shouldPlay = true;
                velocity = scaleVelocity(0.4, intensity, 0.1);
                instTimeOffset += 0.005; // Slightly lay back the ghost note
            }
        } else if (activeMotif >= 1) {
            // Standard ghost note leading into the backbeat (e.g., 'a' of 1 and 3)
            if (isAOfBeat && (beatIndex === 0 || beatIndex === 2)) {
                if (roll(0.4, intensity)) {
                    shouldPlay = true;
                    velocity = scaleVelocity(0.35, intensity, 0.1);
                }
            }
        }
    }

    // Use Sidestick for low intensity backbeats
    if (shouldPlay && inst.name === 'Snare' && isBackbeat && intensity < 0.35) {
        soundName = 'Sidestick';
        velocity = scaleVelocity(0.9, intensity, 0.1);
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
