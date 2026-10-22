// Shared types for the shell-voicing engine. No DOM, no audio, no framework.

/** A note name with its spelling: `letter` is 0-6 for C D E F G A B, `pc` is the pitch class 0-11. */
export interface Spelled {
    name: string; // e.g. "B♭", "F♯"
    pc: number;
    letter: number;
}

/**
 * Chord qualities the engine can voice: eight 7th-chord shells (the 7sus4 and m6 since #1817),
 * six triads (#1588), the add9 (#1820, a major triad with its 9th, ukulele only) and the power
 * chord (`five`).
 */
export type Quality =
    | 'maj7'
    | 'dom7'
    | 'm7'
    | 'm7b5'
    | 'dim7'
    | 'six'
    | '7sus4'
    | 'm6'
    | 'maj'
    | 'min'
    | 'dim'
    | 'aug'
    | 'sus4'
    | 'sus2'
    | 'add9'
    | 'five';

/**
 * What family of grip voices a quality, and so which shapes it may use: a 7th-chord `shell`
 * (R/3/7), a closed `triad`, or a `power` chord (root, 5th, octave).
 */
export type GripKind = 'shell' | 'triad' | 'power';

/**
 * Chord degrees used in voicings. `bb7` is the diminished 7th (same fret as a 6th); `2` and `4`
 * are a sus chord's suspensions, `#5` an augmented triad's 5th. `9` is an add9's added tone
 * (#1820): the 2nd's pitch class, named apart so a sus2's 2 (the 3rd's stand-in) and an add9's 9
 * (a colour over the 3rd) read as the chords name them.
 */
export type Degree =
    | 'R'
    | '2'
    | '3'
    | 'b3'
    | '4'
    | '7'
    | 'b7'
    | 'bb7'
    | '6'
    | '5'
    | 'b5'
    | '#5'
    | '9';

/**
 * Role of a shape's note.
 * R root, T third (a sus chord's 4th or 2nd, a 7sus4's 4th), S seventh (or 6th), F the 5th (on ukulele shells a
 * helper so all strings can be strummed), O the root an octave up (a power chord's top note),
 * R2/T2/F2 the same degree again (a ukulele chord doubles one tone to fill its four strings),
 * N an add9's 9th, in the seat a ukulele triad would double (#1820, `QualityDef.added`).
 */
export type ShapeRole = 'R' | 'T' | 'S' | 'F' | 'O' | 'R2' | 'T2' | 'F2' | 'N';

/** Role of a note inside a grip: a shape role, or X<degree> for an added tone on a free string. */
export type Role = ShapeRole | `X${string}`;

export interface ShapeDef {
    id: string;
    /** Which qualities may use this shape: those whose `QualityDef.kind` matches. */
    kind: GripKind;
    /** String the root sits on (1 = highest-pitched string); the grip is built from it. */
    rootString: number;
    /** Short display name, e.g. "R–7–3". */
    name: string;
    /** [string, role] pairs that make up the grip. */
    voices: Array<[number, ShapeRole]>;
    /**
     * The only qualities taught on this shape, where that is fewer than every quality of its
     * `kind` (`allowedShapes`, `build`). Unset on a shape that serves them all.
     */
    qualities?: Quality[];
    /**
     * A first-position form, not a shape that moves (#1613): built only where one of its
     * strings rings open (`buildAt`), which is the one root it is the book grip for. One
     * exception (#1688): a sus2 may leave its open string while it stays inside the 4th fret,
     * which gives the Cm form one closed grip, D♭sus2 1-3-4-4 (see `buildAt`).
     */
    openOnly?: boolean;
    /**
     * A grip printed in first position only (#1809): built only where every fret is inside the
     * 4th fret and one is fretted (`buildAt`). The ukulele's two-string power chords, which the
     * charts give at the nut and nowhere else (F♯5 x-1-2-x, B5 x-x-2-2).
     */
    nutOnly?: boolean;
    /**
     * One of the guitar's open chords as the method books print it: a 7th (#1838,
     * `GUITAR_OPEN_SEVENTHS`, E7 0-2-0-1-0-0) or a triad or sus chord (#1849,
     * `GUITAR_OPEN_CHORDS`, C x-3-2-0-1-0). A full strummed chord for one root, built only on its
     * open strings (`openOnly`), offered only in first position and there alone (`bookGrip` in
     * `voicing.ts`), and fingered as a strummed chord that keeps the book's fingering
     * (`fingerRules`, `FingerOpts.book`). Its kind is its quality's: an open 7th is a `shell`.
     */
    book?: boolean;
    /**
     * A book chord the plan never chooses from (#1843, `GUITAR_OPEN_SUS_AFTER_PLAN`): it takes
     * the place of an open-string grip the plan gave its chord, after the plan (`toOpenSus` in
     * `voicing.ts`), so the chords beside it are never moved to suit it.
     */
    afterPlan?: boolean;
}

export interface InstrumentDef {
    id: string;
    name: string;
    strings: number;
    maxFret: number;
    /** Open-string MIDI notes keyed by string number (1 = highest-pitched string). */
    open: Record<number, number>;
    /** One-letter string names indexed by string number - 1. */
    letters: string;
    /** Fret the voicer aims for when the hand isn't locked to a window. */
    defaultTarget: number;
    shapes: ShapeDef[];
    /** Human-readable string name, e.g. "6th string" or "G string". */
    strName(s: number): string;
    strShort(s: number): string;
}

export interface Note {
    string: number;
    fret: number;
    degree: Degree;
    role: Role;
    /** 1-4 for fretted notes, 0 for open strings, null if no fingering could be assigned. */
    finger: number | null;
}

export interface Voicing {
    shape: ShapeDef;
    /** Fret of the root on its root string. */
    rootFret: number;
    notes: Note[];
    /**
     * The quality's `required` tones this grip has no room for (`buildAt`): with one missing it
     * is another chord. `allPositions` offers such a grip only when the chord has no complete
     * one, so a voiced chart holds one only as that last resort.
     */
    missing: Degree[];
    root: Spelled;
    quality: Quality;
    /** e.g. "Dm7", "B♭maj7", "F♯m7♭5" */
    symbol: string;
}

/** A chord in a chart. Extra fields (bar, beat, duration, numeral...) are carried through untouched. */
export interface ChartChord {
    root: Spelled;
    quality: Quality;
    [extra: string]: unknown;
}

/** A voiced chart entry: the voicing plus every field from the input chord. */
export type VoicedChord<C extends ChartChord = ChartChord> = Voicing & Omit<C, 'root' | 'quality'>;

/** Inclusive fret range the hand should stay inside, e.g. [2, 7]. */
export type HomeWindow = [number, number];

export interface VoiceOptions {
    instrument: InstrumentDef;
    /**
     * The fret window the hand sits in (open strings always count as inside). null = anywhere.
     * Not a hard limit: a chord whose window holds no grip a player would take reaches a fret
     * past it, or leaves it (`candidates` in `voicing.ts`).
     */
    home?: HomeWindow | null;
    /**
     * Limit which strings can hold a shell's root, e.g. [6, 5] for classic guitar shells.
     * Defaults to every shape. Triad and power grips ignore it.
     */
    rootStrings?: number[];
    /**
     * What keeping one grip per strummed symbol (a triad, a power chord, a ukulele shell) may
     * cost a chart, per occurrence that changes grip (`unifyGrips`). The stand never sets it; 0
     * turns the rule off for those, and the tests bracket the default with it. A guitar shell in
     * a window from the 1st fret is held to one grip whatever it costs (`learnersShell`, #1851),
     * so this does not reach it.
     */
    sameGripTolerance?: number;
}
