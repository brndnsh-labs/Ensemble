/**
 * The tempo above which the count-in is two bars, not one (#1996, DECISION 2026-11-04): at a
 * fast tempo one bar goes by before a player has the time in their body, and two bars is how a
 * band counts off up-tempo. Its own module, with no imports, so the listening-gate tools
 * (`scripts/live-capture.ts`) read the same rule the band host plays.
 */
export const TWO_BAR_COUNT_IN_ABOVE_BPM = 200;

/** How many bars the count-in is at `bpm`: one, or two above `TWO_BAR_COUNT_IN_ABOVE_BPM`. */
export function countInBars(bpm: number): 1 | 2 {
    return bpm > TWO_BAR_COUNT_IN_ABOVE_BPM ? 2 : 1;
}
