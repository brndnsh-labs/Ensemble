// Shared types for the shell-voicing engine. No DOM, no audio, no framework.

/** A note name with its spelling: `letter` is 0-6 for C D E F G A B, `pc` is the pitch class 0-11. */
export interface Spelled {
    name: string; // e.g. "B♭", "F♯"
    pc: number;
    letter: number;
}

/** Chord qualities the engine can voice as shells. */
export type Quality = 'maj7' | 'dom7' | 'm7' | 'm7b5' | 'dim7' | 'six';

/** Chord degrees used in voicings. `bb7` is the diminished 7th (same fret as a 6th). */
export type Degree = 'R' | '3' | 'b3' | '7' | 'b7' | 'bb7' | '6' | '5' | 'b5' | '9' | '13';

/** Optional extra tone a player can stack on a shell. */
export type Tone = 'none' | '5' | '9' | '13';

/**
 * Role of a note inside a grip.
 * R root, T third, S seventh (or 6th), F the 5th used as a helper on ukulele so all strings can be strummed,
 * X<degree> an added tone placed on a free string.
 */
export type Role = 'R' | 'T' | 'S' | 'F' | `X${string}`;

export interface ShapeDef {
    id: string;
    /** String the root sits on (1 = highest-pitched string). */
    rootString: number;
    /** Short display name, e.g. "R–7–3". */
    name: string;
    /** [string, role] pairs that make up the grip. */
    voices: Array<[number, 'R' | 'T' | 'S' | 'F']>;
}

export interface InstrumentDef {
    id: 'guitar' | 'uke' | string;
    name: string;
    strings: number;
    maxFret: number;
    /** Open-string MIDI notes keyed by string number (1 = highest-pitched string). */
    open: Record<number, number>;
    /** One-letter string names indexed by string number - 1. */
    letters: string;
    /** Strings that can hold a root (UI hint for "tap a root" interactions). */
    rootStrings: number[];
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
    /** Tones that were requested but don't fit the grip within reach. */
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
    /** Keep every grip inside this fret window (open strings always allowed). null = anywhere. */
    home?: HomeWindow | null;
    /** Limit which strings can hold the root, e.g. [6, 5] for classic guitar shells. Defaults to every shape. */
    rootStrings?: number[];
    /** Optional color tone stacked on every chord. */
    tone?: Tone;
}
