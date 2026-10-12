/**
 * Per-section override resolution.
 *
 * Sections can override the per-instrument enabled flags. These helpers look up
 * the section that contains a given step and return the effective value (override
 * if present, global otherwise) without mutating any global state.
 */

import type { ArrangerState, EnsembleState, Section, SectionInstrumentKey } from '../types.js';
import { binarySearchMap } from '../utils.js';

/**
 * Find the section that owns `step`, walking the live `sections[]` and matching
 * by `sectionMap` ranges (which are populated by `validateProgression`). Returns
 * `null` when the arranger has no resolved sectionMap yet (e.g. pre-validate).
 */
function sectionAtStep(arranger: ArrangerState | null | undefined, step: number): Section | null {
    if (!arranger) {
        return null;
    }
    const map = arranger.sectionMap;
    if (!map || map.length === 0) {
        return null;
    }
    // sectionMap is one chart pass while transport steps are monotonic. Normalize
    // here so every section-aware consumer (the drum voices' band-layer count and the bus
    // mute logic in `engine.ts`) gets the same override on later loops.
    const totalSteps = arranger.totalSteps || 0;
    const chartStep = totalSteps > 0 ? ((step % totalSteps) + totalSteps) % totalSteps : step;
    const entry = binarySearchMap(map, chartStep);
    if (!entry) {
        return null;
    }
    const sec = arranger.sections?.find((s) => s.id === entry.id);
    return sec || null;
}

/**
 * True when an instrument should generate notes at this step. Section overrides
 * win when present; otherwise falls back to the instrument's global `enabled` flag.
 */
export function isInstrumentActiveAtStep(
    state: EnsembleState,
    instrument: SectionInstrumentKey,
    step: number,
): boolean {
    const sec = sectionAtStep(state?.arranger, step);
    const override = sec?.instruments?.[instrument];
    if (typeof override === 'boolean') {
        return override;
    }
    const slice = (state as any)?.[instrument];
    return Boolean(slice?.enabled);
}

/**
 * True when a lane can sound anywhere in this chart.
 *
 * Audio buses are chart-wide resources (the old engine's worker heads were too): a
 * globally-muted lane still needs a live bus when a later section explicitly forces it on.
 * Per-step emission remains governed by `isInstrumentActiveAtStep` above.
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
