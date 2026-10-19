import { type Barre, barres, fingerMap } from './fingering';
import { spellDegree } from './theory';
import type { Degree, InstrumentDef, Note, Voicing } from './types';

export interface RootMove {
    /**
     * What the root does on the neck, read off the two fretted notes: "moves one string over,
     * same fret", "slides up 2 frets on the same string"... The interval is not named (it was,
     * as "up a 4th", from the note names alone — which pointed up while the hand went down a
     * 5th; cut 2026-10-11).
     */
    geometry: string;
    from?: Note;
    to?: Note;
    /** True for the classic hands-still move: same fret, adjacent string. */
    straightAcross: boolean;
}

export function rootMove(inst: InstrumentDef, a: Voicing, b: Voicing): RootMove {
    const ra = a.notes.find((n) => n.role === 'R'),
        rb = b.notes.find((n) => n.role === 'R');
    let geometry = '';
    if (ra && rb) {
        const ds = Math.abs(ra.string - rb.string),
            df = rb.fret - ra.fret;
        if (ra.string === rb.string && df === 0) {
            geometry = 'stays put';
        } else if (ra.string === rb.string) {
            geometry = `slides ${df > 0 ? 'up' : 'down'} ${Math.abs(df)} fret${Math.abs(df) > 1 ? 's' : ''} on the same string`;
        } else if (df === 0) {
            geometry =
                ds === 1
                    ? 'moves one string over, same fret'
                    : `moves ${ds} strings over, same fret`;
        } else {
            geometry = `moves to the ${inst.strName(rb.string)}, ${Math.abs(df)} fret${Math.abs(df) > 1 ? 's' : ''} ${df > 0 ? 'higher' : 'lower'}`;
        }
        if (rb.fret === 0 && !(ra.string === rb.string && df === 0)) {
            geometry = `lands on the open ${inst.strName(rb.string)}`;
        }
    }
    return {
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
    /**
     * Set on a hold where a barre stays down on only some of its strings and comes off others
     * that must then ring open or lower (#1691): the strings it stays on, [lowest, highest].
     * Such a hold says where (`text`), since "stays down" alone would leave the barre flat.
     */
    on?: [number, number];
}

/** Numbers as words, for "the top two strings" and "the two D♭s". */
export const COUNT_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six'];

/**
 * A barre's strings in words: "the top two strings" when the strings run in pitch order (so
 * "top" can only mean the highest-pitched), otherwise by name ("the G, C and E strings" on a
 * re-entrant uke, where the G string is not the lowest).
 */
export function barreStrings(inst: InstrumentDef, [lo, hi]: [number, number]): string {
    const n = hi - lo + 1;
    if (n === inst.strings) {
        return `all ${COUNT_WORDS[n] ?? n} strings`;
    }
    let ordered = true;
    for (let s = 1; s < inst.strings; s++) {
        ordered &&= inst.open[s] > inst.open[s + 1];
    }
    if (ordered && lo === 1) {
        return `the top ${COUNT_WORDS[n] ?? n} strings`;
    }
    const names = Array.from({ length: n }, (_, i) => inst.strShort(hi - i));
    return `the ${names.slice(0, -1).join(', ')} and ${names.at(-1)} strings`;
}

const sameRun = (x: Barre | undefined, y: Barre | undefined): boolean =>
    !x || !y ? x === y : x.strings[0] === y.strings[0] && x.strings[1] === y.strings[1];

/** Whether barre `y` lies at `x`'s fret on strings `x` already covered. */
const within = (x: Barre, y: Barre): boolean =>
    x.fret === y.fret && y.strings[0] >= x.strings[0] && y.strings[1] <= x.strings[1];

/**
 * What each finger does going from a to b ("stays down", "slides up 1 fret", "lifts off"...). A
 * barre is one finger (#1594): it stays down, slides as a whole, or "bars fret 8 on the top two
 * strings" when it is laid down or changes its strings. A barre that gives way to strings it
 * already lay across, at its own fret, has not moved: the finger stays down and comes off the
 * rest. That is a fingertip on ONE of them (#1683: G x-x-x-4-3-3, 2-1-1, to Em x-x-x-4-5-3,
 * 2-3-1, leaves the index on the 1st string), even one another finger was fretting higher
 * (#1691: the ukulele's B♭7 1-2-1-1 to A7 0-1-0-0 leaves the index on the C string, under the
 * middle finger until then), or a shorter barre inside it (#1691: Esus4 x-2-2-2-x-x to A5
 * x-0-2-2-x-x keeps the index across the 4th and 3rd strings). Read off the barre's strings, it
 * was a move to that string or a new barre.
 *
 * Plain "stays down" is true only where every string the barre leaves is fretted by another
 * finger at its fret or higher (Dsus2 x-x-2-2-3-x, 1-1-3, to Dm x-x-3-2-3-x, the 4th string
 * now under the middle finger), or, on a guitar, left out of b, which the flat finger mutes.
 * A ukulele strums every string, so there a string left out rings like an open one. Where one must ring open or lower, the finger comes off
 * it, and the hold says where it stays (`FingerMove.on`): Esus4 to A5 is "stays down on the
 * 4th and 3rd strings", the A string open; the ukulele's B♭7 to A7 "stays down on the C
 * string", the other three open.
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
        // reshaped one is named. A barre that gives way to strings it lay across stays.
        const covered =
            bx !== undefined &&
            y !== undefined &&
            (by
                ? within(bx, by)
                : bx.fret === y.fret && y.string >= bx.strings[0] && y.string <= bx.strings[1]);
        const sameShape = !by || sameRun(bx, by) || covered;
        // Where a narrowing barre stays, and whether a string it comes off must sound open or
        // lower in b: then the finger has to lift off it, and the line says where it stays.
        // A string b frets at the barre's fret or higher with another finger is no matter: it
        // sounds the same with the flat finger still under it. A string b leaves out is none
        // on a guitar, where a flat finger lying across an unplayed string is how it is muted;
        // on a ukulele every string is strummed, so one left flat would ring (#1691).
        const stays: [number, number] | undefined =
            covered && bx && y ? (by ? by.strings : [y.string, y.string]) : undefined;
        let lifts = false;
        if (stays && bx) {
            for (let s = bx.strings[0]; s <= bx.strings[1]; s++) {
                if (s >= stays[0] && s <= stays[1]) {
                    continue;
                }
                const n = b.notes.find((m) => m.string === s);
                lifts ||= n ? n.fret < bx.fret : inst.id === 'uke';
            }
        }
        if (y && sameShape && (covered || (x?.string === y.string && x.fret === y.fret))) {
            moves.push({
                finger: f,
                kind: 'hold',
                text:
                    lifts && stays
                        ? `stays down on ${
                              stays[0] === stays[1]
                                  ? `the ${inst.strName(stays[0])}`
                                  : barreStrings(inst, stays)
                          }`
                        : 'stays down',
                ...(lifts ? { on: stays } : {}),
                // The note a held under this finger there, or the barre's own where it lay
                // across that string under another finger.
                from:
                    a.notes.find(
                        (n) => n.finger === f && n.string === y.string && n.fret === y.fret,
                    ) ?? x,
                to: y,
                barre: by,
            });
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

/** A note two grips share: the same string at the same fret, so the same pitch left sounding. */
export interface SharedNote {
    string: number;
    /** 0 for an open string that rings in both grips: no finger holds it. */
    fret: number;
    /** The note in the first grip and in the second: its degree and finger in each. */
    from: Note;
    to: Note;
    /**
     * The note's name as the first grip spells it (`spellDegree`, the neck's own dot labels, so
     * the key's spelling): "F". Where the second grip spells it another way, both: "D♯/E♭".
     */
    name: string;
}

/**
 * The common tones of a change (#1618): every note on the same string and fret in both grips,
 * lowest string first, with what it is in each chord. Read off the notes alone — whether a finger
 * stays on one is `fingerMoves`' business, and the two disagree on purpose: Dm7 `x 5 3 5 x x` to
 * G7 `3 x 3 4 x x` shares the F on the 4th string under two different fingers.
 */
export function sharedNotes(a: Voicing, b: Voicing): SharedNote[] {
    const shared: SharedNote[] = [];
    for (const from of a.notes) {
        const to = b.notes.find((n) => n.string === from.string && n.fret === from.fret);
        if (to) {
            const was = spellDegree(a.root, from.degree),
                is = spellDegree(b.root, to.degree);
            shared.push({
                string: from.string,
                fret: from.fret,
                from,
                to,
                name: was === is ? was : `${was}/${is}`,
            });
        }
    }
    return shared.sort((x, y) => y.string - x.string);
}

/**
 * A degree as a teacher says it across a change: "the 3rd becomes the 7th". The 3rd and the 7th
 * are named without their quality — the chord symbol already says minor or dominant, and the
 * lesson is which chord tone the note is. An altered 5th keeps its alteration, which is what the
 * chord is named for. Null for the diminished 7th: it is spelled with a double flat and sounds
 * as a 6th, so neither "7th" nor "6th" is a name a student would match to the dot — the
 * narration leaves that note out instead.
 */
const SPOKEN: Record<Degree, string | null> = {
    R: 'root',
    '2': '2nd',
    '3': '3rd',
    b3: '3rd',
    '4': '4th',
    '5': '5th',
    b5: 'flat 5th',
    '#5': 'sharp 5th',
    '6': '6th',
    '7': '7th',
    b7: '7th',
    bb7: null,
};
export const spokenDegree = (degree: Degree): string | null => SPOKEN[degree];
