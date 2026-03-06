import { DEFAULT_CONFIG, getStepIndices, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    isLatin: true,
};

/**
 * Maps intensity to motif complexity for Latin / Bossa.
 * 0: Classic Bossa Nova (Understated/Grounded)
 * 1: Busy Bossa / Songo Style (Increased Syncopation)
 * 2: Driving Samba (High 16th Density)
 * 3: Partido Alto (Syncopated Displacement)
 */
export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0; // Pure Bossa Nova at low intensity
    }

    // Stable seed ranges for core motifs
    if (seed < 0.2) {
        return 0; // Bossa foundation always reachable
    }
    if (seed < 0.5) {
        return 1; // Songo/Busy Bossa reachable at mid intensity
    }

    // For seeds > 0.5, allow high-energy styles at higher intensity
    if (intensity < 0.75) {
        return seed < 0.8 ? 0 : 1;
    }

    if (seed < 0.8) {
        return 2; // Samba
    }
    return 3; // Partido Alto
}

export function applyOverrides(context, state) {
    const {
        step,
        inst,
        loopStep,
        playback,
        groove,
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

    const macroBeat = Math.floor(stepsPerBar / 4);

    // --- 1. KICK PATTERNS (Surdo Feel) ---
    if (inst.name === 'Kick') {
        shouldPlay = false;
        // Basic Bossa/Samba Kick: 1, pickup to 2, 3, pickup to 4
        const kicks = getStepIndices(stepsPerBar, [0, 3 / 16, 8 / 16, 11 / 16]);
        if (kicks.includes(loopStep)) {
            shouldPlay = true;
            // Accented primary hits
            velocity =
                loopStep === kicks[0] || loopStep === kicks[2]
                    ? scaleVelocity(1.1, intensity, 0.1)
                    : scaleVelocity(0.85, intensity, 0.1);
        }

        // High Intensity Samba Surdo: Driving pickups
        if (intensity > 0.75 && (activeMotif === 2 || activeMotif === 3)) {
            const pickups = getStepIndices(stepsPerBar, [7 / 16, 15 / 16]);
            if (pickups.includes(loopStep)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.7, intensity, 0.2);
            }
        }
    } else if (inst.name === 'Snare') {
        shouldPlay = false;
        // Default to Sidestick for most Latin styles
        soundName = 'Sidestick';

        // --- Motif Snare Patterns ---
        if (activeMotif === 0) {
            // Classic Bossa/Samba Sidestick pattern
            const pattern = getStepIndices(stepsPerBar, [0, 3 / 16, 6 / 16, 10 / 16, 13 / 16]);
            if (pattern.includes(loopStep)) {
                shouldPlay = true;
            }
        } else if (activeMotif === 1) {
            // Songo Style
            const pattern = getStepIndices(stepsPerBar, [2 / 16, 5 / 16, 8 / 16, 11 / 16, 14 / 16]);
            if (pattern.includes(loopStep)) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2) {
            // Samba Syncopation
            const pattern = getStepIndices(stepsPerBar, [
                0,
                4 / 16,
                7 / 16,
                8 / 16,
                11 / 16,
                13 / 16,
                15 / 16,
            ]);
            if (pattern.includes(loopStep)) {
                shouldPlay = true;
            }
        } else if (activeMotif === 3) {
            // Partido Alto
            const pattern = getStepIndices(stepsPerBar, [0, 3 / 16, 6 / 16, 10 / 16, 12 / 16]);
            if (pattern.includes(loopStep)) {
                shouldPlay = true;
            }
        }

        // --- Repinique Turnaround Fills ---
        if (isTurnaround && intensity > 0.8) {
            // Rapid-fire "Repinique" style calls
            const fillPattern = getStepIndices(stepsPerBar, [12 / 16, 13 / 16, 14 / 16, 15 / 16]);
            if (fillPattern.includes(loopStep)) {
                shouldPlay = true;
                velocity = 1.0 + Math.random() * 0.2;
                soundName = 'Snare'; // Use full Snare for the fill crack
            }
        }

        if (shouldPlay) {
            velocity = 0.9 + intensity * 0.1 + Math.random() * 0.2;
            // Peak intensity: switch some sidesticks to rimshots
            if (intensity > 0.85 && roll(0.4)) {
                soundName = 'Snare';
                velocity *= 1.15;
            }
        }

        // --- Special Bossa Nova 2-Bar Pattern (Cross-stick) ---
        if (groove.lastDrumPreset === 'Bossa Nova') {
            soundName = 'Sidestick';
            const bossaStep = step % (stepsPerBar * 2);
            // Refine the traditional Bossa cross-stick pattern
            const bossaPattern = getStepIndices(stepsPerBar * 2, [
                0,
                3 / 32,
                6 / 32,
                10 / 32,
                13 / 32,
                16 / 32,
                19 / 32,
                22 / 32,
                25 / 32,
                29 / 32,
            ]);
            if (bossaPattern.includes(bossaStep)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.9, intensity, 0.15);
            }
            // Probabilistic variations based on intensity
            const variations = getStepIndices(stepsPerBar * 2, [7 / 32, 23 / 32, 31 / 32]);
            if (intensity > 0.5 && variations.includes(bossaStep) && roll(0.3, intensity)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.5, intensity, 0.2);
            }
        }
    } else if (inst.name === 'Shaker') {
        shouldPlay = true;
        // Driving 8th pulse with 16th ghost notes scaling with intensity
        const offbeatAmount = Math.floor(macroBeat / 2);
        velocity =
            loopStep % offbeatAmount === 0
                ? scaleVelocity(0.8, intensity, 0.15)
                : scaleVelocity(0.4, intensity, 0.3);
        if (loopStep % macroBeat === 0) {
            velocity *= 1.15; // Accent the downbeats
        }
    } else if (inst.name === 'Conga') {
        const tumbaoSteps = getStepIndices(stepsPerBar, [4 / 16, 11 / 16, 12 / 16, 15 / 16]);
        if (tumbaoSteps.includes(loopStep)) {
            shouldPlay = true;
            if (loopStep === tumbaoSteps[2]) {
                soundName = 'CongaHighSlap';
                velocity = scaleVelocity(0.8, intensity, 0.25); // Harder slap with intensity
            } else if (loopStep === tumbaoSteps[3]) {
                soundName = 'CongaHigh';
                velocity = scaleVelocity(0.7, intensity, 0.1);
            } else {
                soundName = 'CongaHighMute';
                velocity = 0.6;
            }
        }
    } else if (inst.name === 'Guiro' && isTurnaround) {
        const guiroStart = getStepIndices(stepsPerBar, [8 / 16])[0];
        if (loopStep > guiroStart) {
            shouldPlay = true;
            velocity = scaleVelocity(0.6, intensity, 0.2);
        }
    } else if (inst.name === 'Agogo' || inst.name.includes('Cowbell')) {
        // Introduce Agogo/Cowbell accents at high intensity
        if (intensity > 0.8 && (activeMotif === 2 || activeMotif === 3)) {
            const agogoPattern = getStepIndices(stepsPerBar, [3 / 16, 6 / 16, 11 / 16, 14 / 16]);
            if (agogoPattern.includes(loopStep) && roll(0.25, intensity)) {
                shouldPlay = true;
                velocity = 0.9;
                soundName = loopStep < Math.floor(stepsPerBar / 2) ? 'CowbellHigh' : 'CowbellLow';
            }
        }
    }

    if (shouldPlay && inst.name === 'Snare' && intensity < INTENSITY_BANDS.LOW) {
        soundName = 'Sidestick';
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
