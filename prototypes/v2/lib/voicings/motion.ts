import { type Barre, barres, fingerMap } from './fingering';
import { mod } from './theory';
import type { InstrumentDef, Note, Voicing } from './types';
import { center } from './voicing';

const ROOT_MOVES: Record<number, [string, string]> = {
    0: ['stays put', '='],
    1: ['up a half step', '↑½'],
    2: ['up a whole step', '↑1'],
    3: ['up a minor 3rd', '↑m3'],
    4: ['up a major 3rd', '↑M3'],
    5: ['up a 4th', '↑4th'],
    6: ['a tritone away', 'tri'],
    7: ['down a 4th', '↓4th'],
    8: ['down a major 3rd', '↓M3'],
    9: ['down a minor 3rd', '↓m3'],
    10: ['down a whole step', '↓1'],
    11: ['down a half step', '↓½'],
};

export interface RootMove {
    /** Semitones up from a's root to b's root, 0-11. */
    semitones: number;
    /** "up a 4th" */
    text: string;
    /** "↑4th" for compact tags */
    short: string;
    /** Where the root goes on the neck: "same fret, one string over", "slides up 2 frets on the same string"... */
    geometry: string;
    from?: Note;
    to?: Note;
    /** True for the classic hands-still move: same fret, adjacent string. */
    straightAcross: boolean;
}

export function rootMove(inst: InstrumentDef, a: Voicing, b: Voicing): RootMove {
    const d = mod(b.root.pc - a.root.pc, 12);
    const ra = a.notes.find((n) => n.role === 'R'),
        rb = b.notes.find((n) => n.role === 'R');
    let geometry = '';
    if (ra && rb) {
        const ds = Math.abs(ra.string - rb.string),
            df = rb.fret - ra.fret;
        if (ra.string === rb.string && df === 0) {
            geometry = 'same spot';
        } else if (ra.string === rb.string) {
            geometry = `slides ${df > 0 ? 'up' : 'down'} ${Math.abs(df)} fret${Math.abs(df) > 1 ? 's' : ''} on the same string`;
        } else if (df === 0) {
            geometry = ds === 1 ? 'same fret, one string over' : `same fret, ${ds} strings over`;
        } else {
            geometry = `over to the ${inst.strName(rb.string)}, ${Math.abs(df)} fret${Math.abs(df) > 1 ? 's' : ''} ${df > 0 ? 'higher' : 'lower'}`;
        }
        if (rb.fret === 0) {
            geometry = `lands on the open ${inst.strName(rb.string)}`;
        }
    }
    return {
        semitones: d,
        text: ROOT_MOVES[d][0],
        short: ROOT_MOVES[d][1],
        geometry,
        from: ra,
        to: rb,
        straightAcross: !!(
            ra &&
            rb &&
            ra.fret === rb.fret &&
            Math.abs(ra.string - rb.string) === 1
        ),
    };
}

export type FingerMoveKind = 'hold' | 'move' | 'lift';
export interface FingerMove {
    finger: number;
    kind: FingerMoveKind;
    text: string;
    from?: Note;
    to?: Note;
    /** The barre this finger lays across in b (#1594); `to` is its note on the lowest-pitched string. */
    barre?: Barre;
}

const COUNT = ['', 'one', 'two', 'three', 'four', 'five', 'six'];

/**
 * A barre's strings in words: "the top two strings" when the strings run in pitch order (so
 * "top" can only mean the highest-pitched), otherwise by name ("the G, C and E strings" on a
 * re-entrant uke, where the G string is not the lowest).
 */
export function barreStrings(inst: InstrumentDef, [lo, hi]: [number, number]): string {
    const n = hi - lo + 1;
    if (n === inst.strings) {
        return `all ${COUNT[n] ?? n} strings`;
    }
    let ordered = true;
    for (let s = 1; s < inst.strings; s++) {
        ordered &&= inst.open[s] > inst.open[s + 1];
    }
    if (ordered && lo === 1) {
        return `the top ${COUNT[n] ?? n} strings`;
    }
    const names = Array.from({ length: n }, (_, i) => inst.strShort(hi - i));
    return `the ${names.slice(0, -1).join(', ')} and ${names.at(-1)} strings`;
}

