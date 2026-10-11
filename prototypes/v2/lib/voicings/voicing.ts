/**
 * The voicer: every grip a chord can take (`allPositions`), and one chosen per chord of a chart
 * (`voiceChart`).
 *
 * PINNED. `test/shell-characterization.test.ts` holds `voiceChart`'s shell output — shape, root
 * fret, and every note's string, fret, degree, role and finger — to `test/golden.json`, for the
 * charts it lists: all six shell qualities (maj7, 7, m7, m7♭5, °7 and 6) on guitar (both
 * root-string limits) and ukulele (high G, and two low-G charts), with and without a hand
 * window. A change to a shell cost here or in `fingering.ts` (`unaryCost`,
 * `transCost`, `handCost`, `fingerTransCost`) moves it; so does a change to which grips a
 * chord is offered (`allPositions`, a quality's `required` tones, where `buildAt` puts one,
 * what `candidates` holds back as a last resort), to which barre a shell may take
 * (`fingerRules`), and so does letting a newer rule reach a shell, which is why triad rules are
 * gated by `kind`. If the change is meant, regenerate the fixture in the same commit (the
 * test's header says how) and review its diff.
 */
import { assignFingers, type FingerOpts, fingerOptions, fingerSequence } from './fingering';
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
 * `fingerRules` gives a guitar shell.
 */
const mayBarre = (shape: ShapeDef): boolean => shape.kind !== 'shell';

/**
 * What a grip's fingering may use (`FingerOpts`). A triad or power grip takes barres freely. A
 * shell that leaves strings muted — a guitar shell, its root on a bass string — takes only the
 * index barre that frees its root (`rootBarre`, #1607). A ukulele shell rings every string and
 * has no bass root to anchor, so it keeps a finger per note.
 */
const fingerRules = (shape: ShapeDef, notes: Note[], inst: InstrumentDef): FingerOpts =>
    mayBarre(shape) ? { barre: true } : { rootBarre: !strumsEveryString({ notes }, inst) };

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
            (kind !== 'shell' || !rootStrings || rootStrings.includes(sh.rootString)),
    );
}

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
                // costs, and a ukulele shell has no added tone at all.
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

