import type { Note } from './types';

/**
 * Fingering: try every assignment of fingers 1-4 where higher frets get higher fingers and equal frets go
 * from the lower-pitched string to the higher one, scored by how compact the hand is.
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

export function fingerOptions(notes: Note[]): FingerOption[] {
    const fr = notes.filter((n) => n.fret > 0);
    if (!fr.length) {
        return [{ p: [], cost: 0, fr }];
    }
    if (fr.length > 4) {
        return [{ p: fr.map(() => null), cost: 0, fr }];
    }
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
        if (!ok) {
            continue;
        }
        const pos = fr.map((n, i) => n.fret - p[i]);
        const ri = fr.findIndex((n) => n.role === 'R');
        const cost =
            (Math.max(...pos) - Math.min(...pos)) * 3 +
            p.reduce((a, b) => a + b, 0) * 0.2 +
            (ri >= 0 && p[ri] > 2 ? 2 : 0);
        out.push({ p, cost, fr });
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

export const assignFingers = (notes: Note[]): void => applyFingers(notes, fingerOptions(notes)[0]);

/** Finger number -> the note it holds. */
export function fingerMap(notes: Note[]): Record<number, Note> {
    const m: Record<number, Note> = {};
    notes.forEach((n) => {
        if (n.finger) {
            m[n.finger] = n;
        }
    });
    return m;
}

/** Cost of moving the hand from one fingering to the next. Re-fingering a held note is expensive. */
export function fingerTransCost(a: FingerOption, b: FingerOption): number {
    const A: Record<number, Note> = {},
        B: Record<number, Note> = {};
    a.fr.forEach((n, i) => {
        const f = a.p[i];
        if (f) {
            A[f] = n;
        }
    });
    b.fr.forEach((n, i) => {
        const f = b.p[i];
        if (f) {
            B[f] = n;
        }
    });
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

/** Plan fingers across a sequence of voicings (mutates each voicing's notes). */
export function fingerSequence(chords: Array<{ notes: Note[] }>): void {
    if (!chords.length) {
        return;
    }
    const O = chords.map((b) => fingerOptions(b.notes));
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
