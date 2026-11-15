// The bass seat's part of a style pack: how a bassist plays a genre, as plain
// data. A line is a sequence of tones laid over a rhythm figure; the engine
// fits the tones to each chord, places the roots, and leads into the changes.

import type { Hold, PerTier } from "../../style/types.ts";
import type { ChordFamily } from "../../theory/chord.ts";

/**
 * A degree of the chord, fitted to whatever chord is sounding (X-A-23, X-A-24):
 *
 * - `R`  the chord's bass note: the slash note under a slash chord
 * - `2`  the major second (the ninth, an octave down)
 * - `b3` the minor third: on a minor chord its own third, on a major or dominant chord the blue third
 * - `3`  the chord's own third, or its suspension (a sus chord's 4th or 2nd)
 * - `4`  the perfect fourth
 * - `#4` the raised fourth: the blues scale's flat fifth, between the 4th and the 5th
 * - `5`  the chord's own fifth: flat on a diminished chord, sharp on an augmented one
 * - `b6` the minor sixth
 * - `6`  the major sixth
 * - `b7` the flat seventh
 * - `8`  the octave above the bass note
 *
 * The third and fifth are read from the chord. The second, fourth, sixth and
 * flat seventh are played as written unless the chord's scale holds a different
 * note in that place (a minor sixth on a dominant heading for a minor chord, a
 * major seventh on a plain major chord). Then the chord "lacks" the tone, and
 * a sequence that asks for it anyway gets a safe neighbour: `2` the root, `4`
 * the third, `6` the fifth, `b7` the octave, and `3` the root on a chord with
 * no third. Conditions exist to choose a better shape than that.
 *
 * `b3`, `#4` and `b6` are chromatic over most chords: the note between two
 * scale tones. Where the chord's scale does not hold one, the line plays it only
 * as a passing tone, a step from the note before and a step on to the note
 * after in the same direction, and never on a held note (BA-15, X-A-26). A
 * shape that would land one anywhere else is not played on that chord.
 */
export type Tone = "R" | "2" | "b3" | "3" | "4" | "#4" | "5" | "b6" | "6" | "b7" | "8";
export const TONES: readonly Tone[] = ["R", "2", "b3", "3", "4", "#4", "5", "b6", "6", "b7", "8"];

/** What a chord must be for a sequence to be played over it. Every condition given must hold. */
export interface ChordCondition {
  readonly family?: readonly ChordFamily[];
  /** True: only slash chords. False: only chords standing on their own root. */
  readonly slash?: boolean;
  /** Tones the chord must be able to give without falling back. */
  readonly has?: readonly Tone[];
  /** Tones the chord must be unable to give. */
  readonly lacks?: readonly Tone[];
}

/**
 * One way of playing a kind of chord: its tones, one list per bar spent on the
 * chord. With two bars the line goes up in the bar the chord arrives and comes
 * down in the next, then up again; which bar is played is counted from the
 * chart, not remembered (BA-97). A chord that arrives partway through a bar
 * starts the first list.
 */
export interface LineShape {
  /** What a bassist would call it. Reports and the critic's notes use it. */
  readonly name?: string;
  readonly bars: readonly (readonly Tone[])[];
  /**
   * Its weight in the draw for the section's home shape, the line the section
   * keeps every time it comes round (X-B-14). Zero: never the home. Default 1.
   */
  readonly home?: number;
  /**
   * Its weight in the draw for the answer, the one other shape a time through
   * the section may play on this kind of chord. Zero: never an answer. Default 1.
   */
  readonly answer?: number;
}

/**
 * The line for one kind of chord. `bars` is its first shape; `others` are
 * further ways to play the same chord, between which the bassist chooses by
 * the phrase. With no others, every bar on such a chord plays `bars`.
 */
export interface ToneSequence extends LineShape {
  readonly when?: ChordCondition;
  readonly others?: readonly LineShape[];
}

/**
 * One bar of 4/4 rhythm, a character per sixteenth (spaces ignored):
 *
 * - `x` the next tone of the sequence
 * - `o` the same tone struck again (the short note of a long-short)
 * - `-` the note before is still held
 * - `.` silence
 *
 * `x--- x--- x--- x-o-` is three quarter notes and a shuffled fourth beat.
 * The grid is straight; the style's swing turns the written "and" into the
 * triplet's last note afterwards.
 */
export interface Figure {
  /** Relative weight in the draw. Zero never wins. */
  readonly weight: number;
  readonly grid: string;
}

/** Sixteenths in a figure's grid: one bar of 4/4. */
export const FIGURE_STEPS = 16;

export interface BassLine {
  /** Tried in order; the first whose condition the chord meets is played. The last has no condition. */
  readonly tones: readonly ToneSequence[];
  /** The rhythm, drawn whole from these and kept for the span `hold` names (X-A-29, X-A-31). */
  readonly figures: { readonly hold: Hold; readonly options: readonly Figure[] };
  /**
   * In any meter but 4/4 the line is played plainly (BA-16): its tones read
   * from the top in every bar, one to a pulse, or only the first of them held
   * from the downbeat.
   */
  readonly otherMeters: "pulses" | "downbeat";
  /** The highest note of the line (MIDI). A tone that would sit above it is played an octave lower. */
  readonly ceiling: number;
  /** How long a note sounds, as a share of the space the figure gives it. */
  readonly length: {
    readonly note: number;
    /** A note that is about to be struck again: the long half of a long-short. */
    readonly long: number;
    /** The note struck again: the short half. */
    readonly short: number;
  };
  /** Written levels, before the bar's energy scales them. */
  readonly velocity: {
    /** Where a chord is struck. */
    readonly arrival: number;
    /** The downbeat and the middle of the bar, when no chord arrives there. */
    readonly strong: number;
    readonly weak: number;
    /** An `o` in the figure. */
    readonly restrike: number;
    /** A lead-in the bassist chose to play. */
    readonly approach: number;
  };
}

