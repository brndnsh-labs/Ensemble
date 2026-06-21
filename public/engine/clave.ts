/**
 * Canonical bossa-nova clave + the offbeat answer the lead accents (#571).
 *
 * ONE shared source of truth so the soloist, and (later) the drummer/bass, lock to the
 * same contour instead of each carrying its own emergent clave (which would drift).
 *
 * Two related patterns, both on a 4/4 16th grid (stepsPerBeat = 4, 16 steps/bar):
 *
 * 1. SON CLAVE (the documented spine). 3-2 son clave as absolute 16th positions over the
 *    32-step 2-bar cycle:
 *      bar 0 — the "3" side: beat 1, the "&" of 2, beat 4  → 0, 6, 12
 *      bar 1 — the "2" side: beat 2, beat 3                → 20, 24  (= bar-local 4, 8)
 *    This is the underlying rhythmic root, kept here as the canonical reference. NB it is
 *    4/5 ON-beats, so it is NOT a useful accent target for a soloist (accenting it is
 *    indistinguishable from beat-playing) — use the offbeat cells below for lead phrasing.
 *
 * 2. OFFBEAT CLAVE CELLS (what the lead actually accents). The partido-alto "fingers
 *    answer on every offbeat" signature the bossa comp plays (accompaniment.ts
 *    `BOSSA_PARTIDO_ALTO_CELLS`): the &-of-2, &-of-3, &-of-4 within each bar →
 *    bar-local 16th positions 6, 10, 14. Accenting the lead onto these locks the melody
 *    to the groove the drummer/bass already play — the genre's defining syncopation,
 *    and (unlike the son clave) a robustly distinguishable accent pattern.
 */
export const BOSSA_CLAVE_STEPS_4_4: readonly number[] = [0, 6, 12, 20, 24];

/** Length of the 2-bar son-clave cycle on a 4/4 16th grid. */
const BOSSA_CLAVE_CYCLE_STEPS_4_4 = 32;

/** Bar-local 16th positions of the offbeat clave cells: &-of-2, &-of-3, &-of-4. */
export const BOSSA_OFFBEAT_CELL_STEPS_4_4: readonly number[] = [6, 10, 14];

const SON_CLAVE_SET_4_4 = new Set(BOSSA_CLAVE_STEPS_4_4);
const OFFBEAT_CELL_SET_4_4 = new Set(BOSSA_OFFBEAT_CELL_STEPS_4_4);

function isFourFourSixteenthGrid(stepsPerBeat: number, stepsPerBar: number): boolean {
    return stepsPerBeat === 4 && stepsPerBar === 16;
}

/**
 * True when `step` (absolute, on the song's step grid) lands on a son-clave stroke.
 * Only defined for the 4/4 16th grid — bossa's dominant meter; returns `false` otherwise
 * so callers fall back to generic positional logic rather than mis-mapping onto an odd
 * meter. (The son clave is the documented spine; for lead accenting prefer the offbeat
 * cells — see `isBossaOffbeatCellStep`.)
 */
export function isBossaClaveStep(step: number, stepsPerBeat: number, stepsPerBar: number): boolean {
    if (!isFourFourSixteenthGrid(stepsPerBeat, stepsPerBar)) {
        return false;
    }
    const pos =
        ((step % BOSSA_CLAVE_CYCLE_STEPS_4_4) + BOSSA_CLAVE_CYCLE_STEPS_4_4) %
        BOSSA_CLAVE_CYCLE_STEPS_4_4;
    return SON_CLAVE_SET_4_4.has(pos);
}

/**
 * True when `step` lands on a bossa offbeat clave cell (&-of-2 / &-of-3 / &-of-4 within
 * the bar) — the lead's accent target that locks to the partido-alto comp. Only defined
 * for the 4/4 16th grid; `false` otherwise.
 */
export function isBossaOffbeatCellStep(
    step: number,
    stepsPerBeat: number,
    stepsPerBar: number,
): boolean {
    if (!isFourFourSixteenthGrid(stepsPerBeat, stepsPerBar)) {
        return false;
    }
    const stepInBar = ((step % stepsPerBar) + stepsPerBar) % stepsPerBar;
    return OFFBEAT_CELL_SET_4_4.has(stepInBar);
}
