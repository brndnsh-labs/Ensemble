import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    backbeatCrack: true,
};

/**
 * Maps intensity to motif complexity for Funk.
 * 0: Standard Syncopated Funk (Grounded)
 * 1: The Funky Drummer (Ghost Note heavy)
 * 2: Displaced Backbeats ("Cold Sweat")
 * 3: Busy Linear (Garibaldi)
 */
export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0; // Grounded pocket at low intensity
    }

    if (intensity < 0.75) {
        // Mid Intensity: Mix of Standard, Ghost Note Heavy, and Displaced
        if (seed < 0.4) {
            return 0;
        }
        if (seed < 0.75) {
            return 1;
        }
        return 2;
    }

    // High Intensity: Full variety including Busy Linear
    if (seed < 0.25) {
        return 0;
    }
    if (seed < 0.5) {
        return 1;
    }
    if (seed < 0.75) {
        return 2;
    }
    return 3;
}

export function applyOverrides(context, state) {
    const {
        inst,
        playback,
        stepVal,
        isDownbeat,
        isBeatStart,
        isBackbeat,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        beatIndex,
        drumComplexity,
        sectionSeed,
        isTurnaround,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- "The One" Reinforcement ---
    if (inst.name === 'Kick' && isDownbeat) {
        shouldPlay = true;
        velocity = scaleVelocity(1.3, intensity, 0.1); // Scale reinforcement with intensity
    }

    // --- Hi-Hat & Open Dynamics ---
    if (inst.name === 'HiHat' || inst.name === 'Open') {
        // Standard Turnaround Bark on the "&" of the last beat (e.g., beat 4 in 4/4)
        if (isTurnaround && isOffbeat && beatIndex >= 3) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.15;
        } else if (shouldPlay) {
            // Pulse shaping
            if (isBeatStart) {
                velocity *= 1.1;
            } else if (isEOfBeat || isAOfBeat) {
                velocity *= 0.8;
            }

            // Occasional open barks at higher intensities on the "&" of beats 2 and 3
            const barkProb = intensity > 0.6 ? 0.3 * intensity : 0.05;
            if (
                activeMotif >= 2 &&
                isOffbeat &&
                (beatIndex === 1 || beatIndex === 2) &&
                roll(barkProb)
            ) {
                soundName = 'Open';
                velocity *= 1.1;
            }
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;

        // --- Motif Snare Patterns ---
        if (activeMotif === 0) {
            // Standard Syncopated Funk
            if (isBackbeat) {
                shouldPlay = true;
            }
            if (stepVal === 0 && isAOfBeat && beatIndex === 1) {
                shouldPlay = true; // "a" of 2 ghost
                velocity = scaleVelocity(0.12, intensity, 0.1);
            }
        } else if (activeMotif === 1) {
            // The Funky Drummer (Ghost Note Heavy)
            if (isBackbeat) {
                shouldPlay = true;
            } else if (
                (isAOfBeat && (beatIndex === 0 || beatIndex === 1 || beatIndex === 2)) ||
                (isOffbeat && beatIndex === 2)
            ) {
                shouldPlay = true;
                velocity = scaleVelocity(0.06, intensity, 0.15) + Math.random() * 0.1;
            }
        } else if (activeMotif === 2) {
            // Displaced Backbeats ("Cold Sweat")
            if (isBackbeat && beatIndex === 1) {
                shouldPlay = true; // Solid on beat 2
            }
            if (isOffbeat && beatIndex === 3) {
                shouldPlay = true; // Displaced to "and" of 4
                velocity = 1.1;
            }
            if ((isAOfBeat && beatIndex === 1) || (isEOfBeat && beatIndex === 2)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.1, intensity, 0.1);
            }
        } else if (activeMotif === 3) {
            // Busy Linear (Garibaldi)
            if (isBackbeat) {
                shouldPlay = true;
                velocity = 1.15;
            } else if (
                (isOffbeat && (beatIndex === 0 || beatIndex === 3)) ||
                (isEOfBeat && (beatIndex === 1 || beatIndex === 2))
            ) {
                shouldPlay = true;
                velocity = scaleVelocity(0.1, intensity, 0.1);
            }
        }

        // --- Snare Turnaround Fills ---
        if (isTurnaround && intensity > 0.75) {
            // Fill on the 16ths of the last beat
            if (beatIndex >= 3 && !isBeatStart && roll(0.7)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.6, intensity, 0.4);
                if (isAOfBeat) {
                    velocity = 1.2; // Strong lead back into the One
                }
            }
        }

        if (shouldPlay) {
            // Ensure strong backbeats and specific displaced accents
            if (isBackbeat || (isOffbeat && beatIndex >= 3)) {
                velocity = Math.max(velocity, 1.1);
            }
            // Low intensity sidestick fallback
            if (intensity < 0.4 && velocity > 0.8) {
                soundName = 'Sidestick';
            }
        }
    } else if (inst.name === 'Kick') {
        shouldPlay = false;

        // --- Motif Kick Patterns ---
        if (activeMotif === 0) {
            if (isBeatStart && !isBackbeat) {
                shouldPlay = true;
            }
            if (isOffbeat && beatIndex === 2 && (drumComplexity > 0.5 || intensity > 0.6)) {
                shouldPlay = true; // "and" of 3
            }
        } else if (activeMotif === 1) {
            if (isDownbeat || (isOffbeat && (beatIndex === 1 || beatIndex === 2))) {
                shouldPlay = true;
            }
            if (isEOfBeat && beatIndex === 3 && roll(0.5, intensity)) {
                shouldPlay = true; // pickup
            }
        } else if (activeMotif === 2) {
            if ((isBeatStart && !isBackbeat) || (isAOfBeat && beatIndex === 2)) {
                shouldPlay = true;
            }
        } else if (activeMotif === 3) {
            // Busy Linear kick
            if (
                isDownbeat ||
                (isAOfBeat && (beatIndex === 0 || beatIndex === 1)) ||
                (isOffbeat && beatIndex === 2)
            ) {
                shouldPlay = true;
            }
            // Extra ghost kicks at peak intensity on the last 16th
            if (intensity > 0.9 && isAOfBeat && beatIndex >= 3) {
                shouldPlay = true;
                velocity = 0.4;
            }
        }

        if (shouldPlay) {
            velocity = scaleVelocity(1.1, intensity, 0.1) + Math.random() * 0.1;
        }
    }

    // --- Global Timing & Gain Polish ---
    if (shouldPlay) {
        if (inst.name === 'HiHat' || inst.name === 'Open') {
            if (stepVal === 2 && intensity > 0.6) {
                velocity = 1.0;
            } else if (stepVal !== 2 && soundName !== 'Open') {
                velocity = Math.min(velocity, scaleVelocity(0.75, intensity, 0.1));
            }
        }
        if (inst.name === 'Snare') {
            if (intensity < 0.35) {
                soundName = 'Sidestick';
            }
            // Drive the backbeat slightly as intensity increases
            if (isBackbeat) {
                instTimeOffset -= 0.004 + intensity * 0.002;
            }
        }
        // General gain boost for strong accents
        if (stepVal === 2) {
            velocity *= 1.1;
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