/**
 * Where roots sit (BA-02). Each root is placed nearest a point between the
 * line's previous note and an anchor: `pull` 0 follows the line wherever it
 * goes, 1 puts every root in the anchor's octave, and between the two the line
 * climbs and dives but comes home. The anchor is drawn between `from` and `to`
 * and kept for `hold`: per section for a line that should keep its octave,
 * per song for loop music where a chord is always the same note.
 */
export interface RegisterPolicy {
  /** The lowest and highest root (MIDI). Line tones above a root may go higher, up to the line's ceiling. */
  readonly lowest: number;
  readonly highest: number;
  readonly anchor: { readonly from: number; readonly to: number; readonly hold: Hold };
  readonly pull: number;
}

/**
 * How the bass note is about to move, which is most of what a chord's function
 * means to a bassist: a V going to its I is `fallFifth`, a IV going home is
 * `riseFifth`, a V dropping to the IV is `stepDown`.
 */
export type RootMotion =
  /** Down a fifth or up a fourth: V to I, I to IV. */
  | "fallFifth"
  /** Up a fifth or down a fourth: IV to I, I to V. */
  | "riseFifth"
  /** Up a half or whole step. */
  | "stepUp"
  /** Down a half or whole step. */
  | "stepDown"
  /** A third or a sixth either way. */
  | "third"
  | "tritone"
  /** The same bass note under a new chord, or the same chord again. */
  | "same";
export const ROOT_MOTIONS: readonly RootMotion[] = [
  "fallFifth",
  "riseFifth",
  "stepUp",
  "stepDown",
  "third",
  "tritone",
  "same",
];

/**
 * The four ways into a chord (BA-03), each aimed at the exact note the arrival
 * will play:
 *
 * - `below`: the half step under it
 * - `above`: the half step over it
 * - `fifth`: its own fifth, a V to I in miniature
 * - `scale`: the nearest tone of the chord being left's scale within a whole step of it
 */
export type LeadInKind = "below" | "above" | "fifth" | "scale";
export const LEAD_IN_KINDS: readonly LeadInKind[] = ["below", "above", "fifth", "scale"];

export interface LeadInPolicy {
  /**
   * Where the lead-in sits: the last beat before the change (the bar's last
   * pulse, so a dotted quarter in 6/8), the last eighth, or the last sixteenth.
   */
  readonly at: "beat" | "eighth" | "sixteenth";
  /** How likely a change is led into, 0 to 1. */
  readonly chance: {
    readonly inside: PerTier<number>;
    /** Into the first bar of a section or of a new time through it (EN-51). */
    readonly intoSection: PerTier<number>;
    /** Into the final chord. */
    readonly intoEnding: number;
  };
  /**
   * What the coin belongs to. `section`: the same changes are led into every
   * time the section returns. `pass`: each time through has its own.
   */
  readonly hold: Hold;
  /** The weight of each kind by how the bass note moves. All zero: never lead into that move (BA-11). */
  readonly kinds: Readonly<Record<RootMotion, Readonly<Record<LeadInKind, number>>>>;
}

/**
 * A bar-long walk into a change: the last bar before it, played as four steps
 * that arrive a half or whole step from the next root in the octave it will be
 * played (BA-05). It replaces the line in that bar and still states the chord
 * on beat 1.
 */
export interface Walk {
  readonly name?: string;
  readonly weight: number;
  readonly when?: ChordCondition;
  /** Which way the line moves from the root: each note above the one before, or below it. */
  readonly toward: "up" | "down";
  /**
   * The notes before the last, as tones of the chord being left, the first of
   * them its root. The bar's figure must strike one more tone than these.
   */
  readonly tones: readonly Tone[];
  /**
   * The last note: the half step beside the next root on the side the walk
   * comes from, or the whole step, which must then be in the scale of the chord
   * being left (X-A-26). It obeys every rule a lead-in obeys.
   */
  readonly last: "half" | "whole";
}

export interface WalkPolicy {
  /**
   * How likely a plan the bassist weighs is to walk into the next line, and
   * into a change inside one. The critic decides which plan is played.
   */
  readonly offer: { readonly end: PerTier<number>; readonly inside: PerTier<number> };
  /** The walks for each way the bass note can move. A move with none is never walked. */
  readonly kinds: Readonly<Partial<Record<RootMotion, readonly Walk[]>>>;
}

/** How the bassist chooses a phrase: plans drawn, each played out, and the critic picks one. */
export interface PhrasePolicy {
  /** How many different plans are weighed for a phrase. */
  readonly candidates: number;
  /** In a plan, how likely a stay on a chord after the phrase's first is played on its answer shape. */
  readonly answers: number;
  /**
   * The share of changes the bassist likes to arrive at by a half step: the
   * critic's `half-steps` costs a phrase by how far outside this it falls.
   */
  readonly halfSteps: { readonly min: number; readonly max: number };
}

export interface BassStyle {
  readonly register: RegisterPolicy;
  /** The part for each tier. The change of part at a tier line is the audible change of section (X-A-07). */
  readonly lines: PerTier<BassLine>;
  readonly leadIn: LeadInPolicy;
  /** Walks into a change. Without them the bass leads in with one note at most. */
  readonly walks?: WalkPolicy;
  /**
   * Choosing between plans for a phrase. Without it, or with nothing to choose
   * (one shape for every chord and no walks), the line plays its first shape.
   */
  readonly phrase?: PhrasePolicy;
  readonly ending: {
    /** The written level of the last note (EN-19). A soft ending plays it at four fifths. */
    readonly velocity: number;
  };
}
