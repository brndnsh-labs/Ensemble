import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.05, // Tighter for rock precision
    blockAdjacentSnare: true,
    backbeatCrack: true,
};

/**
 * Rock Motifs:
 * 0: Classic Standard (Kick on 1 & 3, Snare on 2 & 4)
 * 1: Driving Double-Kick (Kick on 1, 1&, 3, 3&)
 * 2: Half-time Feel (Snare on beat 3)
 * 3: Anthem/Stadium (Feathered 4-on-the-floor, Ride/Open focus)
 * @param {number} seed
 * @param {number} complexity
 * @param {number} [intensity=1.0]
 * @returns {number}
 */
export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0;
    }

    // Seed-based selection for variety
    if (intensity < 0.6) {
        if (seed < 0.6) {
            return 0;
        }
        return 1; // Driving
    }

    if (intensity < INTENSITY_BANDS.HIGH) {
        if (seed < 0.3) {
            return 0;
        }
        if (seed < 0.6) {
            return 1;
        }
        if (seed < 0.85) {
            return 2; // Half-time
        }
        return 3; // Anthem
    }

    // High Intensity
    if (seed < 0.2) {
        return 1;
    }
    if (seed < 0.5) {
        return 2;
    }
    return 3;
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
        isDownbeat,
        isBeatStart,
        isBackbeat,
        isOffbeat,
        beatIndex,
        drumComplexity,
        orchestration,
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
    const halfBarStep = Math.floor(stepsPerBar / 2);
    const isEighthNote = isBeatStart || isOffbeat;

    // --- 1. HI-HAT / RIDE ---
    if (inst.name === 'HiHat' || inst.name === 'Open') {
        shouldPlay = false;

        if (isTurnaround && loopStep >= halfBarStep) {
            // Drop for fills
        } else if (isEighthNote) {
            shouldPlay = true;

            // Orchestration Override
            if (orchestration?.rideVoice === 'Ride') {
                soundName = 'Ride';
                velocity = isBeatStart ? 1.1 : 0.9;
            } else if (orchestration?.rideVoice === 'Open') {
                soundName = 'Open';
                velocity = isBeatStart ? 1.05 : 0.85;
            } else if (orchestration?.rideVoice === 'HiHat-Closed') {
                soundName = 'HiHat';
                velocity = isBeatStart ? 0.95 : 0.75;
            } else {
                // Legacy logic fallback
                if (activeMotif === 3 || intensity > 0.8) {
                    soundName = sectionSeed < 0.5 ? 'Ride' : 'Open';
                    velocity = isBeatStart ? 1.15 : 0.95;
                } else if (intensity > 0.6) {
                    soundName = roll(0.7, intensity) ? 'HiHat' : 'Open';
                    velocity = isBeatStart ? 1.05 : 0.85;
                } else {
                    soundName = 'HiHat';
                    velocity = isBeatStart ? 0.95 : 0.75;
                }
            }

            velocity = scaleVelocity(velocity, intensity, 0.1);
        }
    }
    // --- 2. KICK DRUM ---
    else if (inst.name === 'Kick') {
        shouldPlay = false;

        // Foundation: Always on 1 and 3 (except half-time maybe)
        if (isBeatStart && !isBackbeat) {
            shouldPlay = true;
            velocity = isDownbeat ? 1.25 : 1.15;
        }

        // Motif 1: Double Kicks (1&, 3&)
        if (activeMotif === 1 && isOffbeat && (beatIndex === 0 || beatIndex === 2)) {
            shouldPlay = true;
            velocity = scaleVelocity(0.9, intensity, 0.15);
        }

        // Motif 2: Half-time (Heavier kick on 1, optional 3)
        if (activeMotif === 2) {
            if (isDownbeat) {
                shouldPlay = true;
                velocity = 1.4;
            } else if (isBeatStart && beatIndex === 2 && roll(0.6, intensity)) {
                shouldPlay = true;
                velocity = 1.1;
            } else if (isOffbeat && beatIndex === 3 && roll(0.4, intensity)) {
                shouldPlay = true; // Anticipation
                velocity = 0.85;
            }
        }

        // Motif 3: Anthem (Feathered 4-on-the-floor)
        if (activeMotif === 3 && isBeatStart && isBackbeat) {
            shouldPlay = true;
            velocity = scaleVelocity(0.65, intensity, 0.1); // Feathered to anchor
        }

        // General Syncopation (Random kicks)
        if (intensity > 0.7 && !shouldPlay && isOffbeat && roll(0.2, intensity)) {
            shouldPlay = true;
            velocity = scaleVelocity(0.7, intensity, 0.2);
        }
    }
    // --- 3. SNARE ---
    else if (inst.name === 'Snare') {
        shouldPlay = false;

        const isHalfTimeBackbeat = beatIndex === 2;
        const isStandardBackbeat = isBackbeat;

        if (activeMotif === 2) {
            if (isBeatStart && isHalfTimeBackbeat) {
                shouldPlay = true;
            }
        } else {
            if (isStandardBackbeat) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            // Orchestration Override
            if (orchestration?.snareVoice === 'Sidestick') {
                soundName = 'Sidestick';
                velocity = 0.8;
            } else if (orchestration?.snareVoice === 'None') {
                shouldPlay = false;
            } else {
                soundName = 'Snare';
                // Higher floor for rock snare to ensure it "cracks"
                velocity = scaleVelocity(1.15, intensity, 0.15);
            }
        }

        // Ghost notes (Modern/Driving)
        if (intensity > 0.6 && !shouldPlay && isOffbeat && roll(0.15, intensity)) {
            shouldPlay = true;
            soundName = 'Sidestick';
            velocity = 0.4;
        }

        // Turnaround Fills
        if (isTurnaround && loopStep >= halfBarStep) {
            if (isEighthNote && roll(0.5, intensity)) {
                shouldPlay = true;
                soundName = 'Snare';
                velocity = 1.1;
            }
        }
    }
    // --- 4. TOMS ---
    else if (inst.name.includes('Tom')) {
        if (isTurnaround && loopStep >= halfBarStep) {
            // Distribute across toms for energy
            if (isEighthNote && roll(0.6, intensity)) {
                shouldPlay = true;
                velocity = 1.15;
            }
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
