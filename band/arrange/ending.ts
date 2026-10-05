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

/** The key of the bar sounding at `tick` (bars are in order: the last one starting by then). */
function keyAt(timeline: Timeline, tick: number): KeyContext | undefined {
    const { bars } = timeline;
    let lo = 0;
    let hi = bars.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (bars[mid].start <= tick) {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    return bars[lo]?.key;
}

/** The keys a bar-by-bar scan compares against: is the bar sounding at `tick` in `key`? */
function inKey(timeline: Timeline, key: KeyContext) {
    return (tick: number) => {
        const here = keyAt(timeline, tick);
        return here?.tonic === key.tonic && here.minor === key.minor;
    };
}

/**
 * Does the chart itself rest on this key's tonic somewhere, in a bar in this key? A chart typed
 * without setting its key reads as C major, so an F tune whose last bar is `Gm7 C7` would
 * otherwise "resolve" to C, and an A minor tune ending on `E7` to C6. A key the chart never sits
 * on is not one to end in, so its written chord stands.
 * - A chart that OPENS on a stable chord on the tonic is in that key outright, whatever follows
 *   it: a dominant I–IV vamp (`E9 | A9`, `C7 | F7`) falls a fifth from every I, and is still in
 *   I. (An F blues keyed C opens on F7, an F tune on F, an A minor tune on Am: none backs C.)
 * - Anywhere else a chord counts when it rests on the tonic (`restsOnTonic`): a tonic dominant
 *   that falls a fifth to the next chord (`C7` → `F`) is a V there, not a tonic.
 * Computed afresh on each call (once per pass): a pure scan that usually stops at the first
 * chord, so the engine keeps no memo between passes.
 */
function keyBacked(timeline: Timeline, key: KeyContext): boolean {
    const { spans } = timeline;
    const sameKey = inKey(timeline, key);
    const opening = spans.find((span) => span.chord);
    if (
        opening?.chord &&
        sameKey(opening.start) &&
        opening.chord.root === key.tonic &&
        STABLE.has(opening.chord.family)
    ) {
        return true;
    }
    return spans.some(
        ({ chord, start }) =>
            !!chord && sameKey(start) && restsOnTonic(timeline, chord, start, key),
    );
}

/**
 * Is a chord on the tonic acting as the tonic, given the chord after it? Only a fall of a fifth
 * can make it something else, and then by what it falls to (#1502):
 * - a dominant falling to anything but another dominant is a V (`C7` → `Fmaj7`); to a dominant
 *   it is the I7 of a dominant I–IV vamp (`C7` → `F7`, a blues), and stays home;
 * - a minor chord falling to a dominant is a ii (`Cm7` → `F7`, the ii–V of Bb), while i → iv
 *   (`Cm7` → `Fm7`) is a minor tune's tonic;
 * - a major chord falling to a minor one is that chord's V (`A` → `Dm` in A minor), while I → IV
 *   (`C` → `F`, `C` → `F7`) is a major tune's tonic.
 */
function actsAsTonic(chord: ChordFacts, next: ChordFacts | null): boolean {
    if (!next || next.root !== mod12(chord.root + 5)) {
        return true;
    }
    switch (chord.family) {
        case 'dominant':
            return next.family === 'dominant';
        case 'minor':
            return next.family !== 'dominant';
        case 'major':
            return next.family !== 'minor';
        default:
            return true;
    }
}

/** The family a held ending takes from the chart's own tonic (`tonicFamily`), or the key's. */
type TonicFamily = 'major' | 'minor' | 'dominant' | null;

/**
 * The family of the chart's own tonic in this key (#1502): what it rests on, weighed by how
 * long it rests there. Every stable chord on the tonic in a bar in this key that acts as the
 * tonic (`actsAsTonic`) counts for its family, by its length; a passing one does not (the ii–V
 * `Cm7 F7` of a C-major tune heading for Bb, a secondary dominant, the V7 of IV).
 * - Minor wins when it rests longer than major and dominant together, and the other way round;
 *   a tie (or nothing resting on the tonic at all) goes to the key's mode, so a passing
 *   borrowed chord (`C | F | Cm | G7`) doesn't turn a major tune minor.
 * - Of the two major families the dominant is taken only when the chart never rests on a
 *   non-dominant major tonic: a blues, a dominant vamp. A tune that states `Cmaj7` anywhere is
 *   not a blues because a `C7` passes through it.
 * Null when the key's mode decides (a power chord, or nothing to weigh).
 */
function tonicFamily(timeline: Timeline, key: KeyContext): TonicFamily {
    const sameKey = inKey(timeline, key);
    let major = 0;
    let dominant = 0;
    let minor = 0;
    for (const { chord, start, end } of timeline.spans) {
        if (
            !chord ||
            chord.root !== key.tonic ||
            !sameKey(start) ||
            !actsAsTonic(chord, chordAfter(timeline, start))
        ) {
            continue;
        }
        const length = end - start;
        if (chord.family === 'major') {
            major += length;
        } else if (chord.family === 'dominant') {
            dominant += length;
        } else if (chord.family === 'minor') {
            minor += length;
        }
    }
    const majors = major + dominant;
    const minorWins = minor > majors || (minor === majors && key.minor);
    if (minorWins && minor > 0) {
        return 'minor';
    }
    if (!minorWins && majors > 0) {
        return major > 0 ? 'major' : 'dominant';
    }
    return null;
}

/**
 * The suffix a held ending plays on the tonic: the family is the chart's (`tonicFamily`), the
 * colour the style's (#1502). A style's colour must not change what the tonic is: funk's I9 on
 * a tune whose tonic is `Cmaj7` adds a b7 the tune never had, and turns the last chord into a
 * V7 of IV.
 * - A dominant tonic in a major key (a blues's `C7`, a dominant vamp's `E9`) takes the style's
 *   `dominant` colour, which keeps the b7 the chart wrote. Without one the style's colour has
 *   no 7th to contradict it (a triad, a 6th), and its major quality stands.
 * - A minor tonic takes the minor quality, a major one the major quality, whatever the key
 *   says: a C minor tune typed without its key ends on Cm6, not on C6.
 * - Otherwise (nothing to weigh, a power chord, or a dominant in a minor key: the Hendrix
 *   `E7#9` tonic is a minor key's sound) the key's mode decides, as it always did.
 */
function endingSuffix(quality: EndingQuality, key: KeyContext, family: TonicFamily): string {
    if (family === 'dominant' && !key.minor) {
        return quality.dominant ?? quality.major;
    }
    if (family === 'minor') {
        return quality.minor;
    }
    if (family === 'major') {
        return quality.major;
    }
    return key.minor ? quality.minor : quality.major;
}

/**
 * The final bar as the band plays it when the pass ends there, or null when it plays the bar
 * as written. It plays as written when:
 * - it opens on an N.C.: a written rest is the chart's own ending (a later N.C. is a stop the
 *   held chord keeps: it sounds up to it, `perform.ts`);
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
 * A bar that reaches home later (`G7 C`, `Csus4 C`) strikes what comes before it as written and
 * holds that written chord from where the chart puts it (#1502).
 */
export function heldEnding(timeline: Timeline, index: number, quality: EndingQuality): Bar | null {
    const bar = timeline.bars[index];
    if (!bar?.spans[0]?.chord || bar.spans.some((span) => span.fermata)) {
        return null;
    }
    if (timeline.coda && index === timeline.bars.length - 1) {
        return null;
    }
    const home = bar.spans.findIndex(
        (span) => !!span.chord && isHome(timeline, span.chord, span.start, bar.key),
    );
    if (home === 0) {
        return null;
    }
    if (home > 0) {
        // The bar resolves itself: a band reading `| G7 C |` strikes the G7 on 1 and holds the
        // C from 3, the tonic the chart writes, in its colour.
        return heldOn(bar, bar.spans[home].chord!, home);
    }
    if (!keyBacked(timeline, bar.key)) {
        return null;
    }
    // A roman numeral names the key's tonic in either mode; the suffix is the genre's colour
    // on the chart's own tonic family.
    const suffix = endingSuffix(quality, bar.key, tonicFamily(timeline, bar.key));
    const chord = parseChord(`I${suffix}`, bar.key);
    if (!chord) {
        throw new Error(`Unknown ending quality: ${suffix}`);
    }
    return heldOn(bar, chord, 0);
}

/**
 * `bar` played to one held chord: the spans before `from` as written (a `G7 C` bar's G7,
 * struck on 1), then `chord` struck where span `from` starts (the downbeat for a resolved
 * turnaround: the resolution is an arrival) and held to the bar's first written rest after it,
 * if it has one: the chart's stop stays where it is written, and the bar is silent from there.
 * The held chord is always the bar's last chord, so a lane finds it there.
 */
function heldOn(bar: Bar, chord: ChordFacts, from: number): Bar {
    const rest = bar.spans.findIndex((span, k) => k > from && !span.chord);
    const start = from > 0 ? bar.spans[from].start : bar.start;
    const barEnd = bar.start + bar.meter.barTicks;
    const end = rest > 0 ? bar.spans[rest].start : barEnd;
    return {
        ...bar,
        spans: [
            ...bar.spans.slice(0, from),
            { start, end, chord, fermata: false, tied: false, attack: true },
            ...(rest > 0 ? [{ ...bar.spans[rest], end: barEnd }] : []),
        ],
    };
}
