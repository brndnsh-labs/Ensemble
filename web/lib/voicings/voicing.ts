/**
 * The voicer: every grip a chord can take (`allPositions`), and one chosen per chord of a chart
 * (`voiceChart`).
 *
 * PINNED. `test/shell-characterization.test.ts` holds `voiceChart`'s shell output — shape, root
 * fret, and every note's string, fret, degree, role and finger — to `test/golden.json`, for the
 * charts it lists: six shell qualities (maj7, 7, m7, m7♭5, °7 and 6; the 7sus4 and m6 of #1817
 * are pinned in `engine.test.ts`, since no golden chart writes them) on guitar (both root-string
 * limits) and ukulele (high G, and two low-G charts), with and without a hand
 * window. A change to a shell cost here or in `fingering.ts` (`unaryCost`,
 * `transCost`, `handCost`, `fingerTransCost`) moves it — and for a ukulele shell, which is
 * costed and held to one grip as the ukulele triads are (`byHand`, #1609), a change to
 * `triadUnaryCost`, `triadTransCost`, `handFree` or `unifyGrips` does too; so does a change to
 * which grips a chord is offered (`allPositions`, a quality's `required` tones, where `buildAt`
 * puts one, what `candidates` puts first — a ukulele chord's `bookGrip`, else its
 * `firstPosition` grips, and a guitar chord's open book chord at the nut (#1838, #1849) — or holds back as a last resort, and how far past the window it looks,
 * `inReach`), to which barre a shell may take
 * (`fingerRules`), to which fingerings the chart plan may give a shell and what a change of
 * fingering costs it (`fingering.ts`'s `taughtAmong`, #1611, and `fingerTransCost`, #1617:
 * fingers only), and so does letting a newer rule reach a shell, which is
 * why triad rules are gated by `kind`. If the change is meant, regenerate the fixture in the
 * same commit (the test's header says how) and review its diff.
 *
 * Grip choice reads the fingering costs too: `buildAt` places an added tone by the cheapest
 * fingering's cost, and `rootBuried` by whether any fingering in reach has the root first
 * (`fingerOptions`, both). So a change to `handCost` or to that list can move a GRIP, not
 * only a finger; #1611 and #1617 left both alone for that reason and put their rules in the
 * plan. Nothing here reads a note's `finger`.
 */
import { assignFingers, type FingerOpts, fingerOptions, fingerSequence } from './fingering';
import { HOME_FRETS } from './home-window';
import { GUITAR_OPEN_CHORDS } from './instruments';
import { DEGREES, mod, QUALITIES } from './theory';
import type {
    ChartChord,
    Degree,
    HomeWindow,
    InstrumentDef,
    Note,
    Quality,
    ShapeDef,
    ShapeRole,
    Spelled,
    VoicedChord,
    VoiceOptions,
    Voicing,
} from './types';

const spanOf = (frets: number[]): number => {
    const x = frets.filter((f) => f > 0);
    return x.length ? Math.max(...x) - Math.min(...x) : 0;
};
const MAX_SPAN = 4;

/**
 * First position: the index at the 1st fret and a finger per fret, so the 4th fret is the last
 * one the hand covers while the open strings are still part of where it sits. It is the same
 * place `atTheNut` credits a triad's open strings in; there the window says where the hand is,
 * here the grip's own fretted notes do. No shell's added tone meets an open string with the
 * highest fretted note on frets 3 to 5, so 2 to 5 draw the same line today: at 1 the grips at
 * the nut go (Bm7♭5 x-2-0-2-x-1), from 6 the stretch comes back.
 */
const FIRST_POSITION_TOP = 4;

/**
 * Where a guitar shell sits in first position (#1851): its frets centred on the 2nd (`center`),
 * as F♯m7 2-x-2-2-x-x, Cm7 x-3-1-3-x-x and Gm7 3-1-3-x-x-x are. A shell is read by all its
 * frets, so the middle of frets 1 to 4 (2.5, the triads' aim, which `handAt` reads off
 * fretted notes) is half a fret from both F♯m7 2-x-2-2-x-x and the stretch x-x-4-2-5-x
 * (centre 3.5) and barely parts them.
 */
const FIRST_POSITION_SHELL = 2;

/**
 * What a guitar shell in a window from fret 1 pays for a stretch (#1851): fretted notes three
 * frets apart, index to little finger (Fm7 x-x-3-1-4-x, F♯m7 x-x-4-2-5-x, B7sus4 x-2-x-2-5-x),
 * where a teacher shows a grip with a finger a fret (Fm7 1-x-1-1-x-x, B7sus4 x-2-2-2-x-x). Read
 * by its `center` alone, the stretch sits nearer the 2nd fret than the 1st fret's grip does,
 * and Fm7 x-x-3-1-4-x won 25 of 35 sweep lines in frets 1–6 (16 on main). Measured: at 0.5 it
 * won 15, at 1.0 10 (F♯m7's stretch 12 to 7, 118 lines moved, one hand jump more), at 1.5 7,
 * with more of the triads beside the shells on open-string fragments (Cm x-3-1-0-x-x). So a
 * stretch costs about what two frets off the aim do.
 */
const FIRST_POSITION_STRETCH = 1;
/** Fretted notes three frets or more apart (`FIRST_POSITION_STRETCH`). */
const stretched = (v: Voicing): boolean =>
    spanOf(v.notes.filter((n) => n.fret > 0).map((n) => n.fret)) >= 3;

/**
 * The most open strings a grip with an added tone may ring. One or two beside fretted notes in
 * first position is a grip the books print (Am7♭5 x-0-1-0-1-x, Bm7♭5 x-2-0-2-x-1). Three of
 * four notes open is not a shell any more: it is a fragment of an open-position chord, good for
 * one root only (Em7♭5 0-1-0-0-x-x, its ♭5 a tritone over the root on the two lowest strings),
 * and it reads as the hand gone to the nut, which pulls the chords around it down to their own
 * open one-offs.
 */
const MAX_OPEN_STRINGS = 2;

/**
 * A grip the added tone would turn into an open-string one-off (#1607): the shape for this root
 * only, not the movable one being learned. Two ways:
 *
 * - An open string under fretted notes that have left first position. The open string costs no
 *   finger, so it is free on span — but the hand is up the neck and the string rings at the nut
 *   (E♭m7♭5 11-0-11-11-x-x leans on the open A), and it is often a stretch in disguise (Em7♭5
 *   x-x-2-0-3-6 is a reach from the 2nd fret to the 6th around the open G).
 * - More open strings than `MAX_OPEN_STRINGS`, wherever the fretted note is.
 *
 * So a shell with an added tone takes an open string only where every method book does: one or
 * two of them, in first position (B♭°7 x-1-2-0-2-x).
 */
const openOneOff = (frets: number[]): boolean => {
    const open = frets.filter((f) => f === 0).length;
    return open > MAX_OPEN_STRINGS || (open > 0 && Math.max(...frets) > FIRST_POSITION_TOP);
};

/**
 * Triad and power grips may take a barre (#1594); a shell is one finger per note, its skipped
 * string muted by the fretting hand, as jazz comping is taught — but for the one barre
 * `fingerRules` gives a guitar shell, and for a ukulele's shells, which it treats as the
 * strummed chords they are. Read by `buildAt` too, where it prices an added tone: no ukulele
 * shell has one, so only the guitar's rule is ever asked there.
 */
const mayBarre = (shape: ShapeDef): boolean => shape.kind !== 'shell';

/**
 * What a grip's fingering may use (`FingerOpts`). A triad or power grip takes barres freely. A
 * shell that leaves strings muted — a guitar shell, its root on a bass string — takes only the
 * index barre that frees its root (`rootBarre`, #1607): the finger-per-note rule is there so
 * the fretting hand can mute the strings the shape skips. A ukulele shell skips none. It rings
 * every string (`strumsEveryString`), a strummed chord like the triad taught beside it, and it
 * bars as that triad does (#1681): D7 2-2-2-3 is the index across three strings and the middle
 * finger, B♭7 1-2-1-1 the index across all four. Every ukulele grip is also marked
 * `ukulele`, which holds its fingering to how the ukulele is taught (`fingering.ts`'s
 * `barreOptions` and `taughtStrummed`). That is read off the instrument, not off how many
 * strings the grip sounds (#1677): the three-string power chord, G5 0-2-3-x, is a ukulele
 * chord too, and a guitar grip on every string would not be one. Grip choice reads no
 * strummed grip's fingering (`rootBuried` and `buildAt`'s added tone are a guitar shell's),
 * so the strummed rules move fingers only.
 *
 * The guitar's book chords, the open 7ths (#1838) and the open triads and sus chords (#1849,
 * `ShapeDef.book`), are strummed chords, every string between their lowest and highest
 * sounding, fingered from the nut (`fingeredFromTheNut`), the book's fingering where the nut
 * rule misses it (`GUITAR_BOOK`), held to one fingering through a song (`unifyFingerings`).
 * E7 0-2-0-1-0-0 is 2-1, C7 x-3-2-3-1-0 3-2-4-1, C x-3-2-0-1-0 3-2-1, G 3-2-0-0-0-3 2-1-3. They
 * are marked `book` (`FingerOpts.book`): a book chord keeps the book's fingering rather than
 * adapting to its neighbour, and a neighbour bends to it only on its own root.
 */
const fingerRules = (shape: ShapeDef, notes: Note[], inst: InstrumentDef): FingerOpts => {
    const ukulele = inst.id === 'uke';
    if (shape.book) {
        return { barre: true, ukulele, book: true };
    }
    return mayBarre(shape) || strumsEveryString({ notes }, inst)
        ? { barre: true, ukulele }
        : { rootBarre: true };
};

/**
 * Fret on string `s` for a note `interval` semitones above a root at fret `r` on `rootString`,
 * kept within reach. Only a triad's note ever comes near the limit: a shell's sit from two frets
 * below its root to three above, so moving the limit a fret or two changes no shell (#1604).
 */
export function fretFor(
    inst: InstrumentDef,
    s: number,
    rootString: number,
    r: number,
    interval: number,
): number {
    let f = r + mod(interval - (inst.open[s] - inst.open[rootString]), 12);
    if (f > r + 6) {
        f -= 12;
    }
    return f;
}

/** Midpoint of the frets a voicing covers; the "where is the hand" number. */
export const center = (v: { notes: Note[] }): number => {
    const fs = v.notes.map((n) => n.fret);
    return (Math.min(...fs) + Math.max(...fs)) / 2;
};
/** True if every fretted note is inside the window (open strings always count as inside). */
export const inHome = (v: { notes: Note[] }, home: HomeWindow | null | undefined): boolean =>
    !home || v.notes.every((n) => n.fret === 0 || (n.fret >= home[0] && n.fret <= home[1]));

/**
 * The shapes a quality may use: its own kind (a shell never borrows a triad grip, nor a triad a
 * shell), and for shells only, the root-string limit (`classic` shells keep the root on the 6th
 * and 5th strings; a triad grip lives on the top strings, so the limit never excludes one).
 * The guitar's open 7ths are not held to it (#1838): the limit says where a moving shell's root
 * lives, and an open chord is no moving shell. D7 x-x-0-2-1-2 is the book's D7 with `classic`
 * shells as without, as the open D triad is.
 */
export function allowedShapes(
    inst: InstrumentDef,
    rootStrings: number[] | undefined,
    quality: Quality,
): ShapeDef[] {
    const kind = QUALITIES[quality].kind;
    return inst.shapes.filter(
        (sh) =>
            sh.kind === kind &&
            taughtFor(sh, quality) &&
            (kind !== 'shell' || !rootStrings || sh.book || rootStrings.includes(sh.rootString)),
    );
}

/**
 * A shape held to some qualities (`ShapeDef.qualities`) serves only those; any other serves all.
 * And a shape with a 9th's seat (role N, #1820) serves exactly the qualities that add one
 * (`QualityDef.added`): an add9 is never the plain triad, nor a plain triad an add9.
 */
const taughtFor = (shape: ShapeDef, quality: Quality): boolean =>
    (!shape.qualities || shape.qualities.includes(quality)) &&
    shape.voices.some(([, role]) => role === 'N') === (QUALITIES[quality].added !== undefined);

