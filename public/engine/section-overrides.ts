/**
 * Per-section override resolution.
 *
 * Sections can override the global conductor target intensity and per-instrument
 * enabled flags. These helpers look up the section that contains a given step
 * and return the effective value (override if present, global otherwise) without
 * mutating any global state.
 */

import type { ArrangerState, EnsembleState, Section, SectionInstrumentKey } from '../types.js';
import { binarySearchMap } from '../utils.js';

/**
 * Find the section that owns `step`, walking the live `sections[]` and matching
 * by `sectionMap` ranges (which are populated by `validateProgression`). Returns
 * `null` when the arranger has no resolved sectionMap yet (e.g. pre-validate).
 */
export function sectionAtStep(
    arranger: ArrangerState | null | undefined,
    step: number,
): Section | null {
    if (!arranger) {
        return null;
    }
    const map = arranger.sectionMap;
    if (!map || map.length === 0) {
        return null;
    }
    const entry = binarySearchMap(map, step);
    if (!entry) {
        return null;
    }
    const sec = arranger.sections?.find((s) => s.id === entry.id);
    return sec || null;
}

/**
 * Effective conductor target intensity for the section the playhead is currently
 * inside. Returns the global target when there is no override.
 *
 * Main-thread only — reads `state.conductor`, which `getSyncState()` does not
 * mirror to the worker. Calling this from worker-side code (e.g. `tick-logic.ts`)
 * would throw on the `state.conductor.targetIntensity` access. Today's only
 * caller is `conductor.ts:updateAutoConductor`, run by `scheduler-core.ts` on
 * the main thread.
 */
export function effectiveTargetIntensity(state: EnsembleState, step: number): number {
    const sec = sectionAtStep(state?.arranger, step);
    const override = sec?.targetIntensity;
    return typeof override === 'number' ? override : (state?.conductor?.targetIntensity ?? 0.35);
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
