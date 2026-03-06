/**
 * Shared utility functions for generative drum strategies.
 */

/**
 * Returns an array of absolute step indices for a given array of relative percentages (0 to 1).
 * Used to translate fixed 16-step patterns to dynamic measure lengths.
 */
export function getStepIndices(stepsPerBar, percentages) {
    return percentages.map((p) => Math.round(p * stepsPerBar));
}

export const INTENSITY_BANDS = {
    LOW: 0.35,
    MID: 0.65,
    HIGH: 0.85,
};

/**
 * Returns true if a random roll is successful, scaled by intensity.
 */
export function roll(probability, intensity = 1.0) {
    return Math.random() < probability * intensity;
}

/**
 * Scales a velocity value based on intensity.
 */
export function scaleVelocity(base, intensity, factor = 0.2) {
    return base + intensity * factor;
}

/**
 * Adds random jitter to a value.
 */
export function jitter(value, amount = 0.1) {
    return value + (Math.random() - 0.5) * amount;
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
