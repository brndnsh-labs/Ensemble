import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.06, // Tighter for acoustic precision
    blockAdjacentSnare: true,
};

/**
 * Maps intensity to motif complexity for Acoustic.
 * 0: Minimal Folk/Cajon (Kick on 1, Sidestick on 3)
 * 1: Driving Folk (Kick on 1/3, Sidestick on 2/4)
 * 2: Soft Rock / Shaker-driven
 * 3: Dynamic Build (Soft Snare runs)
 */
export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0; // Pure Cajon foundation
    }

    if (intensity < 0.65) {
        if (seed < 0.6) {
            return 0;
        }
        return 1; // Driving Folk
    }

    // High Intensity prioritization
    if (seed < 0.2) {
        return 0; // Maintain minimal option
    }
    if (seed < 0.45) {
        return 1; // Driving Folk
    }
    if (seed < 0.8) {
        return 2; // Soft Rock
    }
    return 3; // Dynamic Build
}

export function applyOverrides(context, state) {
    const {
        inst,
        playback,
        drumComplexity,
        sectionSeed,
        isDownbeat,
        isBeatStart,
        isOffbeat,
        beatIndex,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);
    const _isEighthNote = isBeatStart || isOffbeat;

    // --- Lay-back: Acoustic is relaxed ---
    instTimeOffset += 0.004 + intensity * 0.004;

    // --- 1. SNARE / SIDESTICK (Cajon Feel) ---
    if (inst.name === 'Snare') {
        shouldPlay = false;

        // Transition from Sidestick to full Snare as intensity rises
        soundName = intensity >= 0.75 ? 'Snare' : 'Sidestick';

        if (activeMotif === 0) {
            // Minimal: Beat 3 only (Half-time pulse)
            if (isBeatStart && beatIndex === 2) {
                shouldPlay = true;
            }
        } else {
            // Standard backbeat on 2 and 4
            if (isBeatStart && (beatIndex === 1 || beatIndex === 3)) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            velocity = scaleVelocity(0.9, intensity, 0.15);
        }

        // Occasional light ghost chatter at high intensity
        if (intensity > 0.7 && !shouldPlay && isOffbeat && roll(0.3)) {
            shouldPlay = true;
            soundName = 'Sidestick';
            velocity = 0.4;
        }
    }
    // --- 2. KICK (Deep & Grounded) ---
    else if (inst.name === 'Kick') {
        shouldPlay = false;

        // Foundation: Beat 1
        if (isDownbeat) {
            shouldPlay = true;
            velocity = 1.2;
        }

        // Motif 1 & 2: Beat 3 presence
        if (activeMotif >= 1 && isBeatStart && beatIndex === 2) {
            shouldPlay = true;
            velocity = 1.05;
        }

        // Syncopation: "& of 2" or "& of 4"
        if (intensity > 0.5 && !shouldPlay && isOffbeat && (beatIndex === 1 || beatIndex === 3)) {
            if (roll(0.4, intensity)) {
                shouldPlay = true;
                velocity = 0.85;
            }
        }
    }
    // --- 3. HI-HAT (Pulse Shaker) ---
    else if (inst.name === 'HiHat' || inst.name === 'Open') {
        // Acoustic HiHats often act as a constant shaker-like pulse
        shouldPlay = true;

        if (isBeatStart) {
            velocity = scaleVelocity(0.7, intensity, 0.15);
            soundName = 'HiHat';
        } else if (isOffbeat) {
            velocity = scaleVelocity(0.6, intensity, 0.1);
            soundName = 'HiHat';
        } else {
            // 16th note "ghost" pulse
            velocity = scaleVelocity(0.3, intensity, 0.1);
            soundName = 'HiHat';
            // Higher intensity increases 16th clarity
            if (intensity < 0.5 && roll(0.4)) {
                shouldPlay = false; // lower density at low intensity
            }
        }

        // Open Hat "Breath"
        if (isOffbeat && beatIndex === 3 && intensity > 0.6 && roll(0.3)) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 0.95;
        }
    }
    // --- 4. PERCUSSION (Tambourine/Shaker) ---
    else if (inst.name === 'Shaker' || inst.name === 'Tambourine') {
        // High intensity shimmers
        shouldPlay = intensity > 0.6;
        if (shouldPlay) {
            velocity = isBeatStart ? 0.8 : 0.5;
            velocity *= scaleVelocity(0.7, intensity, 0.3);
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
