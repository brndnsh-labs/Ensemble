import type { Note } from './types';

/**
 * Fingering: try every assignment of fingers 1-4 where higher frets get higher fingers and equal frets go
 * from the lower-pitched string to the higher one, scored by how compact the hand is. Triad and
 * power grips, and every ukulele chord (#1681), may also lay one finger across a run of
 * same-fret strings (a barre, #1594), and a
 * guitar shell the one index barre that frees its root (#1607); a barre
 * is derived from the fingers, never stored — several fretted notes sharing a finger (`barres`).
 * A chart is planned as a sequence so shared notes keep their finger (`fingerSequence`), and
 * that plan chooses only among the fingerings a grip is taught with (`taughtOptions`: a shell's
 * `taughtAmong`, #1611; a triad's, a power chord's or any ukulele chord's `taughtStrummed`,
 * #1617, #1681, #1677, #1683). What a guitar shell's cheapest
 * option costs is also what grip choice reads (`voicing.ts`'s `buildAt` and `rootBuried`), so
 * `handCost` and a shell's options list stay as they are and the teaching rules live in the
 * plan. No grip is chosen by what a strummed grip's fingering costs, so the barres that cannot
 * be played at all are kept out of its list (`barreOptions`).
 */
export interface FingerOption {
    /** Fretted notes, in the order `p` refers to. */
    fr: Note[];
    /** Finger for each fretted note. */
    p: Array<number | null>;
    cost: number;
    /**
     * Set on a fingering the chart plan takes only beside a chord that shares its fingers
     * (`taughtAmong`, `arrives`). `'left'`: fingers left where they were, so the chord BEFORE
     * must already hold them. `'before'` / `'after'`: a second standard fingering, taken to
     * keep the hand on the chord before / after, that chord in its own cheapest fingering.
     */
    needs?: 'left' | 'before' | 'after';
    /**
     * Set with `needs`: how many of this fingering's fingers the chord beside it must hold on
     * the same notes (`heldFingers`). On a ukulele grip (`taughtStrummed`, #1681) two, or one
     * when it moves only one finger off the grip's default (`holdFor`). On a guitar grip
     * fingered from the nut, one for each fingertip off its own fret, up to two (`offItsFret`,
     * #1683), and two on a fingering that crowds the hand (`crowdedOptions`).
     */
    hold?: number;
    /**
     * Set with `hold` on a guitar grip fingered from the nut (`offItsFret`): the hold is
     * counted against the chord beside it (`nutHoldKept`), which may already have the hand
     * where this fingering puts it (#1691). Also set on a `GUITAR_BOOK` row's second
     * fingering, drilled chord or not (#1834: A x-x-x-2-2-0 as 1-3 beside D).
     */
    nut?: boolean;
    /**
     * Set with `needs` on a crowded fingering that places a finger (`crowdedOptions`, #1683):
     * it is taken only beside a chord on the same root, every note the two share the same
     * degree in both (`onOneRoot`).
     */
    sameRoot?: boolean;
    /**
     * Set with `needs` on a crowded guitar-shell fingering (`suspensionOptions`, #1825): it is
     * taken only beside the same shell with its 3rd suspended, or the other way round
     * (`suspends`), and that chord may be in any fingering it takes freely, not only its
     * default (`arrives`).
     */
    resolves?: boolean;
    /**
     * Set on the default fingering of a guitar open chord a method drills (`drilledChord`,
     * fingered from the nut): the book fingering, which the chord beside it adapts to
     * (`FingerOption.adapts`, #1835).
     */
    drilled?: boolean;
    /**
     * Set with `drilled` on a book chord's default (`FingerOpts.book`, #1849). A neighbour
     * adapts to it only on the same root (`onOneRoot`): C6 x-3-2-2-x-x as 3-2-1 beside the open
     * C, never F x-x-3-2-1-x as 4-3-1 beside the open Am, a fingering no method teaches for F.
     */
    book?: boolean;
    /**
     * Set with `needs` and `hold` on a guitar fingering that keeps two fingers of a drilled
     * open chord's book fingering (`adaptOptions`, #1835): it is taken only beside that chord
     * in it (`FingerOption.drilled`). C7 x-3-2-3-x-x as 3-2-4 after C x-3-2-0-x-x (3-2).
     */
    adapts?: boolean;
    /**
     * Set by `taughtOptions`: per note of `fr`, whether this fingering puts a different finger
     * on it than the grip's default fingering does (all false on the default itself). The
     * default is the cheapest unless a teaching rule names another (`taughtStrummed`,
     * `taughtAmong`).
     */
    own?: boolean[];
}

const PERMS: Record<number, number[][]> = {};
function perms(k: number): number[][] {
    if (PERMS[k]) {
        return PERMS[k];
    }
    const out: number[][] = [];
    const rec = (cur: number[], used: Set<number>) => {
        if (cur.length === k) {
            out.push(cur.slice());
            return;
        }
        for (let f = 1; f <= 4; f++) {
            if (!used.has(f)) {
                used.add(f);
                cur.push(f);
                rec(cur, used);
                cur.pop();
                used.delete(f);
            }
        }
    };
    rec([], new Set());
    PERMS[k] = out;
    return out;
}

/** What a fingering may use. */
export interface FingerOpts {
    /**
     * A strummed grip — a triad or power grip, or any ukulele chord: a finger may lie across
     * a run of same-fret notes (#1594). Which finger is `barreOptions`' rule: the index or the
     * ring finger, never the middle or the little finger (#1677, #1819).
     */
    barre?: boolean;
    /**
     * A shell whose root sits on a bass string under muted strings (a guitar shell): it is a
     * finger per note, except for the one small index barre that gets its root off the ring or
     * little finger (`rootBarreOptions`, #1607).
     */
    rootBarre?: boolean;
    /**
     * A ukulele grip: a triad, a 7th or a power chord, on four strings or three (`voicing.ts`'s
     * `fingerRules`, which reads the instrument and not the string count). It is fingered as
     * the ukulele is taught (#1681, #1677): the little finger never lies flat
     * (`barreOptions`), the chords with a method-book fingering take it (`UKE_BOOK`), and a
     * chord keeps one fingering unless enough fingers can stay down (`taughtStrummed`,
     * `holdFor`). A guitar grip takes a second taught fingering for one held note, unless it
     * is fingered from the nut and that fingering takes the hand off it (`offItsFret`), and
     * in first position its fingers take the frets of their own numbers (`aheadOfItsFret`);
     * then a guitar triad or power grip keeps one of them for the song unless the other
     * keeps two fingers (`unifyFingerings`, #1836).
     */
    ukulele?: boolean;
    /**
     * One of the guitar's book chords at the nut (`ShapeDef.book`: the open 7ths of #1838 and
     * the open chords of #1849). It keeps its book fingering, so it never adapts to the chord
     * beside it (`adaptOptions`), and a neighbour adapts to it only on its own root
     * (`FingerOption.book`).
     */
    book?: boolean;
}

/**
 * How compact the hand is: the spread of the hand's position (each note's fret minus its finger,
 * so 1-2-3-4 on four neighbouring frets is a spread of 0), a little for each finger used further
 * from the index, and — for a shell — the root kept off the weak fingers. That last is the
 * shell's rule: its root on a bass string anchors the grip and mutes the skipped string. A triad's
 * root moves with the inversion, and the ring finger takes it as often as not (the open D's 1-3-2,
 * the 5-5-3 C's ring barre), so a grip that may bar (`rootRule` false) goes without it.
 */
function handCost(fr: Note[], p: number[], rootRule: boolean): number {
    const pos = fr.map((n, i) => n.fret - p[i]);
    const ri = fr.findIndex((n) => n.role === 'R');
    return (
        (Math.max(...pos) - Math.min(...pos)) * 3 +
        p.reduce((a, b) => a + b, 0) * 0.2 +
        (rootRule && ri >= 0 && p[ri] > 2 ? 2 : 0)
    );
}

/** One finger per fretted note: higher frets get higher fingers, equal frets go low string to high. */
function splitOptions(fr: Note[], rootRule: boolean): FingerOption[] {
    const out: FingerOption[] = [];
    for (const p of perms(fr.length)) {
        let ok = true;
        for (let i = 0; i < fr.length && ok; i++) {
            for (let j = 0; j < fr.length; j++) {
                const a = fr[i],
                    b = fr[j];
                if (a.fret < b.fret && !(p[i] < p[j])) {
                    ok = false;
                    break;
                }
                if (a.fret === b.fret && a.string > b.string && !(p[i] < p[j])) {
                    ok = false;
                    break;
                }
            }
        }
        if (ok) {
            out.push({ p, cost: handCost(fr, p, rootRule), fr });
        }
    }
    return out;
}

/**
 * Laying a finger flat takes more effort than a fingertip, so a barre has to buy something: a
 * free finger, or a hand that no longer crowds two fingertips into one fret. Kept below the 2.5
 * that re-fingering a held note costs (`fingerTransCost`), so a two-string barre above the index
 * (the 5-5-3 C) is a preference the chart planner can still overrule to keep a note held.
 */
const BARRE_COST = 0.6;

/**
 * A barre that lies under another finger (a string inside it fretted higher, the 2-3-2 of a
 * second-inversion triad on the top strings) is worth it only up the neck. Low down the frets are
 * wide enough for a fingertip each — the open D shape and the uke's G are taught 1-3-2 — and up
 * the neck they narrow until two fingertips crowd one fret and the flat finger is the cleaner
 * grip (12-13-12 is an index barre). Costed per fret so the crossover sits at the 6th fret.
 */
const holeCost = (fret: number): number => 4.6 - 0.3 * fret;

/**
 * The fingers that may lie flat: the index and the ring finger, never the middle, and never the
 * little finger, which teachers rarely ask to (#1677 on the ukulele, #1819 on the guitar). The
 * ukulele's closed E shape 1-4-4-2 is 1-3-4-2, a fingertip each, where the costs had the little
 * finger across two strings; the guitar's Dsus4 x-5-5-2-x-x, E♭sus4 x-6-6-3-x-x and Csus2
 * x-10-10-7-x-x are 3-4-1 where they were 4-4-1, and the power chord x-2-4-4-x-x is 1-3-3 or
 * 1-3-4, never 1-4-4. Beside a chord that keeps the little finger on the lower string (D
 * x-5-4-2-x-x, 4-3-1) the guitar grip is 4-3-1 instead (`crossedOptions`).
 */
const BARRE_FINGERS = [1, 3];

/**
 * Barre fingerings (#1594): one finger flat across a contiguous run of strings at one fret, the
 * run's ends both notes of the grip at that fret. Legal only when every string inside the run is
 * in the grip at that fret or higher — a lower note (an open string included) would be stopped by
 * the barre, and a string left out would sound it. The index bars at the grip's lowest fret; the
 * ring finger bars above an index note (C 5-5-3: index on the 3, ring across the 5s).
 * The middle finger never bars. One barre per grip. Every other finger keeps the split rule, with
 * the barre counted once at its fret. The candidates are costed alongside the split ones, so the
 * planner, not a rule, decides between them.
 *
 * Only the index lies flat UNDER another finger (a string inside the run fretted higher). The
 * ring finger across three strings with the little finger inside it a fret up is no grip: the
 * ukulele's G shape is 1-2-4-3 at every fret (7-9-10-9 was 1-3-4-3 from the 7th fret up,
 * where `holeCost` runs out, #1677). Only a four-note grip can ask, so only a ukulele's.
 *
 * `strummed` (a triad, a power chord, any ukulele chord; not a guitar shell's root barre) adds
 * the other half of the legality (#1681, #1677): no open string of the grip on the barre's
 * palm side, the strings numbered below the run. A finger laid flat reaches its strings from
 * that side, tip on the furthest, so everything nearer is under it. Across the ukulele's G, C
 * and E strings it damps the open A of D 2-2-2-0, which is why D is taught a fingertip each
 * (1-2-3), Asus4 2-2-0-0 as 1-2 and C♯m 1-1-0-4 as 1-2-4; on a guitar it damps the open G of
 * Em x-2-2-0-x-x and the open E of A x-x-x-2-2-0, a fingertip each in every method. An open
 * string beyond the fingertip is clear of it: Gm7 0-2-1-1 and Gmaj7 0-2-2-2 are barres, and
 * so are the guitar's E5 0-2-2-x-x-x and A5 x-0-2-2-x-x.
 *
 * Only the index and the ring finger lie flat (`BARRE_FINGERS`).
 */
function barreOptions(notes: Note[], fr: Note[], strummed: boolean): FingerOption[] {
    const out: FingerOption[] = [];
    const byString = new Map(notes.map((n) => [n.string, n]));
    for (const f of new Set(fr.map((n) => n.fret))) {
        const at = fr.filter((n) => n.fret === f).map((n) => n.string);
        for (const lo of at) {
            for (const hi of at) {
                if (hi <= lo) {
                    continue;
                }
                let legal = true,
                    hole = false;
                for (let s = lo; s <= hi; s++) {
                    const n = byString.get(s);
                    if (!n || n.fret < f) {
                        legal = false;
                        break;
                    }
                    hole ||= n.fret > f;
                }
                if (!legal || (strummed && notes.some((n) => n.string < lo && n.fret === 0))) {
                    continue;
                }
                const inBarre = fr.map((n) => n.fret === f && n.string >= lo && n.string <= hi);
                const rest = fr.filter((_, i) => !inBarre[i]);
                for (const b of BARRE_FINGERS) {
                    if (hole && b !== 1) {
                        continue;
                    }
                    for (const q of perms(rest.length)) {
                        if (q.includes(b)) {
                            continue;
                        }
                        // The barre's place in the finger order: below any note under it in fret
                        // (or beside it on a lower string), above any note over it.
                        const below = (n: Note) => n.fret < f || (n.fret === f && n.string > hi);
                        let ok = rest.every((n, i) => (below(n) ? q[i] < b : q[i] > b));
                        for (let i = 0; i < rest.length && ok; i++) {
                            for (let j = 0; j < rest.length; j++) {
                                const x = rest[i],
                                    y = rest[j];
                                if (
                                    (x.fret < y.fret ||
                                        (x.fret === y.fret && x.string > y.string)) &&
                                    !(q[i] < q[j])
                                ) {
                                    ok = false;
                                    break;
                                }
                            }
                        }
                        // A ring-finger barre sits above an index note on a lower fret.
                        if (ok && b !== 1) {
                            ok = rest.some((n, i) => q[i] === 1 && n.fret < f);
                        }
                        if (!ok) {
                            continue;
                        }
                        let k = 0;
                        const p = fr.map((_, i) => (inBarre[i] ? b : q[k++]));
                        out.push({
                            p,
                            cost: handCost(fr, p, false) + BARRE_COST + (hole ? holeCost(f) : 0),
                            fr,
                        });
                    }
                }
            }
        }
    }
    return out;
}

