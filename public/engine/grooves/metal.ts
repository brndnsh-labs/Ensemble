import {
    applyStandardBase,
    binaryTier,
    DEFAULT_CONFIG,
    type DrumStepBase,
    type GrooveContext,
    INTENSITY_BANDS,
    makeMotifSelector,
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
 * 0: Standard Heavy, 1: Driving 8th Kick, 2: The Gallop, 3: Double Kick 16ths, 4: Blast Beat
 */
export const getMotif = makeMotifSelector([
    binaryTier(0.65, 0.6),
    {
        maxIntensity: INTENSITY_BANDS.HIGH,
        picks: [[0.3, 1], [0.7, 2], 3],
    },
    {
        picks: [[0.25, 2], [0.6, 3], 4],
    },
]);

export function applyOverrides(context: GrooveContext, state: DrumStepBase): DrumStepBase {
    const result = applyStandardBase(context, state);
    if (result.muted) {
        return result.base;
    }
    const { base } = result;

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