/** Build one grip with its root at fret `r`. Returns null if any note falls off the neck. */
export function buildAt(
    inst: InstrumentDef,
    shape: ShapeDef,
    root: Spelled,
    quality: Quality,
    r: number,
): Voicing | null {
    const q = QUALITIES[quality];
    const degOf = (role: ShapeRole): Degree => {
        const deg =
            role === 'R' || role === 'R2' || role === 'O'
                ? 'R'
                : role === 'T' || role === 'T2'
                  ? q.third
                  : role === 'S'
                    ? q.seventh
                    : role === 'N'
                      ? q.added
                      : q.five;
        if (!deg) {
            throw new Error(`${quality} has no ${role} for shape ${shape.id}`);
        }
        return deg;
    };
    const notes: Note[] = shape.voices.map(([s, role]) => ({
        string: s,
        role,
        degree: degOf(role),
        fret: fretFor(inst, s, shape.rootString, r, DEGREES[degOf(role)].int),
        finger: null,
    }));
    if (!notes.every((n) => n.fret >= 0 && n.fret <= inst.maxFret)) {
        return null;
    }
    // A first-position form exists only on its open string (`ShapeDef.openOnly`, #1613), with
    // one exception (#1688): as a sus2 it may move while it stays inside the 4th fret
    // (`FIRST_POSITION_TOP`). That is D♭sus2 1-3-4-4, the open Csus2 0-2-3-3 a fret up and the
    // book's grip (the same notes as A♭sus4, also 1-3-4-4). Without it D♭sus2 was 6-3-4-4 and
    // `D♭ D♭sus2 D♭` jumped five frets each way. Further up it is the Em7-shaped stretch a
    // teacher does not show (Esus2 4-6-7-7 for 4-4-2-2), so it moves no further.
    // The guitar's book chords (#1838, #1849) never move: Asus2 x-0-2-2-0-0 a fret up is
    // x-2-4-4-2-2, a grip no book prints, and as a sus2 it took B♭sus2 and Bsus2 at the nut.
    if (
        shape.openOnly &&
        !notes.some((n) => n.fret === 0) &&
        (shape.book || !(quality === 'sus2' && notes.every((n) => n.fret <= FIRST_POSITION_TOP)))
    ) {
        return null;
    }
    // A two-string power chord is the nut's (`ShapeDef.nutOnly`, #1809), built inside the 4th
    // fret only: with no window E♭5 x-x-6-6 took `B♭5 F5 E♭5 F5` off x-x-1-1 / x-0-1-x up to
    // x-5-6-x / 5-5-8-8. A5 x-x-0-0 is two open strings, not a grip. A window up the neck
    // never offers one at all (`candidates`).
    if (
        shape.nutOnly &&
        (notes.some((n) => n.fret > FIRST_POSITION_TOP) || notes.every((n) => n.fret === 0))
    ) {
        return null;
    }

    // A required tone (the ♭5 of an m7♭5 or a °7) goes on a free string — unless a helper (F)
    // note already plays it. One that fits nowhere within reach is reported in `missing`;
    // `allPositions` decides what becomes of the grip.
    const missing: Degree[] = [];
    const extras: Degree[] = notes.some((n) => n.role === 'F') ? [] : [...q.required];
    for (const deg of extras) {
        const used = new Set(notes.map((n) => n.string));
        // How hard the grip is to finger with the tone at fret `f` of string `s`: the fingering
        // planner's own cost for its best fingering (`handCost`).
        // A finger per note, on purpose: the barre that frees a root (`fingerRules`) is how a
        // grip gets held once it is chosen, not a reason to put the tone somewhere else — with
        // it x 9 x 8 10 8 would beat the book's x 9 10 8 10 x from the 7th fret up.
        const effort = (s: number, f: number): number =>
            fingerOptions(
                [...notes, { string: s, fret: f, degree: deg, role: `X${deg}`, finger: null }],
                { barre: mayBarre(shape) },
            )[0].cost;
        let best: { s: number; f: number; span: number } | null = null;
        for (let s = 1; s < shape.rootString; s++) {
            if (used.has(s)) {
                continue;
            }
            const base = fretFor(inst, s, shape.rootString, r, DEGREES[deg].int);
            for (const f of [base, base + 12, base - 12]) {
                if (f < 0 || f > inst.maxFret) {
                    continue;
                }
                const frets = notes.map((n) => n.fret).concat(f);
                const span = spanOf(frets);
                // No room here if the tone is out of reach, or if it would make the grip an
                // open-string one-off (`openOneOff`). Only a grip with an added tone is asked:
                // a three-note shell on open strings (Em7 0-x-0-0-x-x) is taken or not on its
                // costs unless its root has a fretted shell too (`openShapeOneOff`), and a
                // ukulele shell has no added tone at all.
                if (span > MAX_SPAN || openOneOff(frets)) {
                    continue;
                }
                // The narrowest grip wins. Of two as narrow:
                // - a fretted tone beats an open string. The fretted grip is the movable shape
                //   being learned; the open string is a one-off that works for this root only
                //   (B♭°7 is x-1-2-0-2-x, not x-1-x-0-2-0), and `center` would read it as the
                //   hand gone to the nut and pull the next chords down after it;
                // - then the grip that is easier to finger. C°7 can take its ♭5 on the 4th string
                //   (x-3-4-2-4-x) or the 1st (x-3-x-2-4-2), both three frets wide: the first is
                //   the grip the method books print, a finger per fret with the root under the
                //   middle finger; the second puts the root under the ring finger and splits two
                //   fingers around a string the hand must also mute;
                // - still a tie (Cm7♭5 on the 6th string), the higher string keeps the tone: up
                //   there it is heard, and stays clear of the root in the bass.
                const tied = best !== null && span === best.span;
                const better =
                    !best ||
                    span < best.span ||
                    (tied && f > 0 && best.f === 0) ||
                    (tied &&
                        f > 0 === best.f > 0 &&
                        effort(s, f) < effort(best.s, best.f) - COST_NOISE);
                if (better) {
                    best = { s, f, span };
                }
            }
        }
        if (best) {
            notes.push({
                string: best.s,
                fret: best.f,
                degree: deg,
                role: `X${deg}`,
                finger: null,
            });
        } else {
            missing.push(deg);
        }
    }
    notes.sort((a, b) => b.string - a.string);
    assignFingers(notes, fingerRules(shape, notes, inst));
    return { shape, rootFret: r, notes, missing, root, quality, symbol: root.name + q.symbol };
}

export function rootFrets(inst: InstrumentDef, shape: ShapeDef, root: Spelled): number[] {
    const r0 = mod(root.pc - inst.open[shape.rootString], 12);
    return [r0, r0 + 12];
}

/**
 * A grip's inversion, by pitch: 0 when the lowest sounding note is the root, 1 when it is the
 * T role's degree (the 3rd, or a sus chord's 4th or 2nd), 2 when it is the 5th. Only a triad has
 * inversions: a shell always starts on its root, and a power chord (no 3rd) names none, so both
 * read 0. Pitch, not string: a re-entrant uke's G string is not its lowest note.
 */
export function inversionOf(inst: InstrumentDef, v: Voicing): 0 | 1 | 2 {
    const q = QUALITIES[v.quality];
    if (q.kind !== 'triad' || !v.notes.length) {
        return 0;
    }
    const pitch = (n: Note) => inst.open[n.string] + n.fret;
    const lowest = v.notes.reduce((a, b) => (pitch(b) < pitch(a) ? b : a));
    return lowest.degree === q.third ? 1 : lowest.degree === q.five ? 2 : 0;
}

/**
 * The MIDI pitches a grip sounds, for a strum (#1596): `open[string] + fret` per note, in STRING
 * order from the lowest string (the highest string number) up — the order a downstroke hits them.
 * That is not always pitch order: a re-entrant uke's high G (string 4) comes first though it is
 * pitched above the C string beside it, as it does under the thumb.
 */
export function gripMidis(inst: InstrumentDef, v: Voicing): number[] {
    return [...v.notes]
        .sort((a, b) => b.string - a.string)
        .map((n) => inst.open[n.string] + n.fret);
}

/**
 * Lowest-fret playable version of a grip, or null when the shape has none for this chord: a
 * note off the neck, or a quality the shape is not taught for (`ShapeDef.qualities`, as
 * `allowedShapes` reads it — the Fm form is no major chord).
 */
export function build(
    inst: InstrumentDef,
    shape: ShapeDef,
    root: Spelled,
    quality: Quality,
): Voicing | null {
    if (!taughtFor(shape, quality)) {
        return null;
    }
    for (const r of rootFrets(inst, shape, root)) {
        const b = buildAt(inst, shape, root, quality, r);
        if (b) {
            return b;
        }
    }
    return null;
}

/**
 * Every grip a chord may take: all allowed shapes, both octaves — less the ones that cannot say
 * the chord.
 *
 * This is the one place a quality's `required` tones are enforced (`QualityDef.required`).
 * `buildAt` reports a grip that has no room for one in `missing`; such a grip is dropped here
 * whenever the chord has a complete grip on these shapes, because without the tone it is another
 * chord: an m7♭5 with no ♭5 is the plain m7 shell, and a °7 with none is the same three notes as
 * a m6. It is kept only when every grip is missing one — a wrong colour is still better than a
 * chord left off the neck, so no chord ever goes unvoiced.
 *
 * Complete comes before in-window: the hand window is applied afterwards (`candidates`), so a
 * complete grip outside the window is preferred to an incomplete one inside it. Leaving the
 * position for one chord is a shift; staying put on the wrong chord teaches the wrong chord.
 */
export function allPositions(
    inst: InstrumentDef,
    root: Spelled,
    quality: Quality,
    opts: { rootStrings?: number[] } = {},
): Voicing[] {
    const out: Voicing[] = [];
    allowedShapes(inst, opts.rootStrings, quality).forEach((sh) =>
        rootFrets(inst, sh, root).forEach((r) => {
            const b = buildAt(inst, sh, root, quality, r);
            if (b) {
                out.push(b);
            }
        }),
    );
    const complete = out.filter((v) => !v.missing.length);
    return complete.length ? complete : out;
}

// ---------- voicing a chart ----------

function viterbi<T>(states: T[][], unary: (s: T) => number, trans: (a: T, b: T) => number): T[] {
    let cost = states[0].map(unary);
    const back: number[][] = [];
    for (let i = 1; i < states.length; i++) {
        const nc: number[] = [],
            nb: number[] = [];
        states[i].forEach((b) => {
            let bi = 0,
                bv = Infinity;
            states[i - 1].forEach((a, j) => {
                const v = cost[j] + trans(a, b);
                if (v < bv) {
                    bv = v;
                    bi = j;
                }
            });
            nc.push(bv + unary(b));
            nb.push(bi);
        });
        cost = nc;
        back.push(nb);
    }
    let k = cost.indexOf(Math.min(...cost));
    const out = new Array<T>(states.length);
    for (let i = states.length - 1; i >= 0; i--) {
        out[i] = states[i][k];
        if (i > 0) {
            k = back[i - 1][k];
        }
    }
    return out;
}

