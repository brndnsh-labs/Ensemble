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
 * The conductor's asymmetric per-step intensity-ramp multipliers — bands "settle
 * in and build," leaning into rises (1.25×) and easing out of drops (0.75×). The
 * single source of truth for BOTH `conductor.ts:updateAutoConductor` (which
 * applies the ramp) and `motifSelectionIntensity` below (which inverts it to
 * recover the bar downbeat). Kept here, not in `conductor.ts`, because `conductor`
 * already imports from this module — putting the shared constant the other way
 * would be a cycle. If the ramp shape is re-tuned (it moved 1.5→1.25 once), change
 * it HERE and both the forward and inverse stay in lockstep.
 */
export const RAMP_INTENSITY_MULTIPLIER = { up: 1.25, down: 0.75 } as const;

/**
 * The intensity a drum **motif** should be selected from — latched to the
 * current bar's downbeat, NOT the live per-step ramping `bandIntensity`.
 *
 * why (#841): the drum motif index (the kick/snare/hat pattern skeleton) is a
 * function of intensity, recomputed every step. `bandIntensity` ramps smoothly
 * within a section (the conductor moves it ~+0.06/bar toward the section target),
 * so when the ramp crosses a motif tier boundary (rock ≈0.61/0.85) or the 0.35
 * `intensityFloor` MID-BAR, the motif flips and the pattern jumps mid-phrase — a
 * drums-only "skip/stutter" (the seed is sticky per #791, but intensity wasn't).
 * Selecting the motif from the bar-downbeat intensity keeps it constant within a
 * bar; it still "opens up" as energy rises, but only ever AT a bar line (where a
 * real drummer changes patterns) — never mid-bar.
 *
 * We don't store the downbeat value (the live drum path is stateless per step
 * and carries no carryover), so we RECONSTRUCT it from the conductor's ramp:
 * within a non-clamped bar `cur(step) = barStart + perStep·loopStep`, so
 * `barStart = cur − perStep·loopStep` recovers the downbeat value EXACTLY for
 * every step of the bar (perStep and direction are constant within a bar). The
 * one approximate case is the single "settling" bar where the ramp reaches the
 * target mid-bar (then late steps sit at target while reconstruction keeps
 * subtracting) — but barStart there is within one bar's travel (~0.06) of the
 * target, so a residual flip is rare and lands at the section's energy plateau,
 * not on every crossing. A vast improvement over the per-step flip.
 *
 * Main-thread only — reads `state.conductor` (unsynced to the worker, see
 * `effectiveTargetIntensity`). The live AUDIO path (`scheduler-core.scheduleDrums`)
 * runs main-thread with the conductor present, so this is where the latch lands.
 * Falls back to the live `bandIntensity` when the conductor is absent or
 * auto-intensity is off. That fallback is exactly bar-stable for MANUAL intensity
 * (no per-step ramp) and for the worker's drum-coordination probes. It is NOT a
 * full fix for the auto-intensity MIDI-export path, which ramps `bandIntensity`
 * per step in a conductor-less worker (`tick-logic.applyWorkerTransition`) with a
 * *different* (linear) ramp shape — exported MIDI can still flip motif mid-bar.
 * Tracked as a follow-up; reconstructing it needs the export ramp's own model,
 * not the conductor's.
 */
export function motifSelectionIntensity(
    state: EnsembleState,
    currentIntensity: number,
    loopStep: number,
): number {
    // `currentIntensity` is the live value the genre strategies use for everything
    // else this step (passed explicitly rather than re-read from `state.playback`
    // so the fallback is byte-identical to the genre's own `intensity`, even in
    // tests that drive intensity through the options bag and not the state snapshot).
    const cur = currentIntensity;
    // No per-step ramp to undo: manual intensity, or no conductor (worker/tests).
    if (!state?.playback?.autoIntensity || !state?.conductor) {
        return cur;
    }
    const stepSize = Math.abs(state.conductor.stepSize ?? 0);
    if (stepSize === 0 || loopStep <= 0) {
        return cur;
    }
    const target = effectiveTargetIntensity(state, state.playback.step ?? 0);
    // Ramp settled — bandIntensity is already stable across the bar.
    if (Math.abs(cur - target) <= 0.001) {
        return cur;
    }
    // Invert the conductor's asymmetric ramp (shared RAMP_INTENSITY_MULTIPLIER).
    // Direction is derived from the live position vs target so a stale stepSize
    // sign can't mislead us.
    const rampingUp = cur < target;
    const perStep =
        stepSize * (rampingUp ? RAMP_INTENSITY_MULTIPLIER.up : RAMP_INTENSITY_MULTIPLIER.down);
    const barStart = rampingUp ? cur - perStep * loopStep : cur + perStep * loopStep;
    // The reconstructed downbeat can't sit on the far side of the target (the ramp
    // is monotonic toward it within a section) nor outside the conductor's clamp.
    const bounded = rampingUp ? Math.min(barStart, target) : Math.max(barStart, target);
    return Math.max(0.01, Math.min(1.0, bounded));
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
