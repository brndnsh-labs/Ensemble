import {
    applyStandardBase,
    DEFAULT_CONFIG,
    INTENSITY_BANDS,
    roll,
    scaleVelocity,
} from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.05, // Rock solid precision
    blockAdjacentSnare: false,
    backbeatCrack: true,
};

/**
 * Metal Motifs:
 * 0: Standard Heavy (Kick on 1 & 3, Snare on 2 & 4)
 * 1: Driving 8th Kick (Trash/Heavy Rock feel)
 * 2: The Gallop (16-16-8 Kick pattern)
 * 3: Double Kick 16ths (Continuous wall of sound)
 * 4: Blast Beat (16th Snare + 16th Kick synchronization)
 * @param {number} seed
 * @param {number} complexity
 * @param {number} [intensity=1.0]
 * @returns {number}
 */
export function getMotif(seed, complexity, intensity = 1.0) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
        return 0; // Pure foundation
    }

    if (intensity < 0.65) {
        if (seed < 0.6) {
            return 0;
        }
        return 1; // Driving 8ths
    }

    if (intensity < INTENSITY_BANDS.HIGH) {
        if (seed < 0.3) {
            return 1;
        }
        if (seed < 0.7) {
            return 2; // Gallop
        }
        return 3; // Double Kick 16ths
    }

    // High Intensity
    if (seed < 0.25) {
        return 2; // Gallop
    }
    if (seed < 0.6) {
        return 3; // 16ths
    }
    return 4; // Blast Beat
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
        isBackbeat,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        beatIndex,
        drumComplexity,
        sectionSeed,
        loopStep,
        isTurnaround,
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity, isEighthNote, halfBarStep } =
        base;

    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    // --- 1. KICK DRUM (The Engine) ---
    if (context.inst.name === 'Kick') {
        shouldPlay = false;

        if (activeMotif === 0) {
            // Standard Heavy
            if (isBeatStart && !isBackbeat) {
                shouldPlay = true;
            }
            if (isOffbeat && beatIndex === 2) {
                shouldPlay = true;
            }
        } else if (activeMotif === 1) {
            // Driving 8ths
            if (isEighthNote) {
                shouldPlay = true;
            }
        } else if (activeMotif === 2) {
            // The Gallop (16-16-8)
            if (isBeatStart || isOffbeat || isAOfBeat) {
                shouldPlay = true;
            }
        } else if (activeMotif === 3 || activeMotif === 4) {
            // Continuous 16ths
            shouldPlay = true;
        }

        if (shouldPlay) {
            velocity = isDownbeat ? 1.3 : isBeatStart ? 1.15 : 0.95;
            // Humanize continuous runs
            if (!isBeatStart) {
                instTimeOffset += (Math.random() - 0.5) * 0.003;
            }
        }
    }
    // --- 2. SNARE (The Anchor) ---
    else if (context.inst.name === 'Snare') {
        shouldPlay = false;
        soundName = 'Snare';

        if (activeMotif === 4 && intensity > 0.85) {
            // Blast Beat: Snare on every 8th or 16th
            if (isEighthNote) {
                shouldPlay = true;
            }
        } else {
            // Standard Backbeat
            if (isBackbeat) {
                shouldPlay = true;
            }
        }

        // Fill Logic
        if (isTurnaround && loopStep >= halfBarStep) {
            if (isEighthNote || isEOfBeat || isAOfBeat) {
                if (roll(0.7, intensity)) {
                    shouldPlay = true;
                    velocity = 1.15;
                }
            }
        }

        if (shouldPlay) {
            velocity = scaleVelocity(1.2, intensity, 0.1);
            if (intensity < 0.4) {
                soundName = 'Sidestick';
            }
        }
    }
    // --- 3. CYMBALS / HATS ---
    else if (
        context.inst.name === 'HiHat' ||
        context.inst.name === 'Open' ||
        context.inst.name === 'Crash'
    ) {
        shouldPlay = false;

        if (isEighthNote) {
            shouldPlay = true;
            // Use China/Open sounds at high intensity
            if (intensity > 0.75) {
                soundName = sectionSeed > 0.5 ? 'Ride' : 'Open';
                velocity = 1.15;
            } else {
                soundName = intensity > 0.5 ? 'Open' : 'HiHat';
                velocity = 1.0;
            }
        }

        // Section Accents
        if (isDownbeat && intensity > 0.8) {
            shouldPlay = true;
            soundName = 'Open'; // China/Crash
            velocity = 1.4;
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