/**
 * Stay near the target fret, avoid wide stretches, and never leave the window if avoidable.
 *
 * The target is the middle of the hand window, pulled lightly (0.15 a fret: the window already
 * keeps the hand close), or with no window the instrument's own home (`defaultTarget`), pulled
 * at 0.45 a fret. One case is neither (#1609): a ukulele grip in a window that starts at
 * the nut. That window is first position plus two frets of reach, not a place to sit in the
 * middle of: every ukulele method teaches G7 0-2-1-2, C7 0-0-0-1, D7 2-2-2-3, A7 0-1-0-0 and
 * B♭7 1-2-1-1, and a pull to the 3rd-and-a-half fret voiced a blues in G as 4-5-3-5 / 3-4-3-3
 * and Am F C G as 2-4-5-3 / 2-5-5-3 instead. So there the grip is aimed exactly as it is with
 * no window — `defaultTarget`, at 0.45 — and the window only says how far the hand may reach.
 * A window that starts higher keeps its own middle: the musician put the hand there.
 *
 * Every ukulele grip since #1809; until then only one that strums every string
 * (`strumsEveryString`), so a two- or three-string power chord in frets 1–6 was still aimed
 * at the window's middle, and B♭5 alone took 3-5-6-x for the book's x-x-1-1 (F5 and F♯5,
 * with no grip inside the window then, took 10-12-13-x and 11-13-14-x).
 *
 * A guitar triad or power grip in a window from fret 1 is aimed at first position too (#1827):
 * the middle of the frets the hand covers there, the 1st to the 4th (`FIRST_POSITION_TOP`),
 * not the window's middle, a fret higher. That fret is what sat a lone Gsus2 or Dsus4 on
 * x-x-5-2-3-x, a finger reaching from the 2nd fret to the 5th, over x-x-x-2-3-3, the top of
 * the book's Dsus4, by 0.15; and E5 alone on x-x-2-4-5-x for 0-2-2-x-x-x, F5 x-x-3-5-6-x for
 * 1-3-3-x-x-x, D x-5-4-2-x-x for x-x-x-2-3-2. Not the guitar's no-window home, the 3rd fret
 * (`defaultTarget`): from there x-x-x-2-3-3 and x-x-5-2-3-x are each half a fret off and tie. The
 * pull stays the window's 0.15, the window still keeping the hand close: at the no-window 0.45
 * the sweep moved 1,902 lines rather than 1,116, and jumps of the hand by three frets or of
 * the string set by two strings rose by 89 and 114 where at 0.15 they rise by 42 and not at
 * all.
 *
 * A guitar shell in a window from fret 1 is aimed at first position as well (#1851), at the
 * 2nd fret (`FIRST_POSITION_SHELL`) and the no-window pull, 0.45, as the ukulele is (#1809).
 * Aimed at the window's middle it was held to a stretch a teacher doesn't show first: F♯m7
 * x-x-4-2-5-x for 2-x-2-2-x-x, B♭m7 6-4-6-x-x-x for x-1-x-1-2-x. Measured over the sweep: at
 * the guitar's no-window home (`defaultTarget`, the 3rd fret) F♯m7 was still the stretch in
 * 30 of 51 lines in frets 1–6 (29 before); at the triads' 2.5, in 18 to 20 at pulls of 0.15
 * to 0.45; at the 2nd fret and 0.45, in 12, each beside C♯m7♭5 x-4-5-4-5-x or a triad on the
 * top strings. A pull of 0.6 took it to 10 but moved 425 lines for 344. There a shell also pays
 * for a stretch (`FIRST_POSITION_STRETCH`), which the aim alone favoured (Fm7 x-x-3-1-4-x). Up the neck and with
 * no window a shell keeps the window's middle or `defaultTarget`: its costs there are a jazz
 * comper's (`byHand`).
 */
function unaryCost(v: Voicing, opts: VoiceOptions): number {
    const home = opts.home ?? null;
    const windowed = home !== null && !(atTheNut(home) && opts.instrument.id === 'uke');
    const target = windowed ? (home[0] + home[1]) / 2 : opts.instrument.defaultTarget;
    const pull = windowed ? 0.15 : 0.45;
    if (byHand(v, opts.instrument)) {
        // A guitar triad or power grip in a window from fret 1 is aimed at first position, at
        // the window's pull (#1827, above). Guitar only: `windowed` is already false for a
        // ukulele window from fret 1, which takes `defaultTarget` instead.
        const aim = windowed && atTheNut(home) ? (1 + FIRST_POSITION_TOP) / 2 : target;
        return triadUnaryCost(v, aim, pull, home, opts.instrument);
    }
    // The out-of-window term (here and in `triadUnaryCost`) never picks a grip: `candidates` gives
    // a chord its in-window grips, else its grips a fret's reach past the window (`inReach`,
    // `aFretPast`), else every grip, and each of those sets is all inside or all outside, so
    // the term adds the same to each (#1604, #1610, #1675). Nor does the wide-span
    // term pick a shell any more: the one shell wider than three frets was a reach around an
    // open string (`openOneOff`, #1607), and without it none is on offer. It stays for a
    // shape that would be.
    // A guitar shell in a window from fret 1 is aimed at first position, at the no-window pull
    // (#1851, above).
    const nut = windowed && atTheNut(home);
    return (
        Math.abs(center(v) - (nut ? FIRST_POSITION_SHELL : target)) * (nut ? 0.45 : pull) +
        (spanOf(v.notes.map((n) => n.fret)) > 3 ? 0.4 : 0) +
        (nut && stretched(v) ? FIRST_POSITION_STRETCH : 0) +
        (inHome(v, home) ? 0 : 5)
    );
}

/**
 * A shell that sounds every string of its instrument: each ukulele shell (root, 3rd, 7th and a
 * helper 5th across the four strings), never a guitar one (three or four notes of six, the rest
 * muted). It is a strummed chord like the uke triads, and it is taught the same way: first
 * position, open strings ringing — C6 and Am7 are 0-0-0-0, C7 is 0-0-0-1, Cmaj7 0-0-0-2 in
 * every ukulele method. So it takes the triads' costs whole (`byHand`, #1609), their
 * open-string credit among them (`openStringCredit`, #1607).
 *
 * A guitar shell does not. There an open string turns the movable shape being learned into a
 * one-off for one root (Fmaj7 1-0-2-x-x-x, B♭6 x-1-x-0-3-x), and with the credit a chart at
 * the nut swaps its shells for a different such grip per chord. Where the same root also holds
 * a fretted shell the open form is a last resort (`openShapeOneOff`: Fmaj7 is 1-x-2-2-x-x);
 * otherwise one is still taken when the costs already favour it; it is not sought. At the nut
 * the open-root ones (Am7 x-0-x-0-1-x, A7 x-0-x-0-2-x) give way to the book's full open chords
 * (#1838, `bookGrip`), and up the neck to the closed shells, since their skipped string rings
 * (#1850, `ringsASkippedString`).
 */
// Ukulele-only, and so is every rule gated on it. Some of the guitar's open 7ths sound all six
// strings (E7 0-2-0-1-0-0, #1838), but they are one root's book chord with a tier of their own
// (`bookGrip`), not a strummed chord to cost by the hand: kept on the comper's costs, the shells
// beside them place themselves as they did beside the open shell on that root.
const strumsEveryString = (v: { notes: Note[] }, inst: InstrumentDef): boolean =>
    inst.id === 'uke' && v.notes.length === inst.strings;

/**
 * A grip costed by the fretting hand (`triadUnaryCost`, `triadTransCost`) and held to one grip
 * per symbol (`unifyGrips`): every triad and power grip, and a shell that strums every string
 * (#1609). The other costs — the hand mid-window, the root's path from string to string — are a
 * jazz comper's, for a shell whose root sits on a bass string under muted ones. A ukulele has
 * no bass string and mutes nothing under its chords (it leaves a string out only for a power
 * chord, by not strumming it): its 7th chord is a strummed four-string chord exactly like
 * its triad, taught on the same page, so the two are costed alike. That also leaves no seam in
 * a chart that mixes them: C to Am7 is 0-0-0-3 to 0-0-0-0 by the same reckoning either way,
 * where a shell read by `center` took the pair up the neck (5-4-3-3 to 2-4-3-3).
 */
const byHand = (v: Voicing, inst: InstrumentDef): boolean =>
    v.shape.kind !== 'shell' || strumsEveryString(v, inst);

/** Keep the hand still and the root's path simple: same string or the neighboring string, few frets. */
function transCost(a: Voicing, b: Voicing, home: HomeWindow | null, inst: InstrumentDef): number {
    // Either grip read by the hand, and the move is: on a ukulele that is every move, on a
    // guitar a move to or from a triad or power grip. Two guitar shells keep the root's path.
    if (byHand(a, inst) || byHand(b, inst)) {
        return triadTransCost(a, b, home, inst);
    }
    const ra = a.notes.find((n) => n.role === 'R')!,
        rb = b.notes.find((n) => n.role === 'R')!;
    const ds = Math.abs(ra.string - rb.string),
        df = Math.abs(ra.fret - rb.fret);
    const rootCost = ds === 0 ? df * 0.35 : ds === 1 ? df * 0.6 : 1.2 + df * 0.6;
    return (
        Math.abs(center(b) - center(a)) * 0.7 +
        rootCost +
        (a.shape.id !== b.shape.id && a.root.pc === b.root.pc ? 0.5 : 0)
    );
}

// ---------- triad and power grips (#1588) ----------
//
// A shell's costs are a jazz comper's: the hand sits mid-window and the ROOT takes a simple path
// (up a 4th is "same fret, one string over"), because the root on a bass string is the shell's
// whole story. A triad is the opposite: its inversions move the root around on purpose, and an
// open string costs the hand nothing — the first-position C, Am, F and G a uke player learns
// are "in position" at the nut. So a triad's position is read off its FRETTED notes only, its
// move cost follows each voice on its own string and keeps the string set (#1597), and in first position (a window from
// fret 1, or no window) each open string earns a little: open strings ring, and they are the
// whole point of the chords a player learns first.
//
// A ukulele's shells are costed here too (`byHand`, #1609): strummed across all four strings,
// they are the same kind of chord.

/** Where the fretting hand is for a triad grip: the fretted notes' centre; at the nut when all open. */
function handAt(v: Voicing): number {
    const fretted = v.notes.filter((n) => n.fret > 0).map((n) => n.fret);
    return fretted.length ? (Math.min(...fretted) + Math.max(...fretted)) / 2 : 0;
}

/** First position: the nut is in reach, so open strings are part of the hand's position. */
const atTheNut = (home: HomeWindow | null): boolean => home === null || home[0] === 1;

/**
 * A strummed chord with every string open, in first position (#1609): the ukulele's C6 and
 * Am7, 0-0-0-0. The fretting hand is not on the neck at all, so the chord has no position: it
 * is played from wherever the hand is and left for wherever the next chord wants it. Read as
 * "the hand at fret 0" (`handAt`) it looked two or three frets from the chords around it, and C
 * to Am7 cost a shift that nobody makes. Only at the nut — up the neck four open strings mean
 * the hand has left its position, and fret 0 is the honest reading — and only for a grip that
 * strums every string: a guitar triad on three open strings (Em x-x-x-0-0-0) still has three
 * strings to keep quiet.
 */
const handFree = (v: Voicing, home: HomeWindow | null, inst: InstrumentDef): boolean =>
    atTheNut(home) && strumsEveryString(v, inst) && v.notes.every((n) => n.fret === 0);

/**
 * What a grip's open strings earn in first position, 0.2 each: they ring, cost no finger, and
 * are the whole point of the chords a player learns first. Against the pull to the target
 * fret (`unaryCost`), one open string is worth under half a fret at 0.45 a fret (no window, or
 * a ukulele at the nut) and a fret and a third at 0.15 (a guitar triad inside its window):
 * enough to choose the open grip among those near the hand — the uke's G7 0-2-1-2, half a fret
 * below its target, over 4-5-3-5 two frets above it — never enough to carry a grip across the
 * neck. Up the neck an open string earns nothing.
 *
 * On a guitar, only a grip that is part of its chord's open form earns it (#1833,
 * `openFormGrip`). Aimed at first position (#1827), the credit took grips no teacher shows over
 * the top of a closed book grip: E♭ x-1-1-0-x-x for x-x-x-3-4-3.
 */
function openStringCredit(v: Voicing, home: HomeWindow | null, inst: InstrumentDef): number {
    if (!atTheNut(home) || (inst.id === 'guitar' && !openFormGrip(v))) {
        return 0;
    }
    return v.notes.filter((n) => n.fret === 0).length * 0.2;
}

/** Each of `GUITAR_OPEN_CHORDS` as its chord (root pitch class and quality) and its frets by string. */
const OPEN_FORMS: { pc: number; quality: Quality; frets: Map<number, number> }[] =
    GUITAR_OPEN_CHORDS.map(([pc, quality, tabs]) => {
        const cells = tabs.split(' ');
        const frets = new Map<number, number>();
        cells.forEach((t, i) => {
            if (t !== 'x') {
                frets.set(cells.length - i, Number(t));
            }
        });
        return { pc, quality, frets };
    });
const OPEN_FORM_QUALITIES = new Set(OPEN_FORMS.map((f) => f.quality));

/**
 * A guitar triad or power grip whose open strings ring as a teacher shows them (#1833): every
 * note on the string and fret it has in one of its chord's open forms (`GUITAR_OPEN_CHORDS`,
 * same root and quality). E x-x-2-1-0-x and Esus4 x-x-2-2-0-x are the middles of the open E and
 * Esus4, Fsus2 x-x-3-0-1-x the bottom of x-x-3-0-1-1, A x-x-x-2-2-0 the open A's top. E♭
 * x-1-1-0-x-x is part of none, nor Cm x-3-1-0-x-x or Gm x-1-0-0-x-x: those chords have no open
 * form, and their closed grip is the book's.
 *
 * A diminished or augmented triad keeps the credit whatever its grip: the table has no open
 * forms for those to be judged against, and taking it away moved the open chords beside them
 * up the neck (`E E° E` in frets 1–6 went from x-2-2-1-x-x / x-1-2-0-x-x to x-x-x-4-5-4 /
 * x-x-x-3-5-3, and the open E7 of #1827's chart closed again).
 */
