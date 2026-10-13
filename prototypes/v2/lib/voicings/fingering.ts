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
 * #1617, #1681). What the cheapest
 * option costs is also what grip choice reads (`voicing.ts`'s `buildAt` and `rootBuried`), so
 * `handCost` and the options list stay as they are and the teaching rules live in the plan.
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
     * Set with `needs` on a ukulele grip's fingerings (`taughtStrummed`, #1681): how many of
     * this fingering's fingers the chord beside it must hold on the same notes (`heldFingers`).
     * Two, or the one finger of a one-finger fingering.
     */
    hold?: number;
    /**
     * Set by `taughtOptions`: per note of `fr`, whether this fingering puts a different finger
     * on it than the grip's default fingering does (all false on the default itself). The
     * default is the cheapest, but for the ukulele chords of `UKE_BOOK` and a grip whose
     * cheapest is a cramped barre.
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
     * A triad or power grip, or a ukulele 7th chord: any finger but the middle may lie across
     * a run of same-fret notes (#1594).
     */
    barre?: boolean;
    /**
     * A shell whose root sits on a bass string under muted strings (a guitar shell): it is a
     * finger per note, except for the one small index barre that gets its root off the ring or
     * little finger (`rootBarreOptions`, #1607).
     */
    rootBarre?: boolean;
    /**
     * The grip sounds every string of its instrument, which here is a ukulele chord, triad or
     * 7th (`voicing.ts`'s `strumsEveryString`). It is fingered as the ukulele is taught
     * (#1681): no barre that would lie on an open string (`barreOptions`), and one fingering
     * for a chord unless two fingers can stay down (`taughtStrummed`). Neither is asked of a
     * guitar grip: its fingerings were not part of that review and stay as they were.
     */
    everyString?: boolean;
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
 * Barre fingerings (#1594): one finger flat across a contiguous run of strings at one fret, the
 * run's ends both notes of the grip at that fret. Legal only when every string inside the run is
 * in the grip at that fret or higher — a lower note (an open string included) would be stopped by
 * the barre, and a string left out would sound it. The index bars at the grip's lowest fret; the
 * ring or little finger bars above an index note (C 5-5-3: index on the 3, ring across the 5s).
 * The middle finger never bars. One barre per grip. Every other finger keeps the split rule, with
 * the barre counted once at its fret. The candidates are costed alongside the split ones, so the
 * planner, not a rule, decides between them.
 *
 * `openRings` (a ukulele grip, `FingerOpts.everyString`, #1681) adds the other half of that
 * legality: no open string of the grip on the barre's palm side, the strings numbered below
 * the run. A finger laid flat reaches its strings from that side, tip on the furthest, so
 * everything nearer is under it: across the G, C and E strings it damps the open A of D
 * 2-2-2-0, which is why D is taught a fingertip each (1-2-3), Asus4 2-2-0-0 as 1-2 and C♯m
 * 1-1-0-4 as 1-2-4. An open string beyond the fingertip is clear of it (Gm7 0-2-1-1 and
 * Gmaj7 0-2-2-2 are barres).
 */
function barreOptions(notes: Note[], fr: Note[], openRings: boolean): FingerOption[] {
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
                if (!legal || (openRings && notes.some((n) => n.string < lo && n.fret === 0))) {
                    continue;
                }
                const inBarre = fr.map((n) => n.fret === f && n.string >= lo && n.string <= hi);
                const rest = fr.filter((_, i) => !inBarre[i]);
                for (const b of [1, 3, 4]) {
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
                        // A ring or little-finger barre sits above an index note on a lower fret.
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
    const out = splitOptions(fr, !opts.barre);
    if (opts.barre) {
        out.push(...barreOptions(notes, fr, opts.everyString === true));
    } else if (opts.rootBarre) {
        out.push(...rootBarreOptions(notes, fr, out));
    }
    out.sort((a, b) => a.cost - b.cost);
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
 * A fingering whose lowest finger sits on a fret below its own number: there is no room on
 * the neck for the index behind it (the little finger on a 1st-fret note leaves the index
 * three frets behind the nut). Nobody ARRIVES on one. Coming to a first-position grip cold,
 * the index takes the 1st fret: the one fretted note of E7 0-x-0-1-x-x and of Am7 x-0-x-0-1-x
 * under the index, Dm7 x-x-0-x-1-1 as 1-2, Fmaj7 1-x-2-2-x-x as 1-2-3, the ukulele's G7
 * 0-2-1-2 as 2-1-3. But a finger that is already down is not lifted to make it so: F7
 * 1-x-1-2-x-x to B♭maj7 x-1-x-2-3-x keeps the ring finger on its note and plays 2-3-4, exactly
 * as G7 to Cmaj7 does two frets up, and the ukulele's G7 0-2-1-2 to Cmaj7 0-0-0-2 lifts two
 * fingers and leaves the third. From the 2nd fret up there is room for the index and such a
 * fingering is an ordinary choice (F♯m7 2-x-2-2-x-x as 2-3-4).
 */
const behindTheNut = (o: FingerOption): boolean => {
    let lowest = -1;
    o.p.forEach((f, i) => {
        if (f !== null && (lowest < 0 || f < (o.p[lowest] as number))) {
            lowest = i;
        }
    });
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
 * The taught ones among a shell's fingerings, cheapest first. Four rules:
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
 * cheapest one would. A shared note the cheapest fingering keeps just as well is no reason
 * to leave it (Cmaj7 x-3-x-4-5-x to Am7 5-3-5-x-x-x keeps the index either way, so Am7 stays
 * 2-1-3).
 *
 * The cheapest fingering is always here and unmarked — it uses the index, so the nut rule
 * cannot mark it — which is why a chord by itself is fingered as `assignFingers` fingers it
 * and why the plan always has a way through.
 */
const taughtAmong = (all: FingerOption[]): FingerOption[] => {
    const best = all[0];
    const rootFirst = rootFinger(best) <= 2;
    const taught: FingerOption[] = [];
    for (const o of all) {
        const usual =
            o.cost <= best.cost + TAUGHT_MARGIN &&
            !(rootFirst && rootFinger(o) > 2) &&
            !idleIndexStretches(o);
        const own = o.p.map((f, i) => f !== best.p[i]);
        if (usual) {
            taught.push({ ...o, own, ...(behindTheNut(o) ? { needs: 'left' as const } : {}) });
        } else if (inPosition(o)) {
            taught.push({ ...o, own, needs: 'before' }, { ...o, own, needs: 'after' });
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
 * does in the A-shape barre chord (C x-x-x-5-5-3, B5 x-2-4-4-x-x), and three above, the little
 * finger.
 */
const crampedBarre = (o: FingerOption): boolean => {
    const b = barringFinger(o);
    const index = o.p.indexOf(1);
    return b > 1 && index >= 0 && o.fr[o.p.indexOf(b)].fret - o.fr[index].fret < b - 1;
};

/**
 * The ukulele chords whose method-book fingering is not the cheapest (`handCost` puts the
 * lowest fingers on the notes and bars wherever that saves one). Keyed by the frets from the
 * G string to the A string, `o` an open string; each lists the book fingerings, the first the
 * one a chord chart prints. A four-string strummed grip is always a ukulele's: a guitar triad
 * or power chord holds three strings.
 *
 * - C 0-0-0-3 under the ring finger and Am 2-0-0-0 under the middle: in first position a
 *   finger takes the fret of its own number, and every method starts there.
 * - Fm 1-0-1-3 is index, middle and little finger (Fender Play, Ukulele Tricks, Kytary).
 * - E♭ 0-3-3-1 is printed three ways: middle and ring on the 3rd fret (Ukulele Tricks, and
 *   the most common), one finger laid across both (UkuTabs), ring and little (Kytary). All
 *   three stay on offer.
 */
const UKE_BOOK: Record<string, string[]> = {
    'o o o 3': ['0-0-0-3'],
    '2 o o o': ['2-0-0-0'],
    '1 o 1 3': ['1-0-2-4'],
    'o 3 3 1': ['0-2-3-1', '0-3-3-1', '0-3-4-1'],
};

/**
 * The F shape, all four strings fretted (F♯ 3-1-2-1, G 4-2-3-2, A♭ 5-3-4-3): the index
 * across the lowest fret, middle and ring above it, at every fret. `holeCost` prices that
 * barre out below the 6th fret, where a guitar's frets are wide enough for a fingertip each
 * (the open D shape); a ukulele's are not, and every chart prints these three with the barre.
 */
const UKE_F_SHAPE = { frets: '2 0 1 0', fingers: ['3-1-2-1'] };

/** A four-string grip's book fingerings, as `UKE_BOOK` spells them, or null. */
function bookFingerings(notes: Note[]): string[] | null {
    if (notes.length !== 4 || notes.some((n) => n.string < 1 || n.string > 4)) {
        return null;
    }
    const byString = [4, 3, 2, 1].map((s) => notes.find((n) => n.string === s));
    if (byString.includes(undefined)) {
        return null;
    }
    const frets = byString.map((n) => (n as Note).fret);
    const book = UKE_BOOK[frets.map((f) => f || 'o').join(' ')];
    if (book) {
        return book;
    }
    const low = Math.min(...frets);
    return low > 0 && frets.map((f) => f - low).join(' ') === UKE_F_SHAPE.frets
        ? UKE_F_SHAPE.fingers
        : null;
}

/** An option's fingers from the highest-numbered string down, an open string 0: '0-2-3-1'. */
const spelled = (notes: Note[], o: FingerOption): string =>
    [...notes]
        .sort((a, b) => b.string - a.string)
        .map((n) => (n.fret === 0 ? 0 : o.p[o.fr.indexOf(n)]))
        .join('-');

/**
 * The taught ones among a strummed grip's fingerings (a triad, a power chord), the default
 * first. Three rules choose them, and a table overrules the rules for a few ukulele chords:
 *
 * - No dearer than the cheapest by more than `TAUGHT_MARGIN`, as for a shell: no stretch the
 *   cheapest does not have (B♭ x-5-3-3-x-x is the barre 3-1-1, never 4-2-3; the ukulele's B
 *   4-3-2-2 is 3-2-1-1, never 4-3-1-2), and no idle index over a stretch.
 * - No ring or little finger laid flat a fret above the index (`crampedBarre`).
 * - Where the cheapest lays the ring or little finger flat, the fingering with a fingertip per
 *   note in position is taught beside it (`inPosition`): the power chord's 1-3-4 beside 1-3-3,
 *   the A shape's 3-4-1 beside 3-3-1, the ukulele's E♭m 3-3-2-1 as 3-4-2-1. Teachers show
 *   both; the barre stays the default and the plan takes the other to keep a note held.
 *
 * And as for a shell, the index behind the nut (`behindTheNut`) is only ever fingers left
 * where they were (`needs: 'left'`): the ukulele's A 2-1-0-0 is 2-1 and F 2-0-1-0 is 2-1.
 *
 * A grip in the table (`bookFingerings`) takes the table's fingerings and its first as the
 * default, priced as the cheapest so the plan reaches for it cold. What the rules would have
 * offered is still there for fingers already down: the index on the 3rd fret of Cm 0-3-3-3
 * stays for C 0-0-0-3, though C alone is the ring finger.
 *
 * A ukulele chord (`everyString`, #1681) asks more before it leaves its default. On a guitar
 * one held note is reason enough to take a second taught fingering. In first position on a
 * ukulele each chord has the one fingering its chart prints, and a single finger kept from
 * the chord before drags the others off it: E7 1-2-0-2 after Dm played 2-3-0-4, G7 0-2-1-2
 * after Fm 0-3-2-4, each with the whole hand a fret behind its place. So there a fingering
 * other than the default — a second one, or fingers left down (`needs: 'left'`) — is taken
 * only beside a chord that holds TWO of its fingers (`FingerOption.hold`, `heldFingers`): G7
 * after Dm7♭5 1-2-1-3 keeps the middle and ring finger and is 0-3-2-4, Em 0-4-3-2 beside G
 * keeps two and is 4-3-2. A fingering of one finger needs only that one (Cmaj7 0-0-0-2 under
 * the ring finger G7 leaves there). The table's own alternatives are book fingerings too and
 * stay unmarked.
 */
function taughtStrummed(notes: Note[], all: FingerOption[], everyString: boolean): FingerOption[] {
    if (all[0].p.includes(null)) {
        return all;
    }
    // The cheapest fingering that is not a cramped barre is what the others are measured
    // from. On three strings that is the cheapest of all; on a ukulele's four the cramped
    // barre can undercut every other (A♭m7♭5 1-2-2-2 as 1-2-3-3), and measured from it the
    // fingertip-each fingering players use (1-2-3-4) would be a stretch too far.
    const best = all.find((o) => !crampedBarre(o)) ?? all[0];
    const usual = all.filter(
        (o) => o.cost <= best.cost + TAUGHT_MARGIN && !idleIndexStretches(o) && !crampedBarre(o),
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
    const book = bookFingerings(notes);
    const printed = book
        ?.map((b) => all.find((o) => spelled(notes, o) === b))
        .filter((o): o is FingerOption => o !== undefined);
    const free = printed?.length
        ? // A choice of fingers apart (0.2 a finger-step), in the order the table gives them.
          printed.map((o, i) => ({ ...o, cost: best.cost + i * 0.4 }))
        : usual.filter((o) => !behindTheNut(o));
    if (!free.length) {
        free.push(best);
    }
    const first = free[0];
    const mark = (o: FingerOption, needs?: 'left'): FingerOption => ({
        ...o,
        own: o.p.map((f, i) => f !== first.p[i]),
        ...(needs ? { needs } : {}),
    });
    const taken = new Set(free.map((o) => o.p.join()));
    const left = usual.filter((o) => !taken.has(o.p.join())).map((o) => mark(o, 'left'));
    if (!everyString) {
        return [...free.map((o) => mark(o)), ...left];
    }
    // The default and whatever else the table prints stay free. A second fingering is offered
    // once for the chord before and once for the chord after, as a shell's is (`taughtAmong`).
    const second = free.slice(printed?.length || 1).map((o) => mark(o));
    return [
        ...free.slice(0, printed?.length || 1).map((o) => mark(o)),
        ...[
            ...second.map((o) => ({ ...o, needs: 'before' as const })),
            ...second.map((o) => ({ ...o, needs: 'after' as const })),
            ...left,
        ].map((o) => ({ ...o, hold: Math.min(2, new Set(o.p).size) })),
    ];
}

/**
 * The fingerings the chart plan may give a grip: the ones it is taught with, so across a chart
 * a held note only ever chooses between two fingerings a teacher would show. A guitar shell's
 * are `taughtAmong` (#1611); a triad's, a power chord's or a ukulele chord's (`barre`) are
 * `taughtStrummed` (#1617, #1681).
 * The first is the grip's default, unmarked: what it takes alone (`assignFingers`).
 */
export function taughtOptions(notes: Note[], opts: FingerOpts = {}): FingerOption[] {
    const all = fingerOptions(notes, opts);
    return opts.barre ? taughtStrummed(notes, all, opts.everyString === true) : taughtAmong(all);
}

/**
 * Finger one grip by itself: its default taught fingering. For every guitar shell and nearly
 * every strummed grip that is the cheapest (`fingerOptions`); the exceptions are the ukulele
 * chords of `UKE_BOOK` and a grip whose cheapest is a cramped barre (`taughtStrummed`).
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

/** Whether `other` holds as many of a marked fingering's fingers as it asks (`FingerOption.hold`). */
const holdsEnough = (marked: FingerOption, other: FingerOption): boolean =>
    heldFingers(marked, other) >= (marked.hold ?? 0);

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
 * And a marked ukulele fingering only beside a chord that holds enough of its fingers
 * (`FingerOption.hold`, #1681).
 */
function arrives(a: FingerOption | null, b: FingerOption): boolean {
    if (b.needs === 'left' && !(a && sharesTheHand(b, a, true) && holdsEnough(b, a))) {
        return false;
    }
    if (
        b.needs === 'before' &&
        !(a && ordinary(a) && sharesTheHand(b, a, false) && holdsEnough(b, a))
    ) {
        return false;
    }
    return !(
        a?.needs === 'after' && !(ordinary(b) && sharesTheHand(a, b, false) && holdsEnough(a, b))
    );
}

/**
 * The cheapest way through a chart, one option per chord: each option's own cost plus the cost
 * of every change (`fingerTransCost`), so a note two chords share keeps its finger where the
 * options allow. Every chord must hold an unmarked option (`FingerOption.needs`), which the
 * plan can always reach and leave; `taughtAmong` says why each does. A chart cannot end on a
 * fingering still waiting for the chord that takes it over.
 */
function planFingers(options: FingerOption[][]): FingerOption[] {
    let cost = options[0].map((o) => (arrives(null, o) ? o.cost : Infinity));
    const back: number[][] = [];
    for (let i = 1; i < options.length; i++) {
        const nc: number[] = [],
            nb: number[] = [];
        options[i].forEach((b) => {
            let bi = 0,
                bv = Infinity;
            options[i - 1].forEach((a, j) => {
                if (!arrives(a, b)) {
                    return;
                }
                const v = cost[j] + fingerTransCost(a, b);
                if (v < bv) {
                    bv = v;
                    bi = j;
                }
            });
            nc.push(bv + b.cost);
            nb.push(bi);
        });
        cost = nc;
        back.push(nb);
    }
    const last = options.length - 1;
    const end = cost.map((c, j) => (options[last][j].needs === 'after' ? Infinity : c));
    let k = end.indexOf(Math.min(...end));
    const out = new Array<FingerOption>(options.length);
    for (let i = last; i >= 0; i--) {
        out[i] = options[i][k];
        if (i > 0) {
            k = back[i - 1][k];
        }
    }
    return out;
}

/**
 * Plan fingers across a sequence of voicings (mutates each voicing's notes). Each carries what
 * its fingering may use (`FingerOpts`): `barre` for triad and power grips and for every
 * ukulele chord (`everyString`), `rootBarre` for a guitar shell.
 *
 * Every grip is planned from the fingerings it is taught with (`taughtOptions`: #1611 for
 * shells, #1617 for triad and power grips), in one pass, so a held note never costs a stretch,
 * a buried root or a cramped barre, and no finger is newly placed with the index behind the
 * nut.
 */
export function fingerSequence(chords: Array<{ notes: Note[] } & FingerOpts>): void {
    if (!chords.length) {
        return;
    }
    const options = chords.map((b) =>
        taughtOptions(b.notes, {
            barre: b.barre,
            rootBarre: b.rootBarre,
            everyString: b.everyString,
        }),
    );
    planFingers(options).forEach((o, i) => {
        applyFingers(chords[i].notes, o);
    });
}