/** The finger an option puts on the grip's root; 0 when the root is an open string. */
const rootFinger = (o: FingerOption): number => o.p[o.fr.findIndex((n) => n.role === 'R')] ?? 0;

/**
 * The one barre a guitar shell takes (#1607): the index laid across the grip's lowest fret, when
 * that is the only way to get the root off the ring or little finger. A shell is taught a finger
 * per note, root under the index or middle finger so that finger can also mute the string the
 * shape skips. That fails when two of the notes sit a fret under the root: G♯°7 4-x-3-4-3-x is
 * 3-1-4-2 a finger each, the root under the ring finger and the hand twisted round it, and
 * players take 2-1-3-1 instead, the index across the 3rd fret; the R–3–6 grip (C6 x-3-2-2-x-x)
 * is 2-1-1 the same way. So the barre is offered only when no finger-per-note fingering has
 * the root on finger 1 or 2, and only where it puts it there — which only an index barre can,
 * since a ring or little-finger barre sits above the root and frees no finger below it. It is
 * costed like any barre (`BARRE_COST`, `holeCost`; the shell's root-finger cost never applies,
 * every one of these having the root on finger 1 or 2), so the planner still chooses, and a
 * grip a finger per note already holds root first (Dm7♭5 x-5-6-5-6-x, 1-3-2-4) keeps the
 * fingering it is taught with.
 */
function rootBarreOptions(notes: Note[], fr: Note[], split: FingerOption[]): FingerOption[] {
    if (split.some((o) => rootFinger(o) <= 2)) {
        return [];
    }
    return barreOptions(notes, fr, false).filter((o) => rootFinger(o) <= 2);
}

/** Every fingering a grip of one to four fretted notes can be held with, cheapest first. */
function everyFingering(notes: Note[], fr: Note[], opts: FingerOpts): FingerOption[] {
    const out = splitOptions(fr, !opts.barre);
    if (opts.barre) {
        out.push(...barreOptions(notes, fr, true));
    } else if (opts.rootBarre) {
        out.push(...rootBarreOptions(notes, fr, out));
    }
    return out.sort((a, b) => a.cost - b.cost);
}

/**
 * Every reasonable fingering for a grip, cheapest first. `barre: true` marks a strummed grip — a
 * triad, a power chord, any ukulele chord: it is offered barres, and drops the guitar shell's
 * root-finger rule (`handCost`). Without it — a guitar shell — every note has its own finger,
 * the skipped string muted by the fretting hand, and with `rootBarre` it is also offered the
 * index barre that frees its root.
 */
export function fingerOptions(notes: Note[], opts: FingerOpts = {}): FingerOption[] {
    const fr = notes.filter((n) => n.fret > 0);
    if (!fr.length) {
        return [{ p: [], cost: 0, fr }];
    }
    if (fr.length > 4) {
        return [{ p: fr.map(() => null), cost: 0, fr }];
    }
    const out = everyFingering(notes, fr, opts);
    return out.length
        ? out.filter((o) => o.cost <= out[0].cost + 4)
        : [{ p: fr.map(() => null), cost: 0, fr }];
}

export function applyFingers(notes: Note[], opt: FingerOption): void {
    notes.forEach((n) => {
        n.finger = n.fret === 0 ? 0 : null;
    });
    opt.fr.forEach((n, i) => {
        n.finger = opt.p[i];
    });
}

// ---------- the fingerings a shell is taught with (#1611) ----------
//
// `fingerOptions` is every fingering within reach, and the chart planner (`fingerSequence`) used
// to choose among all of them: it would take a stretch, a root under the ring finger or the
// little finger on a lone 1st-fret note to keep one note held — or for no hold at all, because
// `fingerTransCost` then charged a finger in use for the distance it travelled and an idle one
// a flat fee, so the idle (usually little) finger got the note. A held note is worth having
// only between two fingerings a teacher would show. So for a shell the planner chooses among
// those alone, and between them only a held note chooses (`fingerTransCost`, #1617).

/**
 * How much dearer than a grip's cheapest fingering one may be and still be taught: 1.
 * `handCost` prices three things, and only one is a matter of taste. Which fingers take the
 * notes, the hand's shape unchanged, is 0.2 a finger-step: G7 3-x-3-4-x-x under 1-2-3 or under
 * 2-3-4 (the rhythm player's, root under the middle finger and the index free to mute the 5th
 * string) are 0.6 apart, and the widest such choice on any shell is 0.8. A fret of stretch or
 * crowding is 3, which no choice of fingers gets back: with the buried roots gone
 * (`taughtAmong`'s own rule), the cheapest fingering past 0.8 is 2.8 dearer (Cmaj7
 * x-x-10-9-12-x as 2-1-3, the ring finger two frets from the middle, where 2-1-4 is a finger
 * per fret). So the line is anywhere from 0.8 up to 2.8, and 1 draws it just past the
 * choices: every choice of fingers stays on offer for a held note to decide, and no held note
 * buys a stretch (G7 3-x-3-4-x-x as 1-2-4, C♯7 x-4-3-4-x-x as 2-1-4).
 *
 * It is not what keeps a buried root out. A barre's cost rises as the frets widen
 * (`holeCost`), so low on the neck the °7's finger-per-note fingering, root under the ring
 * finger, is 0.7 dearer than its index barre at the 2nd fret and exactly 1 at the 3rd.
 */
const TAUGHT_MARGIN = 1;

/**
 * An idle index over a stretched hand: nothing under finger 1 while two of the other fingers
 * sit further apart in frets than they are in fingers (C7 x-3-x-3-5-x as 2-3-4, the ring and
 * little finger two frets apart; Fmaj7 x-x-3-x-5-5 as 2-3-4, the middle and ring). Leaving the
 * index out is a real fingering, but only over a hand that is closed up. A stretch is what the
 * index is for: 1-2-4 and 1-3-4 hold the same notes with every finger on its own fret.
 * `handCost` cannot say so — it reads a crowded fret and a stretched one alike.
 */
const idleIndexStretches = (o: FingerOption): boolean =>
    !o.p.includes(1) &&
    o.p.some((a, i) =>
        o.p.some(
            (b, j) => a !== null && b !== null && a < b && o.fr[j].fret - o.fr[i].fret > b - a,
        ),
    );

/**
 * An idle index under a little finger tucked inside the grip: nothing under finger 1 while
 * the little finger frets a note with a fingered string on either side of it, a fret above
 * the ring finger on the thinner side (#1691). It is the D shape x-x-x-2-3-2 (1-3-2) moved up
 * a finger, 2-4-3, and B° x-x-3-4-3-x the same. `handCost` reads it as a choice of fingers,
 * 0.6 dearer, but no teacher shows it: the ring finger reaching over the middle is the D
 * shape, the shorter little finger reaching over the ring a knot, and the index that would
 * undo it is free. A little finger on the outside string is no knot (C♯+ x-4-3-2-x-x as 4-3-2
 * keeps D♭'s ring and little finger, a plain diagonal), and with the index down the reach is
 * taught (the ukulele's G shape 1-2-4-3), so only these are ruled out. A guitar's only: the
 * ukulele's frets are close enough that its G 0-2-3-2 as 0-2-4-3 stays a second fingering for
 * two fingers kept (#1681), and its teacher's review left it there.
 */
const idleIndexTucked = (o: FingerOption): boolean => {
    const little = o.p.indexOf(4);
    if (little < 0 || o.p.includes(1)) {
        return false;
    }
    const { string, fret } = o.fr[little];
    return (
        o.fr.some((n, i) => o.p[i] !== null && n.string > string) &&
        o.fr.some((n, i) => o.p[i] === 3 && n.string < string && n.fret < fret)
    );
};

/** Which note of a fingering its lowest-numbered finger holds (-1 for none fingered). */
const lowestFinger = (o: FingerOption): number => {
    let lowest = -1;
    o.p.forEach((f, i) => {
        if (f !== null && (lowest < 0 || f < (o.p[lowest] as number))) {
            lowest = i;
        }
    });
    return lowest;
};

/**
 * A fingering whose lowest finger sits on a fret below its own number: there is no room on
 * the neck for the index behind it (the little finger on a 1st-fret note leaves the index
 * three frets behind the nut). Nobody ARRIVES on one. Coming to a first-position grip cold,
 * the index takes the 1st fret: the one fretted note of E7 0-x-0-1-x-x and of Am7 x-0-x-0-1-x
 * under the index, Dm7 x-x-0-x-1-1 as 1-2, Fmaj7 1-x-2-2-x-x as 1-2-3, the ukulele's G7
 * 0-2-1-2 as 2-1-3. But a finger that is already down is not lifted to make it so: F7
 * 1-x-1-2-x-x to B♭maj7 x-1-x-2-3-x keeps the ring finger on its note and plays 2-3-4, exactly
 * as G7 to Cmaj7 does two frets up. On a ukulele that takes two fingers that stay, or the one
 * finger of a one-finger chord (`holdFor`): G7 0-2-1-2 to Cmaj7 0-0-0-2 lifts two fingers and
 * leaves the ring finger, though Cmaj7 alone is the middle finger (`aheadOfItsFret`). Only the
 * lowest finger is read, so a grip on the 2nd fret or higher has room for the index behind
 * its fingers and is an ordinary choice (F♯m7 2-x-2-2-x-x as 2-3-4), and a fingering whose
 * index is on its own fret is never one, wherever its other fingers sit.
 */
const behindTheNut = (o: FingerOption): boolean => {
    const lowest = lowestFinger(o);
    return lowest >= 0 && (o.p[lowest] as number) > o.fr[lowest].fret;
};

/**
 * The fingering that sits in position: the index on the grip's lowest fret, each other note
 * under the lowest finger that reaches it without a stretch (so no finger is skipped that
 * could have taken the note), and no finger pulled more than a fret back from its own. For
 * almost every shell that is the cheapest fingering already. Where it is not: the R–♭3–♭7
 * minor 7th on the 6th and 5th strings (and the three-note 4th-string °7, the same hand), Dm7 x-5-3-5-x-x, whose position fingering is 3-1-4 —
 * index on the 3rd fret, ring and little finger on the 5th — and whose cheapest is 2-1-3, root
 * first with the middle finger two frets from the index. Both are taught; players use
 * either. (The °7 on the 6th string is not one: its 3-1-4-2 crowds the index's fret and pulls
 * the little finger two frets back, which is why it takes the barre.)
 */
const inPosition = (o: FingerOption): boolean => {
    if (o.p.includes(null)) {
        return false;
    }
    const lowest = Math.min(...o.fr.map((n) => n.fret));
    // Low fret first, and on one fret the lower-pitched string first: the order fingers go in.
    const order = o.fr
        .map((_, i) => i)
        .sort((i, j) => o.fr[i].fret - o.fr[j].fret || o.fr[j].string - o.fr[i].string);
    let finger = 0;
    return order.every((i) => {
        const offset = o.fr[i].fret - lowest;
        finger = Math.max(finger + 1, offset + 1);
        // `finger - 1 - offset` is how far back from its own fret the finger sits.
        return o.p[i] === finger && finger - 1 - offset <= 1;
    });
};

/**
 * The taught ones among a shell's fingerings, the default first. Four rules:
 *
 * - No dearer than the cheapest by more than `TAUGHT_MARGIN`: no stretch the cheapest does
 *   not have.
 * - Root first where the cheapest is: when the cheapest fingering has the root under finger 1
 *   or 2, one with it under the ring or little finger is out, whatever it costs (D7
 *   x-5-4-5-x-x as 3-2-4; G°7 3-x-2-3-2-x as 3-1-4-2, which the margin alone lets through
 *   below the 4th fret). It is #1607's rule for choosing a grip, held to here.
 * - No idle index over a stretch (`idleIndexStretches`).
 * - The index behind the nut (`behindTheNut`) only as fingers left where they were: marked
 *   `needs: 'left'`, taken only from a chord that already holds them (`arrives`).
 *
 * And one fingering the first two rules would drop comes back: the one in position
 * (`inPosition`), which for the 6th- and 5th-string minor 7th is 3-1-4. It is a second
 * standard fingering, not the default, so it needs a reason, and the reason is the chord
 * beside it: it is offered once to keep the hand on the chord before (`needs: 'before'`) and
 * once to keep it on the chord after (`'after'`), that chord fingered its own cheapest way
 * (Dm7 x-5-3-5-x-x as 3-1-4 into the B♭ triad x-5-3-3-x-x, ring finger and index staying).
 * Two second choices do not justify each other: Gm7 x-10-8-10-x-x 3-1-4 beside Dm7
 * 10-x-10-10-x-x 2-3-4 keeps the little finger down, but 2-1-3 beside 1-2-3 keeps the ring
 * finger on the same note. With nothing to keep either side the minor 7th is 2-1-3.
 *
 * A marked fingering has to earn its place with a finger of its own (`FingerOption.own`): the
 * neighbour must share a note that this fingering holds under a different finger than the
 * default would. A shared note the default fingering keeps just as well is no reason
 * to leave it (Cmaj7 x-3-x-4-5-x to Am7 5-3-5-x-x-x keeps the index either way, so Am7 stays
 * 2-1-3).
 *
 * The DEFAULT, first in the list, is the cheapest — unless that one is out of position and
 * another the first three rules pass is in it (#1677). Fmaj7 x-x-3-x-5-5 is the one shape:
 * its cheapest is 1-2-3, the middle finger two frets from the index and the 4th fret under
 * nothing, 0.4 less than 1-3-4 only because `handCost` counts the little finger as dearer
 * than the middle. 1-3-4 is a finger per fret, and what the hand plays there after C7 already.
 * The two swap prices, so the plan reaches for 1-3-4 cold and 1-2-3 stays a free choice for
 * a held note. Where the in-position fingering is past the margin (the minor 7th's 3-1-4)
 * the cheapest stays the default, as above.
 *
 * The default is always here and unmarked — it uses the index, so the nut rule cannot mark
 * it — which is why a chord by itself is fingered as `assignFingers` fingers it and why the
 * plan always has a way through.
 *
 * `fromTheNut` is a shell that rings an open string in first position
 * (`fingeredFromTheNut`: Dmaj7 x-x-0-x-2-2, Dm7 x-x-0-x-1-1). Its fingers left where they
 * were need as many to stay as they have fingertips off their own frets (`offItsFret`,
 * #1683): Dmaj7 after A x-x-x-2-2-0 kept the ring finger and played 3-4 for it, the index two
 * frets behind the nut, and is 1-2. A closed shell on the 1st fret is not asked: B♭maj7
 * x-1-x-2-3-x still keeps F7's ring finger and plays 2-3-4.
 */
