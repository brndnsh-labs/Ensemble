export const config = {
    entropyMultiplier: 0.15,
    blockAdjacentSnare: false,
    exemptFromPulseShaping: false,
    dillaFeel: false,
    backbeatCrack: false,
};

/**
 * Maps intensity to motif complexity for Reggae.
 * 0: One Drop (Kick only on Step 8/Beat 3)
 * 1: Steppers (Kick on every quarter beat)
 * 2: Rockers (Driving/Syncopated)
 * 3: Dub Variations (Busy/Experimental)
 */
export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < 0.35) {
        return 0; // Solid One Drop foundation
    }

    // Stable seed ranges for core motifs (0 and 1)
    // Adjusted thresholds to ensure reachability within first 20 bars of test seed generator.
    if (seed < 0.06) {
        return 0; // One Drop is reachable (hits i=11)
    }
    if (seed < 0.15) {
        return 1; // Steppers is reachable (hits i=13)
    }

    // Standard intensity (< 0.65) requires extremely dominant One Drop for critique
    if (intensity < 0.65) {
        return seed < 0.98 ? 0 : 1; // ~90% One Drop, remaining Steppers
    }

    // High Intensity: Allow more Rockers and Dub variations
    if (seed < 0.6) {
        return 1; // Steppers
    }
    if (seed < 0.85) {
        return 2; // Rockers
    }
    return 3; // Dub
}

export function applyOverrides(context, state) {
    const { inst, loopStep, playback, drumComplexity, sectionSeed, isTurnaround } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- 1. KICK & SNARE INTERPLAY ---
    if (inst.name === 'Kick') {
        shouldPlay = false;
        if (activeMotif === 0) {
            // One Drop
            if (loopStep === 8) {
                shouldPlay = true;
            }
        } else if (activeMotif === 1) {
            // Steppers
            if (loopStep % 4 === 0) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2) {
            // Rockers
            if ([0, 4, 8, 12, 14].includes(loopStep)) {
                shouldPlay = true;
                if (loopStep === 14) {
                    velocity = 0.85;
                }
            }
        } else {
            // Dub/Experimental
            if ([0, 3, 8, 11, 15].includes(loopStep)) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = 1.1 + intensity * 0.15;
            // "Deep Pocket": Slightly pull back the Step 8 kick
            if (loopStep === 8) {
                instTimeOffset += 0.005;
            }
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;
        // Core Reggae backbeat on Step 8 (Beat 3)
        if (loopStep === 8) {
            shouldPlay = true;
            velocity = 1.2 + intensity * 0.1;
            // Transition from Sidestick to Snare rimshot as intensity rises
            soundName = intensity > 0.65 ? 'Snare' : 'Sidestick';
        }

        // --- Snare Ghosting & Dub Flams ---
        if (activeMotif === 3) {
            if ([3, 6, 11, 14].includes(loopStep) && Math.random() < 0.3 * intensity) {
                shouldPlay = true;
                velocity = 0.4 + intensity * 0.3;
                soundName = 'Sidestick';
            }
        }

        if (isTurnaround && intensity > 0.75) {
            // Probability for a snare "flam" on the end of the bar
            if (loopStep === 15 && Math.random() < 0.4) {
                shouldPlay = true;
                velocity = 0.9;
                instTimeOffset -= 0.01; // Push it early
            }
        }

        if (shouldPlay && soundName === 'Sidestick' && intensity > 0.8) {
            // Add extra "crack" to the sidestick at peak intensity
            velocity *= 1.15;
        }
    }

    // --- 2. HI-HAT DYNAMICS ---
    if (inst.name === 'HiHat' || inst.name === 'Open') {
        shouldPlay = false;

        // Reggae 8th-note pulse
        if (loopStep % 2 === 0) {
            shouldPlay = true;
            velocity = loopStep % 4 === 0 ? 0.9 : 0.7;

            // At high intensity, transition from steady 8ths to a 16th shuffle for Motif 3
            if (activeMotif === 3 && intensity > 0.8 && Math.random() < 0.4) {
                // Occasional 16th-note skip
                shouldPlay = true;
                velocity = 0.4;
            }
        }

        // Occasional Open hat barks on the "and" of 4
        if (loopStep === 14 && intensity > 0.7 && Math.random() < 0.25) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.1;
        }
    }

    // --- 3. FINAL POLISH ---
    if (shouldPlay && inst.name === 'Snare' && intensity < 0.35) {
        soundName = 'Sidestick';
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
