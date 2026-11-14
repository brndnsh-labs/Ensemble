// The soloist's part of a style pack: how a lead player improvises in a
// genre, as plain data. A solo is planned in phrases. A phrase has a shape
// (which bars carry the line, which one lands, which rest), a rhythm for each
// playing bar from the style's own cells, and a job in the chorus: state an
// idea, say it again, change it, or answer it. The engine chooses the pitches
// (landings first, then the line between them), offers several whole phrases
// for each slot, and lets the critic pick.

import type { ToneRole } from "../../theory/chord.ts";
import type { ScaleName } from "../../theory/scale.ts";

/**
 * One bar of rhythm on the sixteenth grid, a character per sixteenth (spaces
 * ignored): `x` a note struck, `-` that note held, `.` silence. The grid is
 * straight; the style's swing bends it afterwards. Under a hard triplet swing
 * the third character of a beat is the triplet's last note and the second its
 * middle one, so `xxx-` on a beat is a triplet.
 */
export type Cell = string;

/**
 * A phrase's bars, a letter each (spaces ignored), written for four bars (SO-08, SO-09):
 * `L` a bar that carries the line, `E` a bar that ends it on a long note,
 * `R` a bar of rest. `L L E R` is three bars of playing and one of room.
 */
export interface Shape {
  readonly weight: number;
  readonly bars: string;
}

/** How busy the soloist is. A style lists its levels from sparsest to busiest. */
export interface Density {
  readonly name: string;
  /** Notes a bar over the whole phrase, rests included: what this level adds up to. */
  readonly notesPerBar: number;
  /** How far a phrase at this level travels, in semitones (SO-12). */
  readonly span: number;
  /** The rhythms a line bar may take at this level (SO-15). */
  readonly cells: readonly Cell[];
  readonly shapes: readonly Shape[];
}

/** One stretch of a solo: how busy, and where it sits against the instrument's home, in semitones. */
export interface ArcStage {
  readonly density: string;
  readonly register: number;
}

/**
 * What the phrases of a chorus are for, a letter each (spaces ignored):
 * `s` states an idea, `r` says it again, `v` says it changed, `a` answers it.
 * `s r a` is the twelve-bar blues itself. A form may open on `v` or `r` to
 * pick up the idea of the chorus before; the first chorus of a solo takes a
 * form that opens on `s`. A chorus with more phrases than the form goes round
 * it again.
 */
export interface Form {
  readonly weight: number;
  readonly phrases: string;
}

/** The shape of a line over a phrase (SO-13). */
export type Contour = "arch" | "fall" | "climb" | "wave";
export const CONTOURS: readonly Contour[] = ["arch", "fall", "climb", "wave"];

/** One way of leading into a phrase from the last beat of the bar before: a beat of rhythm (SO-36). */
export interface Pickup {
  readonly weight: number;
  readonly beat: Cell;
}

export interface SoloStyle {
  /** The instrument the soloist plays unless the player asks for another: a name from the instrument list. */
  readonly instrument: string;
  /** Semitones this style lifts the instrument's home, to sit over the comp and not in it (SO-07). */
  readonly lift: number;

  /** The notes a line is made of over each chord (SO-29). The chord's own tones are always in. */
  readonly notes: {
    /** The chord's own scale is in the pool: a line that follows the changes. */
    readonly chordScale: boolean;
    /** Notes of the key that are in whatever the chord, as semitones above the tonic. */
    readonly key: { readonly major: readonly number[]; readonly minor: readonly number[] };
    /**
     * Key notes that are blue only over some chords: the note, and the chord
     * roots (semitones above the tonic) it may be played over. Elsewhere it
     * is in only where the chord's own scale has it (SO-30).
     */
    readonly blue: readonly { readonly degree: number; readonly over: readonly number[] }[];
    /**
     * A passing note added over one mode, as semitones above the chord's root:
     * never held and never on a beat (the bebop scale's extra note, SO-29).
     */
    readonly passing: readonly { readonly scale: ScaleName; readonly interval: number }[];
  };
  /** Where a note on a chord change lands, best first (SO-22). The 6th stands in for a 7th, a suspension for the 3rd. */
  readonly arrive: readonly ToneRole[];
  /** Where an answer comes to rest, best first (SO-22). */
  readonly settle: readonly ToneRole[];
  /** Where a statement is left hanging, best first: a question, not yet answered (KF-B-13). */
  readonly hang: readonly ToneRole[];

