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
 * Section-practice loop (#1016). A minimal structural view of the two playback
 * fields the fold reads — lets both the main-thread scheduler and the worker's
 * buffer manager share one folding authority without importing the full slice.
 */
interface PracticeLoopBounds {
    readonly loopStartStep?: number;
    readonly loopEndStep?: number;
}

/**
 * True when a section-practice loop is active — a valid, non-empty window.
 * Both `-1` (the cleared sentinel) or an inverted range read as "no loop".
 */
export function isPracticeLooping(
    pb: PracticeLoopBounds | null | undefined,
): pb is PracticeLoopBounds & { loopStartStep: number; loopEndStep: number } {
    if (!pb) {
        return false;
    }
    const start = pb.loopStartStep ?? -1;
    const end = pb.loopEndStep ?? -1;
    return start >= 0 && end > start;
}

/**
 * Fold a monotonic step into the active practice-loop window `[start, end)`.
 *
 * The scheduler and worker keep `step` **monotonic** (so buffer keys stay unique
 * and buffer-head bookkeeping is untouched) and call this only to derive the
 * *musical* chart position: chord lookup, section awareness, drum/soloist
 * seeding. Because the folded value lands inside `[0, totalSteps)`, every engine
 * `step % totalSteps` downstream resolves to the drilled section with no engine
 * changes. Steps before the window pass through unchanged (the drill hasn't
 * reached the loop yet); at/after it they cycle within it. Identity (returns
 * `step`) when no loop is active — so non-looping playback is byte-for-byte
 * unchanged. (#1016)
 */
export function foldPracticeStep(step: number, pb: PracticeLoopBounds | null | undefined): number {
    if (!pb || !isPracticeLooping(pb)) {
        return step;
    }
    const start = pb.loopStartStep;
    const end = pb.loopEndStep;
    if (step < start) {
        return step;
    }
    const width = end - start;
    return start + ((step - start) % width);
}

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
 * Main-thread only — reads `state.conductor`, which `getSyncState()` does not
 * mirror to the worker. Calling this from worker-side code (e.g. `tick-logic.ts`)
 * would throw on the `state.conductor.targetIntensity` access. Today's only
 * caller is `conductor.ts:updateAutoConductor`, run by `scheduler-core.ts` on
 * the main thread.
 */
export function effectiveTargetIntensity(state: EnsembleState, step: number): number {
    // Transport remains monotonic during a section-practice drill. Resolve the
    // authored section from the folded musical position so pass two does not
    // accidentally fall through to another section's intensity override.
    const musicalStep = foldPracticeStep(step, state?.playback);
    const sec = sectionAtStep(state?.arranger, musicalStep);
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
    // #1062 — the soloist trade's runtime on/off decision layers over the
    // user's own `enabled` flag here, at READ time, rather than the trade
    // block (conductor.ts) ever assigning onto `enabled` itself. A section
    // that explicitly forces the soloist on (the `typeof override === 'boolean'`
    // branch above) still wins over an in-flight trade silence.
    if (instrument === 'soloist' && state?.soloist?.tradeSilenced) {
        return false;
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