const openFormGrip = (v: Voicing): boolean =>
    !OPEN_FORM_QUALITIES.has(v.quality) ||
    OPEN_FORMS.some(
        (f) =>
            f.pc === v.root.pc &&
            f.quality === v.quality &&
            v.notes.every((n) => f.frets.get(n.string) === n.fret),
    );

/**
 * A guitar triad at the nut that rings an open string but is part of no open form (#1857,
 * `openFormGrip`): Cm x-3-1-0-x-x and x-x-1-0-1-x, E♭ x-1-1-0-x-x, Gm x-1-0-0-x-x, C♯m
 * x-x-x-1-2-0, A♭m x-x-1-1-0-x. No teacher shows these; the chord's lesson grip is the book's
 * (`lessonGrip`: Cm x-x-x-5-4-3, E♭ x-x-x-3-4-3). Sus chords are left alone: Csus2 x-3-0-0-x-x
 * is the open Csus2's fragment in all but name, and the open sus grips are #1843's business.
 * A diminished or augmented triad is never one (`openFormGrip` does not judge them), and a
 * power chord is not asked (`kind === 'triad'`).
 */
const offFormOpen = (v: Voicing, home: HomeWindow | null, inst: InstrumentDef): boolean =>
    inst.id === 'guitar' &&
    atTheNut(home) &&
    v.shape.kind === 'triad' &&
    !v.shape.book &&
    v.quality !== 'sus2' &&
    v.quality !== 'sus4' &&
    v.notes.some((n) => n.fret === 0) &&
    !openFormGrip(v);

/**
 * The string sets a lesson grip sits on, by their lowest string: G-B-E (3-2-1) and D-G-B
 * (4-3-2), the top strings a rhythm player is taught triads on.
 */
const LESSON_SETS = new Set([1, 2]);

/**
 * A grip a teacher shows for a triad (#1861, DECISION 2026-10-22): a closed triad, every note
 * fretted, on the top two string sets, G-B-E or D-G-B, in any of its three inversions
 * (`closedTriads`). These are the tops of the barre chords a lesson teaches: Cm x-x-x-5-4-3 (the
 * A shape's), Gm x-x-x-3-3-3 (the E shape's), E♭ x-x-x-3-4-3, C♯m x-x-x-6-5-4, A♭m x-x-x-4-4-4.
 * A triad on A-D-G (A♭m x-2-1-1-x-x) is not one: it sits under the barre's top, where no lesson
 * stops, and as the cheapest closed grip it read worse in 17 of #1857's 21 lost lines. Nor is
 * a grip with an open string, a book chord or a shell. Guitar only: the ukulele's triads strum
 * every string and have no string sets. On the guitar every triad shape but the book chords is
 * a `closedTriads` set, three neighbouring strings, so the lowest string names the set. The
 * quality is not asked: a diminished, augmented or sus triad there (D° x-x-3-1-3-x) is one too,
 * which counts where it stands beside the chord being replaced.
 */
export const lessonGrip = (v: Voicing, inst: InstrumentDef): boolean =>
    inst.id === 'guitar' &&
    v.shape.kind === 'triad' &&
    !v.shape.book &&
    v.notes.every((n) => n.fret > 0) &&
    LESSON_SETS.has(lowString(v));

/**
 * Grip `a` is grip `b`'s shape slid along the neck (#1857): `b` sounds every string `a` does,
 * each at `a`'s fret moved by the same number of frets. A♭m x-x-1-1-0-x is B♭m x-x-3-3-2-x two
 * frets down; C♯m x-x-x-1-2-0 is the top of the open Dm x-x-0-2-3-1 a fret down. The hand keeps
 * its shape and moves it, so `a` beside `b` is a grip in place, whatever else it is. `b` may
 * sound more strings than `a` (Dm's open D), never fewer. (A move of no frets is the same grip,
 * which a different chord beside it never is.)
 */
export const slidFrom = (a: Voicing, b: Voicing): boolean => {
    const frets = new Map(b.notes.map((n) => [n.string, n.fret]));
    const moves = a.notes.map((n) => (frets.get(n.string) ?? Number.NaN) - n.fret);
    return moves.every((m) => m === moves[0]);
};

function triadUnaryCost(
    v: Voicing,
    target: number,
    pull: number,
    home: HomeWindow | null,
    inst: InstrumentDef,
): number {
    return (
        (handFree(v, home, inst) ? 0 : Math.abs(handAt(v) - target) * pull) +
        (spanOf(v.notes.map((n) => n.fret)) > 3 ? 0.4 : 0) +
        (inHome(v, home) ? 0 : 5) -
        openStringCredit(v, home, inst)
    );
}

/** The grip's lowest string: where its string set sits across the neck. */
const lowString = (v: Voicing): number => Math.min(...v.notes.map((n) => n.string));

/**
 * Voice-lead on a string set (#1597), the way a guitarist comps a pop loop: keep the same three
 * strings and move through the inversions, each voice stepping or holding. Three terms:
 *
 * - **Stay on the set.** The sets are compared by their lowest string, which is how a player
 *   names one ("the 4-3-2 set") and stays well-defined between a two-note power chord and a
 *   three-note triad, where an overlap count would read a smaller grip as a move. A ukulele
 *   has no string sets: every grip but a power chord strums all four strings. There it fires
 *   only between a grip that sounds the A string and a power grip that leaves it out, the
 *   three-string G shape (G5 0-2-3-x, A5 2-4-5-x) or the C–E two-string grip (F♯5 x-1-2-x);
 *   never for B♭5 x-x-1-1 or B5 x-x-2-2, which keep the A string. So on a ukulele it reads as
 *   a change of strum, all four strings or one left out, and as that it does work a teacher's
 *   grips rely on, so it stays (#1812). Dropped for the ukulele it moved 2–3 of 1,801 charts
 *   at the nut and 37–43 in each window from fret 2 up, and lost three things: the open A5
 *   beside the open chords in frets 2–7 (`Am A5 Am` 2-0-0-0 / 2-4-0-0 / 2-0-0-0 went to
 *   2-4-5-3 / 2-4-5-x, the closed pair #1688's review ruled out), a power riff's one shape as
 *   it slides up the neck (`E5 G5 A5 E5` in frets 5–10 ends 9-9-12-12, and went back down to
 *   2-4-5-x), and the riffs at the nut (`B♭5 D♭5 E♭5 B♭5` left the book's x-x-1-1 beside D♭5
 *   1-1-4-4 for 3-5-6-x; with no window, `B♭5 E♭5 F5` 3-5-6-x / 3-3-6-6 / 5-5-8-8 dropped F5
 *   to x-0-1-x). What dropping it gained was not this term's to give: up the neck, a lone
 *   power chord between strummed chords whose window holds no grip for it took the four-string
 *   grip two frets out over the three-string one a fret past (`F F5 F` in frets 7–12 was
 *   10-9-8-8 / 5-5-8-8 / 10-9-8-8, where a player keeps the hand at 10-12-13-x), because the
 *   three-string grip was not on offer there. Since #1814 it is (`powerAFretPast`), and this
 *   term is left as it was.
 * - **Move by step.** Each note of the new grip is costed on its own string: a common tone (same
 *   string, same fret) is free, a slide costs by its fret distance (an open string is fret 0), a
 *   string that was silent before is a fresh placement. A note on an open string costs nothing in
 *   first position (the finger simply lifts and the string rings, the uke's 0003 → 2000 move);
 *   up the neck it is fret 0, a reach all the way back to the nut.
 * - **Keep the hand where it is.** A shift inside one fret is free — the hand has not moved, a
 *   finger has reached. Nor has it moved to or from a chord that is all open strings
 *   (`handFree`): there is no hand on the neck to shift.
 */
function triadTransCost(
    a: Voicing,
    b: Voicing,
    home: HomeWindow | null,
    inst: InstrumentDef,
): number {
    // A guitar book chord (#1838, #1849) is no string set: it strums every string from its root
    // up, and the grip beside it has no set of its own to stay on (measured for the 7ths; the
    // open triads beside each other have no other grip to choose). Read by its top
    // string it pulled the grips beside it onto the top strings (F5 1-3-3-x-x-x beside Fmaj7
    // x-x-3-2-1-0 went to x-x-3-5-6-x, 37 sweep lines); read as a set holding every string it
    // sounds, the same, since F5's set lies below it. Read by its bass string, the hand jumps
    // of three frets or more this change adds at the nut doubled (184, against 92 with no set
    // term). So the move is left to the step and shift terms.
    const sets = a.shape.book || b.shape.book ? 0 : Math.abs(lowString(b) - lowString(a));
    // One string over is a real choice (a player would rather not, 1.2 ≈ an eight-fret slide's
    // worth of finger travel); each further string is a register jump that leaves the comping
    // range the ear was following, so it costs more again (+1.5 a string).
    const setCost = sets === 0 ? 0 : 1.2 + (sets - 1) * 1.5;
    const was = new Map(a.notes.map((n) => [n.string, n.fret]));
    const lifts = atTheNut(home);
    // On one root (D to Dsus4, E♭ to E♭sus4) the chord stays under the hand and only what
    // changes moves (#1809): D 2-2-2-0 to Dsus4 2-2-3-0 is one finger up a fret. Lifting a finger
    // off a tone both chords hold, to sound a different open string, gives up that held note,
    // so it is priced as the move it is rather than as a free lift. Free, it priced Dsus4
    // 0-2-3-0 as half a round trip from D, and which Dsus4 a chart got hung on its order
    // (`Dsus4 D Dsus4` 0-2-3-0, `D Dsus4 D` 2-2-3-0; `E♭sus4 E♭` 3-3-4-1 for 1-3-4-1, the 3rds
    // of E♭ 0-3-3-1 each up a fret). Between roots a lift stays free: C 0-0-0-3 to Am 2-0-0-0.
    // A ukulele's only: on a guitar it moved 18–25 triad charts per nut setup nobody reviewed,
    // and the guitar's open-string grips are one inversion among three, not the book's one grip.
    const pitchOf = (s: number, f: number) => mod(inst.open[s] + f, 12);
    const bTones = new Set(b.notes.map((n) => pitchOf(n.string, n.fret)));
    const holds = (s: number, before: number | undefined) =>
        inst.id === 'uke' &&
        a.root.pc === b.root.pc &&
        before !== undefined &&
        before > 0 &&
        bTones.has(pitchOf(s, before));
    let stepCost = 0;
    for (const n of b.notes) {
        const before = was.get(n.string);
        if (n.fret === 0 && lifts && !holds(n.string, before)) {
            continue;
        }
        // 0.15 a fret: a one-fret slide is near free, a five-fret leap (0.75) is not.
        // 0.3 for a fresh string: a new finger placed, about a two-fret slide's worth.
        stepCost += before === undefined ? 0.3 : Math.abs(n.fret - before) * 0.15;
    }
    const shift =
        handFree(a, home, inst) || handFree(b, home, inst) ? 0 : Math.abs(handAt(b) - handAt(a));
    // 0.7 a fret beyond the first: moving the whole hand is the costliest thing a grip change does.
    return Math.max(0, shift - 1) * 0.7 + setCost + stepCost;
}

/**
 * A guitar shell whose root no fingering gets under the index or middle finger (#1607): the
 * R–3–7 shapes of m7♭5 and °7, where two of the other notes (m7♭5: the ♭3 and ♭5) or all three
 * (°7) sit below the root's fret, on strings no barre can join (Dm7♭5 x-5-3-5-x-4 is 3-1-4-2,
 * its ♭7 level with the root; E°7 x-7-5-6-x-6 is 4-1-2-3). The root is
 * the note the hand finds first and the finger that mutes the skipped string; under the ring or
 * little finger the other three reach back across it. Players take the R–7–3 grip on the same
 * root instead (x-5-6-5-6-x, x-7-8-6-8-x). The fingering planner's own options decide
 * (`fingerOptions`, which includes the barre that frees a root), so a grip it can finger root
 * first — every three-note shell, the 6th-string °7 — is never one of these. Shells only: a
 * triad's root moves with its inversion and the ring finger takes it as often as not
 * (`handCost`), and a ukulele shell has no bass root to anchor.
 */
