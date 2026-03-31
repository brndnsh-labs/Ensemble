/**
 * Shared utility functions for generative drum strategies.
 */

export const INTENSITY_BANDS = {
    LOW: 0.35,
    MID: 0.65,
    HIGH: 0.85,
};

/**
 * Returns true if a random roll is successful, scaled by intensity.
 * @param {number} probability - Value between 0 and 1
 * @param {number} [intensity=1.0] - Optional intensity multiplier
 * @returns {boolean}
 */
export function roll(probability, intensity = 1.0) {
    return Math.random() < probability * intensity;
}

/**
 * Scales a velocity value based on intensity.
 * @param {number} base - Base velocity
 * @param {number} intensity - Current performance intensity
 * @param {number} [factor=0.2] - Scaling factor
 * @returns {number}
 */
export function scaleVelocity(base, intensity, factor = 0.2) {
    return base + intensity * factor;
}

/**
 * Derive a deterministic phrase-level seed so grooves can vary bar-to-bar without
 * falling back to unconstrained randomness. Reusing the same phrase seed across a
 * small bar span helps hats and cymbals read like a player shaping a phrase.
 *
 * @param {number} sectionSeed
 * @param {number} barIndex
 * @param {number} [phraseBars=2]
 * @param {number} [salt=0]
 * @returns {number}
 */
export function getPhraseSeed(sectionSeed, barIndex, phraseBars = 2, salt = 0) {
    const normalizedSeed = Math.max(0, Math.min(0.999, sectionSeed || 0));
    const phraseIndex = Math.floor(barIndex / Math.max(1, phraseBars));
    const seedInt = Math.floor(normalizedSeed * 256);

    return ((phraseIndex * 97 + seedInt * 53 + salt * 29) % 256) / 256;
}

/**
 * Default configuration for drum strategies.
 */
export const DEFAULT_CONFIG = {
    entropyMultiplier: 0.15,
    blockAdjacentSnare: false,
    exemptFromPulseShaping: false,
    dillaFeel: false,
    backbeatCrack: false,
    isLatin: false,
};

/**
 * Selects a motif index from a sorted list of [seedThreshold, motifIndex] pairs.
 * Returns the motif for the first threshold that `seed` falls below.
 *
 * @param {number} seed
 * @param {[number, number][]} picks - Sorted pairs of [threshold, motifIndex]
 * @returns {number}
 */
function pickBySeed(seed, picks) {
    for (const [threshold, motif] of picks) {
        if (seed < threshold) {
            return motif;
        }
    }
    return picks[picks.length - 1][1];
}

/**
 * Factory that creates a deterministic motif selector from a tier configuration.
 * Each tier maps an intensity ceiling to seed-based motif indices.
 * The last tier (omit `maxIntensity`) acts as the high-intensity default.
 *
 * @example
 * const getMotif = makeMotifSelector([
 *   { maxIntensity: 0.6, picks: [[0.6, 0], [1.0, 1]] },
 *   { picks: [[0.3, 0], [0.7, 1], [1.0, 2]] },
 * ]);
 *
 * @param {Array<{maxIntensity?: number, picks: [number, number][]}>} tiers
 * @param {{complexityThreshold?: number, intensityFloor?: number}} [opts]
 * @returns {(seed: number, complexity: number, intensity?: number) => number}
 */
export function makeMotifSelector(tiers, opts = {}) {
    const complexityThreshold = opts.complexityThreshold ?? 0.3;
    const intensityFloor = opts.intensityFloor ?? INTENSITY_BANDS.LOW;

    return function getMotif(seed, complexity, intensity = 1.0) {
        if (complexity < complexityThreshold || intensity < intensityFloor) {
            return 0;
        }
        for (const tier of tiers) {
            if (tier.maxIntensity === undefined || intensity < tier.maxIntensity) {
                return pickBySeed(seed, tier.picks);
            }
        }
        return 0;
    };
}

/**
 * Standard base logic for groove overrides.
 * Extracts context and handles early returns for muted instruments.
 *
 * @param {any} context
 * @param {any} state
 * @returns {{base: any, muted: boolean}}
 */
export function applyStandardBase(context, state) {
    const { inst, playback, stepsPerBar } = context;

    if (inst.muted) {
        return { base: state, muted: true };
    }

    const intensity = playback.bandIntensity;
    // Common helpers derived from context
    const isEighthNote = context.isBeatStart || context.isOffbeat;
    const halfBarStep = Math.floor(stepsPerBar / 2);

    return {
        base: {
            ...state,
            intensity,
            isEighthNote,
            halfBarStep,
        },
        muted: false,
    };
}
