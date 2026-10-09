/**
 * Section-practice controller (#1016).
 *
 * The practicing musician (VISION persona #1) wants to drill one part of the
 * chart: start playback from a chosen section. This module computes a section's
 * step bounds from the arranger's section map; the caller seeds
 * `playback.startStep` (where the next play begins) from them.
 */

import { getState } from '../state.js';

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
 * span (min start, max end).
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