const rootBuried = (v: Voicing, inst: InstrumentDef): boolean => {
    const root = v.notes.find((n) => n.role === 'R');
    // An open root takes no finger, so it cannot be under a weak one.
    if (v.shape.kind !== 'shell' || !root || root.fret === 0 || strumsEveryString(v, inst)) {
        return false;
    }
    return fingerOptions(v.notes, fingerRules(v.shape, v.notes, inst)).every((o) => {
        const finger = o.p[o.fr.indexOf(root)];
        return finger !== null && finger > 2;
    });
};

/**
 * A three-note guitar shell that is the open-string one-off of a fretted shape (#1610): one of
 * its notes is an open string, and the same root — same string, same fret — holds another shell
 * with every note fretted. B♭7 x-1-0-1-x-x is the R–3–7 shape at the 1st fret with its 3rd
 * fallen on the open D; on that same B♭ sits the R–7–3 shape, x-1-x-1-3-x, which is the grip
 * every method prints there and the one that moves to B7 and C7. All ten such grips on the
 * neck are that case: an R–3–7 shape at the 1st or 2nd fret, its 3rd open, with the R–7–3 shape
 * fretted on the same root (F7 1-0-1-x-x-x, Bm7 x-2-0-2-x-x). The open form is good for
 * this root only (`openOneOff`'s notion, here for the shape's own notes rather than an added
 * tone), and taking the fretted one costs the hand nothing: the root stays where it is. So
 * it is a last resort (`candidates`), as a buried root is.
 *
 * Where the root has no fretted shell, the open form IS the shape at that fret and stays on
 * offer, taken or not on its costs:
 *
 * - A root on an open string (E7 0-x-0-1-x-x, Am7 x-0-x-0-1-x, Dm7 x-x-0-x-1-1): the R–7–3
 *   shape at the nut, the nut holding the root. The R–3–7 shape cannot be built there (its 3rd
 *   would be behind the nut), so there is no fretted grip on that root, and these ten are the
 *   open E, A and D chords a learner already knows, less the 5th. In first position the
 *   chords among them that the book prints whole play that instead (#1838, `bookGrip`), so
 *   up the neck most of these ring their skipped string and give way to a closed shell
 *   (`ringsASkippedString`, #1850).
 * - A 6 chord at the 1st fret (B♭6 x-1-x-0-3-x, F6 1-x-0-2-x-x): both shapes put the 6th on an
 *   open string, so neither is the fretted one. Between B♭7 x-1-x-1-3-x and B♭maj7 x-1-x-2-3-x
 *   it is the same grip with the 3rd string moving 0, 1, 2, and sending it to the 6th fret
 *   instead makes a chart at the nut hop between the two positions.
 *
 * - A 7sus4 or m6 on an open root, or at the 1st fret (#1817): A7sus4 x-0-x-0-3-x, D7sus4
 *   x-x-0-x-1-3, E7sus4 0-x-0-2-x-x, Dm6 x-x-0-x-0-1, B♭m6 x-1-x-0-2-x, Fm6 1-x-0-1-x-x, the
 *   same grips as the 7, m7 and 6 chords beside them with one note moved. One that frets
 *   nothing at all, on three neighbouring open strings, is `openStrum`'s last resort instead.
 *
 * Three-note shells only. A grip with an added tone (m7♭5, °7) was placed by `openOneOff`,
 * which lets one or two open strings ring in first position as the books print it (Bm7♭5
 * x-2-0-2-x-1), and a ukulele shell is taught on its open strings (`strumsEveryString`).
 */
const openShapeOneOff = (v: Voicing, all: Voicing[], inst: InstrumentDef): boolean =>
    v.shape.kind === 'shell' &&
    !strumsEveryString(v, inst) &&
    QUALITIES[v.quality].required.length === 0 &&
    v.notes.some((n) => n.fret === 0) &&
    all.some(
        (w) =>
            w.shape.rootString === v.shape.rootString &&
            w.rootFret === v.rootFret &&
            w.notes.every((n) => n.fret > 0),
    );

/**
 * A guitar grip on three neighbouring open strings: the hand holds nothing, so it is the open
 * strings strummed rather than a grip, and it is a last resort (`candidates`), as an open
 * shell's one-off is. A shell (#1817): the open strings are tuned a 4th apart, so only R–4–♭7
 * lands there, A7sus4 x-0-0-0-x-x and E7sus4 0-0-0-x-x-x; offered, A7sus4's pulled a Wonderwall
 * in frets 1–6 onto the open strings throughout. A triad (#1822): Gsus2 and Dsus4 x-0-0-0-x-x,
 * G x-x-0-0-0-x and Em x-x-x-0-0-0, the only four (a power chord always frets its 5th). A
 * teacher puts a finger down for each: `E Em E` in frets 1–6 is x-x-2-1-0-x / x-x-2-0-0-x,
 * the top of the open chords, not x-x-x-1-0-0 / x-x-x-0-0-0, and `G+ G G+` keeps G's finger,
 * x-2-0-0-x-x. The R–7–3 shape on an open root (Em7 0-x-0-0-x-x) skips a string, so it is not
 * this rule's; its skipped string rings, which is `ringsASkippedString`'s (#1850), and at the
 * nut Em7 is the book's 0-2-0-0-0-0 (#1838). A ukulele strums every string, and its
 * all-open grips (C6 0-0-0-0) are book grips.
 */
const openStrum = (v: Voicing, inst: InstrumentDef): boolean =>
    !strumsEveryString(v, inst) &&
    v.notes.every((n) => n.fret === 0) &&
    v.notes.every((n, i) => i === 0 || Math.abs(n.string - v.notes[i - 1].string) === 1);

/**
 * A grip that skips a string a strum rings (#1850): a muted string between two sounding
 * strings with no fretted note on either side of it. A comper mutes a skipped string with the
 * fretting finger beside it, the bass finger's underside or the next finger's tip (x-5-x-5-7-x,
 * Dmaj7 x-x-0-x-2-2, Emaj7 0-x-1-1-x-x), so those stay. With an open string on both sides no
 * finger is there: A7 x-0-x-0-2-x, A7sus4 x-0-x-0-3-x, Em7 0-x-0-0-x-x and E7sus4 0-x-0-2-x-x
 * ring it. A last resort (`candidates`), like `openStrum`. Only guitar shells skip strings:
 * triads and power grips sit on neighbouring strings, and a ukulele shell sounds every string.
 *
 * It acts up the neck, in a window from the 2nd fret. At the nut and with no window those
 * chords play the book's open chords: every grip it flags (A7, A7sus4, Am7, E7, E7sus4, Em7,
 * Dm6, D6 on their open roots) is a chord with a book grip, the first tier there (`bookGrip`).
 * It needs no exemption either: a strum rings the string at the nut too.
 */
const ringsASkippedString = (v: Voicing): boolean => {
    const fretAt = new Map(v.notes.map((n) => [n.string, n.fret]));
    const sounding = v.notes.map((n) => n.string);
    const fretted = (s: number) => (fretAt.get(s) ?? 0) > 0;
    for (let s = Math.min(...sounding) + 1; s < Math.max(...sounding); s++) {
        if (!fretAt.has(s) && !fretted(s - 1) && !fretted(s + 1)) {
            return true;
        }
    }
    return false;
};

/**
 * How far the window widens when it holds no grip a player would take: one fret, either end
 * (`inReach`). One, because past that the grip is in another position, and where the hand goes
 * then is for the costs to say. Nor would two rescue anything: in no six-fret window of the
 * guitar does a shell have such a grip two frets out, root in the window, and none one fret out.
 */
const REACH = 1;

/**
 * A grip that belongs to the window's position though a note of it is a fret outside (#1610):
 * its root in the window, and no note more than `REACH` past either end (E♭m7♭5 x-6-7-6-7-x in
 * frets 1–6, F♯m7♭5 2-x-2-2-1-x in frets 2–7). The root is what places it: the window is where
 * the musician's hand sits (first position unless they move it, #1840), and a shell is built
 * up from its root, so a grip rooted there is this position's grip for the chord rather than another
 * position's. An open root is in every window, as an open string is for `inHome` (Emaj7
 * 0-x-1-1-x-x in frets 2–7, its two fretted notes a fret below).
 *
 * It says where the grip is, not how far the hand travels to it: the window is six frets and a
 * hand covers four, so such a grip may still be a shift from the chord before (x-7-6-8-x-x
 * after x-2-x-3-4-x). That is the costs' business, and they see it.
 *
 * Shells only: a triad's root moves with its inversion, so it places nothing.
 */
export const inReach = (v: Voicing, home: HomeWindow | null): boolean => {
    const root = v.notes.find((n) => n.role === 'R');
    if (v.shape.kind !== 'shell' || !home || !root) {
        return false;
    }
    return (
        (root.fret === 0 || (root.fret >= home[0] && root.fret <= home[1])) &&
        v.notes.every(
            (n) => n.fret === 0 || (n.fret >= home[0] - REACH && n.fret <= home[1] + REACH),
        )
    );
};

/**
 * The grip a ukulele teacher shows first (#1613, #1675): a strummed chord in first position
 * with a string ringing open and nothing fretted past the 4th fret (`FIRST_POSITION_TOP`) —
 * C 0-0-0-3, F 2-0-1-0, A7 0-1-0-0, E 1-4-0-2, Cm 0-3-3-3. Every such grip the shapes hold is
 * one the method books print (each was read, over the twelve roots and every quality, for
 * #1675); the two open-string grips that are not, Dsus2 2-2-0-5 and Fsus2 0-5-3-3, reach past
 * the 4th fret around the open string and are left out by that.
 *
 * Where a chord has one, it is voiced from those alone (`candidates`). The costs cannot be
 * left to choose: they count finger travel, and one neighbour is enough to make a closed grip
 * the shorter trip. F between two Cm 0-3-3-3 was 2-5-5-3, the Em shape as a major chord, for
 * sharing a fret with it; C beside Fdim 4-5-4-2 was 5-4-3-3; A7 before D7 2-2-2-3 was 2-4-3-4;
 * E beside Eaug 1-4-4-3 was 1-4-4-2. No price on the open grip sorts them: tried as a flat
 * credit, A7 opens beside D7 at 0.4 and F beside Fdim not until 0.8. A player does not weigh
 * it either. They play the grip they know and move for the chord that needs it (DECISION
 * 2026-10-12, which first said so for a symbol voiced two ways).
 *
 * First position only (`atTheNut`): in a window further up an open string is the hand gone
 * back to the nut. And only a grip that strums every string (`strumsEveryString`), as with the
 * other first-position rules of #1609: a guitar triad or power grip on open strings is one
 * inversion among three, not the book's one grip, and a guitar shell's open string is a
 * one-off (`openShapeOneOff`).
 *
 * The guitar's exception is its book chords (`ShapeDef.book`): the open 7ths (#1838,
 * `GUITAR_OPEN_SEVENTHS`) and, since #1849, the open triads and sus chords (`GUITAR_OPEN_CHORDS`,
 * C x-3-2-0-1-0, G 3-2-0-0-0-3, Am x-0-2-2-1-0). At the nut a chord that has one plays it,
 * as a ukulele chord plays its book grip, in a song that sits at the nut around it
 * (`atTheNutAround`, #1859; elsewhere the costs choose); its three-string grips,
 * one inversion among three, are not offered there. The comping shells there skipped a string
 * between two open ones with no finger beside it to mute it (A7 x-0-x-0-2-x, E7 0-x-0-1-x-x,
 * Am7 x-0-x-0-1-x, Em7 0-x-0-0-x-x, A7sus4 x-0-x-0-3-x, Dm6 x-x-0-x-0-1), and a strummed chord
 * rang it; the triads took the open chords' top or bass strings, and dropped the root from the
 * bass beside a book 7th (C x-x-x-0-1-0 beside G7). Every method shows the full chord instead
 * (A7 x-0-2-0-2-0, E7 0-2-0-1-0-0, C x-3-2-0-1-0). Each chord has one such grip, so the tier is
 * that grip. Up the neck none is offered (`candidates`).
 */
const bookGrip = (v: Voicing, home: HomeWindow | null, inst: InstrumentDef): boolean =>
    atTheNut(home) &&
    (v.shape.book === true || (firstPosition(v, home, inst) && v.notes.some((n) => n.fret === 0)));

