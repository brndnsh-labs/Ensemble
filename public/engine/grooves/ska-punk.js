import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    exemptFromPulseShaping: true,
    entropyMultiplier: 0.04, // Rock solid fast timing
};

/**
 * Maps intensity to motif complexity for Ska-Punk.
 * 0: Classic Ska (Grounded 1/3 kick, dominant offbeat hats)
 * 1: Driving 2-Step (Fast Punk feel)
 * 2: Double-Time / Skate Punk (Maximum energy)
 * 3: D-Beat (Syncopated driving feel)
 */
export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0; // Pure Ska foundation
    }

    if (intensity < 0.6) {
        if (seed < 0.6) {
            return 0;
        }
        return 1; // 2-Step
    }

    // High Intensity
    if (seed < 0.2) {
        return 0;
    }
    if (seed < 0.5) {
        return 1; // 2-Step
    }
    if (seed < 0.8) {
        return 2; // Double-Time
    }
    return 3; // D-Beat
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
        isEOfBeat,
        beatIndex,
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);
    const _isEighthNote = isBeatStart || isOffbeat;

    // --- 1. ENERGETIC PUSH (Micro-timing) ---
    // Rushing the beat drives the Ska-Punk energy.
    instTimeOffset -= 0.006 + intensity * 0.008;

    // --- 2. HI-HAT / OPEN DYNAMICS ---
    if (inst.name === 'HiHat' || inst.name === 'Open') {
        shouldPlay = false;

        // The Skank: Mandatory offbeat focus
        if (isOffbeat) {
            shouldPlay = true;
            // Offbeats are accented and crisp
            velocity = scaleVelocity(1.3, intensity, 0.1);
            if (intensity > 0.7 && roll(0.4)) {
                soundName = 'Open';
            }
        } else if (isBeatStart && (activeMotif >= 1 || intensity > 0.6)) {
            // Keep the eighth notes moving for punk motifs
            shouldPlay = true;
            velocity = scaleVelocity(0.8, intensity, 0.1);
        }

        // Crash on the One for section energy
        if (isDownbeat && intensity > 0.8 && roll(0.4)) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.4;
        }
    }
    // --- 3. KICK DRUM ---
    else if (inst.name === 'Kick') {
        shouldPlay = false;

        if (activeMotif === 0) {
            // Classic Ska: 1 and 3
            if (isBeatStart && !isBackbeat) {
                shouldPlay = true;
            }
        } else if (activeMotif === 1 || activeMotif === 2) {
            // 2-Step & Double-Time: Every quarter note
            if (isBeatStart) {
                shouldPlay = true;
            }
        } else if (activeMotif === 3) {
            // D-Beat / Syncopated
            if (
                isDownbeat ||
                (isAOfBeat && beatIndex === 0) ||
                (isBeatStart && beatIndex === 2) ||
                (isOffbeat && beatIndex === 3)
            ) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = scaleVelocity(1.2, intensity, 0.15);
        }
    }
    // --- 4. SNARE POCKET ---
    else if (inst.name === 'Snare') {
        shouldPlay = false;

        if (activeMotif === 2) {
            // Double Time: Snare on the offbeats!
            if (isOffbeat) {
                shouldPlay = true;
            }
        } else {
            // Standard Backbeat
            if (isBackbeat) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = scaleVelocity(1.2, intensity, 0.1);
            soundName = intensity > 0.4 ? 'Snare' : 'Sidestick';
        }

        // Turnaround Fill
        if (isTurnaround && intensity > 0.7 && !shouldPlay) {
            if (beatIndex >= 3 && (isEOfBeat || isAOfBeat)) {
                shouldPlay = true;
                soundName = 'Snare';
                velocity = 1.1;
            }
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
