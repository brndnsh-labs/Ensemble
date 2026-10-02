/**
 * The held ending: the chord a performance that does not loop ends on (#1482).
 *
 * A non-looping pass ends on one held chord (`BarPlan.ending`), and every lane plays it from
 * its final bar's first chord. Many tunes' last bar is a turnaround — a ii–V (`Dm7 G7`), a V7,
 * a tritone sub — written to point back to the top for the next chorus. On the last time
 * through a band does not hold that chord: it resolves it, and ends on the tonic. So when the
 * final bar's first chord is not already home, the band plays that bar on the key's tonic, in
 * the quality its genre ends on (`Style.ending`: I6 for swing, I9 for the blues, the triad for
 * rock, the minor equivalents in a minor key), and bass, comp and the lead's last note all
 * hear that one chord.
 *
 * Only the ending bar changes. The bars before it still lead into the chord the chart writes,
 * as they do on every chorus: a band hears the last chorus's turnaround coming and resolves it
 * on the downbeat, not earlier.
 */
import type { Bar, Timeline } from '../form/timeline.js';
import type { EndingQuality } from '../styles/types.js';
import { parseChord } from '../theory/chord.js';

/**
 * The final bar as the band plays it when the pass ends there, or null when it plays the bar
 * as written. It plays as written when:
 * - its first event is an N.C.: a written rest is the chart's own ending;
 * - it carries a fermata: a held chord the chart asks for is a written ending, held as written
 *   (and `holdFermatas` holds the chord the chart writes there);
 * - it is the last bar of a last-chorus coda (`Timeline.coda`): written outro material ends
 *   the tune the way the chart says, whatever chord that is;
 * - its first chord already stands on the tonic, root and bass (`Bb6` closing rhythm changes,
 *   `C7` closing a blues, `Em9` closing a minor groove, a Picardy `E` in E minor): it is
 *   already home, in the colour the chart chose for it.
 * A tonic over another bass (`C/E`, `C/G`) is not home: an inversion is a passing sound, and a
 * held ending stands on its root, so it resolves like any other turnaround chord.
 */
export function heldEnding(timeline: Timeline, index: number, quality: EndingQuality): Bar | null {
    const bar = timeline.bars[index];
    const written = bar?.spans[0]?.chord;
    if (!bar || !written || bar.spans.some((span) => span.fermata)) {
        return null;
    }
    if (timeline.coda && index === timeline.bars.length - 1) {
        return null;
    }
    const { tonic, minor } = bar.key;
    if (written.root === tonic && written.bass === tonic) {
        return null;
    }
    // A roman numeral names the key's tonic in either mode; the suffix is the genre's quality.
    const chord = parseChord(`I${minor ? quality.minor : quality.major}`, bar.key);
    if (!chord) {
        throw new Error(`Unknown ending quality: ${minor ? quality.minor : quality.major}`);
    }
    return {
        ...bar,
        // One chord for the whole bar, struck on its downbeat: the resolution is an arrival,
        // even where the written chord was held over from the bar before.
        spans: [
            {
                start: bar.start,
                end: bar.start + bar.meter.barTicks,
                chord,
                fermata: false,
                tied: false,
                attack: true,
            },
        ],
    };
}
