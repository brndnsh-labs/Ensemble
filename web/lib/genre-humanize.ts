/**
 * The humanize that plays, for a chart's genre. Whether a stored amount is set at all is
 * `@core/songbook/humanize`'s `bandHumanize` (#2010, the "not set" predicate and why); this adds
 * the style lookup `core/` can't make, since the genre → style table lives here.
 */
import { STYLES } from '@band/index';
import { bandHumanize } from '@core/songbook/humanize';
import { styleForGenre } from './band-voices';

/**
 * The humanize the band plays: the musician's amount, or, while it is not set, the amount the
 * genre's band style plays (`styleForGenre`, the lookup `runtime.bandStyle` plays by, so this is
 * the number `applyFeel` lands on). What the Groove control shows, and what the soloist voice
 * scales its per-note timbre jitter by (#2055).
 */
export function playedHumanize(stored: number, genre: string): number {
    return bandHumanize(stored) ?? STYLES[styleForGenre(genre)].feel.humanize;
}