const taughtAmong = (all: FingerOption[], fromTheNut: boolean): FingerOption[] => {
    const best = all[0];
    const rootFirst = rootFinger(best) <= 2;
    const usual = (o: FingerOption): boolean =>
        o.cost <= best.cost + TAUGHT_MARGIN &&
        !(rootFirst && rootFinger(o) > 2) &&
        !idleIndexStretches(o);
    const first = inPosition(best)
        ? best
        : (all.find((o) => usual(o) && !behindTheNut(o) && inPosition(o)) ?? best);
    const own = (o: FingerOption) => o.p.map((f, i) => f !== first.p[i]);
    const taught: FingerOption[] = [{ ...first, cost: best.cost, own: own(first) }];
    for (const o of all) {
        if (o === first) {
            continue;
        }
        if (usual(o)) {
            taught.push({
                ...o,
                cost: o === best ? first.cost : o.cost,
                own: own(o),
                ...(behindTheNut(o)
                    ? {
                          needs: 'left' as const,
                          ...(fromTheNut ? { hold: offItsFret(o), nut: true } : {}),
                      }
                    : {}),
            });
        } else if (inPosition(o)) {
            taught.push(
                { ...o, own: own(o), needs: 'before' },
                { ...o, own: own(o), needs: 'after' },
            );
        }
    }
    return taught;
};

// ---------- the fingerings a strummed grip is taught with (#1617) ----------
//
// Triad and power grips (`FingerOpts.barre`) were planned from every fingering within reach,
// so a chart showed B♭ x-5-3-3-x-x as 4-2-3 where the index barre is standard, F x-3-3-2-x-x
// with the ring finger flat a fret above the index, and the ukulele's A 2-1-0-0 under the
// ring and little finger because those were idle. Most of a strummed grip's standard
// fingering is what `fingerOptions` already prices cheapest; the rules below keep the plan to
// it and to the second fingerings a teacher also shows, and a short table (`UKE_BOOK`) holds
// the ukulele chords whose method-book fingering the costs do not reach.

/** The finger an option lays flat (it holds more than one note), or 0. */
const barringFinger = (o: FingerOption): number =>
    o.p.find((f, i) => f !== null && o.p.indexOf(f) !== i) ?? 0;

/**
 * A ring or little finger laid flat closer to the index than a finger apiece would sit: the
 * ring finger across a fret that is only one above the index's (F x-3-3-2-x-x as 3-3-1, Dm
 * 2-2-1-0 as 3-3-1). A flat finger cannot also be pulled back, and the grip has a fingering
 * with a fingertip per note (2-3-1). Two frets above the index the ring finger lies flat as it
 * does in the A-shape barre chord (C x-x-x-5-5-3, B5 x-2-4-4-x-x); three above, on a guitar,
 * it is a stretch (`stretchedBarre`).
 */
const crampedBarre = (o: FingerOption): boolean => {
    const b = barringFinger(o);
    const index = o.p.indexOf(1);
    return b > 1 && index >= 0 && o.fr[o.p.indexOf(b)].fret - o.fr[index].fret < b - 1;
};

/**
 * A guitar ring finger laid flat three frets or more above the index (#1819): Dsus4
 * x-5-5-2-x-x as 3-3-1. That was the little finger's barre (4-4-1), and with the little finger
 * never flat (`BARRE_FINGERS`) the ring finger took its place beside a power chord's ring
 * barre (G5 3-5-5-x-x-x 1-3-3 to Gsus2 x-5-5-2-x-x), a stretch no guitar method shows: the
 * ring finger lies flat two frets above the index, as in the A shape (`crampedBarre`), and
 * three above the grip is a fingertip each, 3-4-1. The ukulele is not asked: its closed E
 * shape's second fingering 1-3-3-2 is one the books print.
 */
const stretchedBarre = (o: FingerOption): boolean => {
    const b = barringFinger(o);
    const index = o.p.indexOf(1);
    return b === 3 && index >= 0 && o.fr[o.p.indexOf(b)].fret - o.fr[index].fret > 2;
};

/**
 * A fingertip on a fret past its finger's own, counted from where the hand sits. The hand
 * covers four frets, a finger over each, and a fingering is in position when every fingertip
 * is on its own fret or pulled back from it; one that reaches ahead is a stretch the next
 * finger was there to save (the ukulele's B♭sus4 3-3-1-1 as 2-3-1-1, the middle finger two
 * frets from the index, where 3-4-1-1 is a finger per fret). `handCost` cannot say so: it
 * reads a reach and a crowded fret alike and then prefers the lower fingers.
 *
 * `fromTheNut` (`fingeredFromTheNut`) is a chord that rings an open string in first position.
 * The hand sits at the nut whichever fingers it uses, so the 1st fret is the index's and a
 * finger takes the fret of its own number, two notes on one fret that finger and the next:
 * the guitar's open C x-3-2-0-x-x is 3-2 (not 2-1, the hand a fret up the neck), Em
 * x-2-2-0-x-x and A x-x-x-2-2-0 are 2-3, E♭ x-1-1-0-x-x 1-2, Csus4 x-3-3-0-x-x 3-4 and G
 * x-2-0-0-x-x the middle finger; the ukulele's C 0-0-0-3 is the ring finger, Am 2-0-0-0 and
 * Cmaj7 0-0-0-2 the middle.
 *
 * Elsewhere the hand sits where its lowest finger puts it.
 */
const aheadOfItsFret = (o: FingerOption, fromTheNut: boolean): boolean => {
    const lowest = lowestFinger(o);
    if (lowest < 0) {
        return false;
    }
    // The fret under the index, used or not.
    const first = fromTheNut ? 1 : o.fr[lowest].fret - ((o.p[lowest] as number) - 1);
    return o.p.some((f, i) => f !== null && o.fr[i].fret - first + 1 > f);
};

/**
 * Whether a grip is fingered from the nut (`aheadOfItsFret`): it rings an open string and
 * frets nothing past the 3rd fret, where every open chord a method teaches sits (a 4th-fret
 * note beside an open string is the hand moved up: C♯dim x-4-2-0-x-x is 3-1). A guitar grip
 * always; a ukulele grip only when it frets ONE note. The ukulele's fuller open chords are
 * printed from the index whatever their fret (D 2-2-2-0 as 1-2-3, G 0-2-3-2 as 1-3-2, Em
 * 0-4-3-2 as 3-2-1): its frets are too close for a finger each to be the easier hand.
 */
const fingeredFromTheNut = (notes: Note[], fr: Note[], ukulele: boolean): boolean =>
    notes.some((n) => n.fret === 0) &&
    fr.every((n) => n.fret <= 3) &&
    (!ukulele || fr.length === 1);

/**
 * The ukulele chords whose method-book fingering the rules do not reach. Keyed by the frets
 * from the G string to the A string, `o` an open string and `x` one the grip leaves out; each
 * lists the book fingerings (for the strings it sounds), the first the one a chord chart
 * prints. Only a ukulele grip is looked up.
 *
 * - Fm 1-0-1-3 is index, middle and little finger (Fender Play, Ukulele Tricks, Kytary).
 * - E♭ 0-3-3-1 is printed three ways: middle and ring on the 3rd fret (Ukulele Tricks, and
 *   the most common), one finger laid across both (UkuTabs), ring and little (Kytary). All
 *   three stay on offer.
 * - Cm 0-3-3-3 is the index laid across three strings, and is also printed a fingertip each,
 *   1-2-3 (#1677): from C the ring finger is already on the A string's 3rd fret, and it stays
 *   there through C, Cm, C. No cost reaches that one: three fingertips on one fret read as
 *   two frets of stretch.
 *
 * - The two-string power chords on the E and A strings (#1809), B5 x-x-2-2 and B♭5 x-x-1-1,
 *   are index and middle, a fingertip each (UkuTabs). The rules lay the index across both;
 *   that stays only as fingers left down, beside a chord that already bars those strings
 *   (B 4-3-2-2 to B5).
 * - Cadd9 0-2-0-3 is middle and ring (#1820, Kytary): C 0-0-0-3 with the middle finger added.
 *   The rules put the index on the 2nd fret and the middle on the 3rd, the hand a fret up.
 *   Index and ring, 0-1-0-3, is Csus2 0-2-3-3 (0-1-2-3) with the middle finger lifted, and
 *   stays on offer for a chord that keeps the index there (Csus2, or G after it).
 * - Am6 2-4-2-3 is the index across the G and E strings under the ring finger on the C string,
 *   the middle finger on the A string, 1-3-1-2 (#1823, Kytary). It is also F♯m7♭5, which the
 *   books finger the same way (Kytary's F♯m7♭5, UkuTabs's G♭m7♭5), so the row is right for
 *   both. The rules gave them 1-4-2-3, a fingertip each.
 *
 * C 0-0-0-3 under the ring finger and Am 2-0-0-0 under the middle were rows here; they are
 * `aheadOfItsFret`'s rule now.
 */
const UKE_BOOK: Record<string, string[]> = {
    '1 o 1 3': ['1-0-2-4'],
    'o 3 3 1': ['0-2-3-1', '0-3-3-1', '0-3-4-1'],
    'o 3 3 3': ['0-1-1-1', '0-1-2-3'],
    'x x 2 2': ['1-2'],
    'x x 1 1': ['1-2'],
    'o 2 o 3': ['0-2-0-3', '0-1-0-3'],
    '2 4 2 3': ['1-3-1-2'],
};

/**
 * Moving shapes, all four strings fretted, whose book fingering is the same at every fret:
 * keyed by each string's fret above the grip's lowest, G string to A string. `holeCost` prices
 * a barre out below the 6th fret, where a guitar's frets are wide enough for a fingertip each
 * (the open D shape); a ukulele's are not, and the charts print these with the barre.
 *
 * - The F shape (F♯ 3-1-2-1, G 4-2-3-2, A♭ 5-3-4-3): the index across the lowest fret, middle
 *   and ring above it.
 * - Two add9 grips (#1820, Kytary; UkuTabs agrees for D and G): the C shape's (D♭add9
 *   1-3-1-4, Dadd9 2-4-2-5) with the index across the G, C and E strings under the ring
 *   finger, the little finger on top; and the F shape's (F♯add9 1-1-2-1, Gadd9 2-2-3-2,
 *   A♭add9 3-3-4-3) with the index across all four and the middle finger on the E string. The
 *   rules gave them 1-3-2-4 and 1-1-3-2 below the 6th fret and the book's above it. No other
 *   grip the shapes hold has these frets.
 */
const UKE_MOVING_BOOK: Record<string, string[]> = {
    '2 0 1 0': ['3-1-2-1'],
    '0 2 0 3': ['1-3-1-4'],
    '0 0 1 0': ['1-1-2-1'],
};

/** A ukulele grip's book fingerings, as `UKE_BOOK` or `UKE_MOVING_BOOK` spell them, or null. */
function bookFingerings(notes: Note[]): string[] | null {
    if (notes.some((n) => n.string < 1 || n.string > 4)) {
        return null;
    }
    const byString = [4, 3, 2, 1].map((s) => notes.find((n) => n.string === s));
    const book = UKE_BOOK[byString.map((n) => (n ? n.fret || 'o' : 'x')).join(' ')];
    if (book) {
        return book;
    }
    if (byString.includes(undefined)) {
        return null;
    }
    const frets = byString.map((n) => (n as Note).fret);
    const low = Math.min(...frets);
    return low > 0 ? (UKE_MOVING_BOOK[frets.map((f) => f - low).join(' ')] ?? null) : null;
}

