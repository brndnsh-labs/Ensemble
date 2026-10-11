import { TIME_SIGNATURES } from './config.js';

/**
 * Is `grouping` a complete positive-integer partition of `timeSignature`?
 *
 * Custom grouping is authored arranger state, so every consumer must agree on its
 * keyspace rather than merely trusting the UI. This predicate is shared by the songbook
 * codec and the v1 import.
 */
export function isValidTimeSignatureGrouping(
    grouping: unknown,
    timeSignature: string,
): grouping is number[] {
    const beats = TIME_SIGNATURES[timeSignature]?.beats;
    if (
        !Array.isArray(grouping) ||
        typeof beats !== 'number' ||
        grouping.length === 0 ||
        grouping.length > beats
    ) {
        return false;
    }

    let total = 0;
    for (const group of grouping) {
        if (!Number.isInteger(group) || group <= 0) {
            return false;
        }
        total += group;
    }
    return total === beats;
}
