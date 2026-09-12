import type { ScoreContext, SemanticScore } from './score-types.js';

type EffectiveContext = Pick<SemanticScore, 'key' | 'isMinor' | 'meter' | 'grouping'>;

/**
 * Resolve already-validated contexts. Sections inherit from the score; measures inherit
 * from the preceding measure in that section. A written meter resets beat grouping.
 */
export function resolveScoreContext(
    inherited: EffectiveContext,
    written: ScoreContext,
): EffectiveContext {
    const grouping =
        written.grouping !== undefined
            ? written.grouping
            : written.meter !== undefined
              ? null
              : inherited.grouping;
    return {
        key: written.key ?? inherited.key,
        isMinor: written.isMinor ?? inherited.isMinor,
        meter: written.meter ?? inherited.meter,
        grouping: grouping ? [...grouping] : null,
    };
}