/**
 * A strummed ukulele grip in first position (#1688): at the nut, nothing fretted past the 4th
 * fret (`FIRST_POSITION_TOP`), the hand where a teacher puts it for the first chords. A chord
 * with no open grip (`bookGrip`) is printed there all the same, closed: B♭ 3-2-1-1, D♭ 1-1-1-4,
 * B♭7 1-2-1-1, C♯7 1-1-1-2, B♭m7 1-1-1-1, D♭maj7 1-1-1-3, Bm7♭5 2-2-1-2, the dim7 1-2-1-2.
 * Where a chord has such a grip it is voiced from those alone (`candidates`), for the reason a
 * book grip is: the costs count finger travel, and one neighbour up the neck pulled the chord
 * up after it. Beside Fdim 4-5-4-2, which has no grip inside the 4th fret, the dim7 went to
 * 4-5-4-5, Bm7♭5 to 4-5-5-5, D♭maj7 to 5-5-4-4 and Dm7♭5 to 5-5-4-5; beside a power chord
 * (F♯5 6-6-9-9, B♭5 3-5-6-x) F♯ went to 6-6-6-4 and B♭ to 3-5-6-5. A player stays in first
 * position and moves the hand only for a chord that has no grip there.
 *
 * Beside a power chord that left the hand jumping to it and back (`F♯ F♯5 F♯` was 3-1-2-1 /
 * 6-6-9-9 / 3-1-2-1) until the books' two-string power grips came in (#1809,
 * `UKE_TWO_STRING_POWER`): it is 3-1-2-1 / x-1-2-x / 3-1-2-1. Power chords stay under this rule
 * on purpose: D♭5's four-string 1-1-4-4 is the one it holds, and left to the costs it became
 * x-x-4-4 and took B♭5 beside it to 3-5-6-x (3 charts of 2,982, all worse).
 *
 * Not a guitar grip (`strumsEveryString`), and not up the neck (`atTheNut`), as for `bookGrip`.
 * A chord with no grip inside the 4th fret (Fdim, Ddim, D5) is left to the steps below.
 */
const firstPosition = (v: Voicing, home: HomeWindow | null, inst: InstrumentDef): boolean =>
    atTheNut(home) &&
    strumsEveryString(v, inst) &&
    v.notes.every((n) => n.fret <= FIRST_POSITION_TOP);

/**
 * A strummed ukulele grip five frets wide (#1675): the index and the little finger four frets
 * apart with the other two between them, on a neck where every chord has a grip of four frets
 * or fewer. They are the minor, diminished and sus2 forms of two shapes whose major form is
 * fine. The Em shape drops its G-string note a fret or two (Gm 3-7-6-5, Fdim 1-5-4-2), where
 * the D shape plays the same chord with that one string up at the others (7-7-6-5, 4-5-4-2);
 * it is a grip only where the G string is open (Em 0-4-3-2). The C shape reaches up for its top
 * note (Ddim 1-2-1-5, E♭m 3-3-2-6); it is a grip only where strings ring open (C♯m 1-1-0-4).
 * `spanOf` reads fretted notes alone, so both of those stay.
 *
 * A last resort (`candidates`), like a guitar shell's buried root: up the neck it is taken
 * when nothing else is in the window or a fret past it. In first position it gives way only to
 * a grip that stays there (`leavesTheNut`).
 */
const fiveFretReach = (v: Voicing, inst: InstrumentDef): boolean =>
    strumsEveryString(v, inst) && spanOf(v.notes.map((n) => n.fret)) > 3;

/**
 * First position and its reach: frets 1 to `HOME_FRETS`, the window the stand opens a ukulele
 * on and the one `atTheNut` means. With no window it is the same place: a chart nobody has
 * placed is aimed there (`unaryCost`).
 */
const NUT_WINDOW: HomeWindow = [1, HOME_FRETS];

/**
 * In first position, a chord whose only grips there are five-fret reaches (#1675): Ddim, whose
 * 1-2-1-5 is the one D diminished triad inside frets 1–6. There the reach is kept, because
 * the other choice is to leave first position, and leaving costs the whole chart: with Ddim at
 * 7-5-4-5 the chords beside it went up after it (B♭ Ddim E♭ F opened on B♭ 3-5-6-5 for
 * 3-2-1-1, F7 Ddim on 5-5-5-6 for 2-3-1-3; 179 of 631 charts tried), and where they stayed the
 * hand hopped five frets and back for one chord. A wide grip in place beats that.
 *
 * The bound is the nut window's own top, the 6th fret, not the 4th fret a book grip is held to
 * (`FIRST_POSITION_TOP`): the grip a reach gives way to need only stay where the hand already
 * may go, and Fdim 4-5-4-2, which replaces 1-5-4-2, has a 5th-fret note. Every other triad has
 * such a grip, so only Ddim is touched by this.
 */
const leavesTheNut = (all: Voicing[], home: HomeWindow | null, inst: InstrumentDef): boolean =>
    atTheNut(home) &&
    !all.some(
        (v) => strumsEveryString(v, inst) && !fiveFretReach(v, inst) && inHome(v, NUT_WINDOW),
    );

/**
 * A strummed ukulele grip no more than a fret (`REACH`) past the window (#1675): what a window
 * up the neck widens to when all it holds is a `fiveFretReach`. E♭m in frets 2–7 is 3-3-2-1
 * or 8-6-6-6 for 3-3-2-6, F♯m in frets 5–10 6-6-5-4 or 11-9-9-9 for 6-6-5-9. A guitar
 * shell's reach asks for the root inside (`inReach`), because a shell is built up from its root
 * and the window is where the roots fall. A ukulele chord has no such anchor: its root moves
 * from string to string with the shape, so only the distance is asked.
 *
 * Never a window from the nut (`atTheNut`): a fret past frets 1–6 is out of first position,
 * and the chart follows the chord that goes there (`leavesTheNut`).
 */
const aFretPast = (v: Voicing, home: HomeWindow | null, inst: InstrumentDef): boolean =>
    home !== null &&
    !atTheNut(home) &&
    strumsEveryString(v, inst) &&
    v.notes.every((n) => n.fret === 0 || (n.fret >= home[0] - REACH && n.fret <= home[1] + REACH));

/**
 * A ukulele power chord's three-string grip, the G shape, no more than a fret past a window up
 * the neck (#1814): where the hand stays when a power chord falls among strummed chords and
 * the window holds no grip for it. `F F5 F` in frets 7–12 is 10-9-8-8 / 10-12-13-x /
 * 10-9-8-8, E♭5 beside E♭ in frets 5–10 8-10-11-x, D♭5 beside D♭ in 3–8 6-8-9-x. Left to the
 * costs, every grip out of the window paid the same, and the four-string grip two frets out
 * won on the notes it shares with the chord beside it (5-5-8-8, 3-3-6-6, 1-1-4-4): the hand
 * left the window for one chord and came back.
 *
 * A step of its own in `candidates`, after `aFretPast`'s, for two reasons.
 *
 * - **Four strings first.** A grip that leaves a string out is taken only where no grip that
 *   strums every string is in reach, as the two-string grips are at the nut (`ShapeDef.nutOnly`,
 *   #1809). So A5 in frets 3–8 is still the book's 2-4-0-0, all four strings, and not
 *   2-4-5-x: both sit a fret below the window, and a strummed chart would have to skip the A
 *   string for the closed one. Offered together, the costs took 2-4-5-x for A5 alone.
 * - **Not in a riff** (`inRiffAt`). Beside another power chord the hand moves with the riff's
 *   shape, and the costs keep it: offered there, the three-string grip pulled the riff apart
 *   (`A♭5 D♭5 E♭5` in frets 3–8 went from 1-3-4-x / 1-1-4-4 / 3-3-6-6 to 8-8-11-11 / 6-8-9-x /
 *   3-3-6-6, `C5 F5 G5` in 7–12 to 12-12-15-15 / 10-12-13-x / 7-7-10-10).
 *
 * Fretted only: every note within the widened window, none open, since up the neck an open
 * string is the hand gone back to the nut. Offered the open G5 0-2-3-x in frets 3–8, `G G5 G`
 * went from 7-7-7-5 / 7-7-10-10 to 4-7-7-5 / 0-2-3-x, where the index stays at the 7th fret.
 * The four-string open forms (A5 2-4-0-0, E5 4-4-0-2) are `aFretPast`'s, as they were. Never
 * at the nut (`atTheNut`), where the two-string grips cover these chords.
 */
const powerAFretPast = (v: Voicing, home: HomeWindow | null, inst: InstrumentDef): boolean =>
    home !== null &&
    !atTheNut(home) &&
    inst.id === 'uke' &&
    v.shape.kind === 'power' &&
    v.notes.every((n) => n.fret >= home[0] - REACH && n.fret <= home[1] + REACH);

/**
 * A power chord in a riff (#1814): the nearest different chord before or after it in the chart
 * is a power chord too. A chord repeated is the same chord, so `E♭5 E♭5 F5` is a riff.
 * `voiceChart` reads it per symbol: one occurrence in a riff puts every occurrence there.
 */
const inRiffAt = (chart: ChartChord[], i: number): boolean =>
    chart[i].quality === 'five' &&
    [-1, 1].some((step) => nextDifferent(chart, i, step)?.quality === 'five');

/**
 * The nearest chord before (`step` −1) or after (+1) `chart[i]` that is a different chord.
 * With `around`, the chart is read as the form that comes round: past its last chord is its
 * first again.
 */
const nextDifferent = (
    chart: ChartChord[],
    i: number,
    step: number,
    around = false,
): ChartChord | undefined => {
    const key = chordKey(chart[i]);
    const n = chart.length;
    for (let k = 1; k < n; k++) {
        const j = i + step * k;
        if (!around && (j < 0 || j >= n)) {
            return undefined;
        }
        const c = chart[((j % n) + n) % n];
        if (chordKey(c) !== key) {
            return c;
        }
    }
    return undefined;
};

/** A chord's grips as `candidates` sorts them (`offered`). */
interface Offered {
    /** Every grip on offer anywhere on the neck. */
    all: Voicing[];
    /** Those inside the window. */
    inside: Voicing[];
    /** The grips of a list a player would take: step 2's filter. */
    clear: (grips: Voicing[]) => Voicing[];
}

/**
 * A chord's grips and the filter `candidates` sorts them by, shared with `takenAtTheNut` so
 * "a grip a player would take" is one rule.
 */
function offered(c: ChartChord, opts: VoiceOptions): Offered {
    const home = opts.home ?? null;
    const inst = opts.instrument;
    const every = allPositions(inst, c.root, c.quality, { rootStrings: opts.rootStrings });
    // A two-string power grip (`ShapeDef.nutOnly`, #1809) is what the books print for a power
    // chord that has nothing else near the nut (F5 x-0-1-x, F♯5 x-1-2-x, B♭5 x-x-1-1, B5
    // x-x-2-2), so it is offered only there: at the nut, and only to a chord with no other grip
    // inside the 4th fret. A muted string costs the plan nothing, so offered beside G5 0-2-3-x
    // or A♭5 1-3-4-x it took G5 Bsus4 to x-2-3-x and E♭5 A♭5 to x-3-4-x; up the neck it took
    // `C C5 C` in frets 2–7 off 0-0-0-3 / 0-0-3-3 to 5-4-3-3 / x-x-3-3.
    const nearTheNut = every.some(
        (v) => !v.shape.nutOnly && v.notes.every((n) => n.fret <= FIRST_POSITION_TOP),
    );
    // The guitar's book chords are the nut's alone (#1838, #1849): in a window from the 2nd
    // fret up an open chord is the hand gone back to the nut, and A7 x-0-2-0-2-0, every note
    // inside frets 2–7, would otherwise be on offer there beside the shells.
    const all = every.filter(
        (v) =>
            (!v.shape.nutOnly || (atTheNut(home) && !nearTheNut)) &&
            (!v.shape.book || atTheNut(home)),
    );
    const reachStays = leavesTheNut(all, home, inst);
    const clear = (grips: Voicing[]) =>
        grips.filter(
            (v) =>
                !rootBuried(v, inst) &&
                !openShapeOneOff(v, all, inst) &&
                !openStrum(v, inst) &&
                !ringsASkippedString(v) &&
                (reachStays || !fiveFretReach(v, inst)),
        );
    const inside = all.filter((v) => inHome(v, home));
    return { all, inside, clear };
}

/**
 * A chord a player would take in first position (#1859): a grip inside the window that step 2
 * of `candidates` does not hold back (`clear`), or the chord's own book chord (`bookGrip`),
 * with nothing fretted past the 4th fret (`FIRST_POSITION_TOP`). What `atTheNutAround` asks
 * of the chords beside a book chord.
 */
