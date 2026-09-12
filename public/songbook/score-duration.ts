import type { ScoreDuration } from './score-types.js';

// Bound exact arithmetic, independently of the smaller JSON/node budgets at the codec boundary.
const MAX_COMPONENT = 1_000_000;

export function scoreDuration(numerator: number, denominator = 1): ScoreDuration {
    if (
        !Number.isSafeInteger(numerator) ||
        !Number.isSafeInteger(denominator) ||
        numerator < 0 ||
        denominator <= 0
    ) {
        throw new Error('Duration must be a non-negative rational number.');
    }
    let a = numerator;
    let b = denominator;
    while (b) {
        [a, b] = [b, a % b];
    }
    const result: ScoreDuration = [numerator / a, denominator / a];
    if (result.some((part) => part > MAX_COMPONENT)) {
        throw new Error('Duration is too precise or too large.');
    }
    return result;
}

export function addScoreDurations(
    a: Readonly<ScoreDuration>,
    b: Readonly<ScoreDuration>,
): ScoreDuration {
    return scoreDuration(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
}

export function scoreMeter(meter: string): { counts: number; unit: number; length: ScoreDuration } {
    const match = /^(\d{1,2})\/(1|2|4|8|16)$/.exec(meter);
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 32) {
        throw new Error(
            'Meter must have 1–32 counts and a whole, half, quarter, eighth or sixteenth unit.',
        );
    }
    const counts = Number(match[1]);
    const unit = Number(match[2]);
    // No leading-zero aliases: one canonical meter spelling makes comparison reliable.
    if (meter !== `${counts}/${unit}`) {
        throw new Error('Use a canonical meter such as 4/4 or 6/8.');
    }
    return { counts, unit, length: scoreDuration(counts * 4, unit) };
}

/** Exact capability check for the current engine, not a lossy quantizer. */
export function durationToSteps(duration: Readonly<ScoreDuration>): number | null {
    try {
        const [n, d] = scoreDuration(duration[0], duration[1]);
        const steps = (n * 4) / d;
        return Number.isSafeInteger(steps) && steps > 0 ? steps : null;
    } catch {
        return null;
    }
}
