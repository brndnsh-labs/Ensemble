import type { Note } from './types';

/**
 * Fingering: try every assignment of fingers 1-4 where higher frets get higher fingers and equal frets go
 * from the lower-pitched string to the higher one, scored by how compact the hand is. Triad and
 * power grips may also lay one finger across a run of same-fret strings (a barre, #1594); a barre
 * is derived from the fingers, never stored — several fretted notes sharing a finger (`barres`).
 * A single chord takes the cheapest option; a chart is planned as a sequence so shared notes keep their finger.
 */
export interface FingerOption {
    /** Fretted notes, in the order `p` refers to. */
    fr: Note[];
    /** Finger for each fretted note. */
    p: Array<number | null>;
    cost: number;
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

/** What a fingering may use: `barre` lets one finger lie across a run of same-fret notes (#1594). */
export interface FingerOpts {
    barre?: boolean;
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
 */
function barreOptions(notes: Note[], fr: Note[]): FingerOption[] {
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
                if (!legal) {
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

/**
 * Every reasonable fingering for a grip, cheapest first. `barre: true` marks a triad or power grip:
 * it is offered barres, and drops the shell's root-finger rule (`handCost`). Without it — a
 * shell — every note has its own finger, the skipped string muted by the fretting hand.
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
        out.push(...barreOptions(notes, fr));
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

export const assignFingers = (notes: Note[], opts: FingerOpts = {}): void =>
    applyFingers(notes, fingerOptions(notes, opts)[0]);

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

/** The same for a fingering option (a barre is one finger, so one entry). */
const optionMap = (o: FingerOption): Record<number, Note> =>
    leads(byFinger(o.fr, (_, i) => o.p[i]));

/**
 * Cost of moving the hand from one fingering to the next. Re-fingering a held note is expensive.
 * A barre is one finger: a barre sliding one fret is one move.
 */
export function fingerTransCost(a: FingerOption, b: FingerOption): number {
    const A = optionMap(a),
        B = optionMap(b);
    let c = 0;
    for (let f = 1; f <= 4; f++) {
        const x = A[f],
            y = B[f];
        if (x && y) {
            if (!(x.string === y.string && x.fret === y.fret)) {
                c += 0.5 + Math.abs(x.fret - y.fret) * 0.6 + Math.abs(x.string - y.string) * 0.4;
            }
        } else if (x || y) {
            c += 0.3;
        }
    }
    a.fr.forEach((x, i) =>
        b.fr.forEach((y, j) => {
            if (x.string === y.string && x.fret === y.fret && a.p[i] !== b.p[j]) {
                c += 2.5;
            }
        }),
    );
    return c;
}

/**
 * Plan fingers across a sequence of voicings (mutates each voicing's notes). `barre` marks the
 * grips that may take a barre (triad and power grips, never a shell).
 */
export function fingerSequence(chords: Array<{ notes: Note[]; barre?: boolean }>): void {
    if (!chords.length) {
        return;
    }
    const O = chords.map((b) => fingerOptions(b.notes, { barre: b.barre }));
    let cost = O[0].map((o) => o.cost);
    const back: number[][] = [];
    for (let i = 1; i < O.length; i++) {
        const nc: number[] = [],
            nb: number[] = [];
        O[i].forEach((b) => {
            let bi = 0,
                bv = Infinity;
            O[i - 1].forEach((a, j) => {
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
    let k = cost.indexOf(Math.min(...cost));
    for (let i = O.length - 1; i >= 0; i--) {
        applyFingers(chords[i].notes, O[i][k]);
        if (i > 0) {
            k = back[i - 1][k];
        }
    }
}

/** The fingering currently on a voicing, as a FingerOption (for planning the next chord from it). */
export function currentFingering(notes: Note[]): FingerOption {
    const fr = notes.filter((n) => n.fret > 0);
    return { fr, p: fr.map((n) => n.finger), cost: 0 };
}
