import {
    applyStandardBase,
    binaryTier,
    DEFAULT_CONFIG,
    makeMotifSelector,
    roll,
    scaleVelocity,
} from './utils.js';

export const config = {
    ...DEFAULT_CONFIG,
    entropyMultiplier: 0.04, // Rock solid timing
    blockAdjacentSnare: false,
    backbeatCrack: false,
};

/**
 * Motifs for Country:
 * 0: Traditional Two-Step, 1: Train Beat Light, 2: Full Heavy Train Beat
 * @type {(seed: number, complexity: number, intensity?: number) => number}
 */
export const getMotif = makeMotifSelector([
    binaryTier(0.6, 0.6),
    {
        picks: [[0.3, 0], [0.8, 1], 2],
    },
]);

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
    } = context;

    let { shouldPlay, velocity, soundName, instTimeOffset, intensity } = base;

    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);

    if (context.inst.name === 'Snare') {
        shouldPlay = false;

        // Train Beat snare is consistent 16ths
        if (activeMotif > 0) {
            shouldPlay = true;

            // Add a small amount of random jitter to all snare hits to prevent "machine gun" effect
            const jitter = (Math.random() - 0.5) * 0.08;

            if (isBackbeat) {
                // Strong accent on 2 and 4
                soundName = intensity > 0.4 ? 'Snare' : 'Sidestick';
                velocity = scaleVelocity(0.95, intensity, 0.1) + jitter;
            } else if (isBeatStart) {
                // Quarter note foundation (non-backbeat)
                soundName = 'Snare';
                velocity = scaleVelocity(0.35, intensity, 0.1) + jitter;
            } else if (isOffbeat) {
                // Eighth note offbeats
                soundName = 'Snare';
                velocity = scaleVelocity(0.3, intensity, 0.1) + jitter;
            } else if (isEOfBeat || isAOfBeat) {
                // The "chicka" ghosts (16ths)
                // Probability scales with intensity
                const ghostProb = 0.5 + intensity * 0.5;
                if (roll(ghostProb)) {
                    shouldPlay = true;
                    soundName = 'Snare';
                    velocity = scaleVelocity(0.15, intensity, 0.08) + jitter;
                } else {
                    shouldPlay = false;
                }
            }
        } else {
            // Motif 0: Standard Two-Step
            if (isBackbeat) {
                shouldPlay = true;
                soundName = intensity < 0.4 ? 'Sidestick' : 'Snare';
                velocity = scaleVelocity(0.9, intensity, 0.1);
            }
        }
    } else if (context.inst.name === 'Kick') {
        shouldPlay = false;

        // Foundation: 1 and 3
        if (isDownbeat || (isBeatStart && beatIndex === 2)) {
            shouldPlay = true;
            velocity = isDownbeat ? 1.25 : 1.1;
        }
        // Four-on-the-floor drive at high intensity
        else if (isBeatStart && intensity > 0.8 && roll(0.8)) {
            shouldPlay = true;
            velocity = scaleVelocity(0.6, intensity, 0.1); // Feathered
        }
    } else if (context.inst.name === 'HiHat' || context.inst.name === 'Open') {
        shouldPlay = false;

        // Hats are secondary in a train beat
        if (activeMotif === 0) {
            // Simple eighths for two-step
            if (isBeatStart || isOffbeat) {
                shouldPlay = true;
                velocity = isBeatStart ? 0.8 : 0.6;
                soundName = 'HiHat';
            }
        } else {
            // Quarter note "clicks" to cut through the snare
            if (isBeatStart) {
                shouldPlay = true;
                velocity = 0.75;
                soundName = 'HiHat';

                // Let the phrase lift on beat 4 at peak intensity,
                // but avoid turning the whole train beat into an open-hat wash.
                if (intensity > 0.82 && beatIndex === 3) {
                    soundName = 'Open';
                    velocity = 0.85;
                }
            }
        }
    }

    return { shouldPlay, velocity, soundName, instTimeOffset };
}