  /** Sparsest first. The arc names the level; the band's energy and the tempo each move it a step. */
  readonly levels: readonly Density[];
  /** The rhythms an end bar may take: each finishes on a long note and leaves its last beat unstruck (SO-15). */
  readonly endings: readonly Cell[];
  readonly forms: readonly Form[];
  /** How often a line takes each shape (SO-13). */
  readonly contours: Readonly<Record<Contour, number>>;

  /** The solo from its first phrase to its last, in equal stretches (SO-05). */
  readonly arc: {
    readonly stages: readonly ArcStage[];
    /**
     * The one top note of the solo: the phrase before the last climbs to it and
     * holds it. `above` is how far over home it is at most; nothing else comes
     * within `clear` semitones of it (SO-07).
     */
    readonly peak: {
      readonly above: number;
      readonly clear: number;
      readonly density: string;
      /** The bar the climb ends on: the top note, held. */
      readonly ending: Cell;
    };
    /** The last phrase, which comes back down so the band can have the tune (SO-05). */
    readonly windDown: ArcStage;
  };

  /** Tempo is felt in seconds, not bars (KF-B-12, Q-47). */
  readonly tempo: {
    /** A bar longer than this many seconds is slow: the line plays a level busier. */
    readonly slowBar: number;
    /** A bar shorter than this is fast: a level sparser. */
    readonly fastBar: number;
  };

  readonly space: {
    /** Seconds of silence after a phrase's last note, whatever the tempo (Q-47). */
    readonly breath: number;
    /** The chance a phrase takes a shape from the next sparser level, keeping its own rhythms (SO-11). */
    readonly roomier: number;
    /** Empty bars a phrase may leave. The first phrase of a solo may leave one more (SO-10). */
    readonly emptyBars: number;
    /** Seconds of playing without a breath after which the line is running on. */
    readonly patience: number;
  };

  readonly habits: {
    /** A line bar plays the bar before it again, moved along the line: a riff, a sequence (SO-18). */
    readonly riff: number;
    /** A short note before a landing is the half step under it (SO-26, SO-27). */
    readonly chromatic: number;
    /** Two short notes before a landing circle it: the step above, the half step below (SO-26). */
    readonly enclosure: number;
    /** A phrase that would start on a downbeat is led in from the beat before (SO-36). */
    readonly pickup: {
      readonly chance: number;
      readonly figures: readonly Pickup[];
      /** The chance the pickup comes from below. */
      readonly rising: number;
    };
  };

  /** Written levels, before the band's energy scales them (SO-51). */
  readonly touch: {
    readonly level: number;
    /** The level of the phrase that climbs to the top note. */
    readonly peak: number;
    /** Added for each semitone above home, taken off below it. */
    readonly perSemitone: number;
    /** Added to a short note on an "and". */
    readonly offbeat: number;
    /** Taken off a note lower than both its neighbours: the valley of a run is ghosted. */
    readonly valley: number;
    /** Taken off a pickup. */
    readonly pickup: number;
    readonly floor: number;
    readonly ceiling: number;
    /** The share of its space a note sounds for when the next note follows at once. */
    readonly legato: number;
  };
}

/**
 * The instrument, which is the player's choice and not the style's (BRIEF 5.3).
 * It says where the soloist can play and whether it has to breathe.
 */
export interface SoloInstrument {
  readonly name: string;
  /** General MIDI program, 0 to 127. */
  readonly program: number;
  /** The lowest and highest notes it plays. */
  readonly range: readonly [low: number, high: number];
  /** Where it sounds most like itself: the middle of a solo sits here (SO-01). */
  readonly home: number;
  /**
   * A horn has lungs: it cannot play longer than `lungs` seconds without a
   * breath, and a breath takes `takes` seconds. Null for an instrument that
   * need not breathe.
   */
  readonly breath: { readonly lungs: number; readonly takes: number } | null;
}
