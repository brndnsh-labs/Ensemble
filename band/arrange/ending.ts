/**
 * The held ending: the chord a performance that does not loop ends on (#1482).
 *
 * A non-looping pass ends on one held chord (`BarPlan.ending`), and every lane plays it from
 * its final bar's first chord. Many tunes' last bar is a turnaround — a ii–V (`Dm7 G7`), a V7,
 * a tritone sub — written to point back to the top for the next chorus. On the last time
 * through a band does not hold that chord: it resolves it, and ends on the tonic. So when the
 * final bar is not already home, the band plays that bar on the key's tonic, in the quality
 * its genre ends on (`Style.ending`: I6 for swing, I9 for the blues, the triad for rock, the
 * minor equivalents in a minor key), and bass, comp and the lead's last note all hear that one
 * chord.
 *
 * Only the ending bar's harmony changes. The bar before it keeps its chords; its approach
 * notes aim at the chord the band is about to hold (`perform.ts` hands it the resolved bar as
 * its next), as a bassist who hears the last chorus's turnaround coming walks into the tonic.
 */
import { type Bar, firstSpanAfter, type Timeline } from '../form/timeline.js';
import type { EndingQuality } from '../styles/types.js';
import { type ChordFacts, type ChordFamily, parseChord } from '../theory/chord.js';
import { type KeyContext, mod12 } from '../theory/pitch.js';

/**
 * The families a tonic can rest on. A suspended, diminished, half-diminished or augmented
 * chord on the tonic is still moving (Csus4 wants its 3rd, Co7 and Cø are passing, C+ leans
 * up to F): standing on the right root is not being home.
 */
const STABLE: ReadonlySet<ChordFamily> = new Set(['major', 'minor', 'dominant', 'power']);

/**
 * The chord the form plays after the span starting at `tick`: the next written chord, or the
 * first of the chart where the form goes round to the top (what a last bar points back to).
 */
function chordAfter(timeline: Timeline, tick: number): ChordFacts | null {
    const { spans } = timeline;
    for (let j = firstSpanAfter(timeline, tick); j < spans.length; j++) {
        if (spans[j].chord) {
            return spans[j].chord;
        }
    }
    return spans.find((span) => span.chord)?.chord ?? null;
}

/**
 * Does the chord at `tick` rest on the key's tonic: rooted on it, in a stable family, and not
 * a dominant resolving down a fifth to the chord after it (`C7` → `F` is a V, the F tune's;
 * a blues's `C7` → `C7` or → `A7` is its tonic)?
 */
function restsOnTonic(
    timeline: Timeline,
    chord: ChordFacts,
    tick: number,
    key: KeyContext,
): boolean {
    if (chord.root !== key.tonic || !STABLE.has(chord.family)) {
        return false;
    }
    const next = chord.family === 'dominant' ? chordAfter(timeline, tick) : null;
    return !next || next.root !== mod12(chord.root + 5);
}

/** A chord a held ending can rest on: resting on the tonic, with the tonic in the bass. */
function isHome(timeline: Timeline, chord: ChordFacts, tick: number, key: KeyContext): boolean {
    return chord.bass === key.tonic && restsOnTonic(timeline, chord, tick, key);
}

const BACKED = new WeakMap<Timeline, Map<string, boolean>>();

/**
 * Does the chart itself rest on this key's tonic somewhere: a tonic-rooted chord in a stable
 * family, in a bar in this key? A chart typed without setting its key reads as C major, so an F
 * tune whose last bar is `Gm7 C7` would otherwise "resolve" to C, and an A minor tune ending on
 * `E7` to C6. A key the chart never sits on is not one to end in, so its written chord stands.
 * A tonic dominant that resolves down a fifth (`C7` → `F`) is a V, not a tonic, and doesn't
 * count; one that doesn't (a blues's `C7` → `C7`, `C7` → `A7`) does.
 */
function keyBacked(timeline: Timeline, key: KeyContext): boolean {
    let byKey = BACKED.get(timeline);
    if (!byKey) {
        byKey = new Map();
        BACKED.set(timeline, byKey);
    }
    const id = `${key.tonic}:${key.minor}`;
    const known = byKey.get(id);
    if (known !== undefined) {
        return known;
    }
    const { spans, bars } = timeline;
    let backed = false;
    let b = 0;
    for (let i = 0; i < spans.length && !backed; i++) {
        const { chord, start } = spans[i];
        while (b + 1 < bars.length && bars[b + 1].start <= start) {
            b++;
        }
        const here = bars[b]?.key;
        backed =
            !!chord &&
            !!here &&
            here.tonic === key.tonic &&
            here.minor === key.minor &&
            restsOnTonic(timeline, chord, start, key);
    }
    byKey.set(id, backed);
    return backed;
}

/**
 * The final bar as the band plays it when the pass ends there, or null when it plays the bar
 * as written. It plays as written when:
 * - it holds an N.C.: a written rest is the chart's own ending;
 * - it carries a fermata: a held chord the chart asks for is a written ending, held as written
 *   (and `holdFermatas` holds the chord the chart writes there). A fermata is how a chart asks
 *   to end off the tonic;
 * - it is the last bar of a written coda (`Timeline.coda`: a D.C./D.S. al Coda's, or a
 *   last-chorus coda's): written ending material ends the tune the way the chart says;
 * - its first chord is already home (`isHome`): `Bb6` closing rhythm changes, `C7` closing a
 *   blues, `Em9` closing a minor groove, a Picardy `E` in E minor, in the colour the chart
 *   chose for it. A tonic over another bass (`C/E`) is not home — an inversion is a passing
 *   sound, and a held ending stands on its root — and nor is `Csus4`;
 * - the chart never rests on the key's tonic anywhere (`keyBacked`): the key is not backed.
 * A bar that reaches home later (`G7 C`, `Csus4 C`) holds that written chord, as written.
 */
export function heldEnding(timeline: Timeline, index: number, quality: EndingQuality): Bar | null {
    const bar = timeline.bars[index];
    if (!bar?.spans.length || bar.spans.some((span) => !span.chord || span.fermata)) {
        return null;
    }
    if (timeline.coda && index === timeline.bars.length - 1) {
        return null;
    }
    const home = bar.spans.findIndex((span) => isHome(timeline, span.chord!, span.start, bar.key));
    if (home === 0) {
        return null;
    }
    if (home > 0) {
        // The bar resolves itself: the band holds the tonic the chart writes, in its colour.
        return heldOn(bar, bar.spans[home].chord!);
    }
    if (!keyBacked(timeline, bar.key)) {
        return null;
    }
    // A roman numeral names the key's tonic in either mode; the suffix is the genre's quality.
    const suffix = bar.key.minor ? quality.minor : quality.major;
    const chord = parseChord(`I${suffix}`, bar.key);
    if (!chord) {
        throw new Error(`Unknown ending quality: ${suffix}`);
    }
    return heldOn(bar, chord);
}

/** `bar` played as one chord, struck on its downbeat: the resolution is an arrival. */
function heldOn(bar: Bar, chord: ChordFacts): Bar {
    return {
        ...bar,
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
