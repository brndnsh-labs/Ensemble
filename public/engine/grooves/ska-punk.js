export const config = {
    entropyMultiplier: 0.15,
    blockAdjacentSnare: false,
    exemptFromPulseShaping: true,
    dillaFeel: false,
    backbeatCrack: false,
};

/**
 * Maps intensity to motif complexity for Ska-Punk.
 * 0: Classic Ska (Understated/Offbeat emphasis)
 * 1: Driving 2-Step (Standard punk beat)
 * 2: D-Beat (Aggressive driving rhythm)
 * 3: Double Time (Maximum energy Skate Punk)
 */
export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < 0.35) {
        return 0; // Pure Ska feel at low intensity
    }

    // Stable seed ranges for core motifs
    if (seed < 0.25) {
        return 0; // Ska foundation always reachable
    }
    if (seed < 0.55) {
        return 1; // 2-Step reachable at mid intensity
    }

    // For seeds > 0.55, allow more energetic styles at higher intensity
    if (intensity < 0.7) {
        return seed < 0.8 ? 0 : 1;
    }

    if (seed < 0.8) {
        return 2; // D-Beat
    }
    return 3; // Double Time
}

export function applyOverrides(context, state) {
    const { inst, loopStep, playback, drumComplexity, sectionSeed, isTurnaround } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- 1. ENERGETIC PUSH (Micro-timing) ---
    // Increase the "rush" as intensity rises to drive the band harder.
    instTimeOffset -= 0.005 + intensity * 0.007;

    // --- 2. HI-HAT / OPEN DYNAMICS (The "Ska Skank") ---
    if (inst.name === 'HiHat' || inst.name === 'Open') {
        shouldPlay = false;

        // Core Offbeat Emphasis (Steps 2, 6, 10, 14)
        if (loopStep % 4 === 2) {
            shouldPlay = true;
            velocity = 1.3 + intensity * 0.2; // Extra emphasis

            // Splashy Open Hats as intensity rises
            if (intensity > 0.6 && Math.random() < 0.4 * intensity) {
                soundName = 'Open';
            }
        } else if (activeMotif >= 1 && loopStep % 2 === 0) {
            // Constant 8th notes for 2-step/D-Beat
            shouldPlay = true;
            velocity = 0.85 + intensity * 0.1;
        }

        // Occasional Crash on the One
        if (loopStep === 0 && intensity > 0.85 && Math.random() < 0.3) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.4;
        }
    } else if (inst.name === 'Kick') {
        shouldPlay = false;

        // --- Kick Motif Logic ---
        if (activeMotif === 0) {
            // Classic Ska: 1 and 3
            if (loopStep === 0 || loopStep === 8) {
                shouldPlay = true;
            }
        } else if (activeMotif === 1) {
            // Driving 2-Step
            if (loopStep % 4 === 0) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2) {
            // D-Beat (Driving syncopation)
            if ([0, 3, 6, 8, 11, 14].includes(loopStep)) {
                shouldPlay = true;
            }
        } else if (activeMotif === 3) {
            // Double Time
            if (loopStep % 2 === 0) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = 1.2 + intensity * 0.15;
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;

        // Solid Backbeat (Critique requirement)
        if (loopStep === 4 || loopStep === 12) {
            shouldPlay = true;
            velocity = 1.15 + intensity * 0.15;
        }

        // --- Turnaround Fills ---
        if (isTurnaround && intensity > 0.7) {
            // Rapid snare fill on steps 13-15
            if (loopStep >= 13) {
                shouldPlay = true;
                velocity = 1.1;
            }
        }

        if (shouldPlay) {
            soundName = intensity > 0.35 ? 'Snare' : 'Sidestick';
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
