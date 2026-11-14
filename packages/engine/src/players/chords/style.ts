// The chord seat's part of a style pack: how a comper plays a genre, as plain
// data. A part is made in three steps, each its own module: the rhythm says
// where the hand strikes and which voicing kind it asks for; the voicing
// engine fits that kind to the chord and leads it from the strike before; the
// idiom turns each voiced strike into the notes the instrument plays.

import type { PerTier } from "../../style/types.ts";
import type { ChordFamily } from "../../theory/chord.ts";

/**
 * A tone of the chord, fitted to whatever chord is sounding:
 *
 * - `R`  the root
 * - `3`  the third, or the suspension that stands in for it (a sus chord's 4th or 2nd,
 *        the eleventh of an eleventh chord)
 * - `5`  the chord's own fifth: flat or sharp when the symbol says so
 * - `7`  the seventh, or the sixth that stands in for it on a 6th chord (X-B-09);
 *        a diminished seventh's double-flat seventh
 * - `9`  the written ninth (b9, 9 or #9); unwritten, the natural 9 when the chord's
 *        scale has it, or a dominant's b9 when its scale has only that (CH-07)
 * - `11` the written eleventh (11 or #11); unwritten, the perfect 11 on a chord with
 *        no major third whose scale has it (over a major third it is a minor 9th, CH-04)
 * - `13` the written thirteenth (13 or b13); unwritten, the natural 13 when the scale
 *        has it, or a dominant's b13 when its scale has only that (CH-07)
 * - `T`  the most telling written tension that no other voice already plays, in the
 *        order of CH-03 (on a dominant b13, #11, b9, #9, 13, 9, 11; elsewhere #11, b13,
 *        b9, #9, 9, 13, 11). Nothing when the symbol writes none.
 *
 * Colour that is not written is only ever taken from the chord's scale, so a
 * dominant falling to a minor chord gets its b9 and b13 (X-B-10, X-B-11).
 */
export type VoiceTone = "R" | "3" | "5" | "7" | "9" | "11" | "13" | "T";
export const VOICE_TONES: readonly VoiceTone[] = ["R", "3", "5", "7", "9", "11", "13", "T"];

/**
 * One voice of a recipe: a tone, or a list of tones tried in order until the
 * chord can give one. `["T", "5"]` is "a written tension takes the fifth's
 * seat" (CH-03, CH-06). A voice the chord cannot fill is left out.
 */
export type Voice = VoiceTone | readonly VoiceTone[];

/** What a chord must be for a recipe to be played over it. Every condition given must hold. */
export interface VoicingCondition {
  readonly family?: readonly ChordFamily[];
  /** Tones the chord must be able to give. */
  readonly has?: readonly VoiceTone[];
  /** Tones the chord must be unable to give. */
  readonly lacks?: readonly VoiceTone[];
}

export interface Recipe {
  readonly when?: VoicingCondition;
  /** Low role to high; where they sit on the instrument is the voicing engine's choice. */
  readonly voices: readonly Voice[];
}

/**
 * A way of choosing a chord's tones: rootless, close position, and later a
 * stab, a shell, a spread. The first recipe whose condition the chord meets is
 * played; the last has no condition. Whatever the recipe says, the third (or
 * suspension), the seventh (or sixth) and every written alteration always
 * sound, giving up the root and the fifth first (X-B-13).
 */
export interface VoicingKind {
  /**
   * How the tones are stacked. Only close position exists now: every
   * inversion inside an octave (CH-15). Drop voicings and two-handed spreads
   * arrive as further members.
   */
  readonly position: "close";
  readonly recipes: readonly Recipe[];
}

/**
 * Where the comp sits on the instrument (X-B-01, X-B-02). The floor is a hard
 * rule: no candidate has a note under it. The ceiling is a preference, paid
 * for per note above it; the top voice is pulled toward the target.
 */
export interface ChordRegister {
  /** The lowest note the comp may play (MIDI). */
  readonly floor: number;
  /** The highest note the comp should play (MIDI). */
  readonly ceiling: number;
  /** Where the top voice is aimed (MIDI). */
  readonly target: number;
}

/**
 * The instrument the seat is being. It decides what a voicing candidate is
 * (keys: any stack of the tones the hand can reach; a guitar, later: a grip on
 * the fretboard) and how a strike becomes notes (keys: every pitch at once; a
 * guitar: a grip rolled across its strings, held from strike to strike).
 */
export type Idiom = "keys";
export const IDIOMS: readonly Idiom[] = ["keys"];

/**
 * The plain rhythm: one strike where each chord arrives, held most of the way
 * to the next (the blues pad, ST-blues-31 low). It is what a meter other than
 * 4/4 plays, and what a voicing audition plays with no rhythm in the way.
 */
export interface PlainRhythm {
  /** How long a strike sounds, as a share of the time until the next strike or the barline. */
  readonly length: number;
  /** Written levels, before the bar's energy scales them. */
  readonly velocity: {
    /** A chord arriving on a beat. */
    readonly beat: number;
    /** A chord arriving between beats. */
    readonly offbeat: number;
    /**
     * The same chord carried over a barline, struck again so a pad on a
     * piano does not die away under a long chord (CH-48).
     */
    readonly restrike: number;
  };
}

export interface ChordStyle {
  readonly idiom: Idiom;
  /** The ways of voicing a chord, by name. A strike asks for one of them by name. */
  readonly kinds: Readonly<Record<string, VoicingKind>>;
  /** The kind a strike asks for when nothing in the rhythm asks otherwise, by tier. */
  readonly voicing: PerTier<string>;
  readonly register: ChordRegister;
  readonly plain: PlainRhythm;
  /** The final chord (CH-74, EN-14 to EN-19). */
  readonly ending: {
    /** The written level of the final chord. */
    readonly velocity: number;
    /** The same in a soft ending. */
    readonly soft: number;
    /** How much harder a short final hit (the button) is than the held chord. */
    readonly accent: number;
  };
  // Part 2, the comping rhythm, adds its fields here: the rhythm book (figures with
  // weights, their articulation, how a phrase is built from them) and anticipation.
}
