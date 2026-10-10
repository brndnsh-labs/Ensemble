import {
    applyFingers,
    assignFingers,
    currentFingering,
    fingerOptions,
    fingerSequence,
    fingerTransCost,
} from './fingering';
import { DEGREES, mod, QUALITIES, toneDegree } from './theory';
import type {
    ChartChord,
    Degree,
    HomeWindow,
    InstrumentDef,
    Note,
    Quality,
    ShapeDef,
    Spelled,
    Tone,
    VoicedChord,
    VoiceOptions,
    Voicing,
} from './types';

const spanOf = (frets: number[]): number => {
    const x = frets.filter((f) => f > 0);
    return x.length ? Math.max(...x) - Math.min(...x) : 0;
};
const MAX_SPAN = 4;

/** Fret on string `s` for a note `interval` semitones above a root at fret `r` on `rootString`, kept within reach. */
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

export function allowedShapes(inst: InstrumentDef, rootStrings?: number[]): ShapeDef[] {
    return rootStrings
        ? inst.shapes.filter((sh) => rootStrings.includes(sh.rootString))
        : inst.shapes;
}

/** Build one grip with its root at fret `r`. Returns null if any note falls off the neck. */
export function buildAt(
    inst: InstrumentDef,
    shape: ShapeDef,
    root: Spelled,
    quality: Quality,
    tone: Tone,
    r: number,
): Voicing | null {
    const q = QUALITIES[quality];
    const degOf = (role: 'R' | 'T' | 'S' | 'F'): Degree =>
        role === 'R' ? 'R' : role === 'T' ? q.third : role === 'S' ? q.seventh : q.five;
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

    const filler = notes.find((n) => n.role === 'F');
    const missing: Degree[] = [];
    const td = toneDegree(quality, tone);
    const extras: Degree[] = filler ? [] : [...q.required];
    if (td) {
        if (!filler) {
            extras.push(td);
        } else if (filler.degree !== td) {
            // On uke the helper string is the only free one: swap the helper for the tone if it fits
            if (q.required.includes(filler.degree)) {
                missing.push(td);
            } else {
                const base = fretFor(inst, filler.string, shape.rootString, r, DEGREES[td].int);
                const others = notes.filter((n) => n !== filler).map((n) => n.fret);
                const opts = [base, base + 12, base - 12]
                    .filter(
                        (f) => f >= 0 && f <= inst.maxFret && spanOf([...others, f]) <= MAX_SPAN,
                    )
                    .sort((a, b) => spanOf([...others, a]) - spanOf([...others, b]));
                if (opts.length) {
                    filler.degree = td;
                    filler.fret = opts[0];
                } else {
                    missing.push(td);
                }
            }
        }
    }
    for (const deg of extras) {
        const used = new Set(notes.map((n) => n.string));
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
                const span = spanOf(notes.map((n) => n.fret).concat(f));
                if (span > MAX_SPAN) {
                    continue;
                }
                if (!best || span < best.span || (span === best.span && s < best.s)) {
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
    assignFingers(notes);
    return { shape, rootFret: r, notes, missing, root, quality, symbol: root.name + q.symbol };
}

export function rootFrets(inst: InstrumentDef, shape: ShapeDef, root: Spelled): number[] {
    const r0 = mod(root.pc - inst.open[shape.rootString], 12);
    return [r0, r0 + 12];
}

/** Lowest-fret playable version of a grip. */
export function build(
    inst: InstrumentDef,
    shape: ShapeDef,
    root: Spelled,
    quality: Quality,
    tone: Tone = 'none',
): Voicing | null {
    for (const r of rootFrets(inst, shape, root)) {
        const b = buildAt(inst, shape, root, quality, tone, r);
        if (b) {
            return b;
        }
    }
    return null;
}

/** A grip inside the home window, if one exists. */
export function buildIn(
    inst: InstrumentDef,
    shape: ShapeDef,
    root: Spelled,
    quality: Quality,
    tone: Tone,
    home: HomeWindow | null | undefined,
): Voicing | null {
    for (const r of rootFrets(inst, shape, root)) {
        const b = buildAt(inst, shape, root, quality, tone, r);
        if (b && inHome(b, home)) {
            return b;
        }
    }
    return null;
}

/** Every grip (all allowed shapes, both octaves) for a chord. */
export function allPositions(
    inst: InstrumentDef,
    root: Spelled,
    quality: Quality,
    opts: { rootStrings?: number[]; tone?: Tone } = {},
): Voicing[] {
    const out: Voicing[] = [];
    allowedShapes(inst, opts.rootStrings).forEach((sh) =>
        rootFrets(inst, sh, root).forEach((r) => {
            const b = buildAt(inst, sh, root, quality, opts.tone ?? 'none', r);
            if (b) {
                out.push(b);
            }
        }),
    );
    return out;
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
    return (
        Math.abs(center(v) - target) * (home ? 0.15 : 0.45) +
        (spanOf(v.notes.map((n) => n.fret)) > 3 ? 0.4 : 0) +
        (inHome(v, home) ? 0 : 5)
    );
}

/** Keep the hand still and the root's path simple: same string or the neighboring string, few frets. */
function transCost(a: Voicing, b: Voicing): number {
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

function candidates(c: ChartChord, opts: VoiceOptions): Voicing[] {
    const all = allPositions(opts.instrument, c.root, c.quality, {
        rootStrings: opts.rootStrings,
        tone: opts.tone,
    });
    const inside = all.filter((v) => inHome(v, opts.home));
    return inside.length ? inside : all;
}

function stamp<C extends ChartChord>(v: Voicing, c: C): VoicedChord<C> {
    const { root, quality, ...rest } = c;
    return {
        ...v,
        notes: v.notes.map((n) => ({ ...n })),
        ...rest,
        root,
        quality,
        symbol: root.name + QUALITIES[quality].symbol,
    } as VoicedChord<C>;
}

/**
 * Voice a whole chart at once: one grip per chord, chosen so the hand moves as little as possible
 * and the root takes simple paths, then fingers planned across the chart so held notes stay held.
 * Extra fields on each chart entry (bar, beat, numeral, duration...) are carried through.
 */
export function voiceChart<C extends ChartChord>(chart: C[], opts: VoiceOptions): VoicedChord<C>[] {
    if (!chart.length) {
        return [];
    }
    const picked = viterbi(
        chart.map((c) => candidates(c, opts)),
        (v) => unaryCost(v, opts),
        transCost,
    );
    const out = picked.map((v, i) => stamp(v, chart[i]));
    fingerSequence(out);
    return out;
}

/** Voice one chord near where the hand already is (for tapped pads or live input). */
export function voiceNext<C extends ChartChord>(
    prev: Voicing | null,
    chord: C,
    opts: VoiceOptions,
): VoicedChord<C> {
    let best: Voicing | null = null,
        bc = Infinity;
    candidates(chord, opts).forEach((v) => {
        const c = unaryCost(v, opts) + (prev ? transCost(prev, v) : 0);
        if (c < bc) {
            bc = c;
            best = v;
        }
    });
    if (!best) {
        throw new Error(
            `No voicing for ${chord.root.name}${QUALITIES[chord.quality].symbol} on ${opts.instrument.name}`,
        );
    }
    const out = stamp(best, chord);
    if (prev) {
        const prevOpt = currentFingering(prev.notes);
        let bo = null,
            bv = Infinity;
        for (const o of fingerOptions(out.notes)) {
            const v = o.cost + fingerTransCost(prevOpt, o);
            if (v < bv) {
                bv = v;
                bo = o;
            }
        }
        if (bo) {
            applyFingers(out.notes, bo);
        }
    }
    return out;
}
