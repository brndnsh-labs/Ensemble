import { DEFAULT_CONFIG, getStepIndices, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.08,
    blockAdjacentSnare: true,
};

/**
 * Maps intensity to motif complexity for Acoustic.
 * 0: Classic Folk/Cajon (Understated/Grounded)
 * 1: Driving Folk (Steady 8th pulse)
 * 2: Soft Rock (Standard backbeat)
 * 3: Dynamic Acoustic (16th note shimmer)
 */
export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0; // Pure Cajon feel at low intensity
    }

    // Stable seed ranges for core motifs
    if (seed < 0.25) {
        return 0; // Folk foundation always reachable
    }
    if (seed < 0.5) {
        return 1; // Driving Folk always reachable
    }

    // For seeds > 0.5, allow more energetic styles at higher intensity
    if (intensity < 0.7) {
        return seed < 0.8 ? 0 : 1;
    }

    if (seed < 0.8) {
        return 2; // Soft Rock
    }
    return 3; // Dynamic Acoustic
}

export function applyOverrides(context, state) {
    const { inst, loopStep, playback, drumComplexity, sectionSeed, stepsPerBar } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    const macroBeat = Math.floor(stepsPerBar / 4);

    // --- 1. SNARE / SIDESTICK (Cajon to Kit Transition) ---
    if (inst.name === 'Snare') {
        shouldPlay = false;

        // Transition from Sidestick to full Snare as intensity rises
        soundName = intensity > 0.65 ? 'Snare' : 'Sidestick';

        if (activeMotif === 2 || activeMotif === 3) {
            // Standard backbeat for Soft Rock/Dynamic
            const backbeats = getStepIndices(stepsPerBar, [4 / 16, 12 / 16]);
            if (backbeats.includes(loopStep)) {
                shouldPlay = true;
            }
        } else {
            // Minimal backbeat for Folk (Beat 3 only)
            const beat3 = getStepIndices(stepsPerBar, [8 / 16])[0];
            if (loopStep === beat3) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = scaleVelocity(0.85, intensity, 0.15) + Math.random() * 0.1;
        }

        // Occasional ghost notes at high intensity
        if (intensity > 0.8 && activeMotif === 3) {
            const ghosts = getStepIndices(stepsPerBar, [3 / 16, 7 / 16, 11 / 16, 15 / 16]);
            if (ghosts.includes(loopStep) && roll(0.25)) {
                shouldPlay = true;
                velocity = scaleVelocity(0.2, intensity, 0.2);
                soundName = 'Sidestick';
            }
        }
    } else if (inst.name === 'Kick') {
        shouldPlay = false;
        // Minimal kick at low intensity (The One)
        if (loopStep === 0) {
            shouldPlay = true;
        }

        // Add backbeat/syncopation as intensity rises
        if (intensity > 0.45) {
            const syncKick1 = getStepIndices(stepsPerBar, [6 / 16])[0];
            if (activeMotif === 0 && loopStep === syncKick1) {
                shouldPlay = true; // "and" of 2
            }
            const beat3 = getStepIndices(stepsPerBar, [8 / 16])[0];
            if (activeMotif >= 2 && loopStep === beat3) {
                shouldPlay = true; // Beat 3
            }
        }

        if (intensity > 0.75 && activeMotif === 3) {
            const syncKick2 = getStepIndices(stepsPerBar, [10 / 16])[0];
            if (loopStep === syncKick2 && roll(0.4)) {
                shouldPlay = true; // syncopated pickup
            }
        }

        if (shouldPlay) {
            velocity = scaleVelocity(0.9, intensity, 0.1);
        }
    } else if (inst.name === 'HiHat' || inst.name === 'Open') {
        // Acoustic HiHats often act as a constant shaker-like pulse
        shouldPlay = true;

        // Basic 8th note pulse accents
        const offbeatAmount = Math.floor(macroBeat / 2);
        const isPulse = loopStep % offbeatAmount === 0;
        const isQuarter = loopStep % macroBeat === 0;

        if (isQuarter) {
            velocity = scaleVelocity(0.7, intensity, 0.15);
        } else if (isPulse) {
            velocity = scaleVelocity(0.5, intensity, 0.1);
        } else {
            // 16th note "ghost" pulse
            velocity = scaleVelocity(0.3, intensity, 0.1);
            // Higher intensity increases 16th clarity
            if (intensity < 0.5 && roll(0.4)) {
                shouldPlay = false; // lower density at low intensity
            }
        }

        // Motif 3: Extra shimmer
        if (activeMotif === 3 && !isPulse) {
            velocity *= 1.2;
        }
    } else if (inst.name === 'Shaker' || inst.name === 'Tambourine') {
        // Percussion scales density with intensity
        const offbeatAmount = Math.floor(macroBeat / 2);
        shouldPlay = loopStep % offbeatAmount === 0;
        if (intensity > 0.6) {
            shouldPlay = true; // full 16th coverage
        }

        velocity = loopStep % macroBeat === 0 ? 0.8 : 0.5;
        velocity *= scaleVelocity(0.7, intensity, 0.3);
    }

    // --- FINAL POLISH ---
    if (shouldPlay) {
        if (inst.name === 'Snare' && intensity < INTENSITY_BANDS.LOW) {
            soundName = 'Sidestick';
        }
        // Subtle human jitter for acoustic feel
        instTimeOffset += (Math.random() - 0.5) * 0.004;
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
