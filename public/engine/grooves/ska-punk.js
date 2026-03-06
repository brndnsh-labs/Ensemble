import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    exemptFromPulseShaping: true,
};

/**
 * Maps intensity to motif complexity for Ska-Punk.
 * 0: Classic Ska (Understated/Offbeat emphasis)
 * 1: Driving 2-Step (Standard punk beat)
 * 2: D-Beat (Aggressive driving rhythm)
 * 3: Double Time (Maximum energy Skate Punk)
 */
export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
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
    const {
        inst,
        playback,
        drumComplexity,
        sectionSeed,
        isTurnaround,
        isDownbeat,
        isBeatStart,
        isBackbeat,
        isOffbeat,
        isAOfBeat,
        beatIndex,
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);
    const isEighthNote = isBeatStart || isOffbeat;

    // --- 1. ENERGETIC PUSH (Micro-timing) ---
    // Increase the "rush" as intensity rises to drive the band harder.
    instTimeOffset -= 0.005 + intensity * 0.007;

    // --- 2. HI-HAT / OPEN DYNAMICS (The "Ska Skank") ---
    if (inst.name === 'HiHat' || inst.name === 'Open') {
        shouldPlay = false;

        // Core Offbeat Emphasis
        if (isOffbeat) {
            shouldPlay = true;
            velocity = scaleVelocity(1.3, intensity, 0.2); // Extra emphasis

            // Splashy Open Hats as intensity rises
            if (intensity > 0.6 && roll(0.4, intensity)) {
                soundName = 'Open';
            }
        } else if (activeMotif >= 1 && isEighthNote) {
            // Constant 8th notes for 2-step/D-Beat
            shouldPlay = true;
            velocity = scaleVelocity(0.85, intensity, 0.1);
        }

        // Occasional Crash on the One
        if (isDownbeat && intensity > 0.85 && roll(0.3)) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.4;
        }
    } else if (inst.name === 'Kick') {
        shouldPlay = false;

        // --- Kick Motif Logic ---
        if (activeMotif === 0) {
            // Classic Ska: 1 and 3 (isBeatStart && !isBackbeat)
            if (isBeatStart && !isBackbeat) {
                shouldPlay = true;
            }
        } else if (activeMotif === 1) {
            // Driving 2-Step
            if (isBeatStart) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2) {
            // D-Beat (Driving syncopation)
            if (
                (isBeatStart && !isBackbeat) ||
                (isAOfBeat && (beatIndex === 0 || beatIndex === 2)) ||
                (isOffbeat && (beatIndex === 1 || beatIndex === 3))
            ) {
                shouldPlay = true;
            }
        } else if (activeMotif === 3) {
            // Double Time
            if (isEighthNote) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = scaleVelocity(1.2, intensity, 0.15);
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;

        // Solid Backbeat (Critique requirement)
        if (isBackbeat) {
            shouldPlay = true;
            velocity = scaleVelocity(1.15, intensity, 0.15);
        }

        // --- Turnaround Fills ---
        if (isTurnaround && intensity > 0.7) {
            // Rapid snare fill
            if (beatIndex >= 3 && !isBeatStart) {
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
