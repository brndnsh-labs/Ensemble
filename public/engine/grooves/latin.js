import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

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
        playback,
        groove,
        drumComplexity,
        sectionSeed,
        isTurnaround,
        isDownbeat,
        isBeatStart,
        isOffbeat,
        isEOfBeat,
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

    // --- 1. KICK PATTERNS (Surdo Feel) ---
    if (inst.name === 'Kick') {
        shouldPlay = false;
        // Basic Bossa/Samba Kick: 1, pickup to 2, 3, pickup to 4
        if (
            isDownbeat ||
            (isAOfBeat && beatIndex === 0) ||
            (isBeatStart && beatIndex === 2) ||
            (isAOfBeat && beatIndex === 2)
        ) {
            shouldPlay = true;
            // Accented primary hits
            velocity = isBeatStart
                ? scaleVelocity(1.1, intensity, 0.1)
                : scaleVelocity(0.85, intensity, 0.1);
        }

        // High Intensity Samba Surdo: Driving pickups
        if (intensity > 0.75 && (activeMotif === 2 || activeMotif === 3)) {
            if (isAOfBeat && (beatIndex === 1 || beatIndex === 3)) {
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
            if (
                isDownbeat ||
                (isAOfBeat && beatIndex === 0) ||
                (isOffbeat && beatIndex === 1) ||
                (isOffbeat && beatIndex === 2) ||
                (isEOfBeat && beatIndex === 3)
            ) {
                shouldPlay = true;
            }
        } else if (activeMotif === 1) {
            // Songo Style
            if (
                (isOffbeat && beatIndex === 0) ||
                (isEOfBeat && beatIndex === 1) ||
                (isBeatStart && beatIndex === 2) ||
                (isAOfBeat && beatIndex === 2) ||
                (isOffbeat && beatIndex === 3)
            ) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2) {
            // Samba Syncopation
            if (
                isDownbeat ||
                (isBeatStart && beatIndex === 1) ||
                (isAOfBeat && beatIndex === 1) ||
                (isBeatStart && beatIndex === 2) ||
                (isAOfBeat && beatIndex === 2) ||
                (isEOfBeat && beatIndex === 3) ||
                (isAOfBeat && beatIndex === 3)
            ) {
                shouldPlay = true;
            }
        } else if (activeMotif === 3) {
            // Partido Alto
            if (
                isDownbeat ||
                (isAOfBeat && beatIndex === 0) ||
                (isOffbeat && beatIndex === 1) ||
                (isOffbeat && beatIndex === 2) ||
                (isBeatStart && beatIndex === 3)
            ) {
                shouldPlay = true;
            }
        }

        // --- Repinique Turnaround Fills ---
        if (isTurnaround && intensity > 0.8) {
            // Rapid-fire "Repinique" style calls
            if (beatIndex === 3) {
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
            // 2-bar pattern is more complex to translate perfectly to purely semantic without state,
            // but we can anchor it to the first and second bar of the 2-bar cycle.
            const isFirstBar = bossaStep < stepsPerBar;
            if (isFirstBar) {
                if (
                    isDownbeat ||
                    (isAOfBeat && beatIndex === 0) ||
                    (isOffbeat && beatIndex === 1) ||
                    (isOffbeat && beatIndex === 2) ||
                    (isEOfBeat && beatIndex === 3)
                ) {
                    shouldPlay = true;
                    velocity = scaleVelocity(0.9, intensity, 0.15);
                }
            } else {
                if (
                    (isBeatStart && beatIndex === 0) ||
                    (isAOfBeat && beatIndex === 0) ||
                    (isOffbeat && beatIndex === 1) ||
                    (isEOfBeat && beatIndex === 2) ||
                    (isEOfBeat && beatIndex === 3)
                ) {
                    shouldPlay = true;
                    velocity = scaleVelocity(0.9, intensity, 0.15);
                }
            }
        }
    } else if (inst.name === 'Shaker') {
        shouldPlay = true;
        // Driving 8th pulse with 16th ghost notes scaling with intensity
        velocity =
            isBeatStart || isOffbeat
                ? scaleVelocity(0.8, intensity, 0.15)
                : scaleVelocity(0.4, intensity, 0.3);
        if (isBeatStart) {
            velocity *= 1.15; // Accent the downbeats
        }
    } else if (inst.name === 'Conga') {
        if (
            (isBeatStart && beatIndex === 1) ||
            (isAOfBeat && beatIndex === 2) ||
            (isBeatStart && beatIndex === 3) ||
            (isAOfBeat && beatIndex === 3)
        ) {
            shouldPlay = true;
            if (isBeatStart && beatIndex === 3) {
                soundName = 'CongaHighSlap';
                velocity = scaleVelocity(0.8, intensity, 0.25); // Harder slap with intensity
            } else if (isAOfBeat && beatIndex === 3) {
                soundName = 'CongaHigh';
                velocity = scaleVelocity(0.7, intensity, 0.1);
            } else {
                soundName = 'CongaHighMute';
                velocity = 0.6;
            }
        }
    } else if (inst.name === 'Guiro' && isTurnaround) {
        if (beatIndex >= 2) {
            shouldPlay = true;
            velocity = scaleVelocity(0.6, intensity, 0.2);
        }
    } else if (inst.name === 'Agogo' || inst.name.includes('Cowbell')) {
        // Introduce Agogo/Cowbell accents at high intensity
        if (intensity > 0.8 && (activeMotif === 2 || activeMotif === 3)) {
            if (
                ((isAOfBeat && beatIndex === 0) ||
                    (isOffbeat && beatIndex === 1) ||
                    (isAOfBeat && beatIndex === 2) ||
                    (isOffbeat && beatIndex === 3)) &&
                roll(0.25, intensity)
            ) {
                shouldPlay = true;
                velocity = 0.9;
                soundName = beatIndex < 2 ? 'CowbellHigh' : 'CowbellLow';
            }
        }
    }

    if (shouldPlay && inst.name === 'Snare' && intensity < INTENSITY_BANDS.LOW) {
        soundName = 'Sidestick';
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
