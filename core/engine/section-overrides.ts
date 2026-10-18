/**
 * Per-section override resolution.
 *
 * Sections can override the per-instrument enabled flags. Which lanes sound in a section is the
 * band's call (`band/arrange/plan.ts`, from the section's `instruments`); this module holds the
 * one question the audio graph asks of the same data.
 */

import type { EnsembleState, SectionInstrumentKey } from '../types.js';

/**
 * True when a lane can sound anywhere in this chart.
 *
 * Audio buses are chart-wide resources (the old engine's worker heads were too): a
 * globally-muted lane still needs a live bus when a later section explicitly forces it on.
 */
export function isInstrumentEverActive(
    state: EnsembleState,
    instrument: SectionInstrumentKey,
): boolean {
    const slice = (state as any)?.[instrument];
    if (slice?.enabled) {
        return true;
    }
    return Boolean(
        state?.arranger?.sections?.some((section) => section.instruments?.[instrument] === true),
    );
}