const takenAtTheNut = (c: ChartChord, opts: VoiceOptions): boolean => {
    const home = opts.home ?? null;
    const { inside, clear } = offered(c, opts);
    return inside.some(
        (v) =>
            v.notes.every((n) => n.fret <= FIRST_POSITION_TOP) &&
            (bookGrip(v, home, opts.instrument) || clear([v]).length > 0),
    );
};

/**
 * Whether a guitar chord's book chord is offered alone (#1859): the song is at the nut around
 * it. Some occurrence of the chord has a neighbour, the nearest different chord before or after
 * it, that a player takes in first position (`takenAtTheNut`). A teacher keeps the hand where
 * the song lives: in an open-position song (`C G Am F`, `E A B7 E`, `F C F`, whose F has
 * x-3-3-2-x-x) the open chord is the one taught, but between two chords with nothing near the
 * nut the open chord is a jump there and back for one chord. `Cdim C Cdim` took the open C
 * x-3-2-0-1-0 between two closed diminished grips x-x-x-5-4-2; it is x-x-x-5-5-3, a finger
 * from them. There the book chord joins the grips step 2 of `candidates` offers, and the costs
 * choose; a book 7th step 2 holds back (G7, C7, B7, Cmaj7, Fmaj7) is left out, and a shell
 * taken.
 *
 * Decided per symbol, in `voiceChart`, as `inRiffAt` is: `unifyGrips` holds every occurrence of
 * a symbol to one grip, so every occurrence must be offered the same grips. It is also #1839's
 * rule: a learner gets one grip per chord per song, so if any C sits beside an open-position
 * chord, every C is the open C. A neighbour that has a book chord of its own counts, whatever
 * its own neighbours: the test asks where the song can sit, not what the plan picks there.
 *
 * The form comes round (`nextDifferent`'s `around`): the chord before the first is the last,
 * as the band plays it and the neck steps through it. Read off the page alone, the first or
 * last chord had one neighbour, and where that one had nothing near the nut the open chord
 * left a song that is open everywhere else: `C D♭°7 Dm7 G7` opened on x-x-5-5-5-x for the
 * open C beside the open G7 it comes back from, `D E♭°7 Em7 A7` on x-x-4-2-3-x, and a lone A
 * after D♭5 x-4-6-6-x-x took x-4-2-2-x-x, though the chart's first chord, B♭sus2 x-3-3-3-x-x,
 * follows it (9 of 102 such sweep lines read worse that way; with the form read round, none).
 * A chart of one chord has nothing beside it to say where the song sits: the window does, and
 * from the nut that is first position.
 */
const atTheNutAround = (
    chart: ChartChord[],
    i: number,
    takenThere: (c: ChartChord) => boolean,
): boolean => {
    const beside = [-1, 1]
        .map((step) => nextDifferent(chart, i, step, true))
        .filter((c) => c !== undefined);
    return beside.length === 0 || beside.some(takenThere);
};

/**
 * The grips a chord is voiced from: the first of these that holds any.
 *
 * 1. A ukulele chord's book grips in first position (`bookGrip`, #1675): where it has one, it
 *    is the chord, whatever stands beside it. A guitar chord's open book chord, there, the
 *    same way (#1838's 7ths, #1849's triads and sus chords), where the song is at the nut
 *    around it (`atTheNutAround`, #1859); elsewhere the book chord is one of step 2's grips.
 *    Else, its closed grips there (`firstPosition`,
 *    #1688). Nothing step 2 holds back is among either: no strummed grip has a buried root or
 *    is an open shell's one-off, and none inside the 4th fret is five frets wide.
 * 2. Grips inside the hand window that a player would take: every one but those with a buried
 *    root (`rootBuried`), the open-string one-offs of a fretted shape (`openShapeOneOff`), a
 *    guitar grip on three open strings alone (`openStrum`, #1817, #1822), a grip that rings a
 *    skipped string (`ringsASkippedString`, #1850) and a ukulele's five-fret reaches
 *    (`fiveFretReach`; in first position only where the chord has another grip there,
 *    `leavesTheNut`). Where the window has one, nothing below is looked at.
 * 3. Such grips with the window widened by a fret: a shell's with its root in the window
 *    (`inReach`, #1610), a strummed ukulele chord's wherever its root is, in a window up
 *    the neck (`aFretPast`). They
 *    are this position's grips for the chord, so they come before the awkward one inside and
 *    before a grip somewhere else on the neck (in frets 1–6, roots on the 6th and 5th strings,
 *    E♭m7♭5 is x-6-7-6-7-x, not x-6-4-6-x-5; E♭maj7, which has no grip inside at all, is
 *    x-6-5-7-x-x and not the 11th fret).
 *    Then, where none of those is in reach, a ukulele power chord's three-string grip a fret
 *    past (`powerAFretPast`, #1814), unless the chord is in a riff (`inRiffAt`).
 * 4. Any grip inside the window, those three kinds included: an awkward grip in the place the
 *    musician put the hand is still the right chord, and it beats leaving.
 * 5. Nothing near: every grip on the neck, those three kinds last, and the costs pick (they
 *    keep it close: Em7♭5 in frets 1–6 is x-7-8-7-8-x, its root one fret out and its top two).
 *
 * So no chord goes unvoiced, and a chord whose window already holds a grip a player would take
 * is voiced exactly as if the wider window were not there. Of the shells, only a guitar's with roots
 * kept to the 6th and 5th strings ever get past step 2: with the 4th string's shapes
 * every chord has such a grip in every six-fret window, as every ukulele shell does. A guitar
 * triad or power chord has neither a buried root nor a reach, so for it this is the grips
 * inside the window, or every grip when none fits, with the four triads that fret nothing held
 * back (`openStrum`, #1822). A ukulele triad gets
 * to step 3 only where a window up the neck holds nothing but a five-fret reach, and its
 * power chords where such a window holds neither (the four-string grips first, then the
 * three-string one).
 *
 * Each step's grips are all inside the window or all outside it (step 3 is only looked at for
 * what step 2 did not find inside, and step 5 when nothing is inside at all), which is why
 * `unaryCost`'s out-of-window term never picks between them.
 */
function candidates(
    c: ChartChord,
    opts: VoiceOptions,
    inRiff: boolean,
    bookAlone: boolean,
): Voicing[] {
    const home = opts.home ?? null;
    const inst = opts.instrument;
    const { all, inside, clear } = offered(c, opts);
    // A guitar book chord is offered alone only where the song is at the nut around it
    // (`atTheNutAround`, #1859); elsewhere it is among step 2's grips, priced like them, or
    // left out where `clear` holds it back (the open G7, C7, B7, Cmaj7 and Fmaj7, whose root
    // a closed shell holds fretted: `openShapeOneOff`, `rootBuried`). Its own fragments are
    // never among them, at this step or the next, the open chord with strings left out (C x-3-2-0-x-x,
    // Csus4 x-3-3-0-x-x): where the hand would finger part of the open chord a player plays all
    // of it, and at the nut a chord with a book chord never offered them (#1849). Offered,
    // they took `C C5 C` and `Csus4 C5 Csus4` off the open chords onto them.
    const alone = inst.id === 'uke' || bookAlone;
    const book = inside.filter((v) => bookGrip(v, home, inst));
    const fragment = (v: Voicing) =>
        !v.shape.book &&
        book.some((b) =>
            v.notes.every((n) => b.notes.some((m) => m.string === n.string && m.fret === n.fret)),
        );
    const tiers = [
        () => (alone ? book : []),
        () => inside.filter((v) => firstPosition(v, home, inst)),
        () => clear(inside.filter((v) => !fragment(v))),
        () =>
            clear(
                all.filter((v) => !fragment(v) && (inReach(v, home) || aFretPast(v, home, inst))),
            ),
        // Not `clear`ed: it holds only power grips, which are never a buried root, an open
        // shell's one-off or a five-fret reach.
        () => (inRiff ? [] : all.filter((v) => powerAFretPast(v, home, inst))),
        () => inside,
        () => clear(all),
    ];
    for (const tier of tiers) {
        const grips = tier();
        if (grips.length) {
            return grips;
        }
    }
    return all;
}

function stamp<C extends ChartChord>(v: Voicing, c: C): VoicedChord<C> {
    const { root, quality, ...rest } = c;
    return {
        ...v,
        notes: v.notes.map((n) => ({ ...n })),
        ...rest,
        root,
        quality,
        // `buildAt` named it from this same root and quality; restated so an extra field can't shadow it.
        symbol: v.symbol,
    } as VoicedChord<C>;
}

// ---------- one grip per symbol (#1599) ----------

/**
 * How much more a chart may cost, per occurrence that changes grip, to keep one grip per symbol.
 * 2.1 is a whole position: the hand moved four frets, a finger per fret, at `triadTransCost`'s
 * 0.7 a fret beyond the first ((4 − 1) × 0.7). Inside that, the second shape saves less than one
 * position shift each time it is played, and a player keeps the shape already under the fingers
 * (the two Cs of G D Em C G D C D differ by 1.5). Past it the other grip is a different place on
 * the neck, and following the voice leading there is worth a second shape.
 */
const SAME_GRIP_TOLERANCE = 2.1;
/** The cost terms are multiples of 0.025; anything smaller is float noise, never a preference. */
const COST_NOISE = 1e-9;

/**
 * The chord as the voicer sees it. `candidates` builds from the root's pitch class and the
 * quality alone, so that pair is the identity: an enharmonic respelling (C♯ and D♭) is the same
 * chord here, and a slash bass never reaches the voicer (`voicingChord` leaves it to the bass).
 */
const chordKey = (c: ChartChord): string => `${c.root.pc}:${c.quality}`;
/** One of a chord's candidate grips: the shape and where its root sits. */
const gripKey = (v: Voicing): string => `${v.shape.id}@${v.rootFret}`;

/**
 * A grip `unifyGrips` holds to one per symbol: one costed by the hand (`byHand`), and since
 * #1839 a guitar shell in a window from the 1st fret. Up the neck a comper moves a 7th chord
 * between its two root strings on purpose; at the nut a learner is taught one grip per chord
 * and keeps it for the song (F7 in a blues in C was `x x 3 2 4 x` and `1 x 1 2 x x`). Only a
 * window placed at the 1st fret, not a chart with no window, and never a ukulele (its shells
 * are `byHand` already).
 */
const heldToOneGrip = (v: Voicing, inst: InstrumentDef, home: HomeWindow | null): boolean =>
    byHand(v, inst) || learnersShell(v, inst, home);

/**
 * A guitar shell in a window from the 1st fret (#1839), held to one grip whatever it costs
 * (#1851): `unifyGrips` keeps no split for it past `SAME_GRIP_TOLERANCE`. Aimed at the nut, a
 * hold to F♯m7 2-x-2-2-x-x cost more than the tolerance where the chord before it, C♯7
 * x-4-3-4-x-x, keeps its root's path to x-x-4-2-5-x, so `bossa` and `minorDim` in F♯ played
 * F♯m7 both ways; a learner is taught one grip and moves the hand for it.
 */
const learnersShell = (v: Voicing, inst: InstrumentDef, home: HomeWindow | null): boolean =>
    !byHand(v, inst) && inst.id === 'guitar' && home !== null && home[0] === 1;

interface Plan {
    path: Voicing[];
    cost: number;
}

/**
 * The same written symbol keeps one grip (#1599). `viterbi` voices each chord on its own
 * neighbours, so a C after an Em and a C after a D can come out as two shapes, and it cannot
 * see "the same symbol later". So this runs after it. For each symbol the plan voices more than
 * one way, in chart order: re-plan the chart with that symbol held to each grip the plan already
 * used, and keep the cheapest when the chart's cost rises by less than `tolerance` for each
 * occurrence that changed grip. Re-planning, not swapping the grip in place, lets the neighbours
 * move with it (the Em before that C follows it down the neck). Per occurrence, so a loop
 * written out four times decides as the loop written once does. A symbol is decided once, and a
 * grip that is kept stays held while the later symbols are decided.
 *
 * For the grips costed by the hand (`byHand`): triads, power chords, and since #1609 a
 * ukulele's shells, which are strummed chords too. Left to the plan alone, 15 of 140 ukulele
 * charts in frets 1–6 and 49 in frets 5–10 voiced a 7th chord two ways (Gm7 Cm7 D7 Gm7 opened
 * on 3-5-3-5 and closed on 0-2-1-1). A guitar shell is left out up the neck and with no
 * window: its jazz comping moves a chord between its two root strings on purpose. In a window
 * from the 1st fret it is held too (#1839, `heldToOneGrip`), and since #1851 to one grip
 * whatever the hold costs (`learnersShell`).
 *
 * Which grip is the cheapest hold's business alone. From #1613 to #1675 a ukulele symbol in
 * first position took the hold with an open string over a cheaper closed one; a chord that has
 * such a grip is now offered nothing else (`bookGrip`, in `candidates`), so every hold of it is
 * one and there is nothing left to prefer. Since #1688 a chord with a closed grip inside the 4th
 * fret is held to those too (`firstPosition`), so at the nut this rarely has a ukulele shell to
 * settle: it does its work for them up the neck (a blues in G in frets 5–10 plays one C7).
 */
