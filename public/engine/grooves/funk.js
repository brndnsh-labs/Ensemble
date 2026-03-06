import { DEFAULT_CONFIG, getStepIndices, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

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
        loopStep,
        playback,
        stepVal,
        drumComplexity,
        sectionSeed,
        isTurnaround,
        stepsPerBar,
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    const backbeats = getStepIndices(stepsPerBar, [4 / 16, 12 / 16]);

    // --- "The One" Reinforcement ---
    if (inst.name === 'Kick' && loopStep === 0) {
        shouldPlay = true;
        velocity = scaleVelocity(1.3, intensity, 0.1); // Scale reinforcement with intensity
    }

    // --- Hi-Hat & Open Dynamics ---
    if (inst.name === 'HiHat' || inst.name === 'Open') {
        const bark = getStepIndices(stepsPerBar, [14 / 16])[0];
        if (isTurnaround && loopStep === bark) {
            // Standard Turnaround Bark
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.15;
        } else if (shouldPlay) {
            // Pulse shaping
            if (loopStep % Math.floor(stepsPerBar / 4) === 0) {
                velocity *= 1.1;
            } else if (loopStep % 2 === 1) {
                velocity *= 0.8;
            }

            // Occasional open barks at higher intensities
            const barkProb = intensity > 0.6 ? 0.3 * intensity : 0.05;
            const openBarks = getStepIndices(stepsPerBar, [6 / 16, 10 / 16]);
            if (activeMotif >= 2 && openBarks.includes(loopStep) && roll(barkProb)) {
                soundName = 'Open';
                velocity *= 1.1;
            }
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;

        // --- Motif Snare Patterns ---
        if (activeMotif === 0) {
            // Standard Syncopated Funk
            if (backbeats.includes(loopStep)) {
                shouldPlay = true;
            }
            const ghost = getStepIndices(stepsPerBar, [7 / 16])[0];
            if (stepVal === 0 && loopStep === ghost) {
                shouldPlay = true; // "a" of 2 ghost
                velocity = scaleVelocity(0.12, intensity, 0.1);
            }
        } else if (activeMotif === 1) {
            // The Funky Drummer (Ghost Note Heavy)
            if (backbeats.includes(loopStep)) {
                shouldPlay = true;
            } else {
                const ghosts = getStepIndices(stepsPerBar, [3 / 16, 7 / 16, 10 / 16, 11 / 16]);
                if (ghosts.includes(loopStep)) {
                    shouldPlay = true;
                    velocity = scaleVelocity(0.06, intensity, 0.15) + Math.random() * 0.1;
                }
            }
        } else if (activeMotif === 2) {
            // Displaced Backbeats ("Cold Sweat")
            if (loopStep === backbeats[0]) {
                shouldPlay = true;
            }
            const dispBackbeat = getStepIndices(stepsPerBar, [14 / 16])[0];
            if (loopStep === dispBackbeat) {
                shouldPlay = true; // Displaced to "and" of 4
                velocity = 1.1;
            }
            const ghosts = getStepIndices(stepsPerBar, [7 / 16, 9 / 16]);
            if (ghosts.includes(loopStep)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.1, intensity, 0.1);
            }
        } else if (activeMotif === 3) {
            // Busy Linear (Garibaldi)
            if (backbeats.includes(loopStep)) {
                shouldPlay = true;
                velocity = 1.15;
            } else {
                const ghosts = getStepIndices(stepsPerBar, [2 / 16, 5 / 16, 9 / 16, 14 / 16]);
                if (ghosts.includes(loopStep)) {
                    shouldPlay = true;
                    velocity = scaleVelocity(0.1, intensity, 0.1);
                }
            }
        }

        // --- Snare Turnaround Fills ---
        if (isTurnaround && intensity > 0.75) {
            const fills = getStepIndices(stepsPerBar, [13 / 16, 14 / 16, 15 / 16]);
            if (fills.includes(loopStep) && roll(0.7)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.6, intensity, 0.4);
                if (loopStep === fills[2]) {
                    velocity = 1.2; // Strong lead back into the One
                }
            }
        }

        if (shouldPlay) {
            // Ensure strong backbeats
            const displaced = getStepIndices(stepsPerBar, [14 / 16])[0];
            if (backbeats.includes(loopStep) || loopStep === displaced) {
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
            const kicks = getStepIndices(stepsPerBar, [0, 8 / 16]);
            if (kicks.includes(loopStep)) {
                shouldPlay = true;
            }
            const syncKick = getStepIndices(stepsPerBar, [10 / 16])[0];
            if (loopStep === syncKick && (drumComplexity > 0.5 || intensity > 0.6)) {
                shouldPlay = true; // "and" of 3
            }
        } else if (activeMotif === 1) {
            const kicks = getStepIndices(stepsPerBar, [0, 6 / 16, 10 / 16]);
            if (kicks.includes(loopStep)) {
                shouldPlay = true;
            }
            const pickup = getStepIndices(stepsPerBar, [13 / 16])[0];
            if (loopStep === pickup && roll(0.5, intensity)) {
                shouldPlay = true; // pickup
            }
        } else if (activeMotif === 2) {
            const kicks = getStepIndices(stepsPerBar, [0, 8 / 16, 11 / 16]);
            if (kicks.includes(loopStep)) {
                shouldPlay = true;
            }
        } else if (activeMotif === 3) {
            // Busy Linear kick
            const kicks = getStepIndices(stepsPerBar, [0, 3 / 16, 7 / 16, 10 / 16]);
            if (kicks.includes(loopStep)) {
                shouldPlay = true;
            }
            // Extra ghost kicks at peak intensity
            const peakGhost = getStepIndices(stepsPerBar, [15 / 16])[0];
            if (intensity > 0.9 && loopStep === peakGhost) {
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
            if (backbeats.includes(loopStep)) {
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
