/**
 * Humanize follows the band style unless the musician has set it (#2010, decided 2026-11-01).
 *
 * Every chart stores a humanize (`ChartGroove.humanize`, a required 0-100 number), and every
 * new song and standard was written with 20 — a default the musician never chose, which pinned
 * every style to 20 and kept its own looseness (metal 10 … neo-soul 60) from ever playing. So a
 * stored 20 means "not set": the band gets `null` and plays the style's own amount, the same
 * one the critique harness and offline renders hear, and the Groove control shows that amount.
 * The stored value is read, never rewritten — nothing migrates, and a chart saved without
 * touching humanize keeps its 20, so it stays "not set".
 *
 * The cost of reading a value as a sentinel: a musician who picks exactly 20 gets the style's
 * own amount, not 20, and the control shows that amount. 19 and 21 are a hair away and play as
 * set; for hip hop and ska-punk, whose own amount is 20, the two read the same. Picking 20 is
 * how a set amount goes back to following the style; when the set amount already equals the
 * style's (35 set on a blues chart), that pick changes nothing on the slider and commits nothing,
 * so the 35 stays set — it plays the same, and only a later genre change tells them apart.
 */
import { STYLES } from '@band/index';
import { styleForGenre } from './band-voices';

/** The stored humanize that means "not set": the default every chart was written with. */
export const UNSET_HUMANIZE = 20;

/** What the band is handed: the musician's amount, or `null` for the style's own. */
export function bandHumanize(stored: number): number | null {
    return stored === UNSET_HUMANIZE ? null : stored;
}

/**
 * What the Groove control shows: the musician's amount, or, while it is not set, the amount the
 * genre's band style plays (`styleForGenre`, the lookup `runtime.bandStyle` plays by).
 */
export function shownHumanize(stored: number, genre: string): number {
    if (stored !== UNSET_HUMANIZE) {
        return stored;
    }
    return STYLES[styleForGenre(genre)].feel.humanize;
}
