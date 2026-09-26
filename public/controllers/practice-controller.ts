/**
 * Section-practice controller (#1016).
 *
 * The practicing musician (VISION persona #1) wants to drill one part of the
 * chart: start playback from a chosen section, or loop that section on repeat.
 * These entry points are invoked from the section-header popover on the
 * chart-first surface (stopped state) and from the active-loop badge (clearing
 * a live drill).
 *
 * Mechanism: both actions seed `playback.startStep` (where the next play begins)
 * and — for looping — `playback.loopStartStep`/`loopEndStep` (the fold window
 * the scheduler + worker confine playback to). The step→musical-position fold
 * lives in `engine/section-overrides.ts` (`foldPracticeStep`); this module only
 * computes the section's step bounds and dispatches. The band plays the loop from those
 * bounds (`bandLoop` in `prototypes/v2/lib/runtime.ts`).
 */

import { dispatch, getState } from '../state.js';
import { ACTIONS } from '../types.js';

export interface SectionStepBounds {
    /** First absolute step of the section, within `[0, totalSteps)`. */
    readonly start: number;
    /** One past the last step (exclusive), within `(start, totalSteps]`. */
    readonly end: number;
}

/**
 * Resolve a section's absolute step window from the arranger's `sectionMap`.
 * Returns `null` when the map is unresolved (pre-validate) or the id is unknown.
 * A section that appears as multiple map entries (rare) collapses to its full
 * span (min start, max end) so the whole thing is drilled as one unit.
 */
export function getSectionStepBounds(sectionId: string): SectionStepBounds | null {
    const { arranger } = getState();
    const map = arranger.sectionMap;
    if (!Array.isArray(map) || map.length === 0) {
        return null;
    }
    let start = Number.POSITIVE_INFINITY;
    let end = Number.NEGATIVE_INFINITY;
    for (const entry of map) {
        if (entry.id === sectionId) {
            if (entry.start < start) {
                start = entry.start;
            }
            if (entry.end > end) {
                end = entry.end;
            }
        }
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return null;
    }
    return { start, end };
}

/**
 * Arm a section-practice loop on `sectionId`: playback, once started, begins at
 * its first step and folds back at its end until the loop is cleared. Song-mode
 * form progression / ending is suspended for the duration (see the scheduler's
 * `isPracticeLooping` guard).
 *
 * #1021 — arming no longer auto-starts playback. The popover expands in place to
 * the drill setup (optionally arm the tempo ramp); the musician configures, then
 * presses the main transport START. This decouples "set up the drill" from "play
 * it" — the tempo-trainer flow. (If a loop is armed while already playing, it
 * engages live on the next fold, as before.)
 */
export function loopSection(sectionId: string): void {
    const bounds = getSectionStepBounds(sectionId);
    if (!bounds) {
        return;
    }
    // SET_PRACTICE_LOOP seeds startStep = start atomically (see the reducer), so
    // one dispatch arms both the loop and the play-from-here seed.
    dispatch(ACTIONS.SET_PRACTICE_LOOP, { start: bounds.start, end: bounds.end });
}

/**
 * Drop out of a running (or armed) practice loop. Playback, if live, flows on
 * into the form from wherever the playhead currently is — no seek, no glitch.
 */
export function clearPracticeLoop(): void {
    dispatch(ACTIONS.SET_PRACTICE_LOOP, null);
}
