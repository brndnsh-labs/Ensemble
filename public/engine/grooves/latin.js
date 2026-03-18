import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    isLatin: true,
};

/**
 * Maps intensity to motif complexity for Latin / Bossa.
 * @param {number} seed
 * @param {number} complexity
 * @param {number} [intensity]
 */
export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0; // Pure Bossa Nova at low intensity
    }

    if (intensity < 0.6) {
        if (seed < 0.7) {
            return 0;
        }
        return 1;
    }

    // High Intensity
    if (seed < 0.3) {
        return 0;
    }
    if (seed < 0.6) {
        return 1;
    }
    if (seed < 0.85) {
        return 2; // Samba
    }
    return 3; // Partido Alto
}

/**
 * @param {any} context
 * @param {any} state
 * @returns {any}
 */
export function applyOverrides(context, state) {
    const {
        step,
        inst,
        playback,
        drumComplexity,
        sectionSeed,
        isTurnaround,
        isBeatStart,
        isOffbeat,
        isAOfBeat,
        beatIndex,
        stepsPerBar,
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- Lay-back: Bossa is relaxed ---
    instTimeOffset += 0.005 + intensity * 0.005;

    // --- 1. KICK PATTERNS (Surdo Feel) ---
    if (inst.name === 'Kick') {
        shouldPlay = false;
        // Foundation: 1 and 3 (Surdo heart)
        if (isBeatStart && (beatIndex === 0 || beatIndex === 2)) {
            shouldPlay = true;
            // The hit on 3 is often heavier or more "open" in feel
            const accent = beatIndex === 2 ? 1.15 : 1.0;
            velocity = scaleVelocity(1.1 * accent, intensity, 0.1);
            // Extra "weight" (lag) on the second surdo hit
            if (beatIndex === 2) {
                instTimeOffset += 0.005;
            }
        }

        // Samba variation: Add 16th note pushes
        if (activeMotif >= 2 && !shouldPlay) {
            if (isAOfBeat && (beatIndex === 0 || beatIndex === 2)) {
                if (roll(0.6, intensity)) {
                    shouldPlay = true;
                    velocity = scaleVelocity(0.7, intensity, 0.1);
                }
            }
        }
    }
    // --- 2. CLAVE (Sidestick) ---
    else if (inst.name === 'Snare') {
        shouldPlay = false;
        soundName = 'Sidestick';

        // 2-Bar Clave Logic
        const barIndex = Math.floor(step / stepsPerBar);
        const isBar1 = barIndex % 2 === 0;
        const stepInBar = step % stepsPerBar;

        if (activeMotif === 0 || activeMotif === 1) {
            // Authentic 3-2 Bossa Clave
            // Bar 1 (3-side): 1, & of 2, 4
            // Bar 2 (2-side): & of 1, 3
            if (isBar1) {
                if (stepInBar === 0 || stepInBar === 6 || stepInBar === 12) {
                    shouldPlay = true;
                }
            } else {
                if (stepInBar === 2 || stepInBar === 8) {
                    shouldPlay = true;
                }
            }

            // Add a bit of chatter if complexity is high
            if (!shouldPlay && drumComplexity > 0.7 && intensity > 0.6) {
                if (isOffbeat && roll(0.3)) {
                    shouldPlay = true;
                    velocity = 0.5;
                }
            }
        } else if (activeMotif === 2) {
            // Samba (Busy cross-stick)
            if (isBeatStart || isOffbeat) {
                if (roll(0.7, intensity)) {
                    shouldPlay = true;
                }
            }
        } else {
            // Partido Alto
            // Typical syncopation: &1, 2, &3, 4 | 1, &2, 3, &4
            const partidoPattern = isBar1 ? [2, 4, 10, 12] : [0, 6, 8, 14];
            if (partidoPattern.includes(stepInBar)) {
                shouldPlay = true;
            }
        }

        if (isTurnaround && intensity > 0.8) {
            if (beatIndex === 3) {
                shouldPlay = true;
                velocity = 1.1;
                soundName = 'Snare';
            }
        }

        if (shouldPlay && soundName === 'Sidestick') {
            velocity = scaleVelocity(0.9, intensity, 0.1) + (Math.random() - 0.5) * 0.1;
        }
    }
    // --- 3. HI-HAT (Steady 8ths) ---
    else if (inst.name === 'HiHat' || inst.name === 'Open') {
        shouldPlay = false;
        if (isBeatStart || isOffbeat) {
            shouldPlay = true;
            soundName = 'HiHat';
            velocity = isBeatStart ? 0.8 : 0.6;
        }
    }
    // --- 4. PERCUSSION (Ganza/Shaker) ---
    else if (inst.name === 'Shaker' || inst.name === 'Perc') {
        shouldPlay = true;
        // Consistent 16th note shimmer with tiered pulse
        if (isBeatStart) {
            velocity = scaleVelocity(0.95, intensity, 0.1);
        } else if (isOffbeat) {
            velocity = scaleVelocity(0.75, intensity, 0.1);
        } else {
            velocity = scaleVelocity(0.45, intensity, 0.1);
        }

        if (inst.name === 'Perc') {
            shouldPlay = activeMotif >= 2 && roll(0.4, intensity);
            soundName = 'AgogoHigh';
        }
    }

    if (shouldPlay && inst.name === 'Snare' && intensity < 0.4) {
        soundName = 'Sidestick';
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
