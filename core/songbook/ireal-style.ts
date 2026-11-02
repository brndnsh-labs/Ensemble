/**
 * What an iReal export's style and tempo mean to Ensemble (#2004). The style field is free text
 * naming one of iReal Pro's feels; it maps to one of the 13 canon genres (`GENRE_NAMES`, pinned by
 * `tests/standards/genre-canon-guard.test.ts`) and to the tempo iReal itself starts that style at.
 * A style this table does not know maps to nothing: the importer keeps the musician's current band
 * rather than guess a genre.
 *
 * The styles are the ones the supplied Jazz 1460 charts use (Medium Swing, Medium Up Swing, Up
 * Tempo Swing, Ballad, Bossa Nova, Waltz) plus iReal Pro's other stock feels that land on a canon
 * genre without argument. The tempos are musically ordinary starting points for each feel (a ballad near 66, a medium
 * swing near 130), not figures read from iReal; the band style's feel (not this table) decides
 * how a genre swings.
 */

interface IRealStyle {
    genre: string;
    /** Where iReal starts this style when a chart carries no tempo of its own. */
    bpm: number;
}

// Keys are lower-cased, whitespace-collapsed style names.
const STYLES = new Map<string, IRealStyle>([
    // Jazz. A waltz is a jazz waltz in iReal's stock set (All Blues, West Coast Blues).
    ['swing', { genre: 'Jazz', bpm: 140 }],
    ['medium swing', { genre: 'Jazz', bpm: 130 }],
    ['medium up swing', { genre: 'Jazz', bpm: 160 }],
    ['up tempo swing', { genre: 'Jazz', bpm: 200 }],
    ['ballad', { genre: 'Jazz', bpm: 66 }],
    ['ballad swing', { genre: 'Jazz', bpm: 66 }],
    ['bebop', { genre: 'Jazz', bpm: 190 }],
    ['cool jazz', { genre: 'Jazz', bpm: 120 }],
    ['jazz waltz', { genre: 'Jazz', bpm: 150 }],
    ['waltz', { genre: 'Jazz', bpm: 150 }],
    // Latin feels the band plays as Bossa.
    ['bossa nova', { genre: 'Bossa', bpm: 130 }],
    ['bossa', { genre: 'Bossa', bpm: 130 }],
    ['latin', { genre: 'Bossa', bpm: 140 }],
    ['samba', { genre: 'Bossa', bpm: 160 }],
    // The rest map by name.
    ['funk', { genre: 'Funk', bpm: 100 }],
    ['rock', { genre: 'Rock', bpm: 120 }],
    ['rock pop', { genre: 'Rock', bpm: 120 }],
    ['pop rock', { genre: 'Rock', bpm: 120 }],
    ['blues', { genre: 'Blues', bpm: 100 }],
    ['shuffle', { genre: 'Blues', bpm: 110 }],
    ['slow blues', { genre: 'Blues', bpm: 66 }],
    ['reggae', { genre: 'Reggae', bpm: 76 }],
    ['country', { genre: 'Country', bpm: 110 }],
    ['disco', { genre: 'Disco', bpm: 120 }],
    ['hip hop', { genre: 'Hip Hop', bpm: 90 }],
    ['metal', { genre: 'Metal', bpm: 160 }],
    ['ska', { genre: 'Ska-Punk', bpm: 170 }],
]);

function styleOf(style: string | undefined): IRealStyle | null {
    const key = (style ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
    return STYLES.get(key) ?? null;
}

/** The canon genre iReal's style maps to, or null when Ensemble has no equivalent it trusts. */
export function genreForIRealStyle(style: string | undefined): string | null {
    return styleOf(style)?.genre ?? null;
}

/** iReal's starting tempo for a style, or null for a style this table does not know. */
export function defaultTempoForIRealStyle(style: string | undefined): number | null {
    return styleOf(style)?.bpm ?? null;
}

/**
 * The tempo an export writes, when it is one Ensemble plays. iReal writes 0 for "not set"
 * (verified: the supplied charts all carry 0), and anything outside the 40-240 BPM the app
 * accepts is left unapplied rather than clamped.
 */
export function writtenIRealTempo(raw: string): number | null {
    if (!/^\d{1,4}$/.test(raw.trim())) {
        return null;
    }
    const bpm = Number(raw);
    return bpm >= 40 && bpm <= 240 ? bpm : null;
}

/** @internal a test seam: every style the table knows, so a test can hold it to the genre canon. */
export function knownIRealStyles(): ReadonlyMap<string, { genre: string; bpm: number }> {
    return STYLES;
}