/**
 * The guitar's open grips whose method-book fingering the nut rule (`aheadOfItsFret`) does not
 * reach (#1691, #1834). Keyed by the fretted notes as `string/fret`, highest-numbered string
 * first, and looked up only for a grip fingered from the nut (`fingeredFromTheNut`). `taught`
 * lists the book's fingerings, the fingers in that order, the first the default; the others
 * are second fingerings, priced no dearer than the margin a taught fingering keeps to
 * (`TAUGHT_MARGIN`) and taken where the chord beside it keeps the hand (`nutHoldKept`). What
 * the nut rule chose stays a second fingering for a finger that stays, as before, but for
 * the fingerings in `never`, which are not offered at all, not even as fingers left down.
 *
 * - The open D's top two fretted notes, x-x-x-2-3-x with an open string beside them: D5
 *   x-x-0-2-3-x and Dsus2 x-x-x-2-3-0 (and x-x-0-2-3-0, and Asus4 x-x-x-2-3-0, the same
 *   frets). They are D x-x-0-2-3-2 (1-3-2) with the middle finger lifted, and every method
 *   prints them 1-3: index on the 3rd string, ring on the 2nd. The nut rule, a finger to the
 *   fret of its number, made them 2-3, which a teacher shows only as Dm x-x-0-2-3-1 (2-3-1)
 *   minus a finger, so 2-3 stays a second fingering for a chord that keeps one of those
 *   fingers. With the ring finger where D has it, B°'s x-x-3-4-3-x is not pulled to 2-4-3
 *   beside D5 to keep it.
 * - The top of the open A, x-x-x-2-2-0 (#1834): in every method the B-string note is the ring
 *   finger, A x-0-2-2-2-0 as 1-2-3 (its top 2-3, the nut rule's choice and the default) or
 *   2-1-3 (its top 1-3). 2-1-3 is the A taught beside D: the index stays on the G string's A
 *   and the ring finger slides a fret along the B string, D x-x-0-2-3-2 (1-3-2) to A and back,
 *   and Dsus2 and Asus4 x-x-x-2-3-0 (1-3) the same. 1-3 reads as a fret of stretch to
 *   `handCost` (3.2 dearer than the cheapest), so no cost reached it, and the rules offered
 *   1-2 in its place, the middle finger on the B string, to keep D's index: no method fingers
 *   A that way.
 * - The open A7, x-0-2-0-2-0 (#1838, one of `GUITAR_OPEN_SEVENTHS`): 2-3, or 1-3, never 1-2,
 *   for the same reason as A's top.
 * - Four of the open chords of #1849 (`GUITAR_OPEN_CHORDS`, whose JSDoc names the sources): A
 *   x-0-2-2-2-0 1-2-3 or 2-1-3, G 3-2-0-0-0-3 2-1-3 or 3-2-4, Asus4 x-0-2-2-3-0 1-2-3 or 1-2-4,
 *   Dsus4 x-x-0-2-3-3 1-3-4 or 1-2-3. A row's fingering need not be one the rules build: A's
 *   2-1-3 crosses two fingers on one fret, which `splitOptions` never does (`guitarBook`).
 */
const GUITAR_BOOK: Record<string, { taught: number[][]; never?: number[][] }> = {
    '3/2 2/3': { taught: [[1, 3]] },
    // The open A7 x-0-2-0-2-0 (#1838): middle and ring finger, the nut rule's 2-3 and Fender's
    // lesson's, or 1-3 as fachords prints it; never 1-2, the middle finger on the B string,
    // which the rules took after Em7♭5 x-x-2-3-3-3 to keep the index's fret.
    '4/2 2/2': {
        taught: [
            [2, 3],
            [1, 3],
        ],
        never: [[1, 2]],
    },
    '3/2 2/2': {
        taught: [
            [2, 3],
            [1, 3],
        ],
        never: [[1, 2]],
    },
    // The open chords of #1849 the nut rule misses.
    // A x-0-2-2-2-0: 1-2-3, or 2-1-3, the A taught beside D (its top's rows above).
    '4/2 3/2 2/2': {
        taught: [
            [1, 2, 3],
            [2, 1, 3],
        ],
    },
    // G 3-2-0-0-0-3: 2-1-3, the first G the beginner courses teach; 3-2-4, the G that moves
    // to C with the ring and middle finger shifting a string together, a second fingering.
    '6/3 5/2 1/3': {
        taught: [
            [2, 1, 3],
            [3, 2, 4],
        ],
    },
    // Asus4 x-0-2-2-3-0: 1-2-3, A's 1-2-3 with the ring finger up a fret; 1-2-4 second.
    '4/2 3/2 2/3': {
        taught: [
            [1, 2, 3],
            [1, 2, 4],
        ],
    },
    // Dsus4 x-x-0-2-3-3: 1-3-4, D's 1-3-2 with the little finger for the middle.
    '3/2 2/3 1/3': {
        taught: [
            [1, 3, 4],
            [1, 2, 3],
        ],
    },
};

/**
 * A guitar grip's row of `GUITAR_BOOK`: its book fingerings found among `every`, the default
 * first, and the fingerings it never takes (as `FingerOption.p` joins), or null.
 */
function guitarBook(
    fr: Note[],
    every: FingerOption[],
): { taught: FingerOption[]; never: Set<string> } | null {
    const order = fr.map((_, i) => i).sort((i, j) => fr[j].string - fr[i].string);
    const row = GUITAR_BOOK[order.map((i) => `${fr[i].string}/${fr[i].fret}`).join(' ')];
    if (!row) {
        return null;
    }
    // A row's fingers in the fretted notes' order (`FingerOption.p`).
    const inOrder = (fingers: number[]): string => {
        const p = new Array<number>(fr.length);
        order.forEach((i, k) => {
            p[i] = fingers[k];
        });
        return p.join();
    };
    // A row may print a fingering the rules never build: the open A's 2-1-3 crosses the index
    // and the middle finger on one fret (#1849), which `splitOptions` never does.
    const taught = row.taught.map(
        (fingers): FingerOption | undefined =>
            every.find((o) => o.p.join() === inOrder(fingers) && !barringFinger(o)) ??
            (new Set(fingers).size === fingers.length
                ? (() => {
                      const p = inOrder(fingers).split(',').map(Number);
                      return { p, cost: handCost(fr, p, false), fr };
                  })()
                : undefined),
    );
    // The row's first fingering is its default: if the grip has none, the row does not apply,
    // rather than promoting a second fingering to the default.
    if (taught[0] === undefined) {
        return null;
    }
    return {
        taught: taught.filter((o): o is FingerOption => o !== undefined),
        never: new Set((row.never ?? []).map(inOrder)),
    };
}

/** An option's fingers from the highest-numbered string down, an open string 0: '0-2-3-1'. */
const spelled = (notes: Note[], o: FingerOption): string =>
    [...notes]
        .sort((a, b) => b.string - a.string)
        .map((n) => (n.fret === 0 ? 0 : o.p[o.fr.indexOf(n)]))
        .join('-');

/**
 * A ring finger laid flat with two strings on its palm side fretted below it: the ukulele's
 * E♭m 3-3-2-1 as 3-3-2-1, the ring finger across the G and C strings while the middle finger
 * and index hold the E and A strings a fret and two frets down. The flat finger passes over
 * both and has to arch clear of them. Over ONE such string it is the A shape's barre, which
 * every guitarist learns (C x-x-x-5-5-3, the ukulele's E 4-4-4-2); over two, the books print
 * a fingertip each first (Ukulele Tricks: E♭m 3-4-2-1) and the barre second.
 */
const archedBarre = (notes: Note[], o: FingerOption): boolean => {
    const flat = barringFinger(o);
    if (flat <= 1) {
        return false;
    }
    const held = o.fr.filter((_, i) => o.p[i] === flat);
    const lowest = Math.min(...held.map((n) => n.string));
    return notes.filter((n) => n.string < lowest && n.fret > 0 && n.fret < held[0].fret).length > 1;
};

/**
 * The same fingering with the index laid across the note the middle finger holds beside it,
 * when the two are fingertips on one fret and neighbouring strings: 3-4-1-2 for the
 * ukulele's B♭sus4 3-3-1-1 gives 3-4-1-1. Null when the fingering has no such pair or
 * `among` has no such barre (an open string on its palm side: Asus4 2-2-0-0). A string
 * between the two is another matter: fretted higher it makes a barre with a finger over it,
 * which `holeCost` decides by the fret (the sus2 shape 2-4-5-2 is 1-3-4-2 low on the neck,
 * as G 0-2-3-2 is 1-3-2).
 */
const indexAcross = (o: FingerOption, among: FingerOption[]): FingerOption | null => {
    const index = o.p.indexOf(1);
    const middle = o.p.indexOf(2);
    if (
        index < 0 ||
        middle < 0 ||
        barringFinger(o) ||
        o.fr[index].fret !== o.fr[middle].fret ||
        Math.abs(o.fr[index].string - o.fr[middle].string) !== 1
    ) {
        return null;
    }
    const want = o.p.map((f) => (f === 2 ? 1 : f)).join();
    return among.find((x) => x.p.join() === want) ?? null;
};

/**
 * Which of a ukulele grip's free fingerings is its default (#1677): the cheapest of those in
 * place, no finger ahead of its fret (`aheadOfItsFret`: B♭sus4 3-3-1-1 is not 2-3-1-1, E5
 * 4-4-0-2 is 3-4-1 and not 2-3-1), or the cheapest of all when none is. Then two rules, in
 * this order:
 *
 * - Not a ring finger arched over two strings (`archedBarre`) where a fingering without one
 *   is taught: E♭m 3-3-2-1 is 3-4-2-1, and the barre 3-3-2-1 the second fingering.
 * - Where the index and middle fingertips sit side by side on one fret and the index can
 *   lie across both, it does (`indexAcross`): the sus4 shape 3-3-1-1 (B♭sus4, Bsus4 4-4-2-2)
 *   is 3-4-1-1, the same index barre as B♭ 3-2-1-1, and 3-4-1-2 the second. `handCost`
 *   cannot choose between them: the ring and little finger already crowd one fret, so the
 *   barre saves nothing it counts.
 */
const ukuleleDefault = (notes: Note[], free: FingerOption[]): FingerOption => {
    const placed = free.filter((o) => !aheadOfItsFret(o, false));
    const inPlace = placed.length ? placed : free;
    const upright = inPlace.find((o) => !archedBarre(notes, o)) ?? inPlace[0];
    return indexAcross(upright, free) ?? upright;
};

/**
 * How many fingers a guitar grip fingered from the nut (`fingeredFromTheNut`) needs the chord
 * beside it to hold before it takes a fingering with the hand off the nut (`FingerOption.hold`,
 * #1683): one for each fingertip that is not on the fret of its own number, up to two. It is
 * the ukulele's rule (`holdFor`, #1681) counted the guitar's way, where the default at the
 * nut is a finger per fret. One held finger used to be reason enough, and it dragged the
 * rest of the hand off its frets: C♯m x-x-x-1-2-0 after G♯m played 2-3 for the middle
 * finger, the index left behind the nut (it is 1-2); A x-x-x-2-2-0 after Bm7♭5 played 3-4;
 * and C x-3-2-0-x-x beside F x-3-3-2-x-x played 2-1 for the middle finger, both fingertips a
 * fret past their own (since #1835 C is never 2-1: `adaptOptions`).
 * A fingering with one fingertip off its fret still takes one finger that stays: Em
 * x-2-2-0-x-x as 1-2 into C (the middle finger is on its own fret and stays there). (A
 * x-x-x-2-2-0 as 1-2 into D, the index staying, was one until #1834: no method fingers A so,
 * and `GUITAR_BOOK` gives it 1-3 there.)
 *
 * That count is from the nut. For a grip no method drills (`drilledChord`: a sus, dim, aug
 * or power grip, an open shell) it is checked against the chord beside it (#1691,
 * `nutHoldKept`), which may already hold the hand where the fingering puts it.
 */
const offItsFret = (o: FingerOption): number =>
    Math.min(2, new Set(o.p.filter((f, i) => f !== null && f !== o.fr[i].fret)).size);

/**
 * The index laid flat with every other finger on its own fret or one back from it, counted
 * from the barre's fret: the index barre a crowded fingering may use (`crowdedOptions`).
 */
const indexBarreInPlace = (o: FingerOption): boolean => {
    if (barringFinger(o) !== 1) {
        return false;
    }
    const first = o.fr[o.p.indexOf(1)].fret;
    return o.p.every((f, i) => f === null || f === 1 || o.fr[i].fret >= first + f - 2);
};

/**
 * The fingerings that crowd the hand to leave fingers where they are (#1683): a fingertip
 * each, no finger reaching ahead of its fret from where the hand sits (`aheadOfItsFret`) and
 * the index not behind the nut, but dearer than the taught ones because fingers share a fret
 * or sit pulled back from their own. `handCost` reads that as a stretch (3.2 to 6.6 dearer
 * than the cheapest on the grips below), so they were never on offer, and a sus chord beside
 * its own major re-fingered the whole grip where a teacher moves one finger:
 *
 * - D x-x-x-2-3-2 (1-3-2) to Dsus4 x-x-x-2-3-3 adds the little finger: 1-3-4, not 1-2-3.
 * - D to Dsus2 x-x-x-2-3-0 lifts the middle finger: 1-3, not 2-3 (and since #1691 1-3 is
 *   Dsus2's own fingering too, `GUITAR_BOOK`).
 * - F x-3-3-2-x-x (2-3-1) to Fsus4 x-3-3-3-x-x adds the little finger: 2-3-4, not the index
 *   laid across all three.
 *
 * A crowded hand is no stretch, but it is nobody's fingering cold, so it is a second
 * fingering (`needs: 'before'` / `'after'`) that asks for TWO fingers to stay
 * (`FingerOption.hold`). One held note does not buy it. A guitar's strummed grip frets three
 * notes at most, so that is one of two things:
 *
 * - A finger LIFTED: a grip of two fretted notes, both already down. Any chord may do that,
 *   since nothing is placed (Dsus2 after D, D5 x-x-0-2-3-x after Dm x-x-3-2-3-x: each is
 *   1-3, which since #1691 is also what each takes cold).
 * - A finger ADDED: a grip of three, two of them down and one to place. Only a suspension
 *   beside its own chord (`FingerOption.sameRoot`, `onOneRoot`), which is what a suspension
 *   is: the chord's hand with one finger more, and back. Between two different chords each
 *   takes the fingering it is taught with (Dm x-5-3-2-x-x, 4-2-1, to B♭ x-5-3-3-x-x shares
 *   two notes the same way, and B♭ is still the barre 3-1-1, never 4-2-3, #1617), and so
 *   does a major chord beside its minor, dim or aug: offered to every chord on one root, the
 *   same rule brought back D x-x-4-2-3-x as 4-1-3 into Dm, a hold #1617 dropped, and had a
 *   major chord follow its sus2 (A♭ x-x-x-5-4-4 as 4-2-3).
 *
 * The neighbour is in its own default fingering, as for every second fingering (`arrives`),
 * so the sus chord follows its major and not the other way round. Priced at the margin
 * (`TAUGHT_MARGIN`), the dearest a taught fingering may be: the two notes it keeps cost more
 * to re-finger (`REFINGER_COST`), and a taught second fingering that keeps them as well is
 * still preferred.
 *
 * The rule names no shape, so it holds wherever two fingers can stay: a sus chord beside its
 * minor (Dm x-x-x-2-3-1 to Dsus4 is 2-3-4), the F and D shapes at every fret, a sus2 beside
 * its power chord (E♭5 x-x-1-3-4-x to E♭sus2 x-x-3-3-4-x is 2-3-4).
 *
 * The index may lie flat in one (#1691), as it would in the chord's own barre form: Dm
 * x-x-3-2-3-x (2-1-3) to Dsus2 x-x-2-2-3-x is 1-1-3, the index laid across the 4th and 3rd
 * strings and the ring finger staying on D, where the cheapest, 1-1-2, moves the D from the
 * ring finger to the middle. No other finger lies flat (a ring or little finger flat beside
 * two held fingers is a hand no method shows), and the fingers above the barre sit no more
 * than a fret back from their own (`indexBarreInPlace`): Dsus2 as 1-1-4, the little finger
 * two frets back, is a cramp.
 */
