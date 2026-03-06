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
    const { inst, loopStep, playback, stepVal, drumComplexity, sectionSeed, isTurnaround } =
        context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- "The One" Reinforcement ---
    if (inst.name === 'Kick' && loopStep === 0) {
        shouldPlay = true;
        velocity = scaleVelocity(1.3, intensity, 0.1); // Scale reinforcement with intensity
    }

    // --- Hi-Hat & Open Dynamics ---
    if (inst.name === 'HiHat' || inst.name === 'Open') {
        if (isTurnaround && loopStep === 14) {
            // Standard Turnaround Bark
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.15;
        } else if (shouldPlay) {
            // Pulse shaping
            if (loopStep % 4 === 0) {
                velocity *= 1.1;
            } else if (loopStep % 2 === 1) {
                velocity *= 0.8;
            }

            // Occasional open barks at higher intensities
            const barkProb = intensity > 0.6 ? 0.3 * intensity : 0.05;
            if (activeMotif >= 2 && [6, 10].includes(loopStep) && roll(barkProb)) {
                soundName = 'Open';
                velocity *= 1.1;
            }
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;

        // --- Motif Snare Patterns ---
        if (activeMotif === 0) {
            // Standard Syncopated Funk
            if (loopStep === 4 || loopStep === 12) {
                shouldPlay = true;
            }
            if (stepVal === 0 && loopStep === 7) {
                shouldPlay = true; // "a" of 2 ghost
                velocity = scaleVelocity(0.12, intensity, 0.1);
            }
        } else if (activeMotif === 1) {
            // The Funky Drummer (Ghost Note Heavy)
            if (loopStep === 4 || loopStep === 12) {
                shouldPlay = true;
            } else if ([3, 7, 10, 11].includes(loopStep)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.06, intensity, 0.15) + Math.random() * 0.1;
            }
        } else if (activeMotif === 2) {
            // Displaced Backbeats ("Cold Sweat")
            if (loopStep === 4) {
                shouldPlay = true;
            }
            if (loopStep === 14) {
                shouldPlay = true; // Displaced to "and" of 4
                velocity = 1.1;
            }
            if ([7, 9].includes(loopStep)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.1, intensity, 0.1);
            }
        } else if (activeMotif === 3) {
            // Busy Linear (Garibaldi)
            if (loopStep === 4 || loopStep === 12) {
                shouldPlay = true;
                velocity = 1.15;
            } else if ([2, 5, 9, 14].includes(loopStep)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.1, intensity, 0.1);
            }
        }

        // --- Snare Turnaround Fills ---
        if (isTurnaround && intensity > 0.75) {
            if ([13, 14, 15].includes(loopStep) && roll(0.7)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.6, intensity, 0.4);
                if (loopStep === 15) {
                    velocity = 1.2; // Strong lead back into the One
                }
            }
        }

        if (shouldPlay) {
            // Ensure strong backbeats
            if (loopStep === 4 || loopStep === 12 || loopStep === 14) {
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
            if (loopStep === 0 || loopStep === 8) {
                shouldPlay = true;
            }
            if (loopStep === 10 && (drumComplexity > 0.5 || intensity > 0.6)) {
                shouldPlay = true; // "and" of 3
            }
        } else if (activeMotif === 1) {
            if (loopStep === 0 || loopStep === 6 || loopStep === 10) {
                shouldPlay = true;
            }
            if (loopStep === 13 && roll(0.5, intensity)) {
                shouldPlay = true; // pickup
            }
        } else if (activeMotif === 2) {
            if (loopStep === 0 || loopStep === 8 || loopStep === 11) {
                shouldPlay = true;
            }
        } else if (activeMotif === 3) {
            // Busy Linear kick
            if (loopStep === 0 || loopStep === 3 || loopStep === 7 || loopStep === 10) {
                shouldPlay = true;
            }
            // Extra ghost kicks at peak intensity
            if (intensity > 0.9 && loopStep === 15) {
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
            if (loopStep === 4 || loopStep === 12) {
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