function unifyGrips(
    chart: ChartChord[],
    states: Voicing[][],
    plan: (states: Voicing[][]) => Plan,
    tolerance: number,
    inst: InstrumentDef,
    home: HomeWindow | null,
): Voicing[] {
    const keys = chart.map((c, i) =>
        states[i].every((v) => heldToOneGrip(v, inst, home)) ? chordKey(c) : null,
    );
    const always = new Set(
        chart.filter((_, i) => states[i].every((v) => learnersShell(v, inst, home))).map(chordKey),
    );
    const held = new Map<string, string>();
    const decided = new Set<string>();
    const holding = () =>
        states.map((options, i) => {
            const key = keys[i];
            const grip = key === null ? undefined : held.get(key);
            return grip === undefined ? options : options.filter((v) => gripKey(v) === grip);
        });
    let best = plan(states);
    for (;;) {
        // The grips each undecided symbol is voiced with, and how often, in chart order.
        const used = new Map<string, Map<string, number>>();
        best.path.forEach((v, i) => {
            const key = keys[i];
            if (key === null || decided.has(key)) {
                return;
            }
            const grips = used.get(key) ?? new Map<string, number>();
            grips.set(gripKey(v), (grips.get(gripKey(v)) ?? 0) + 1);
            used.set(key, grips);
        });
        const split = [...used].find(([, grips]) => grips.size > 1);
        if (!split) {
            return best.path;
        }
        const [key, grips] = split;
        decided.add(key);
        const occurrences = [...grips.values()].reduce((a, b) => a + b, 0);
        let pick: (Plan & { grip: string; changed: number }) | null = null;
        // Most used first, then first played (the sort is stable over the Map's insertion
        // order): on equal cost the chart keeps the shape it already plays most.
        for (const [grip, count] of [...grips].sort((a, b) => b[1] - a[1])) {
            held.set(key, grip);
            const options = holding();
            // Every occurrence of a symbol is offered the same grips (`voiceChart` decides
            // riff status per symbol for that, #1814), so a grip one occurrence used is on
            // offer at each. If that ever breaks, a grip some occurrence cannot take is no hold:
            // skipping it leaves the symbol split instead of handing `viterbi` an empty step.
            if (options.some((step) => !step.length)) {
                continue;
            }
            const tried = plan(options);
            if (!pick || tried.cost < pick.cost - COST_NOISE) {
                pick = { ...tried, grip, changed: occurrences - count };
            }
        }
        if (
            pick &&
            (always.has(key) || pick.cost - best.cost < tolerance * pick.changed - COST_NOISE)
        ) {
            held.set(key, pick.grip);
            best = pick;
        } else {
            held.delete(key);
        }
    }
}

/** The grip's lowest fretted fret, where the hand sits; Infinity for a grip that frets nothing. */
const lowFret = (v: Voicing): number =>
    Math.min(...v.notes.filter((n) => n.fret > 0).map((n) => n.fret));

/**
 * The grips of the chords beside each of `at`'s occurrences: the nearest different chord before
 * and after, the form read as coming round, as the band plays it (`nextDifferent`'s `around`).
 */
const gripsBeside = (chart: ChartChord[], path: Voicing[], at: number[]): Voicing[] => {
    const key = chordKey(chart[at[0]]);
    const n = path.length;
    return at.flatMap((i) =>
        [-1, 1].flatMap((step) => {
            for (let k = 1; k < n; k++) {
                const j = (((i + step * k) % n) + n) % n;
                if (chordKey(chart[j]) !== key) {
                    return [path[j]];
                }
            }
            return [];
        }),
    );
};

/**
 * An off-form open triad swapped, after the plan, for its chord's lesson grip (#1857, #1861:
 * `offFormOpen`, `lessonGrip`). Cm x-3-1-0-x-x beside the open C is x-x-x-5-4-3, the A-shape
 * barre's top; C♯m x-x-x-1-2-0 beside B x-x-x-4-4-2 is x-x-x-6-5-4.
 *
 * After the plan, not in `candidates`: holding these grips back there changed what their chord
 * cost everywhere it appears, so the plan moved its neighbours to suit (C6 x-3-2-2-x-x to
 * x-3-x-2-5-x, F5 1-3-3-x-x-x to x-x-3-5-6-x) and broke up lines of barre tops. Here the rest of
 * the path is the plan's: only the chord changes, and only where the plan put it on such a grip.
 * Every occurrence on that grip changes together, so the symbol keeps one grip (`unifyGrips`).
 *
 * Only a lesson grip replaces it, and only where the hand is in one of the two settings a
 * teacher would move it for, at every occurrence: each chord beside it (`gripsBeside`) is an
 * open chord (`ShapeDef.book`) or a lesson grip on the replacement's own string set (a line of
 * barre tops). Among other small closed grips at the nut (A° x-3-1-2-x-x, B7sus4 x-2-2-2-x-x,
 * C6 x-3-2-2-x-x) the little open triad is in place: the hand is already playing small shapes in
 * first position, and every lesson grip of these chords sits from the 3rd fret up. Swapped there
 * too, 16 of 90 judged lines read worse (and 29 of 70 with no check on the neighbours' strings).
 * Chosen by cost alone, without the lesson grip, the replacement was most often one no lesson
 * shows (A♭m x-2-1-1-x-x, Cm x-6-5-5-x-x): 21 of 70 read worse. Counting a grip of an open form
 * (`openFormGrip`) as an open chord too changed nothing: at the nut those chords play their book
 * chord.
 *
 * Of the lesson grips on offer, the cheapest moves into and out of the chord (`trans`), and none
 * that makes more moves of the hand by three frets or more (the lowest fretted note, `lowFret`)
 * beside the chord than the open grip did, the move round the form from the last chord to the
 * first counted too: a barre top sits higher than the open grip, and without the check A♭m
 * x-x-1-1-0-x before D♭ x-x-3-1-2-x went to x-x-6-4-4-x. No cost margin. Where none
 * passes, the plan's grip stays.
 *
 * It also stays where some occurrence of it is the shape of a chord beside it slid along the
 * neck (`slidFrom`), whatever that chord is: A♭m x-x-1-1-0-x after B♭m x-x-3-3-2-x is the same
 * hand two frets down, and C♯m x-x-x-1-2-0 after the open Dm x-x-0-2-3-1 is Dm's top a fret down.
 * Swapped, those were the only 6 of 36 judged lines that read worse: the barre top took the hand
 * off a shape it was moving. Guitar only, in first position (`atTheNut`), as `offFormOpen` and
 * `lessonGrip` say: up the neck no plan holds such a grip, and a ukulele has no lesson grip.
 */
function toLessonGrips(
    chart: ChartChord[],
    states: Voicing[][],
    path: Voicing[],
    trans: (a: Voicing, b: Voicing) => number,
    home: HomeWindow | null,
    inst: InstrumentDef,
): Voicing[] {
    const out = [...path];
    const groups = new Map<string, number[]>();
    out.forEach((v, i) => {
        if (offFormOpen(v, home, inst)) {
            const key = `${chordKey(chart[i])}|${gripKey(v)}`;
            groups.set(key, [...(groups.get(key) ?? []), i]);
        }
    });
    for (const at of groups.values()) {
        const was = out[at[0]];
        const beside = gripsBeside(chart, out, at);
        if (beside.some((b) => slidFrom(was, b))) {
            continue;
        }
        const n = out.length;
        const mine = new Set(at);
        const pick = (g: Voicing, i: number) => (mine.has(i % n) ? g : out[i % n]);
        // The moves that touch the chord, each once (two occurrences side by side share one),
        // the form read round as `gripsBeside` reads it: the move from the last chord back to
        // the first is one too, so a loop voices alike whichever chord the page starts on.
        const edges = n < 2 ? [] : [...new Set(at.flatMap((i) => [(i - 1 + n) % n, i]))];
        const moves = (g: Voicing) =>
            edges.reduce((sum, e) => sum + trans(pick(g, e), pick(g, e + 1)), 0);
        const jumps = (g: Voicing) =>
            edges.filter((e) => {
                const a = lowFret(pick(g, e)),
                    b = lowFret(pick(g, e + 1));
                return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) >= 3;
            }).length;
        // Every occurrence of a symbol is offered the same grips (`voiceChart` decides per
        // symbol), so the first occurrence's are every occurrence's.
        const lessons = states[at[0]].filter(
            (v) =>
                lessonGrip(v, inst) &&
                jumps(v) <= jumps(was) &&
                beside.every(
                    (b) => b.shape.book || (lessonGrip(b, inst) && lowString(b) === lowString(v)),
                ),
        );
        const best = lessons
            .map((v) => ({ v, cost: moves(v) }))
            .reduce<{ v: Voicing; cost: number } | null>(
                (b, c) => (!b || c.cost < b.cost - COST_NOISE ? c : b),
                null,
            );
        if (best) {
            for (const i of at) {
                out[i] = best.v;
            }
        }
    }
    return out;
}

/**
 * Voice a whole chart at once: one grip per chord, chosen so the hand moves as little as possible
 * and the root takes simple paths, a strummed symbol (a triad, a ukulele shell) and a guitar
 * shell in first position kept to one grip where that costs little (`unifyGrips`), then
 * fingers planned across the chart so held notes stay held, between the fingerings each grip
 * is taught with (`fingerSequence`, #1611, #1617).
 * Extra fields on each chart entry (bar, beat, numeral, duration...) are carried through.
 */
export function voiceChart<C extends ChartChord>(chart: C[], opts: VoiceOptions): VoicedChord<C>[] {
    if (!chart.length) {
        return [];
    }
    const home = opts.home ?? null;
    const unary = (v: Voicing) => unaryCost(v, opts);
    const trans = (a: Voicing, b: Voicing) => transCost(a, b, home, opts.instrument);
    const plan = (states: Voicing[][]): Plan => {
        const path = viterbi(states, unary, trans);
        const cost = path.reduce(
            (sum, v, i) => sum + unary(v) + (i ? trans(path[i - 1], v) : 0),
            0,
        );
        return { path, cost };
    };
    // Per symbol, not per occurrence: `unifyGrips` holds every occurrence of a symbol to one
    // grip, so each must be offered the same grips. A symbol in a riff anywhere in the chart is
    // in a riff throughout (a lone F5 beside a riff's F5 plays the riff's grip, #1814).
    const riffs = new Set(chart.filter((_, i) => inRiffAt(chart, i)).map(chordKey));
    // The same per symbol for a guitar book chord (#1859): one occurrence beside a chord a
    // player takes in first position puts the song at the nut around every occurrence.
    const taken = new Map<string, boolean>();
    const takenThere = (c: ChartChord): boolean => {
        const key = chordKey(c);
        if (!taken.has(key)) {
            taken.set(key, takenAtTheNut(c, opts));
        }
        return taken.get(key) === true;
    };
    const atTheNutSymbols = new Set(
        chart.filter((_, i) => atTheNutAround(chart, i, takenThere)).map(chordKey),
    );
    const states = chart.map((c) =>
        candidates(c, opts, riffs.has(chordKey(c)), atTheNutSymbols.has(chordKey(c))),
    );
    // An off-form open triad gives way to its lesson grip once the path is set (#1857, #1861).
    const picked = toLessonGrips(
        chart,
        states,
        unifyGrips(
            chart,
            states,
            plan,
            opts.sameGripTolerance ?? SAME_GRIP_TOLERANCE,
            opts.instrument,
            home,
        ),
        trans,
        home,
        opts.instrument,
    );
    const out = picked.map((v, i) => stamp(v, chart[i]));
    fingerSequence(
        out.map((v) => ({
            notes: v.notes,
            ...fingerRules(v.shape, v.notes, opts.instrument),
            oneFingering: learnersShell(v, opts.instrument, home),
        })),
    );
    return out;
}