const crowdedOptions = (
    every: FingerOption[],
    taken: Set<string>,
    cost: number,
): FingerOption[] => {
    const fr = every[0].fr;
    const added = fr.length > 2;
    // A suspension's 2nd or 4th, not an add9's 9th (#1820): an add9 is no suspension, and a
    // guitar, the only instrument asked here, has no add9 grip (it plays the plain triad).
    if (fr.length < 2 || (added && !fr.some((n) => n.degree === '2' || n.degree === '4'))) {
        return [];
    }
    return crowded(every, taken).map((o) => ({
        ...o,
        cost,
        hold: 2,
        ...(added ? { sameRoot: true } : {}),
    }));
};

/**
 * The ring and little finger crossed on one fret (#1819): a guitar grip whose default puts the
 * ring finger on the lower-pitched of two neighbouring strings and the little finger on the
 * higher, above the index, also offered the other way round, 4-3-1. Dsus4 x-5-5-2-x-x is 3-4-1
 * alone, a fingertip each (it was 4-4-1, the little finger flat, `BARRE_FINGERS`); beside D
 * x-5-4-2-x-x, 4-3-1, the little finger stays on the root and the index on the 5th, and the
 * ring finger slides a fret up its string to the 4th and back, as a teacher shows it. Taken
 * as 3-4-1 there, both strings changed finger. The same shape at every fret: E♭ x-6-5-3-x-x to
 * E♭sus4 x-6-6-3-x-x, and the sus2 under its root a string lower.
 *
 * `splitOptions` never offers it, since on one fret it gives the lower-pitched string the
 * lower finger; so it is a second fingering (`needs`), priced at the margin (`TAUGHT_MARGIN`),
 * for TWO fingers that stay (`FingerOption.hold`, counted by `heldFingers`), as D's 4-3-1
 * keeps the little finger and the index. Which two is not checked; the sweep finds no
 * same-root neighbour that holds two without the little finger. One held note does
 * not buy it, nor a chord on another root (`FingerOption.sameRoot`): it is the suspension's
 * hand, the chord's with one finger moved.
 */
const crossedOptions = (first: FingerOption, cost: number): FingerOption[] => {
    const { fr, p } = first;
    const ring = p.indexOf(3);
    const little = p.indexOf(4);
    if (
        ring < 0 ||
        little < 0 ||
        !p.includes(1) ||
        p.includes(null) ||
        fr[ring].fret !== fr[little].fret ||
        fr[ring].string !== fr[little].string + 1
    ) {
        return [];
    }
    const swapped = p.map((f) => (f === 3 ? 4 : f === 4 ? 3 : f));
    return [{ ...first, p: swapped, cost, hold: 2, sameRoot: true }];
};

/**
 * A hand in position: every fingertip on the fret of its own number or a fret back from it,
 * counted from where the hand sits (the index's fret, or the fret its lowest finger leaves
 * for it), none ahead. Two fingers may cross on one fret, as in the open A's 2-1-3, on
 * neighbouring strings or not (F♯m7♭5 2-0-2-x-1-x as 3-0-2-1 beside the C top, #1835).
 */
const inHand = (o: FingerOption): boolean => {
    const lowest = lowestFinger(o);
    if (lowest < 0) {
        return false;
    }
    // The fret under the index, used or not.
    const first = o.fr[lowest].fret - ((o.p[lowest] as number) - 1);
    return o.p.every((f, i) => {
        const back = f === null ? 0 : first + f - 1 - o.fr[i].fret;
        return back >= 0 && back <= 1;
    });
};

/**
 * The fingerings that keep a drilled open chord's book fingering under the hand (#1835): a
 * guitar grip beside an open chord a method drills (`drilledChord`, fingered from the nut),
 * fingered so that two of that chord's fingers stay where they are, a fingertip each and the
 * hand in position (`inHand`), and no idle index over a stretch or under a tucked little
 * finger. Every method fingers open C x-3-2-0-1-0 as 3-2-(0)-1, adds the little finger for
 * C7 and lifts the index for Cmaj7, so beside C x-3-2-0-x-x (3-2) the chord with C's notes on
 * the A and D strings keeps the ring and middle finger there: C7 x-3-2-3-x-x and Cmaj7
 * x-3-2-4-x-x are 3-2-4, the little finger added (their own fingering, 2-1-3, has the root
 * under the middle finger and the hand a fret up the neck), and Am x-3-2-2-x-x is 3-2-1, C
 * with the index added on the G string, the middle and index crossed on one fret as in the
 * open A's 2-1-3. Neither is a fingering `splitOptions` makes or `taughtAmong` takes (3-2-4
 * puts a shell's root under the ring finger), so before #1835 the plan kept both fingers by
 * moving C instead, to 2-1, both fingertips a fret past their own: the chord the student
 * learned is the one that should not move.
 *
 * A second fingering (`needs`) for TWO fingers that stay (`FingerOption.hold`), priced at the
 * margin (`TAUGHT_MARGIN`), and taken only beside the drilled chord in its book fingering
 * (`FingerOption.adapts`, `FingerOption.drilled`): beside anything else these hands are the
 * holds #1617 and #1683 ruled out (B♭ x-5-3-3-x-x 4-2-3 after Dm). Alone, Am x-3-2-2-x-x
 * is still the barre 2-1-1, and C7 and Cmaj7 2-1-3.
 *
 * And the drilled chord no longer offers its hand a fret up (`taughtStrummed`: C as 2-1, both
 * fingertips past their own frets, which no method teaches). Measured over 3,120
 * progressions × 15 setups, every chord that shared both of 2-1's fingers is offered one of
 * these: kept for a neighbour that could not adapt, 2-1 was taken in none of the 24 sweep
 * lines that had it, and the sweep is the same without it.
 */
const adaptOptions = (first: FingerOption, taken: Set<string>, cost: number): FingerOption[] => {
    const fr = first.fr;
    if (fr.length < 2 || fr.length > 4 || first.p.includes(null)) {
        return [];
    }
    return perms(fr.length)
        .map((p): FingerOption => ({ p, cost: handCost(fr, p, false), fr }))
        .filter(
            (o) =>
                !taken.has(o.p.join()) &&
                !behindTheNut(o) &&
                inHand(o) &&
                !idleIndexStretches(o) &&
                !idleIndexTucked(o),
        )
        .sort((a, b) => a.cost - b.cost)
        .flatMap((o) => {
            const adapted = {
                ...o,
                cost,
                hold: 2,
                adapts: true,
                own: o.p.map((f, i) => f !== first.p[i]),
            };
            return [
                { ...adapted, needs: 'before' as const },
                { ...adapted, needs: 'after' as const },
            ];
        });
};

/**
 * The crowded fingerings among `every` that `taken` does not already hold: a fingertip each
 * (or the index flat in place), the index not behind the nut, no finger ahead of its fret and
 * no idle index (`crowdedOptions`, `suspensionOptions`).
 */
const crowded = (every: FingerOption[], taken: Set<string>): FingerOption[] =>
    every.filter(
        (o) =>
            !o.p.includes(null) &&
            !taken.has(o.p.join()) &&
            (!barringFinger(o) || indexBarreInPlace(o)) &&
            !behindTheNut(o) &&
            !aheadOfItsFret(o, false) &&
            !idleIndexStretches(o) &&
            !idleIndexTucked(o),
    );

/**
 * The crowded fingerings a guitar SHELL is offered beside its own suspension (#1825): the
 * dominant 7th beside its 7sus4 on one root, the 4th a fret above the 3rd on the same string.
 * On the R–3–♭7 shapes (A7 5-4-5-x-x-x, D7 x-5-4-5-x-x, G7 x-x-5-4-6-x) the 7sus4 lays the
 * 4th level with the root and the ♭7, and its cheapest fingering, 1-2-3, has the root under
 * the index, where the 7th's 3rd, a fret lower, needs the index under it. So `A7sus4 A7`
 * re-fingered the root (1-2-3 into 2-1-3). A teacher keeps the root and the ♭7 down: A7sus4
 * 2-3-4, a taught fingering already (0.6 dearer), then A7 2-1-4, the index dropping in for the
 * 3rd while the ring finger lifts off the 4th. That A7 is 3.2 dearer than its cheapest, a
 * fret of crowding `handCost` reads as a stretch, so `taughtAmong` never offers it.
 *
 * So these are second fingerings that need TWO fingers to stay (`FingerOption.hold`), as a
 * strummed grip's crowded fingerings do (`crowdedOptions`), priced at the margin
 * (`TAUGHT_MARGIN`), and taken only beside the suspension (`FingerOption.resolves`,
 * `suspends`). Two things differ from a strummed grip's:
 *
 * - The neighbour may be in any fingering it takes freely (`arrives`), not only its default:
 *   the 7sus4's default cannot keep the root under the finger the 7th needs there, and its
 *   2-3-4 is not a second fingering but one a held note may choose. Two fingerings that
 *   each wait on the other (`needs`) still do not justify each other.
 * - Only the 4th and the 3rd: the two grips share every other note and differ in one note
 *   each, on one string. A 6, a m7 or a maj7 beside its 7 differs the same way and is not
 *   asked: offered, A7 x-x-7-6-8-x took 3-2-4 into Am7 3-1-4, the root on the ring finger
 *   (`taughtAmong`'s root-first rule, which a crowded fingering does not pass through), A7
 *   and Amaj7 x-x-7-x-9-9 1-3-4 with the middle finger idle, and F♯6 2-x-1-3-x-x 2-1-4 into
 *   F♯7 2-3-4, both crowded, which no teacher was asked about. Nor is a triad: #1617 and
 *   #1683 ruled the strummed cases (B♭ x-5-3-3-x-x 4-2-3 after Dm; D x-x-4-2-3-x 4-1-3 into
 *   Dm), and this rule reaches only shells.
 *
 * Offered to every guitar shell with a 3rd or a 4th, both ways round, so the plan decides
 * which side moves; on the shapes whose cheapest fingerings already keep both fingers (G7sus4
 * 3-x-3-5-x-x to G7 3-x-3-4-x-x, 1-2-3 both) none is taken.
 */
const suspensionOptions = (
    notes: Note[],
    opts: FingerOpts,
    taught: FingerOption[],
    cost: number,
): FingerOption[] => {
    const first = taught[0];
    const fr = first.fr;
    if (fr.length < 2 || !fr.some((n) => n.degree === '3' || n.degree === '4')) {
        return [];
    }
    return crowded(everyFingering(notes, fr, opts), new Set(taught.map((o) => o.p.join())))
        .map((o) => ({
            ...o,
            cost,
            hold: 2,
            resolves: true,
            own: o.p.map((f, i) => f !== first.p[i]),
        }))
        .flatMap((o) => [
            { ...o, needs: 'before' as const },
            { ...o, needs: 'after' as const },
        ]);
};

/**
 * How many of its fingers a ukulele chord's marked fingering needs the chord beside it to
 * hold (`FingerOption.hold`, #1681, #1677): as many as it moves off the default, up to two.
 * One held finger used to be reason enough, and it dragged the others a fret behind their
 * place: E7 1-2-0-2 after Dm played 2-3-0-4 for the one finger, G7 0-2-1-2 after Fm 0-3-2-4.
 * Those move three fingers and need two to stay. A fingering that moves ONE finger is that
 * finger staying where it is and nothing else: Fm 1-0-1-3 as 1-2-3 after C, the ring finger
 * left on the A string and the index and middle where the book puts them, so the ring finger
 * never leaves through C, Fm, C. A one-finger chord's other finger is the same case.
 */
const holdFor = (o: FingerOption): number =>
    Math.min(2, new Set(o.p.filter((_, i) => o.own?.[i])).size);

/**
 * A grip of two or more fretted notes held by the ring and little finger alone, the index and
 * middle finger both idle (#1811): fingertips (3-4) or either one laid flat (a ring or little
 * finger barre, 3-3 or 4-4, which the ukulele's barre rules already keep off its own). On a ukulele it is never a fingering a teacher shows, even
 * for fingers left down: the two weakest fingers, the least independent of the hand, fret the
 * whole chord while the two strong ones hang over nothing, and in first position the hand sits
 * with the index behind the nut. Lifting a finger to leave the middle and ring is a lift a
 * teacher shows (Dm 2-2-1-0 to Dsus2 2-2-0-0 keeps 2-3, Fm 1-0-1-3 to Fsus2 0-0-1-3 keeps 2-4),
 * and so is the ring finger alone on a one-finger chord (Cmaj7 0-0-0-2 after G7); the ring and
 * little finger left together are not. Dsus4 2-2-3-0 as 2-3-4 into G5 0-2-3-x was 3-4, Ddim7
 * 1-2-1-2 into Em7 0-2-0-2 3-4, and both are the book's index and middle (or the middle and
 * ring, lifted from a grip that has them there). The guitar is not asked: at the nut a finger
 * takes the fret of its own number, so its Csus4 x-3-3-0-x-x IS 3-4 (`aheadOfItsFret`).
 */
