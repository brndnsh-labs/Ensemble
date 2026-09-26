/**
 * The swing a genre plays: its band style's own feel, the one swing authority (#1404,
 * decided 2026-09-26). Picking a genre (`runtime.setGenre`) and opening a link that names one
 * (`v1-link.ts`) both write it into the chart's `groove.swing`/`swingSub`, which the player can
 * then change in the Feel sheet. Neither the genre table (`SMART_GENRES`) nor the old drum
 * presets carry a swing any more, so there is nothing to disagree with it.
 */
import { STYLES } from '@band/index';
import { STYLE_FOR_GENRE } from './band-voices';

/** `null` for a name with no band style; a persisted genre is guarded with `Object.hasOwn`. */
export function genreSwing(genre: string): { swing: number; swingSub: '8th' | '16th' } | null {
    if (!Object.hasOwn(STYLE_FOR_GENRE, genre)) {
        return null;
    }
    const { feel } = STYLES[STYLE_FOR_GENRE[genre]];
    return { swing: feel.swing, swingSub: feel.swingGrid === 16 ? '16th' : '8th' };
}
