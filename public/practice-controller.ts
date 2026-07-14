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
 * computes the section's step bounds and dispatches. Playback is started via the
 * normal `TOGGLE_PLAY` path so the count-in, seed regeneration, and worker flush
 * all run exactly as a top-of-chart start does.
 */

import { dispatch, getState } from './state.js';
import { ACTIONS } from './types.js';

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
 * Start (or restart) playback from the top of `sectionId`, playing through the
 * rest of the form normally — no loop. Clears any active practice loop.
 */
export function startSectionFromHere(sectionId: string): void {
    const bounds = getSectionStepBounds(sectionId);
    if (!bounds) {
        return;
    }
    dispatch(ACTIONS.SET_PRACTICE_LOOP, null);
    dispatch(ACTIONS.SET_START_STEP, bounds.start);
    startOrRestart();
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

/**
 * Configure the practice tempo ramp (#1021) — the woodshed drill where the
 * looped section starts at `startPct` of your set tempo and climbs `perLoop` BPM
 * each pass back up to it. Pass any subset; the reducer merges and clamps. The
 * goal tempo is captured from the live BPM at play-start (not here); this only
 * arms the ramp and sets the two knobs. Disarmed automatically when the loop is
 * cleared or playback stops.
 */
export function setPracticeRamp(config: {
    enabled?: boolean;
    perLoop?: number;
    startPct?: number;
}): void {
    dispatch(ACTIONS.SET_PRACTICE_RAMP, config);
}

/**
 * Begin playback if stopped. The section popover that drives these actions is
 * stopped-only (the direction strip collapses during play), so in practice this
 * always starts from a stopped transport — `startPlayback` then seeds `step`
 * from the `startStep` we just dispatched. Guarded so a redundant call while
 * already playing is a no-op rather than a stop.
 */
function startOrRestart(): void {
    const { playback } = getState();
    if (!playback.isPlaying) {
        dispatch(ACTIONS.TOGGLE_PLAY);
    }
}