const weakFingersAlone = (o: FingerOption): boolean =>
    o.p.length > 1 && o.p.every((f) => f !== null && f >= 3);

/**
 * The taught ones among a strummed grip's fingerings (a triad, a power chord), the default
 * first. Three rules choose them, and a table overrules the rules for a few ukulele chords:
 *
 * - No dearer than the cheapest by more than `TAUGHT_MARGIN`, as for a shell: no stretch the
 *   cheapest does not have (B♭ x-5-3-3-x-x is the barre 3-1-1, never 4-2-3; the ukulele's B
 *   4-3-2-2 is 3-2-1-1, never 4-3-1-2), and no idle index over a stretch, nor on a guitar
 *   under a little finger tucked inside the grip (`idleIndexTucked`, #1691: the D shape is
 *   never 2-4-3).
 * - No ring finger laid flat a fret above the index (`crampedBarre`), nor on a guitar three
 *   above it (`stretchedBarre`, #1819).
 * - Where the cheapest lays the ring or little finger flat, the fingering with a fingertip per
 *   note in position is taught beside it (`inPosition`): the power chord's 1-3-4 beside 1-3-3,
 *   the A shape's 3-4-1 beside 3-3-1, the ukulele's E♭m 3-3-2-1 as 3-4-2-1. Teachers show
 *   both; the plan takes the second to keep a note held.
 *
 * And as for a shell, the index behind the nut (`behindTheNut`) is only ever fingers left
 * where they were (`needs: 'left'`): the ukulele's A 2-1-0-0 is 2-1 and F 2-0-1-0 is 2-1.
 *
 * The DEFAULT is the cheapest of those, but for two things (#1677), and whichever it is, it
 * is priced as the cheapest, so the plan reaches for it cold. A grip fingered from the nut
 * (`fingeredFromTheNut`) takes the cheapest with no fingertip ahead of its fret
 * (`aheadOfItsFret`): the guitar's C x-3-2-0-x-x is 3-2 and Em x-2-2-0-x-x 2-3. The
 * fingerings that rule passes over are still taught (Em as 1-2) but only as second
 * fingerings, taken to keep a finger on the chord before or after (`needs`): Em as 1-2 into
 * C, the middle finger staying. Each needs a finger to stay for every fingertip it has off
 * its own fret (`offItsFret`, #1683), and so do that grip's fingers left down. But a drilled
 * open chord never takes the hand a whole fret up, both fingertips past their own (C as 2-1,
 * #1835): the chord beside it adapts instead (`adaptOptions`: Am x-3-2-2-x-x as 3-2-1, C7
 * x-3-2-3-x-x as 3-2-4). A guitar grip whose book
 * fingering the nut rule misses takes the book's (`GUITAR_BOOK`, #1691: D5 x-x-0-2-3-x and
 * Dsus2 x-x-x-2-3-0 are 1-3), the rule's own a second fingering for one finger that stays,
 * and the book's second fingerings are offered beside it (#1834: A x-x-x-2-2-0 is 2-3, and
 * 1-3 beside D, never 1-2).
 * And a ukulele grip's default is `ukuleleDefault`'s. A guitar grip
 * up the neck keeps the cheapest: its review found nothing to correct there, and the dim
 * triad x-x-5-3-5-x stays 2-1-3, root first like the minor 7th whose hand it shares.
 *
 * A grip in the table (`bookFingerings`) takes the table's fingerings and its first as the
 * default. Its others are book fingerings too, and one finger that stays is enough to take
 * one (E♭ 0-3-3-1 as the barre after F7; Cm 0-3-3-3 as 1-2-3 after C). What the rules would
 * have offered is still there for fingers already down: the index on the 1st fret of Fm
 * 1-0-1-3 stays for a chord that leaves it there.
 *
 * A ukulele chord (`FingerOpts.ukulele`, #1681) asks more before it leaves its default. On a
 * guitar one held note is reason enough to take a second taught fingering here, and the chart
 * then holds the grip to one fingering for the song unless the second keeps two fingers
 * (`unifyFingerings`, #1836). In first position
 * on a ukulele each chord has the one fingering its chart prints, so there a fingering other
 * than the default — a second one, or fingers left down (`needs: 'left'`) — is taken only
 * beside a chord that holds enough of its fingers (`holdFor`, `FingerOption.hold`,
 * `heldFingers`): G7 after Dm7♭5 1-2-1-3 keeps the middle and ring finger and is 0-3-2-4, Em
 * 0-4-3-2 beside G keeps two and is 4-3-2. A fingering of one finger needs only that one
 * (Cmaj7 0-0-0-2 under the ring finger G7 leaves there).
 *
 * A guitar grip is also offered the fingerings that crowd the hand to keep two fingers down
 * (`crowdedOptions`, #1683): a finger lifted, or a suspension's finger added beside its own
 * chord (Dsus4 x-x-x-2-3-3 as 1-3-4 beside D); and its ring and little finger crossed on one
 * fret beside its own chord (`crossedOptions`, #1819: Dsus4 x-5-5-2-x-x as 4-3-1 beside D).
 */
function taughtStrummed(notes: Note[], all: FingerOption[], opts: FingerOpts): FingerOption[] {
    if (all[0].p.includes(null)) {
        return all;
    }
    const ukulele = opts.ukulele === true;
    const fr = all[0].fr;
    // The cheapest fingering that is not a cramped barre is what the others are measured
    // from. On three strings that is the cheapest of all; on a ukulele's four the cramped
    // barre can undercut every other (A♭m7♭5 1-2-2-2 as 1-2-3-3), and measured from it the
    // fingertip-each fingering players use (1-2-3-4) would be a stretch too far.
    const best = all.find((o) => !crampedBarre(o)) ?? all[0];
    const usual = all.filter(
        (o) =>
            o.cost <= best.cost + TAUGHT_MARGIN &&
            !idleIndexStretches(o) &&
            !(idleIndexTucked(o) && !ukulele) &&
            !(stretchedBarre(o) && !ukulele) &&
            !crampedBarre(o),
    );
    if (barringFinger(best) > 1) {
        // Priced at the margin, the dearest a taught fingering may be: `handCost` reads two
        // fingertips on one fret as a fret of stretch (2.6 here), which no held note would buy.
        usual.push(
            ...all
                .filter((o) => !usual.includes(o) && !barringFinger(o) && inPosition(o))
                .map((o) => ({ ...o, cost: best.cost + TAUGHT_MARGIN })),
        );
    }
    const book = ukulele ? bookFingerings(notes) : null;
    // A book fingering the costs put out of reach (Cm 0-3-3-3 as 1-2-3) is looked up among
    // every fingering the grip can be held with.
    const every = book ? everyFingering(notes, fr, opts) : [];
    const printed = book
        ?.map((b) => every.find((o) => spelled(notes, o) === b))
        .filter((o): o is FingerOption => o !== undefined);
    let free: FingerOption[];
    // Taught, but with the hand off the nut: second fingerings.
    let ahead: FingerOption[] = [];
    // What a guitar grip's `GUITAR_BOOK` row says it never takes.
    let never = new Set<string>();
    const fromTheNut = !printed?.length && fingeredFromTheNut(notes, fr, ukulele);
    if (printed?.length) {
        // A choice of fingers apart (0.2 a finger-step), in the order the table gives them.
        free = printed.map((o, i) => ({ ...o, cost: best.cost + i * 0.4 }));
    } else {
        free = usual.filter((o) => !behindTheNut(o));
        if (!free.length) {
            free = [best];
        }
        if (fromTheNut) {
            const atTheNut = free.filter((o) => !aheadOfItsFret(o, true));
            if (atTheNut.length) {
                ahead = free.filter((o) => !atTheNut.includes(o));
                free = atTheNut;
            }
        }
        // A guitar grip at the nut whose book fingering the nut rule misses (`GUITAR_BOOK`):
        // the book's first is the default, its others second fingerings counted against the
        // chord beside them (`FingerOption.nut`), and what the rule chose waits for a finger
        // that stays, but for what the book never takes.
        const book =
            !ukulele && fromTheNut ? guitarBook(fr, everyFingering(notes, fr, opts)) : null;
        if (book) {
            const [own, ...also] = book.taught;
            const listed = new Set(book.taught.map((o) => o.p.join()));
            never = book.never;
            ahead = [
                ...also.map((o) => ({
                    ...o,
                    cost: Math.min(o.cost, best.cost + TAUGHT_MARGIN),
                    nut: true,
                })),
                ...[...free, ...ahead].filter(
                    (o) => !listed.has(o.p.join()) && !never.has(o.p.join()),
                ),
            ];
            free = [own];
        }
        const chosen = ukulele ? ukuleleDefault(notes, free) : free[0];
        free = [{ ...chosen, cost: best.cost }, ...free.filter((o) => o !== chosen)];
    }
    const first = free[0];
    const mark = (o: FingerOption, needs?: 'left'): FingerOption => ({
        ...o,
        own: o.p.map((f, i) => f !== first.p[i]),
        ...(needs ? { needs } : {}),
    });
    const beside = (second: FingerOption[]): FingerOption[] => [
        ...second.map((o) => ({ ...mark(o), needs: 'before' as const })),
        ...second.map((o) => ({ ...mark(o), needs: 'after' as const })),
    ];
    const taken = new Set([...free, ...ahead].map((o) => o.p.join()));
    const left = usual
        .filter((o) => !taken.has(o.p.join()) && !never.has(o.p.join()))
        .map((o) => mark(o, 'left'));
    if (!ukulele) {
        // The hand off the nut, for fingers enough that stay (`offItsFret`), counted against
        // the chord beside it unless this is an open chord every method drills (`drilledChord`)
        // and the fingering is not one its book prints (A's 1-3 beside D keeps the index on
        // its note and slides the ring finger a fret, the hand where D has it, #1834).
        const drilled = drilledChord(notes);
        const drilledOpen = fromTheNut && drilled;
        const held = (o: FingerOption): FingerOption =>
            fromTheNut
                ? { ...o, hold: offItsFret(o), ...(drilled && !o.nut ? {} : { nut: true }) }
                : o;
        // Never a drilled chord with the hand a fret up the neck, both fingertips past their
        // own frets (C as 2-1): the chord beside it keeps the book's fingers instead
        // (`adaptOptions`, #1835). One fingertip off is a book fingering of its own (Em
        // x 2 2 0 x x as 1-2), and stays a second fingering.
        const offBook = (o: FingerOption): boolean => drilledOpen && !o.nut && offItsFret(o) === 2;
        // Built from `ahead` BEFORE `offBook` filters it, so `adaptOptions` never offers the
        // drilled chord's own off-the-book hand (C 2-1) back as an adapting neighbour's.
        const taughtHere = new Set([
            ...[...usual, ...free, ...ahead].map((o) => o.p.join()),
            ...never,
        ]);
        const crowded = crowdedOptions(
            everyFingering(notes, fr, opts),
            taughtHere,
            best.cost + TAUGHT_MARGIN,
        );
        const [own, ...rest] = free.map((o) => mark(o));
        return [
            drilledOpen ? { ...own, drilled: true, ...(opts.book ? { book: true } : {}) } : own,
            ...rest,
            ...beside(ahead.filter((o) => !offBook(o))).map(held),
            ...left.map(held),
            ...beside(crowded),
            ...beside(crossedOptions(first, best.cost + TAUGHT_MARGIN)),
            // A book chord keeps the book's fingers: it is what the chord beside it adapts to.
            ...(opts.book
                ? []
                : adaptOptions(
                      first,
                      new Set([...taughtHere, ...crowded.map((o) => o.p.join())]),
                      best.cost + TAUGHT_MARGIN,
                  )),
        ];
    }
    // A second fingering is offered once for the chord before and once for the chord after,
    // as a shell's is (`taughtAmong`). A one-finger chord's other fingers are fingers left
    // down, as they were when C and Am were rows of the table. None is the ring and little
    // finger alone (`weakFingersAlone`), however many fingers it keeps.
    const second = beside(free.slice(1));
    const marked = [...second, ...ahead.map((o) => mark(o, 'left')), ...left].filter(
        (o) => !weakFingersAlone(o),
    );
    return [
        mark(first),
        ...marked.map((o) => ({
            ...o,
            hold: printed?.length && second.includes(o) ? 1 : holdFor(o),
        })),
    ];
}

/**
 * The fingerings the chart plan may give a grip: the ones it is taught with, so across a chart
 * a held note only ever chooses between two fingerings a teacher would show. A guitar shell's
 * are `taughtAmong` (#1611); a triad's, a power chord's or a ukulele chord's (`barre`) are
 * `taughtStrummed` (#1617, #1681, #1677), and a guitar shell is also offered the crowded
 * fingerings that keep its hand beside its own suspension (`suspensionOptions`, #1825).
 * The first is the grip's default, unmarked: what it takes alone (`assignFingers`).
 */
export function taughtOptions(notes: Note[], opts: FingerOpts = {}): FingerOption[] {
    const all = fingerOptions(notes, opts);
    if (opts.barre) {
        return taughtStrummed(notes, all, opts);
    }
    const taught = taughtAmong(all, fingeredFromTheNut(notes, all[0].fr, false));
    const margin = all[0].cost + TAUGHT_MARGIN;
    return [
        ...taught,
        ...suspensionOptions(notes, opts, taught, margin),
        ...adaptOptions(taught[0], new Set(taught.map((o) => o.p.join())), margin),
    ];
}

