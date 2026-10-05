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
    return spanAfter(timeline, tick)?.chord ?? null;
}

/** The span holding `chordAfter`'s chord: where the form goes next, round to the top if need be. */
function spanAfter(timeline: Timeline, tick: number) {
    const { spans } = timeline;
    for (let j = firstSpanAfter(timeline, tick); j < spans.length; j++) {
        if (spans[j].chord) {
            return spans[j];
        }
    }
    return spans.find((span) => span.chord) ?? null;
}

/**
 * Is a dominant moving on, given the chord after it? It is when it resolves down a fifth
 * (`C7` → `F` is a V, the F tune's), and when it turns minor on its own root (#1521): `C7` →
 * `Cm7` is a II7 becoming the ii of a ii–V (`C7 | Cm7 F7 | Bb`, the A-Train's bars 3–6), not a
 * C that rests. A blues's `C7` → `C7` or → `A7` stays.
 */
function dominantMoves(chord: ChordFacts, next: ChordFacts | null): boolean {
    return (
        !!next &&
        (next.root === mod12(chord.root + 5) ||
            (next.root === chord.root && next.family === 'minor'))
    );
}

/**
 * Does the chord at `tick` rest on the key's tonic: rooted on it, in a stable family, and not
 * a dominant moving on to the chord after it (`dominantMoves`)?
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
    return chord.family !== 'dominant' || !dominantMoves(chord, chordAfter(timeline, tick));
}

/**
 * A chord a held ending can rest on: resting on the tonic, with the tonic in the bass, and not
 * the ii of a ii–V (`isTwoFive`, #1521). `Cm7 F7` closing a jazz blues in Bb left on C is a
 * turnaround to Bb: held as home, the band sat on Cm7 for the whole bar and never played its F7.
 * The same test `keyBacked` already makes of a chord before it can back the key.
 */