const sameRun = (x: Barre | undefined, y: Barre | undefined): boolean =>
    !x || !y ? x === y : x.strings[0] === y.strings[0] && x.strings[1] === y.strings[1];

/**
 * What each finger does going from a to b ("stays down", "slides up 1 fret", "lifts off"...). A
 * barre is one finger (#1594): it stays down, slides as a whole, or "bars fret 8 on the top two
 * strings" when it is laid down or changes its strings.
 */
export function fingerMoves(
    inst: InstrumentDef,
    a: Voicing,
    b: Voicing,
): { moves: FingerMove[]; openStrings: number[] } {
    const A = fingerMap(a.notes),
        B = fingerMap(b.notes),
        barA = barres(a.notes),
        barB = barres(b.notes),
        moves: FingerMove[] = [];
    for (let f = 1; f <= 4; f++) {
        const x = A[f],
            y = B[f];
        if (!x && !y) {
            continue;
        }
        const bx = barA.find((r) => r.finger === f),
            by = barB.find((r) => r.finger === f);
        // A barre that stays a barre on the same strings moves like one finger; a new or
        // reshaped one is named. A barre giving way to one note is that finger's note.
        const sameShape = !by || sameRun(bx, by);
        if (x && y && x.string === y.string && x.fret === y.fret && sameShape) {
            moves.push({ finger: f, kind: 'hold', text: 'stays down', from: x, to: y, barre: by });
        } else if (y && by && !sameShape) {
            moves.push({
                finger: f,
                kind: 'move',
                text: `bars fret ${by.fret} on ${barreStrings(inst, by.strings)}`,
                from: x,
                to: y,
                barre: by,
            });
        } else if (x && y && x.string === y.string) {
            const d = y.fret - x.fret;
            moves.push({
                finger: f,
                kind: 'move',
                text: `slides ${d > 0 ? 'up' : 'down'} ${Math.abs(d)} fret${Math.abs(d) > 1 ? 's' : ''}`,
                from: x,
                to: y,
                barre: by,
            });
        } else if (x && y) {
            moves.push({
                finger: f,
                kind: 'move',
                text: `moves to the ${inst.strName(y.string)}, fret ${y.fret}`,
                from: x,
                to: y,
            });
        } else if (x) {
            moves.push({ finger: f, kind: 'lift', text: 'lifts off', from: x });
        } else {
            moves.push({
                finger: f,
                kind: 'move',
                text: `goes down on the ${inst.strName(y!.string)}, fret ${y!.fret}`,
                to: y,
            });
        }
    }
    return { moves, openStrings: b.notes.filter((n) => n.fret === 0).map((n) => n.string) };
}

export interface TravelSummary {
    /** Sum of hand-position shifts across the chart, in frets. */
    totalFrets: number;
    /** Finger changes that are just "stay down", out of all finger changes (repeated chords excluded). */
    holds: number;
    changes: number;
    lowestFret: number;
    highestFret: number;
}
export function handTravel(inst: InstrumentDef, chords: Voicing[]): TravelSummary {
    let total = 0,
        holds = 0,
        changes = 0;
    for (let i = 1; i < chords.length; i++) {
        const a = chords[i - 1],
            b = chords[i];
        total += Math.abs(center(b) - center(a));
        if (a.root.pc === b.root.pc && a.quality === b.quality && a.rootFret === b.rootFret) {
            continue;
        }
        const m = fingerMoves(inst, a, b).moves;
        holds += m.filter((x) => x.kind === 'hold').length;
        changes += m.length;
    }
    const fretted = chords.flatMap((c) => c.notes.map((n) => n.fret).filter((f) => f > 0));
    return {
        totalFrets: Math.round(total),
        holds,
        changes,
        lowestFret: fretted.length ? Math.min(...fretted) : 0,
        highestFret: fretted.length ? Math.max(...fretted) : 0,
    };
}