/** Lowest-fret playable version of a grip. */
export function build(
    inst: InstrumentDef,
    shape: ShapeDef,
    root: Spelled,
    quality: Quality,
): Voicing | null {
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

/** Stay near the middle of the home window, avoid wide stretches, and never leave the window if avoidable. */
function unaryCost(v: Voicing, opts: VoiceOptions): number {
    const home = opts.home ?? null;
    const target = home ? (home[0] + home[1]) / 2 : opts.instrument.defaultTarget;
    if (v.shape.kind !== 'shell') {
        return triadUnaryCost(v, target, home);
    }
    // The out-of-window term (here and in `triadUnaryCost`) never picks a grip: `candidates` gives
    // a chord its in-window grips, or every grip when it has none, so a chord's grips are all
    // inside or all outside and the term adds the same to each (#1604). Nor does the wide-span
    // term pick a shell any more: the one shell wider than three frets was a reach around an
    // open string (`openOneOff`, #1607), and without it none is on offer. It stays for a
    // shape that would be.
    return (
        Math.abs(center(v) - target) * (home ? 0.15 : 0.45) +
        (spanOf(v.notes.map((n) => n.fret)) > 3 ? 0.4 : 0) +
        (inHome(v, home) ? 0 : 5) -
        (strumsEveryString(v, opts.instrument) ? openStringCredit(v, home) : 0)
    );
}

/**
 * A shell that sounds every string of its instrument: each ukulele shell (root, 3rd, 7th and a
 * helper 5th across the four strings), never a guitar one (three or four notes of six, the rest
 * muted). It is a strummed chord like the uke triads, and it is taught the same way: first
 * position, open strings ringing — C6 and Am7 are 0-0-0-0, C7 is 0-0-0-1, Cmaj7 0-0-0-2 in
 * every ukulele method. So it earns the triads' open-string credit (`openStringCredit`, #1607).
 *
 * A guitar shell does not. There an open string turns the movable shape being learned into a
 * one-off for one root (Fmaj7 1-0-2-x-x-x, A7 x-0-x-0-2-x), and with the credit a chart at the
 * nut swaps its shells for a different such grip per chord. One is still taken when the costs
 * already favour it (Am7 x-0-x-0-1-x); it is not sought.
 */
const strumsEveryString = (v: { notes: Note[] }, inst: InstrumentDef): boolean =>
    v.notes.length === inst.strings;

/** Keep the hand still and the root's path simple: same string or the neighboring string, few frets. */
function transCost(a: Voicing, b: Voicing, home: HomeWindow | null): number {
    if (a.shape.kind !== 'shell' || b.shape.kind !== 'shell') {
        return triadTransCost(a, b, home);
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

/** Where the fretting hand is for a triad grip: the fretted notes' centre; at the nut when all open. */
function handAt(v: Voicing): number {
    const fretted = v.notes.filter((n) => n.fret > 0).map((n) => n.fret);
    return fretted.length ? (Math.min(...fretted) + Math.max(...fretted)) / 2 : 0;
}

/** First position: the nut is in reach, so open strings are part of the hand's position. */
const atTheNut = (home: HomeWindow | null): boolean => home === null || home[0] === 1;

/**
 * What a grip's open strings earn in first position, 0.2 each: they ring, cost no finger, and
 * are the whole point of the chords a player learns first. Against the pull to the target
 * fret, one open string is worth under half a fret with no window (0.45 a fret) and a fret and
 * a third inside one (0.15 a fret, where the window already keeps the hand close): enough that
 * in frets 1–6 the uke's all-open C6 (centre 0, three and a half frets from the middle) beats
 * the closed 2-4-3-3 (centre 3, half a fret from it), never enough to carry a grip across the
 * neck. Up the neck an open string earns nothing.
 */
function openStringCredit(v: Voicing, home: HomeWindow | null): number {
    return atTheNut(home) ? v.notes.filter((n) => n.fret === 0).length * 0.2 : 0;
}

function triadUnaryCost(v: Voicing, target: number, home: HomeWindow | null): number {
    return (
        Math.abs(handAt(v) - target) * (home ? 0.15 : 0.45) +
        (spanOf(v.notes.map((n) => n.fret)) > 3 ? 0.4 : 0) +
        (inHome(v, home) ? 0 : 5) -
        openStringCredit(v, home)
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
 *   three-note triad, where an overlap count would read a smaller grip as a move. Every uke grip
 *   rings all four strings, so this never fires there.
 * - **Move by step.** Each note of the new grip is costed on its own string: a common tone (same
 *   string, same fret) is free, a slide costs by its fret distance (an open string is fret 0), a
 *   string that was silent before is a fresh placement. A note on an open string costs nothing in
 *   first position (the finger simply lifts and the string rings, the uke's 0003 → 2000 move);
 *   up the neck it is fret 0, a reach all the way back to the nut.
 * - **Keep the hand where it is.** A shift inside one fret is free — the hand has not moved, a
 *   finger has reached.
 */
function triadTransCost(a: Voicing, b: Voicing, home: HomeWindow | null): number {
    const sets = Math.abs(lowString(b) - lowString(a));
    // One string over is a real choice (a player would rather not, 1.2 ≈ an eight-fret slide's
    // worth of finger travel); each further string is a register jump that leaves the comping
    // range the ear was following, so it costs more again (+1.5 a string).
    const setCost = sets === 0 ? 0 : 1.2 + (sets - 1) * 1.5;
    const was = new Map(a.notes.map((n) => [n.string, n.fret]));
    const lifts = atTheNut(home);
    let stepCost = 0;
    for (const n of b.notes) {
        const before = was.get(n.string);
        if (n.fret === 0 && lifts) {
            continue;
        }
        // 0.15 a fret: a one-fret slide is near free, a five-fret leap (0.75) is not.
        // 0.3 for a fresh string: a new finger placed, about a two-fret slide's worth.
        stepCost += before === undefined ? 0.3 : Math.abs(n.fret - before) * 0.15;
    }
    // 0.7 a fret beyond the first: moving the whole hand is the costliest thing a grip change does.
    return Math.max(0, Math.abs(handAt(b) - handAt(a)) - 1) * 0.7 + setCost + stepCost;
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
 * The grips a chord is voiced from: those inside the hand window, or every grip when none fits
 * — and of those, the ones a player would take. A grip with a buried root (`rootBuried`) stays
 * only when the position offers nothing else: staying in the window comes first, because that
 * is where the musician put the hand, and an awkward grip there is still the right chord.
 */
function candidates(c: ChartChord, opts: VoiceOptions): Voicing[] {
    const all = allPositions(opts.instrument, c.root, c.quality, { rootStrings: opts.rootStrings });
    const inside = all.filter((v) => inHome(v, opts.home));
    const reachable = inside.length ? inside : all;
    const clear = reachable.filter((v) => !rootBuried(v, opts.instrument));
    return clear.length ? clear : reachable;
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
 * Triad and power chords only: a shell chart is pinned by the characterization suite
 * (`test/shell-characterization.test.ts`), and its jazz comping moves a chord between its two
 * root strings on purpose.
 */
function unifyGrips(
    chart: ChartChord[],
    states: Voicing[][],
    plan: (states: Voicing[][]) => Plan,
    tolerance: number,
): Voicing[] {
    const keys = chart.map((c) => (QUALITIES[c.quality].kind === 'shell' ? null : chordKey(c)));
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
            const tried = plan(holding());
            if (!pick || tried.cost < pick.cost - COST_NOISE) {
                pick = { ...tried, grip, changed: occurrences - count };
            }
        }
        if (pick && pick.cost - best.cost < tolerance * pick.changed - COST_NOISE) {
            held.set(key, pick.grip);
            best = pick;
        } else {
            held.delete(key);
        }
    }
}

/**
 * Voice a whole chart at once: one grip per chord, chosen so the hand moves as little as possible
 * and the root takes simple paths, a triad symbol kept to one grip where that costs little
 * (`unifyGrips`), then fingers planned across the chart so held notes stay held.
 * Extra fields on each chart entry (bar, beat, numeral, duration...) are carried through.
 */
export function voiceChart<C extends ChartChord>(chart: C[], opts: VoiceOptions): VoicedChord<C>[] {
    if (!chart.length) {
        return [];
    }
    const home = opts.home ?? null;
    const unary = (v: Voicing) => unaryCost(v, opts);
    const trans = (a: Voicing, b: Voicing) => transCost(a, b, home);
    const plan = (states: Voicing[][]): Plan => {
        const path = viterbi(states, unary, trans);
        const cost = path.reduce(
            (sum, v, i) => sum + unary(v) + (i ? trans(path[i - 1], v) : 0),
            0,
        );
        return { path, cost };
    };
    const picked = unifyGrips(
        chart,
        chart.map((c) => candidates(c, opts)),
        plan,
        opts.sameGripTolerance ?? SAME_GRIP_TOLERANCE,
    );
    const out = picked.map((v, i) => stamp(v, chart[i]));
    fingerSequence(
        out.map((v) => ({ notes: v.notes, ...fingerRules(v.shape, v.notes, opts.instrument) })),
    );
    return out;
}