function isHome(timeline: Timeline, chord: ChordFacts, tick: number, key: KeyContext): boolean {
    return (
        chord.bass === key.tonic &&
        restsOnTonic(timeline, chord, tick, key) &&
        !isTwoFive(chord, chordAfter(timeline, tick), key)
    );
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
 * Is a minor chord on the tonic of a major key the ii of a ii–V (`Cm7` → `F7`, heading for Bb)?
 * In a major key a minor chord on the tonic that falls a fifth to a dominant is not resting on
 * it: Autumn Leaves (G minor) opens on `Cm7 F7`, rhythm changes, Stella and Cherokee pass
 * through it (#1516). A minor key's dorian i7–IV7 (`Em7 A7`) is its tonic.
 */
function isTwoFive(chord: ChordFacts, next: ChordFacts | null, key: KeyContext): boolean {
    return (
        !key.minor &&
        chord.family === 'minor' &&
        next?.family === 'dominant' &&
        next.root === mod12(chord.root + 5)
    );
}

/**
 * Does the chart itself rest on this key's tonic somewhere, in a bar in this key? A chart typed
 * without setting its key reads as C major (`blankSong`), so an F tune whose last bar is `Gm7
 * C7` would otherwise "resolve" to C, and an A minor tune ending on `E7` to C6. A key the chart
 * never sits on is not one to end in, so its written chord stands.
 * - A chart that OPENS on a stable chord on the tonic is in that key outright, whatever follows
 *   it: a dominant I–IV vamp (`E9 | A9`, `C7 | F7`) falls a fifth from every I, and is still in
 *   I. (An F blues keyed C opens on F7, an F tune on F, an A minor tune on Am: none backs C.)
 * - Anywhere else a chord counts when it rests on the tonic (`restsOnTonic`): a tonic dominant
 *   that falls a fifth to the next chord (`C7` → `F`) is a V there, not a tonic.
 * - Neither counts as a ii of a ii–V in a major key (`isTwoFive`, #1516): `Cm7 F7` is how a
 *   G minor or a Bb tune passes through C, so a defaulted C must not be read off it.
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
        STABLE.has(opening.chord.family) &&
        !isTwoFive(opening.chord, chordAfter(timeline, opening.start), key)
    ) {
        return true;
    }
    return spans.some(
        ({ chord, start }) =>
            !!chord &&
            sameKey(start) &&
            restsOnTonic(timeline, chord, start, key) &&
            !isTwoFive(chord, chordAfter(timeline, start), key),
    );
}

/**
 * Where the last bar comes to rest on the chord the chart opens on (#1516): the index of the
 * span from which it stays on that chord's root to the bar's end, or -1. A tune that starts and
 * ends on its I is home there whatever its key says: `G | C | D | G` and `F | Bb | C | F` typed
 * without a key (read as C) end on G and F, not on C. Matched by root, in any stable family and
 * in root position (a G minor groove's `Gm11` and its last `G7#9`), and only when both act as a
 * tonic (`actsAsTonic`): a tune that opens on its V (`G7 | C`) does not end at home on that V.
 * The bar has to END there: one that opens on the opening chord and moves off it (`F G7`,
 * `G D7`) is a turnaround, and resolves; one that reaches it later (`D7 G`) gets home itself.
 */
function bookendAt(timeline: Timeline, bar: Bar): number {
    const opening = timeline.spans.find((span) => span.chord);
    if (!opening?.chord || opening.start >= bar.start) {
        return -1;
    }
    if (!resting(timeline, opening.chord, opening.start, bar.key.minor)) {
        return -1;
    }
    const from = runOn(bar, opening.chord.root);
    const arrival = from >= 0 ? bar.spans[from] : null;
    return arrival?.chord && resting(timeline, arrival.chord, arrival.start, bar.key.minor)
        ? from
        : -1;
}

/**
 * A chord a tune can come to rest on, whatever its key says: stable, in root position, and
 * acting as a tonic given the chord after it (`actsAsTonic`). What a bookend and a written
 * arrival must both be.
 */
function resting(timeline: Timeline, chord: ChordFacts, start: number, minorKey: boolean) {
    return (
        STABLE.has(chord.family) &&
        chord.bass === chord.root &&
        actsAsTonic(chord, chordAfter(timeline, start), minorKey)
    );
}

/**
 * The index of the span from which every chord of `bar` to its end (before a written stop) is
 * on `root`, or -1 when its last chord is not.
 */
function runOn(bar: Bar, root: number): number {
    let from = -1;
    for (let k = bar.spans.length - 1; k >= 0; k--) {
        const { chord } = bar.spans[k];
        if (!chord) {
            if (from >= 0) {
                break;
            }
            continue;
        }
        if (chord.root !== root) {
            break;
        }
        from = k;
    }
    return from;
}

/** The bar's last chord (before a written stop), or null when it writes none. */
function lastChord(bar: Bar): ChordFacts | null {
    for (let k = bar.spans.length - 1; k >= 0; k--) {
        const { chord } = bar.spans[k];
        if (chord) {
            return chord;
        }
    }
    return null;
}

/**
 * Where the last bar writes its own arrival (#1521): the index of the span from which it rests
 * (`resting`) to its end on one chord, struck straight after the dominant a fifth above it —
 * `D7 G`, `E7 Am`, `C7 F` — or -1. A V7–I written inside the bar is the chart's own cadence:
 * a band reading it strikes the V and holds the I, as it does a `G7 C` on the key's tonic.
 * Only a dominant-family V counts (a 7th chord, not a bare triad): `G7 C` is a cadence in any
 * idiom, while a triad a fifth above is as often a I–IV the other way round.
 */
function arrivalAt(timeline: Timeline, bar: Bar): number {
    const last = lastChord(bar);
    if (!last) {
        return -1;
    }
    const from = runOn(bar, last.root);
    const before = from > 0 ? bar.spans[from - 1].chord : null;
    const arrival = bar.spans[from];
    return before?.family === 'dominant' &&
        before.root === mod12(last.root + 7) &&
        arrival?.chord &&
        resting(timeline, arrival.chord, arrival.start, bar.key.minor)
        ? from
        : -1;
}

/**
 * The chord a final dominant points back to, when the band should end there rather than on
 * the key's tonic (#1521): the chart's opening chord, when the last bar's last chord is the
 * dominant a fifth above it — the turnaround that sends the form round to the top — and the key
 * cannot be trusted to name home instead. Null when the key's own reading stands.
 *
 * A defaulted key of C is backed by a `C7` that rests (`keyBacked`): an 8-bar blues in G
 * (`G7 | D7 | C7 | C7 | G7 | D7 | G7 | D7`) and rhythm changes' bridge (`C7 | C7 | F7`) both
 * hold one for two bars, and both resolved into C; and a chart that never rests on C at all
 * (Giant Steps, Ornithology, Donna Lee left on C) held its last turnaround as written. Here
 * three roots could be home — the key's tonic, the opening chord's, and the last V7's own —
 * and the opening wins only when the chart says so, one chord at a time:
 * - the key is major. A minor key was set by the musician (a new chart's default is C major),
 *   so it is trusted;
 * - the opening is a stable chord with a third (major, dominant or minor), in root position,
 *   at rest (`resting`), off the key's tonic (an opening on the tonic is the key itself, and
 *   the key's path resolves it). A minor opening counts: a minor tune typed without its key
 *   (`Am | Dm7 | Bm7b5 | E7`, a minor blues) ends on its i, not on its V7. A power chord does
 *   not: it has no third to say which mode to end in. Nor does a dominant that opens a chain
 *   of dominants falling by fifths (`dominantChain`: `A7 | D7 | G7 | E7`);
 * - nothing but a dominant 7th rests on the key's tonic (`tonicWeights`): a triad, a 6th, a
 *   maj7, a minor chord or a power chord on C is how a tune states C as its home (`G | Am | Dm7
 *   | C | … | G D7` stays a C tune that opens on its V; All The Things You Are left on C rests
 *   on `Cmaj7`), and a stated home is never outweighed. A `C7` is as often a blues's IV7, a V7
 *   or a chain of dominants as a tonic, so it is weighed instead:
 * - the opening rests longer than C7 rests on C. Home is where a tune spends its time: the
 *   8-bar blues rests on its I7 three bars to its IV7's two (every blues gives its I more than
 *   its IV). Each side is measured the way the engine already reads it: the opening by
 *   `actsAsTonic`, as a bookend is (a blues's I7 → IV7 is its tonic), and C by `restsOnTonic`,
 *   as `keyBacked` reads the key (`stays`: a `C7` falling a fifth is moving, not resting — in
 *   an F blues it is the V7 that sends the form home). So an F blues left on C rests six bars
 *   on F7 to one on C7, while a circle of dominants in C (`D7 | G7 | C7 | A7`) rests on D7 no
 *   longer than on C7, and the key it was set in stands;
 * - and the opening rests longer than the last V7's own root does as a resting chord. A V7 on
 *   a root the tune rests on as home is that home picking up its 7th to turn round (a D tune
 *   that opens on its IV and ends `D D7`; a C tune ending on `C7`), not the V of the opening.
 * A tie on either count keeps the key's reading.
 */
function openingHome(timeline: Timeline, bar: Bar): ChordFacts | null {
    const { key } = bar;
    const opening = timeline.spans.find((span) => span.chord);
    const last = lastChord(bar);
    if (key.minor || !opening?.chord || opening.start >= bar.start || last?.family !== 'dominant') {
        return null;
    }
    const home = opening.chord;
    if (
        home.family === 'power' ||
        !resting(timeline, home, opening.start, false) ||
        last.root !== mod12(home.root + 7) ||
        home.root === key.tonic ||
        dominantChain(timeline, home, opening.start)
    ) {
        return null;
    }
    const tonic = tonicWeights(timeline, key, key.tonic);
    if (tonic.major + tonic.neutral + tonic.minor + tonic.power > 0) {
        return null;
    }
    const opens = tonicWeights(timeline, key, home.root);
    const rests = opens.major + opens.neutral + opens.dominant + opens.minor + opens.power;
    const turn = tonicWeights(timeline, key, last.root);
    const turnRests = turn.major + turn.neutral + turn.minor + turn.power;
    return rests > tonic.stays && rests > turnRests ? home : null;
}

/**
 * Does the dominant at `tick` open a chain of dominants falling by fifths (#1521): `A7 → D7 →
 * G`, each falling a fifth onto the next? `actsAsTonic` lets a dominant that falls onto another
 * dominant stay home, as a blues's I7 → IV7 does — but a blues's IV7 goes back to its I7 or
 * elsewhere, while a chain's next dominant falls a fifth again: `A7 | D7 | G7 | E7` is a G
 * tune's V of V, V and I, and its A7 is no home to end on.
 */
function dominantChain(timeline: Timeline, chord: ChordFacts, tick: number): boolean {
    const next = spanAfter(timeline, tick);
    if (chord.family !== 'dominant' || next?.chord?.family !== 'dominant') {
        return false;
    }
    const onward = chordAfter(timeline, next.start);
    return next.chord.root === mod12(chord.root + 5) && onward?.root === mod12(next.chord.root + 5);
}

/**
 * Is a chord on the tonic acting as the tonic, given the chord after it and the key's mode?
 * Only a fall of a fifth can make it something else, and then by what it falls to (#1502):
 * - a dominant falling to anything but another dominant is a V (`C7` → `Fmaj7`); to a dominant
 *   it is the I7 of a dominant I–IV vamp (`C7` → `F7`, a blues), and stays home;
 * - a minor chord falling to a dominant is a ii in a major key (`Cm7` → `F7`, the ii–V of Bb),
 *   but a minor key's dorian i7–IV7 vamp (`Em7` → `A7`); i → iv (`Cm7` → `Fm7`) is a tonic;
 * - a major chord falling to a minor one is that chord's V in a minor key (`A` → `Dm` in A
 *   minor), but a major key's I → iv (`C` → `Fm`); I → IV (`C` → `F`, `C` → `F7`) is a tonic.
 */
function actsAsTonic(chord: ChordFacts, next: ChordFacts | null, minorKey: boolean): boolean {
    if (!next || next.root !== mod12(chord.root + 5)) {
        return true;
    }
    switch (chord.family) {
        case 'dominant':
            return next.family === 'dominant';
        case 'minor':
            return minorKey || next.family !== 'dominant';
        case 'major':
            return !minorKey || next.family !== 'minor';
        default:
            return true;
    }
}

/** The family a held ending takes from the chart's own tonic (`tonicFamily`), or the key's. */
type TonicFamily = 'major' | 'minor' | 'dominant' | null;

/**
 * How long the chart rests on `root` in each family, in the bars in `key` (#1502): every chord
 * on `root` that acts as a tonic there (`actsAsTonic`) counts by its length; a passing one does
 * not (the ii–V `Cm7 F7` of a C-major tune heading for Bb, a secondary dominant, the V7 of IV).
 * A major-family chord counts as `major` only when it writes a major 7th: that is the one tone
 * that says the tonic is not a dominant. A triad, a 6th, a 6/9 or an add9 is `neutral` (#1521):
 * each sits inside a dominant's own 13th chord (`C6`'s A is `C13`'s 13th), so it says major
 * rather than minor and nothing about the 7th. A blues states its I as a plain `C` or voices it
 * `C6` in the turnaround (a jazz blues's `C6 A7`) without stopping being a blues; a swing tune
 * that ends on `C6` and never rests on a `C7` is still major, since there is nothing dominant
 * to weigh against it. A power chord (`C5`) is counted apart: it states the root as home but no
 * mode at all, so it backs a key (`openingHome`) without voting on the ending's family.
 */
function tonicWeights(timeline: Timeline, key: KeyContext, root: number) {
    const sameKey = inKey(timeline, key);
    const weights = { major: 0, neutral: 0, dominant: 0, stays: 0, minor: 0, power: 0 };
    for (const { chord, start, end } of timeline.spans) {
        const next = chord ? chordAfter(timeline, start) : null;
        if (
            !chord ||
            chord.root !== root ||
            !sameKey(start) ||
            !actsAsTonic(chord, next, key.minor)
        ) {
            continue;
        }
        const length = end - start;
        if (chord.family === 'major') {
            weights[chord.seventh === 11 ? 'major' : 'neutral'] += length;
        } else if (chord.family === 'dominant') {
            weights.dominant += length;
            // A dominant that does not move on (`dominantMoves`) stays where it is: a `C7`
            // falling to `F7` is a blues's I7–IV7 or an F blues's V7–I7, and says nothing about
            // which; a `C7` turning to `Cm7` is a ii–V on its way.
            if (!dominantMoves(chord, next)) {
                weights.stays += length;
            }
        } else if (chord.family === 'minor') {
            weights.minor += length;
        } else if (chord.family === 'power') {
            weights.power += length;
        }
    }
    return weights;
}

/**
 * The family of the chart's own tonic on `root` in this key (#1502): what it rests on, weighed
 * by how long it rests there (`tonicWeights`).
 * - Minor wins when it rests longer than the major-third chords (major, neutral and dominant)
 *   together, and the other way round; a tie (or nothing resting on the tonic at all) goes to
 *   the key's mode, so a passing borrowed chord (`C | F | Cm | G7`) doesn't turn a major tune
 *   minor.
 * - Of the major-third families the dominant is taken only when the chart never rests on a
 *   major 7th there: a blues, a dominant vamp. A tune that states `Cmaj7` anywhere is not a
 *   blues because a `C7` passes through it.
 * - A triad or a 6th doesn't rule the dominant out (#1521), but it is where a tune rests, so
 *   the dominant has to out-rest it: a blues rests on its I7 most of the time, and one plain
 *   `C` (or a `C6 A7` turnaround) in bar 11 doesn't make it a major tune; a pop song resting on
 *   its C triad with one passing `C7` (`C | C7 | Am | F`) is not a blues. A tie stays major.
 * Null when the key's mode decides (a power chord, or nothing to weigh).
 */
function tonicFamily(timeline: Timeline, key: KeyContext, root = key.tonic): TonicFamily {
    const { major, neutral, dominant, minor } = tonicWeights(timeline, key, root);
    const majors = major + neutral + dominant;
    const minorWins = minor > majors || (minor === majors && key.minor);
    if (minorWins && minor > 0) {
        return 'minor';
    }
    if (!minorWins && majors > 0) {
        return major === 0 && dominant > neutral ? 'dominant' : 'major';
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
 * - it rests from its downbeat to its end on the chord the chart opens on (`bookendAt`): the
 *   tune is home whatever its key says (a `G | C | D | G` typed without a key);
 * - the chart never rests on the key's tonic anywhere (`keyBacked`): the key is not backed.
 *   When that bar writes its own V7–I (`E7 Am`), it holds the I it arrives on (`arrivalAt`).
 * A bar that reaches home later (`G7 C`, `Csus4 C`) strikes what comes before it as written and
 * holds that written chord from where the chart puts it (#1502).
 * Otherwise it resolves, on its downbeat: to the key's tonic, or — when its last chord is the
 * V7 of the chart's opening chord, nothing but a dominant 7th (or nothing at all) rests on the
 * key's tonic, and the opening rests longer than any rival — to the opening chord
 * (`openingHome`, #1521).
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
    // Bookends outrank the key, even a key that was set (#1516; a set key can't be told from
    // the default yet, #1521): a tune that opens and ends on its own chord ends there.
    const bookend = bookendAt(timeline, bar);
    if (bookend === 0) {
        return null;
    }
    if (bookend > 0) {
        return heldOn(bar, bar.spans[bookend].chord!, bookend);
    }
    // A final V7 of the opening chord, in a key nothing but a dominant 7th backs (or nothing at
    // all), resolves to the opening chord when the tune rests there longest (#1521): `G7 | D7 |
    // C7 | C7 | G7 | D7 | G7 | D7` left on C ends on G, Giant Steps left on C on B.
    const back = openingHome(timeline, bar);
    if (back) {
        return resolvedOn(timeline, bar, quality, back.root);
    }
    if (!keyBacked(timeline, bar.key)) {
        // No key to resolve into: the bar is played as written, and when it writes its own
        // V7–I (`E7 Am` in an A minor tune left on C) the band holds the I it arrives on
        // rather than the V it opens with (#1521).
        const arrival = arrivalAt(timeline, bar);
        return arrival > 0 ? heldOn(bar, bar.spans[arrival].chord!, arrival) : null;
    }
    return resolvedOn(timeline, bar, quality, bar.key.tonic);
}

/**
 * `bar` resolved on its downbeat to the I on `root`, in the bar's mode: a roman numeral names
 * the tonic in either mode, and the suffix is the genre's colour on the chart's own family on
 * that root (`tonicFamily`, weighed over the bars in the bar's key).
 */
function resolvedOn(timeline: Timeline, bar: Bar, quality: EndingQuality, root: number): Bar {
    const tonic: KeyContext = { tonic: root, minor: bar.key.minor };
    const suffix = endingSuffix(quality, tonic, tonicFamily(timeline, bar.key, root));
    const chord = parseChord(`I${suffix}`, tonic);
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
