import { DEFAULT_CONFIG, INTENSITY_BANDS, roll, scaleVelocity } from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    backbeatCrack: true,
    entropyMultiplier: 0.06, // Tight but expressive
};

/**
 * Maps intensity to motif complexity for Funk.
 * @param {number} seed
 * @param {number} complexity
 * @param {number} [intensity=1.0]
 * @returns {number}
 */
export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0; // Grounded pocket
    }

    if (intensity < 0.7) {
        if (seed < 0.4) {
            return 0;
        }
        return 1; // Ghost heavy
    }

    // High Intensity
    if (seed < 0.2) {
        return 0;
    }
    if (seed < 0.5) {
        return 1; // Ghost heavy
    }
    if (seed < 0.75) {
        return 2; // Displaced
    }
    return 3; // Linear
}

/**
 * @param {any} context
 * @param {import('../../types.js').EnsembleState & any} state
 * @returns {any}
 */
export function applyOverrides(context, state) {
    const {
        inst,
        playback,
        isDownbeat,
        isBeatStart,
        isBackbeat,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        beatIndex,
        drumComplexity,
        orchestration,
        sectionSeed,
        isTurnaround,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset } = state;

    if (inst.muted) {
        return state;
    }

    const intensity = playback.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- "The One" Absolute Reinforcement ---
    if (inst.name === 'Kick' && isDownbeat) {
        shouldPlay = true;
        velocity = scaleVelocity(1.35, intensity, 0.1);
    }

    // --- Hi-Hat & Open Dynamics ---
    if (inst.name === 'HiHat' || inst.name === 'Open') {
        shouldPlay = false;

        const useOrchestration = orchestration?.rideVoice !== undefined;
        const voice = orchestration?.rideVoice;

        // 16th note shimmer (Texture)
        if (intensity > 0.5 || (useOrchestration && voice !== 'None')) {
            shouldPlay = true;
            soundName = 'HiHat';

            if (voice === 'Ride') {
                soundName = 'Ride';
            }
            if (voice === 'Open') {
                soundName = 'Open';
            }

            // Tiered velocity for the shimmer
            if (isBeatStart) {
                velocity = scaleVelocity(0.85, intensity, 0.15);
            } else if (isOffbeat) {
                velocity = scaleVelocity(0.7, intensity, 0.1);
            } else {
                velocity = scaleVelocity(0.45, intensity, 0.1);
            }
        } else if (isBeatStart || isOffbeat) {
            shouldPlay = true;
            soundName = 'HiHat';
            velocity = isBeatStart ? 0.8 : 0.6;
        }

        // Barks (Open Hat syncopation)
        const barkProb = (activeMotif === 2 ? 0.6 : 0.2) * intensity;
        if (isOffbeat && roll(barkProb) && voice !== 'HiHat-Closed') {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.1;
        }

        // Turnaround Bark
        if (isTurnaround && isOffbeat && beatIndex >= 3) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.2;
        }
    }
    // --- Snare Pocket ---
    else if (inst.name === 'Snare') {
        shouldPlay = false;

        // Fundamental Backbeat
        if (activeMotif === 2) {
            // Displaced: Beat 2 is normal, but beat 4 is displaced to "&"
            if (isBackbeat && beatIndex === 1) {
                shouldPlay = true;
            }
            if (isOffbeat && beatIndex === 3) {
                shouldPlay = true; // Displaced hit
                velocity = 1.1;
            }
        } else {
            if (isBackbeat) {
                shouldPlay = true;
            }
        }

        if (shouldPlay) {
            if (orchestration?.snareVoice === 'Sidestick') {
                soundName = 'Sidestick';
                velocity = 0.8;
            } else if (orchestration?.snareVoice === 'None') {
                shouldPlay = false;
            } else {
                soundName = intensity > 0.4 ? 'Snare' : 'Sidestick';
                velocity = scaleVelocity(1.2, intensity, 0.1);
            }
        }

        // Motif 1: The Funky Drummer (Dense Ghosting)
        if (activeMotif === 1 && !shouldPlay) {
            // High probability for ghosting on all non-beat steps
            if (!isBeatStart && roll(0.6 + intensity * 0.3)) {
                shouldPlay = true;
                soundName = 'Sidestick';
                velocity = scaleVelocity(0.15, intensity, 0.15) + Math.random() * 0.1;
            }
        }

        // Motif 3: Linear Snare (interlocking)
        if (activeMotif === 3 && !shouldPlay) {
            if (isAOfBeat && (beatIndex === 0 || beatIndex === 2)) {
                if (roll(0.7, intensity)) {
                    shouldPlay = true;
                    soundName = 'Sidestick';
                    velocity = 0.5;
                }
            }
        }

        // General Syncopation (The "& of 4" or "a of 2")
        if (intensity > 0.6 && !shouldPlay) {
            if ((isAOfBeat && beatIndex === 1) || (isOffbeat && beatIndex === 3)) {
                if (roll(0.4)) {
                    shouldPlay = true;
                    soundName = intensity > 0.8 ? 'Snare' : 'Sidestick';
                    velocity = 0.7;
                }
            }
        }

        // Low intensity fallback
        if (shouldPlay && intensity < 0.35 && velocity > 0.8) {
            soundName = 'Sidestick';
        }
    }
    // --- Kick Drum ---
    else if (inst.name === 'Kick') {
        shouldPlay = false;

        // Grounding
        if (isDownbeat || (isBeatStart && beatIndex === 2)) {
            shouldPlay = true;
            velocity = isDownbeat ? 1.3 : 1.1;
        }

        // Motif 3: Linear Kick
        if (activeMotif === 3) {
            if (isEOfBeat && (beatIndex === 1 || beatIndex === 3)) {
                shouldPlay = true;
                velocity = 0.9;
            }
        }

        // General Syncopation
        if (intensity > 0.7 && !shouldPlay) {
            const syncProb = activeMotif === 1 ? 0.5 : 0.2;
            if (isOffbeat && roll(syncProb)) {
                shouldPlay = true;
                velocity = 0.85;
            }
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