/**
 * Finger one grip by itself: its default taught fingering. For most grips that is the
 * cheapest (`fingerOptions`); `taughtAmong` and `taughtStrummed` say where it is not.
 */
export const assignFingers = (notes: Note[], opts: FingerOpts = {}): void =>
    applyFingers(notes, taughtOptions(notes, opts)[0]);

/** A finger laid flat across a run of strings at one fret; `strings` is [lowest, highest] string number. */
export interface Barre {
    finger: number;
    fret: number;
    strings: [number, number];
}

/** Notes grouped by the finger `fingerOf` gives each (an unfingered note is left out). */
function byFinger(
    notes: Note[],
    fingerOf: (n: Note, i: number) => number | null,
): Record<number, Note[]> {
    const m: Record<number, Note[]> = {};
    notes.forEach((n, i) => {
        const f = fingerOf(n, i);
        if (f) {
            const held = m[f];
            if (held) {
                held.push(n);
            } else {
                m[f] = [n];
            }
        }
    });
    return m;
}

/** Finger number -> every note it holds (two or more for a barre). */
export const fingerNotes = (notes: Note[]): Record<number, Note[]> =>
    byFinger(notes, (n) => n.finger);

/** The barres in a fingered grip: each finger that holds more than one note. */
export function barres(notes: Note[]): Barre[] {
    return Object.entries(fingerNotes(notes))
        .filter(([, held]) => held.length > 1)
        .map(([finger, held]) => {
            const strings = held.map((n) => n.string);
            return {
                finger: Number(finger),
                fret: held[0].fret,
                strings: [Math.min(...strings), Math.max(...strings)],
            };
        });
}

/**
 * Finger -> the note that stands for it: the one it holds, or for a barre the note on its
 * lowest-pitched string (the highest string number), where the finger's tip sits.
 */
function leads(held: Record<number, Note[]>): Record<number, Note> {
    const m: Record<number, Note> = {};
    for (const [f, ns] of Object.entries(held)) {
        m[Number(f)] = ns.reduce((a, b) => (b.string > a.string ? b : a));
    }
    return m;
}

/** Finger number -> the note it holds; for a barre, its note on the lowest-pitched string. */
export const fingerMap = (notes: Note[]): Record<number, Note> => leads(fingerNotes(notes));

/**
 * What re-fingering a note two chords share costs the plan. More than any taught fingering
 * the plan may take freely is dearer than its grip's default (`TAUGHT_MARGIN`), so one held
 * note is always worth a second fingering; `BARRE_COST` is set against it.
 */
const REFINGER_COST = 2.5;

/**
 * Cost of changing from one fingering to the next: `REFINGER_COST` for every note the two
 * chords share (same string, same fret) that changes finger. Nothing else.
 *
 * It used to charge travel as well (#1617): a finger used in both chords for the distance it
 * moved, 0.5 and up, and one used in only one of them a flat 0.3. So the plan preferred
 * whichever fingers were idle, and one grip took two taught fingerings in a chart with no
 * held note between them (Autumn Leaves in G minor: Gm7 3-x-3-3-x-x as 1-2-3, then 2-3-4; a
 * blues in B♭: B♭7 x-1-x-1-3-x as 1-2-3, then 1-2-4). Capping a finger's travel at a lift
 * and a place (0.6) removed most of that and left the fingerings that differ in how many
 * fingers they use, a barre against a fingertip each, still chosen by the count. Travel
 * between two grips is the same hand moving whichever fingers it is given, and it never
 * bought a hold: with the term gone a grip takes its default fingering unless a held note
 * says otherwise, and as many notes stay held (measured over 5,760 charts: 12 fewer in
 * 24,645).
 */
export function fingerTransCost(a: FingerOption, b: FingerOption): number {
    let c = 0;
    a.fr.forEach((x, i) =>
        b.fr.forEach((y, j) => {
            if (x.string === y.string && x.fret === y.fret && a.p[i] !== b.p[j]) {
                c += REFINGER_COST;
            }
        }),
    );
    return c;
}

/**
 * Whether a fingering taken only beside a chord that shares its fingers (`FingerOption.needs`)
 * has that chord in `other`: no note the two share changes finger, and one of them is a note
 * the marked fingering holds with a finger of its own (`FingerOption.own`).
 *
 * `inPlace` asks more, for fingers said to be left where they were: no STRING the two chords
 * both fret changes finger either. A finger may stay or slide along its string; it is not
 * swapped for another. The ukulele's G♯m7 1-3-2-2 (1-4-2-3) to Emaj7 1-3-0-2 shares three
 * notes, and 2-4-0-3 would keep two of them with the middle finger where the index was; B7
 * 2-3-2-2 (1-4-2-3) to the same Emaj7 would send the middle finger across to the string the
 * index is on, a fret below it. Neither is the hand staying put, and Emaj7 is 1-3-0-2.
 */
function sharesTheHand(marked: FingerOption, other: FingerOption, inPlace: boolean): boolean {
    let earned = false;
    for (let i = 0; i < marked.fr.length; i++) {
        for (let j = 0; j < other.fr.length; j++) {
            const x = marked.fr[i],
                y = other.fr[j];
            if (x.string !== y.string) {
                continue;
            }
            const sameNote = x.fret === y.fret;
            if (marked.p[i] !== other.p[j]) {
                if (sameNote || inPlace) {
                    return false;
                }
            } else if (sameNote) {
                earned ||= marked.own?.[i] ?? true;
            }
        }
    }
    return earned;
}

/**
 * How many of `marked`'s fingers `other` has down already: on a note the two chords share
 * (same string, same fret), under the same finger. A barre that stays is one finger.
 */
function heldFingers(marked: FingerOption, other: FingerOption): number {
    const held = new Set<number>();
    marked.fr.forEach((x, i) => {
        const j = other.fr.findIndex((y) => y.string === x.string && y.fret === x.fret);
        const finger = marked.p[i];
        if (j >= 0 && finger !== null && other.p[j] === finger) {
            held.add(finger);
        }
    });
    return held.size;
}

/**
 * A major or minor triad: every note the root, a 3rd or the 5th, and a 3rd among them. At the
 * nut these are the open chords a method drills first (C x-3-2-0-1-0, A, Am, Em, E, D), and
 * their fingering is the one the student learned, kept beside any chord but one that leaves
 * two of its fingers down (`offItsFret`, #1683: C beside F is 3-2), and never left for the
 * hand a fret up: the chord beside it adapts to it (`adaptOptions`, #1835). The
 * sus, dim, aug and power grips and the open shells are not drilled that way; a player
 * fingers them from the chord beside them (`nutHoldKept`, #1691). One exception: a
 * `GUITAR_BOOK` row's second fingering is counted that way too (#1834, A as 1-3 beside D).
 */
const drilledChord = (notes: Note[]): boolean =>
    notes.every(
        (n) => n.degree === 'R' || n.degree === '3' || n.degree === 'b3' || n.degree === '5',
    ) && notes.some((n) => n.degree === '3' || n.degree === 'b3');

/**
 * Whether the chord beside a guitar grip fingered from the nut keeps enough of the hand for
 * one of its fingerings off the nut (`FingerOption.nut`, #1691). `offItsFret` asks a finger
 * that stays for each fingertip off the fret of its own number, because one held finger used
 * to drag the rest of the hand off its frets. Where the neighbour already has the hand there,
 * nothing is dragged, and two things say so:
 *
 * - The index stays on its note: the hand is in the index's position, not at the nut, and the
 *   fingertips are counted from there. C5 x-3-5-5-x-x (1-3-3) to Csus4 x-3-3-0-x-x keeps the
 *   index on C in 3rd position, and Csus4 is 1-2 with the middle finger beside it, a fret
 *   back from its own: one fingertip off, and one finger kept. It was 3-4, the index lifted
 *   off the C it shares.
 * - A finger slides a fret along its string, the same finger in both chords: it keeps its
 *   string and its place in the hand, and counts as one that stays. E x-2-2-1-x-x (2-3-1) to
 *   E° x-1-2-0-x-x keeps the ring finger on E while the middle slides from B to B♭: 2-3, where
 *   it was 1-2 and both notes changed finger.
 *
 * A finger that changes string is still a change: C x-3-2-0-x-x beside F x-3-3-2-x-x keeps the
 * middle finger on C, but 2-1 sends the index from the 3rd string to the 4th, and C stays 3-2
 * (#1683).
 */
function nutHoldKept(marked: FingerOption, other: FingerOption): boolean {
    // The fingers kept, each once: a barre that stays or slides is one finger, as in
    // `heldFingers`.
    const kept = new Set<number>();
    let indexKept = false;
    marked.fr.forEach((x, i) => {
        const finger = marked.p[i];
        const j = other.fr.findIndex((y) => y.string === x.string);
        if (j < 0 || finger === null || other.p[j] !== finger) {
            return;
        }
        if (other.fr[j].fret === x.fret) {
            kept.add(finger);
            indexKept ||= finger === 1;
        } else if (Math.abs(other.fr[j].fret - x.fret) === 1) {
            kept.add(finger);
        }
    });
    const index = marked.p.indexOf(1);
    // Counted from the index's fret where it stays, from the nut where it does not.
    const asked = indexKept
        ? Math.min(
              2,
              marked.p.filter(
                  (f, i) =>
                      f !== null && f !== 1 && marked.fr[i].fret !== marked.fr[index].fret + f - 1,
              ).length,
          )
        : (marked.hold ?? 0);
    return kept.size >= asked;
}

/** Whether `other` holds as many of a marked fingering's fingers as it asks (`FingerOption.hold`). */
const holdsEnough = (marked: FingerOption, other: FingerOption): boolean =>
    marked.nut ? nutHoldKept(marked, other) : heldFingers(marked, other) >= (marked.hold ?? 0);

/**
 * Whether two grips are one chord with a note changed: every note they share (same string,
 * same fret) is the same degree in both, so they stand on one root. D and Dsus4 keep the root
 * and the 5th; Dm and B♭ share two notes, each with a new job.
 */
const onOneRoot = (a: FingerOption, b: FingerOption): boolean =>
    a.fr.every((x) =>
        b.fr.every((y) => x.string !== y.string || x.fret !== y.fret || x.degree === y.degree),
    );

/**
 * Whether two grips are one chord with its 3rd suspended (#1825): they share every fretted note
 * but one each, and those two are the 3rd in one and the 4th in the other, on the same string.
 * A7 5-4-5-x-x-x and A7sus4 5-5-5-x-x-x; not A7 and Amaj7, A6 or Am7, whose other note is a
 * fret along its string too, nor a sus4 on another string set. Sharing the rest, the two stand
 * on one root and the 4th sits a fret above the 3rd, so neither is asked (measured: asking
 * either moved no chart).
 */
const suspends = (a: FingerOption, b: FingerOption): boolean => {
    const own = (x: FingerOption, y: FingerOption) =>
        x.fr.filter((n) => !y.fr.some((m) => m.string === n.string && m.fret === n.fret));
    const [p, q] = [own(a, b), own(b, a)];
    return (
        p.length === 1 &&
        q.length === 1 &&
        p[0].string === q[0].string &&
        [p[0].degree, q[0].degree].sort().join() === '3,4'
    );
};

/**
 * Whether a marked fingering has what it asks of the chord beside it: its fingers shared
 * (`sharesTheHand`), enough of them held (`holdsEnough`), for a crowded one the same chord
 * (`FingerOption.sameRoot`), for a crowded shell its suspension (`FingerOption.resolves`), and
 * for one that keeps a drilled open chord's fingers that chord in its book fingering
 * (`FingerOption.adapts`, `FingerOption.drilled`, #1835).
 */
const keptBy = (marked: FingerOption, other: FingerOption, inPlace: boolean): boolean =>
    sharesTheHand(marked, other, inPlace) &&
    holdsEnough(marked, other) &&
    (!marked.sameRoot || onOneRoot(marked, other)) &&
    (!marked.resolves || suspends(marked, other)) &&
    (!marked.adapts || (other.drilled === true && (!other.book || onOneRoot(marked, other)))) &&
    // Fingers left down from a book chord (#1849) are two of them on its own root (E+
    // x-3-2-1-x-x 4-3-1 after E), never another chord's hand bent to fit (F x-x-3-2-1-x 4-3-1
    // after Am) nor one finger kept with the index idle (A° x-3-1-2-x-x 4-2-3 after Am).
    (marked.needs !== 'left' ||
        !other.book ||
        (onOneRoot(marked, other) && heldFingers(marked, other) >= 2));

/** The same grip under the same fingers: the hand has not moved. */
const sameFingers = (a: FingerOption, b: FingerOption): boolean =>
    a.fr.length === b.fr.length &&
    a.fr.every(
        (n, i) => n.string === b.fr[i].string && n.fret === b.fr[i].fret && a.p[i] === b.p[i],
    );

/** The same grip under the same fingers, waiting on the same neighbour (`FingerOption.needs`). */
const sameHand = (a: FingerOption, b: FingerOption): boolean =>
    a.needs === b.needs && sameFingers(a, b);

/**
 * A chord in its default fingering, the one it takes alone: no finger differs from it
 * (`FingerOption.own`).
 */
const ordinary = (o: FingerOption): boolean => !o.own?.includes(true);

/**
 * Whether the plan may go from `a` to `b` (`a` null at the top of a chart). Always, unless
 * one of them is a marked fingering (`FingerOption.needs`):
 *
 * - `b` marked `'left'` only from a chord that already has its fingers down, in place
 *   (`sharesTheHand`), in any taught fingering: a finger that is down is not lifted;
 * - `b` marked `'before'` only from a chord that shares its fingers, in its ordinary
 *   fingering, and `a` marked `'after'` only to one.
 *
 * And a marked fingering that asks for fingers to stay (`FingerOption.hold`: a ukulele
 * chord's, #1681; a guitar grip's with the hand off the nut or crowded, #1683) only beside a
 * chord that holds that many of them (`keptBy`).
 *
 * The same grip again under the same fingers is no change at all (`sameHand`, #1677): a chart
 * writes a chord once a bar, and a second fingering waits for the next chord that differs. A
 * x-x-x-2-2-0 for two bars and then D keeps the index, as it does for one (A as 1-3, #1834).
 */
