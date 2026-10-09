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
function sectionAtStep(arranger: ArrangerState | null | undefined, step: number): Section | null {
    if (!arranger) {
        return null;
    }
    const map = arranger.sectionMap;
    if (!map || map.length === 0) {
        return null;
    }
    // sectionMap is one chart pass while transport steps are monotonic. Normalize
    // here so every section-aware consumer (worker generation, live scheduling,
    // conductor, and practice playback) gets the same override on later loops.
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
 * Effective conductor target intensity for the section the playhead is currently
 * inside. Returns the global target when there is no override.
 *
 * No app caller is left: its only caller was the old engine's conductor (#1404). Kept with
 * its test for now.
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

/**
 * Whether the soloist should make the other lanes yield at this step.
 *
 * `busySteps` is session memory and intentionally survives across ticks. When a
 * section force-mutes the soloist its producer stops advancing that memory, so
 * the effective lane gate must win over a stale positive value.
 */
export function isSoloistBusyAtStep(
    state: EnsembleState,
    step: number,
    coordinationBusy = false,
): boolean {
    if (!isInstrumentActiveAtStep(state, 'soloist', step)) {
        return false;
    }
    return Boolean(coordinationBusy || (state?.soloist?.session?.phrasing?.busySteps ?? 0) > 0);
}

/**
 * True when a lane can sound anywhere in this chart.
 *
 * Audio buses and worker heads are chart-wide resources: a globally-muted lane
 * still needs a live bus/head when a later section explicitly forces it on.
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
