import {
    applyStandardBase,
    DEFAULT_CONFIG,
    INTENSITY_BANDS,
    roll,
    scaleVelocity,
} from './utils.js';

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
    const { base, muted } = applyStandardBase(context, state);
    if (muted) {
        return base;
    }

    const {
        isDownbeat,
        isBeatStart,
        isPulse,
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

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity } = base;

    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- "The One" Absolute Reinforcement ---
    if (context.inst.name === 'Kick' && isDownbeat) {
        shouldPlay = true;
        velocity = scaleVelocity(1.35, intensity, 0.1);
    }

    // --- Hi-Hat & Open Dynamics ---
    if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
        shouldPlay = false;

        const useOrchestration = orchestration?.rideVoice !== undefined;
        const voice = orchestration?.rideVoice;
        const rideSection = voice === 'Ride';
        const openSection = voice === 'Open';

        // 16th note shimmer (Texture)
        if (intensity > 0.5 || (useOrchestration && voice !== 'None')) {
            shouldPlay = true;
            soundName = rideSection && (isBeatStart || isOffbeat) ? 'Ride' : 'HiHat';

            // Tiered velocity for the shimmer
            if (isBeatStart) {
                velocity = scaleVelocity(0.85, intensity, 0.15);
            } else if (isOffbeat) {
                velocity = scaleVelocity(0.7, intensity, 0.1);
            } else {
                velocity = scaleVelocity(0.45, intensity, 0.1);
            }

            if (
                openSection &&
                isOffbeat &&
                (isEOfBeat || beatIndex === 3 || (isAOfBeat && intensity > 0.75)) &&
                roll(0.55, intensity)
            ) {
                soundName = 'Open';
                velocity = 1.05;
            }
        } else if (isBeatStart || isOffbeat) {
            shouldPlay = true;
            soundName = 'HiHat';
            velocity = isBeatStart ? 0.8 : 0.6;
        }

        // Barks (Open Hat syncopation)
        const barkProb = (activeMotif === 2 ? 0.6 : openSection ? 0.45 : 0.2) * intensity;
        if (isOffbeat && roll(barkProb) && voice !== 'HiHat-Closed') {
            shouldPlay = true;
            soundName = 'Open';
            velocity = openSection ? 1.0 : 1.1;
        }

        // Turnaround Bark
        if (isTurnaround && isOffbeat && isPulse && isBackbeat) {
            shouldPlay = true;
            soundName = 'Open';
            velocity = 1.2;
        } else if (isTurnaround && isOffbeat && !shouldPlay) {
            // Give a chance to play on a turnaround offbeat
            if (roll(0.4, intensity)) {
                shouldPlay = true;
                soundName = 'Open';
                velocity = 1.2;
            }
        }
    }
    // --- Snare Pocket ---
    else if (context.inst.name === 'Snare') {
        shouldPlay = false;

        // Fundamental Backbeat
        if (activeMotif === 2) {
            // Displaced backbeat: First backbeat is normal, later ones are displaced to the offbeat
            if (isBackbeat) {
                if (roll(0.5)) {
                    shouldPlay = true;
                    velocity = 1.15;
                }
            } else if (isOffbeat && !isPulse) {
                // Displaced hits on offbeats, higher intensity means more displacement
                if (roll(0.8, intensity)) {
                    shouldPlay = true;
                    velocity = 1.1;
                }
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
            if (isAOfBeat && !isBackbeat && isPulse) {
                if (roll(0.7, intensity)) {
                    shouldPlay = true;
                    soundName = 'Sidestick';
                    velocity = 0.5;
                }
            }
        }

        // General Syncopation
        if (intensity > 0.6 && !shouldPlay) {
            // General syncopation on 'a' of beats or offbeats
            if ((isAOfBeat && isBackbeat) || (isOffbeat && roll(0.2))) {
                if (roll(0.3)) {
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
    else if (context.inst.name === 'Kick') {
        shouldPlay = false;

        // Grounding
        if (isDownbeat || (isPulse && isBackbeat)) {
            shouldPlay = true;
            velocity = isDownbeat ? 1.3 : 1.1;
        }

        // Motif 3: Linear Kick
        if (activeMotif === 3) {
            if (isEOfBeat && isBackbeat) {
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