function arrives(a: FingerOption | null, b: FingerOption): boolean {
    if (a && sameHand(a, b)) {
        return true;
    }
    if (b.needs === 'left' && !(a && keptBy(b, a, true))) {
        return false;
    }
    if (b.needs === 'before' && !(a && besideIt(b, a) && keptBy(b, a, false))) {
        return false;
    }
    return !(a?.needs === 'after' && !(besideIt(a, b) && keptBy(a, b, false)));
}

/**
 * Whether `other` is fingered as a second fingering's neighbour must be: in its default
 * (`ordinary`), or, beside a crowded shell's (`FingerOption.resolves`, #1825), in any
 * fingering it takes freely (no `needs` of its own).
 */
const besideIt = (marked: FingerOption, other: FingerOption): boolean =>
    ordinary(other) || (marked.resolves === true && !other.needs);

/**
 * How close two ways through a chart may cost and still be a tie: float rounding, not a
 * difference. The prices are sums of tenths (`handCost`, `holeCost`, `REFINGER_COST`), so
 * two ways that differ at all differ by far more than this.
 */
const TIE = 1e-9;

/**
 * The cheapest way through a chart, one option per chord: each option's own cost plus the cost
 * of every change (`fingerTransCost`), so a note two chords share keeps its finger where the
 * options allow. Every chord must hold an unmarked option (`FingerOption.needs`), which the
 * plan can always reach and leave; `taughtAmong` says why each does. A chart cannot end on a
 * fingering still waiting for the chord that takes it over.
 *
 * A fingering's own cost is what it costs to TAKE it, so the same grip again under the same
 * fingers (`sameFingers`) adds nothing (#1683). A chart writes a chord once a bar, and
 * charged by the bar a second fingering's premium grew with the length of the chord until
 * the default won: F x-3-3-2-x-x to Fm x-3-3-1-x-x was 3-4-2 into 3-4-1 a bar each and
 * 2-3-1 into 3-3-1 two bars each. A run of one chord is now planned as one chord.
 *
 * Two ways through that cost the same (`TIE`) go to the one that takes fewer second
 * fingerings (`ordinary`, counted once for a run), so where a held note can be kept on either
 * side of a change the hand re-fingers it LATE, when it moves anyway (#1691): classic guitar
 * 1-6, `Csus4 Csus2 A♭maj7`, Csus2 x-3-0-0-x-x keeps Csus4's ring finger on C, and the index
 * takes the C with the rest of A♭maj7's hand. Taking the index early, a second fingering, put
 * the re-fingering on the lift from Csus4 to Csus2, where nothing else moves.
 *
 * Returns the way and what it costs, `Infinity` when the options leave no way through
 * (`unifyFingerings` holds a grip to one fingering and asks).
 */
function planFingers(options: FingerOption[][]): { path: FingerOption[]; cost: number } {
    // Each way through as [its cost, the second fingerings it takes].
    const better = (v: number, m: number, bv: number, bm: number): boolean =>
        v < bv - TIE || (v <= bv + TIE && m < bm);
    const marks = (o: FingerOption): number => (ordinary(o) ? 0 : 1);
    let cost = options[0].map((o) => (arrives(null, o) ? o.cost : Infinity));
    let second = options[0].map(marks);
    const back: number[][] = [];
    for (let i = 1; i < options.length; i++) {
        const nc: number[] = [],
            nm: number[] = [],
            nb: number[] = [];
        options[i].forEach((b) => {
            let bi = 0,
                bv = Infinity,
                bm = Infinity;
            options[i - 1].forEach((a, j) => {
                if (!arrives(a, b)) {
                    return;
                }
                // The hand that has not moved pays nothing: a run of one grip under the same
                // fingers pays that fingering's own cost once. Carried as it is, not taken off
                // and put back (#1691).
                const same = sameFingers(a, b);
                const v = same ? cost[j] : cost[j] + fingerTransCost(a, b) + b.cost;
                const m = same ? second[j] : second[j] + marks(b);
                if (better(v, m, bv, bm)) {
                    bv = v;
                    bm = m;
                    bi = j;
                }
            });
            nc.push(bv);
            nm.push(bm);
            nb.push(bi);
        });
        cost = nc;
        second = nm;
        back.push(nb);
    }
    const last = options.length - 1;
    let k = -1;
    options[last].forEach((o, j) => {
        // A chart cannot end on a fingering still waiting for the chord after it.
        if (o.needs !== 'after' && (k < 0 || better(cost[j], second[j], cost[k], second[k]))) {
            k = j;
        }
    });
    const total = k < 0 ? Infinity : cost[k];
    k = Math.max(k, 0);
    const out = new Array<FingerOption>(options.length);
    for (let i = last; i >= 0; i--) {
        out[i] = options[i][k];
        if (i > 0) {
            k = back[i - 1][k];
        }
    }
    return { path: out, cost: total };
}

/**
 * How many of `a`'s fingers `b` has on the same strings: on the same note, or a fret along it,
 * the same finger in both. A finger that stays and a finger that slides along its string both
 * keep their place in the hand, as `nutHoldKept` counts them (#1691: E x-2-2-1-x-x to E°
 * x-1-2-0-x-x keeps the ring finger on E and slides the middle from B to B♭). A barre is one
 * finger.
 */
function fingersKept(a: FingerOption, b: FingerOption): number {
    const kept = new Set<number>();
    a.fr.forEach((x, i) => {
        const finger = a.p[i];
        const j = b.fr.findIndex((y) => y.string === x.string);
        if (
            finger !== null &&
            j >= 0 &&
            b.p[j] === finger &&
            Math.abs(b.fr[j].fret - x.fret) <= 1
        ) {
            kept.add(finger);
        }
    });
    return kept.size;
}

/**
 * Whether the fingering at `i` keeps two of its fingers down from the chord before or into the
 * chord after it, the nearest grip on either side that is not this one under these fingers
 * (`sameFingers`: a chord held for several bars is one chord). A grip that frets one note
 * keeps its one finger. It asks for two as the ukulele does (`holdFor`, #1681), but counts
 * every finger that stays, not only the ones the song's fingering would not keep there: `Cm
 * Cdim C` with no window keeps Cm x-x-x-5-4-3 as 4-3-2 into Cdim x-x-x-5-4-2 (4-3-1), two
 * fingers, where the default 3-2-1 keeps one. Counted only beyond what the song's fingering
 * keeps, it was measured and left: the open A beside D went back to 2-3 (its 1-3 keeps the
 * index, and the ring finger slides as 2-3's does, #1834), `Fm F Fm6 Fm` gave up F 3-4-2 into
 * Fm 3-4-1 (#1683), and 53 sweep lines lost two fingers they kept.
 */
function keepsTwo(path: FingerOption[], i: number): boolean {
    const o = path[i];
    const want = Math.min(2, new Set(o.p.filter((f) => f !== null)).size);
    const beside = (step: number): FingerOption | undefined => {
        let j = i + step;
        while (path[j] && sameFingers(path[j], o)) {
            j += step;
        }
        return path[j];
    };
    return [beside(-1), beside(1)].some((n) => n !== undefined && fingersKept(o, n) >= want);
}

/**
 * One fingering per guitar chord per song (#1836). A teacher gives a chord one fingering for the
 * whole song and fingers it a second way only where that clearly pays: where two fingers stay
 * down into the next chord, or come down from the one before. The plan kept a held note at
 * every change it could, so a strummed guitar grip took a second fingering for ONE note and
 * played two in one song: Let It Be's F x-3-3-2-x-x was 2-3-1 after Am and 3-4-2 after G (to
 * keep the ring finger into C), and Ring of Fire's G x-x-5-4-3-x 3-2-1 and 4-3-2. The ukulele
 * has asked for two held fingers since #1681 (`holdFor`).
 *
 * So, after the plan, a grip (`keys`: its strings and frets; `null` for one not asked) that is
 * fingered two ways is re-planned held to its DEFAULT, the fingering it takes alone, whether
 * or not the plan took it, and keeps that wherever it has a way through: a grip leaves its
 * default only for two fingers. Only where it has none (a fingering that waits on a neighbour,
 * `needs`, cannot be held everywhere) does it take the cheapest of the fingerings the plan
 * used, most used first. Then the split stays only if every occurrence fingered another way
 * than that one keeps two fingers (`keepsTwo`): Hallelujah's Am x-3-2-2-x-x is 3-2-1 after C
 * (both of C's fingers kept, #1835) and the barre elsewhere. Let It Be's F is 2-3-1 throughout,
 * La Bamba's (`C F G F`) too, giving up the ring finger kept on C, and Ring of Fire's G
 * 3-2-1. Like `unifyGrips`, which holds a strummed symbol to one grip, one grip is settled at a
 * time, in chart order, and all or nothing: a grip fingered three ways keeps only the split
 * whose every other occurrence keeps two. A grip settled earlier is not judged again when a
 * later one re-plans its neighbour; the test of every chart (`engine.test.ts`) reads the result
 * itself.
 *
 * Asked of no ukulele grip (its rule already is this one, and its charts stay as they are) and
 * no guitar shell, whose fingers a jazz comper chooses afresh for a held note (`taughtAmong`;
 * the blues in B♭'s E♭7 x-x-1-x-2-3 is 1-2-3, and 2-3-4 after F7; the shell characterization
 * pins them), though a shell beside a grip held here may re-finger to keep a note of it. The
 * same rule put on every guitar second fingering (`holdFor` on each, the plan's way) was
 * measured against this one: over 3,120 progressions × 15 setups it moved 3,079 sweep lines
 * and gave up 4,033 held notes, most in charts that already played each chord one way
 * (`D♭ D♭dim D♭`'s D♭dim x-4-2-0-x-x, 4-2 to keep the little finger), where this moves 65,
 * every changed grip but two to its default, and gives up 64.
 */
function unifyFingerings(options: FingerOption[][], keys: Array<string | null>): FingerOption[] {
    const held = new Map<string, string>();
    const decided = new Set<string>();
    const holding = () =>
        options.map((step, i) => {
            const key = keys[i];
            const fingers = key === null ? undefined : held.get(key);
            return fingers === undefined ? step : step.filter((o) => o.p.join() === fingers);
        });
    let best = planFingers(options);
    for (;;) {
        // The fingerings each undecided grip takes, and how often, in chart order.
        const used = new Map<string, Map<string, number>>();
        best.path.forEach((o, i) => {
            const key = keys[i];
            if (key === null || decided.has(key)) {
                return;
            }
            const fingerings = used.get(key) ?? new Map<string, number>();
            fingerings.set(o.p.join(), (fingerings.get(o.p.join()) ?? 0) + 1);
            used.set(key, fingerings);
        });
        const split = [...used].find(([, fingerings]) => fingerings.size > 1);
        if (!split) {
            return best.path;
        }
        const [key, fingerings] = split;
        decided.add(key);
        // The grip's default first (what it takes alone), taken if it has a way through.
        const own = options[keys.indexOf(key)][0].p.join();
        const order = [
            own,
            ...[...fingerings]
                .sort((x, y) => y[1] - x[1])
                .map(([f]) => f)
                .filter((f) => f !== own),
        ];
        let pick: { path: FingerOption[]; cost: number; fingers: string } | null = null;
        for (const fingers of order) {
            held.set(key, fingers);
            const tried = planFingers(holding());
            if (tried.cost === Infinity) {
                continue;
            }
            if (fingers === own) {
                pick = { ...tried, fingers };
                break;
            }
            if (!pick || tried.cost < pick.cost - TIE) {
                pick = { ...tried, fingers };
            }
        }
        if (pick === null) {
            held.delete(key);
            continue;
        }
        const main = pick.fingers;
        const earned = best.path.every(
            (o, i) => keys[i] !== key || o.p.join() === main || keepsTwo(best.path, i),
        );
        if (earned) {
            held.delete(key);
        } else {
            held.set(key, main);
            best = pick;
        }
    }
}

/**
 * Plan fingers across a sequence of voicings (mutates each voicing's notes). Each carries what
 * its fingering may use (`FingerOpts`): `barre` for triad and power grips and for every
 * ukulele chord (`ukulele`), `rootBarre` for a guitar shell.
 *
 * Every grip is planned from the fingerings it is taught with (`taughtOptions`: `taughtAmong`
 * for a guitar shell, `taughtStrummed` for triad and power grips and every ukulele chord), in
 * one pass, so a held note never costs a stretch, a buried root or a cramped barre, no finger
 * is newly placed with the index behind the nut, and a ukulele chord leaves its default only
 * for fingers enough that stay (`holdFor`), as a guitar's open grip leaves the nut
 * (`offItsFret`) and any guitar grip crowds the hand (`crowdedOptions`). Then a guitar triad or
 * power grip fingered two ways is held to one, unless the second keeps two fingers
 * (`unifyFingerings`, #1836).
 */
export function fingerSequence(chords: Array<{ notes: Note[] } & FingerOpts>): void {
    if (!chords.length) {
        return;
    }
    const options = chords.map((b) =>
        taughtOptions(b.notes, {
            barre: b.barre,
            rootBarre: b.rootBarre,
            ukulele: b.ukulele,
            book: b.book,
        }),
    );
    // A guitar triad or power grip, by its strings and frets: one hand, whatever the chart
    // calls it (Am x-3-2-2-x-x and C6 are one grip, #1835).
    const keys = chords.map((c) =>
        c.ukulele || !c.barre ? null : c.notes.map((n) => `${n.string}/${n.fret}`).join(' '),
    );
    unifyFingerings(options, keys).forEach((o, i) => {
        applyFingers(chords[i].notes, o);
    });
}
