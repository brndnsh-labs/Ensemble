// The soloist's part of a style pack: how a lead player improvises in a
// genre, as plain data. A solo is planned in phrases. A phrase has a shape
// (which bars carry the line, which one lands, which rest), a rhythm for each
// playing bar from the style's own cells, and a job in the chorus: state an
// idea, say it again, change it, or answer it. The engine chooses the pitches
// (landings first, then the line between them), offers several whole phrases
// for each slot, and lets the critic pick.

import type { MeterName } from "../../perform/meter.ts";
import type { ChordFamily, ToneRole } from "../../theory/chord.ts";
import type { ScaleName } from "../../theory/scale.ts";

/**
 * One bar of rhythm on the sixteenth grid, a character per sixteenth (spaces
 * ignored; sixteen in 4/4, and in rhythms written for another meter as many
 * as its bar has): `x` a note struck, `-` that note held, `.` silence. The grid is
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
 * What a phrase is asked to be, a letter of a form:
 * `s` states an idea, `r` says it again, `v` says it changed, `a` answers it
 * and comes to rest; `c` is a contrast, something else set beside the idea (a
 * bridge); `b` brings back the idea the chorus opened on. What is played for
 * `s`, `v`, `c` and `b` is the idea from then on.
 */
export type Role = "s" | "r" | "v" | "a" | "c" | "b";
export const ROLES: readonly Role[] = ["s", "r", "v", "a", "c", "b"];

/**
 * What the phrases of a chorus are for, a letter each (spaces ignored).
 * `s r a` is the twelve-bar blues itself; `s a v a c r b a` is thirty-two
 * bars with a bridge. A form is written for a chorus of as many phrases as it
 * has letters, and a chorus takes one written for its own length when the
 * style has one; failing that the longest that fits, going round again, or
 * the shortest, cut to how it opens and how it closes. A form may open on `v`
 * or `r` to pick up the idea of the chorus before; the first chorus of a solo
 * takes a form that opens on `s`.
 */
export interface Form {
  readonly weight: number;
  readonly phrases: string;
}

/** The shape of a line over a phrase (SO-13). */
export type Contour = "arch" | "fall" | "climb" | "wave";
export const CONTOURS: readonly Contour[] = ["arch", "fall", "climb", "wave"];

/** A contour, or one for when the idea it answers rose and one for when it fell. */
export type ContourAsk = Contour | { readonly rose: Contour; readonly fell: Contour };

/**
 * Which remembered idea a phrase is made from: the one being worked on (the
 * default), the first idea of the solo, or the one this chorus opened on.
 */
export type Idea = "idea" | "first" | "opening";

/**
 * One way of making a phrase: a candidate, written whole, for the critic to
 * choose among. A style's book lists the ways it offers for each thing a form
 * can ask. The name is for anyone reading the choice, and keys the way's own
 * draws, so two ways in one list do not share a name unless they are the
 * same kind (new statements are told apart by their place in the list).
 */
export type Way = { readonly name: string } & (
  | {
      /** Something new: a rhythm from the level's cells, a contour, a shape. */
      readonly make: "new";
      /** It keeps to one rhythm all along its line, each bar the bar before moved on. */
      readonly oneRhythm: boolean;
      /** In rhythms the idea being worked on does not use, where the level has others. */
      readonly apart?: boolean;
      /** Semitones above where the arc puts this phrase: a bridge lifts (SO-41). */
      readonly lift?: number;
    }
  | {
      /**
       * The idea again, bar for bar: where it was (0), moved as far as the
       * chord's root has moved ("chord", SO-33), or each note a number of
       * steps of the scale along the way the arc is going.
       */
      readonly make: "again";
      readonly of?: Idea;
      readonly by: "chord" | number;
    }
  | {
      /** The idea with a new last bar, coming to rest above (1) or below (-1) where it did. */
      readonly make: "ending";
      readonly of?: Idea;
      readonly direction: 1 | -1;
    }
  | {
      /**
       * The idea grown into this place's own shape and pace. It opens on the
       * idea's first bar (its pitches too, with `keepOpening`), then keeps
       * that rhythm all along (`oneRhythm`) or runs on in the level's own.
       */
      readonly make: "grown";
      readonly of?: Idea;
      readonly contour: Contour;
      readonly keepOpening: boolean;
      readonly oneRhythm: boolean;
    }
  | {
      /** The idea's rhythm with a new line under another contour: an answer (AU-36). */
      readonly make: "turned";
      readonly of?: Idea;
      readonly contour: ContourAsk;
    }
);

/** One way of leading into a phrase from the last beat of the bar before: a beat of rhythm (SO-36). */
export interface Pickup {
  readonly weight: number;
  readonly beat: Cell;
}

/**
 * What the soloist writes as a bar, written for a meter other than 4/4: every
 * rhythm as long as that meter's bar, and a pickup as long as its last pulse.
 */
export interface SoloTime {
  /**
   * The style's levels again, in the same order and under the same names (the
   * solo's arc names them), with this meter's rhythms and phrase shapes.
   */
  readonly levels: readonly Density[];
  /** The rhythms an end bar may take: each finishes on a long note and leaves its last pulse unstruck. */
  readonly endings: readonly Cell[];
  /** The ways of leading into a phrase from the last pulse of the bar before. */
  readonly pickups: readonly Pickup[];
  /** The bar the solo's top note is held in. */
  readonly peak: Cell;
}

export interface SoloStyle {
  /**
   * The soloist's rhythms written for a bar of another meter, by the meter's
   * name as a chart writes it (`"12/8"`, `"6/4"`). In a bar of a meter written
   * here the soloist plays them; in any other it plays as much of a 4/4 rhythm
   * as the bar has room for. Its notes, its line and its habits are the same
   * player's in every meter.
   */
  readonly meters?: Readonly<Partial<Record<MeterName, SoloTime>>>;
  /** The instrument the soloist plays unless the player asks for another: a name from the instrument list. */
  readonly instrument: string;
  /** Semitones this style lifts the instrument's home, to sit over the comp and not in it (SO-07). */
  readonly lift: number;

  /** The notes a line is made of over each chord (SO-29). The chord's own tones are always in. */
  readonly notes: {
    /** The chord's own scale is in the pool: a line that follows the changes. */
    readonly chordScale: boolean;
    /**
     * Notes over each chord's own root, by the chord's family, as semitones
     * above that root: a scale moved with every chord, as a pentatonic on each
     * chord's root is (ST-disco-21: 1 2 3 5 6 over a major chord). A family
     * left out adds nothing. Left out, none.
     */
    readonly overRoot?: Readonly<Partial<Record<ChordFamily, readonly number[]>>>;
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
  /** How a landing is chosen among the chord's tones (SO-21). */
  readonly landing: {
    /**
     * Semitones each place down a ranking costs: a better tone wins unless
     * the next is more than this much closer to where the line is.
     */
    readonly perRank: number;
    /** How far, in semitones, a remembered note may be moved to land on a chord tone. */
    readonly reach: number;
  };
  /**
   * How the line gets from one landing to the next: what each kind of move
   * costs the walk, against a step with the line, which costs nothing
   * (SO-24, SO-25).
   */
  readonly line: {
    /**
     * The widest move, in semitones, that is a step of the scale the style
     * plays: a minor third in a blues scale or a pentatonic, a whole step
     * where the line runs the chord's own scale.
     */
    readonly step: number;
    /** Past a step, a move up to this wide is a skip; wider is a leap. */
    readonly skip: number;
    readonly skipCosts: number;
    readonly leapCosts: number;
    /** A half step onto a note that is not a chord tone: a crawl, where the half step is not the idiom. */
    readonly halfStepOffChord: number;
    /** A second half step in a row. */
    readonly halfStepsInARow: number;
    /** A note on a beat that is not a chord tone, in semitones of pull (SO-25). */
    readonly offChordOnBeat: number;
    /**
     * An off-beat note from which the next note, on the beat, cannot be a
     * chord tone a step further on: what the bebop scale's passing tone is
     * there to fix (AU-35). Nothing for a style that does not run the changes.
     */
    readonly strandsTheBeat: number;
  };

  /** Sparsest first. The arc names the level; the band's energy and the tempo each move it a step. */
  readonly levels: readonly Density[];
  /** The rhythms an end bar may take: each finishes on a long note and leaves its last beat unstruck (SO-15). */
  readonly endings: readonly Cell[];
  readonly forms: readonly Form[];
  /** How often a line takes each shape (SO-13). */
  readonly contours: Readonly<Record<Contour, number>>;
  /**
   * The ways of making a phrase that are offered for each thing a form asks,
   * in order of preference (the critic takes the first of equals).
   */
  readonly book: {
    /** The first phrase of a solo, which has nothing yet to work on. */
    readonly opening: readonly Way[];
    /** For each letter the style's forms use. */
    readonly roles: Readonly<Partial<Record<Role, readonly Way[]>>>;
    /** The phrase that climbs to the solo's top note, whatever the form asked there. */
    readonly peak: readonly Way[];
    /**
     * When the idea was stated this many levels sparser than the arc now
     * asks, these are offered too, wherever the list has nothing new: a new
     * idea at this pace is better than the old one starved.
     */
    readonly outgrown: {
      readonly levels: number;
      /**
       * Or when the idea as it was last played has fewer than this share of
       * the notes a bar the arc now asks for, wherever it was stated: an idea
       * carried from phrase to phrase keeps the pace it was born at.
       */
      readonly thin?: number;
      readonly ways: readonly Way[];
    };
  };
  /**
   * How alike two phrases must be (0 to 1) to be heard as related, and as
   * the same phrase again. `related` sits just above what two unrelated
   * phrases of the style score, which depends on how much its rhythms share.
   */
  readonly likeness: { readonly related: number; readonly same: number };

  /** The solo from its first phrase to its last, in equal stretches (SO-05). */
  readonly arc: {
    readonly stages: readonly ArcStage[];
    /**
     * The one top note of the solo: a phrase of the last chorus goes up to it
     * and ends on it. `above` is how far over home it is at most; nothing else
     * comes within `clear` semitones of it (SO-07).
     */
    readonly peak: {
      readonly above: number;
      readonly clear: number;
      readonly density: string;
      /** How many phrases before the solo's last it comes: 1 is the phrase before the last (SO-05). */
      readonly fromEnd: number;
      /** Its bars, as a shape (SO-09). */
      readonly shape: string;
      /** The way its line goes up to the top note. */
      readonly contour: Contour;
      /** Its line bars are one bar in sequence, each the bar before moved on (SO-05). */
      readonly sequence: boolean;
      /** The bar it ends on: the top note, held. */
      readonly ending: Cell;
    };
    /** The last phrase, which comes back down so the band can have the tune (SO-05). */
    readonly windDown: ArcStage & { readonly contour: Contour };
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
    /** A line bar plays the bar before it again: a riff, a sequence (SO-18). */
    readonly riff: number;
    /**
     * How a riff bar says the bar before it: as a `sequence`, moved along the
     * line with its landings found afresh; or `the same`, note for note,
     * moved only where the chord moved (SO-33).
     */
    readonly riffIs: "sequence" | "the same";
    /**
     * A rhythm figure is stabbed: each bar that plays it says its first note
     * two to four times before the line moves on. Decided once for a figure
     * in a phrase, never note by note (SO-35).
     */
    readonly stab: number;
    /**
     * The closest a stabbed note is struck again, in sixteenths. At 2 the
     * note is pumped on the eighths and the line lifts off it where the
     * rhythm runs on in sixteenths: one pitch twice a sixteenth apart is a
     * stutter (ST-disco-25). Left out, 1: a stab on every sixteenth the
     * figure strikes, as a horn section stabs (ST-funk-32).
     */
    readonly stabEvery?: number;
    /**
     * Inside a phrase, a line bar's last eighth that runs into a struck
     * downbeat is tied over the barline: one note, the next chord's (SO-38).
     */
    readonly tie: number;
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
      /**
       * The pickup's last note is the line's own approach to its first: the
       * half step under it, as often as the style's `chromatic` says (SO-36).
       */
      readonly approach: boolean;
    };
    /**
     * A string pushed up into a note, on an instrument whose hand can (SO-53).
     * Only into a note a phrase lands on: one struck where the chord changes,
     * or the last before a breath. Left at no chance, the style does not bend.
     */
    readonly bend: {
      /** The chance a landing on a major 3rd is pushed up from the half step under it. */
      readonly third: number;
      /** The chance a landing on a root or a perfect 5th, a quarter note or longer, is pushed up from the whole step under it. */
      readonly rootOrFifth: number;
      /**
       * Where the hand always gets lyrical: the phrase that goes up to the
       * solo's top note and this many phrases either side of it. The top
       * note itself is bent into whenever it can be (KF-B-10).
       */
      readonly around: number;
      /**
       * The chance any other phrase is one the hand gets lyrical in. The
       * chances above are for a landing of such a phrase; the rest of the
       * phrases are played plain, and are the space between (KF-B-10).
       */
      readonly elsewhere: number;
    };
    /**
     * Beats a note must be held for before it is shaken, on an instrument
     * that shakes its notes (SO-52): a dotted quarter is 1.5.
     */
    readonly shake: number;
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
 * It says where the soloist can play, whether it has to breathe, and what its
 * hand can do with a note's pitch.
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
  /**
   * A hand that can push a string up into a note: the note is struck flat and
   * eased up to pitch in `takes` seconds. In seconds, because a hand does not
   * move faster when the tempo does. Null for an instrument that cannot.
   */
  readonly bend: { readonly takes: number } | null;
  /**
   * How it shakes a held note: `depth` cents, `rate` times a second, starting
   * `after` seconds into the note and reaching its depth over `grows` more.
   * `upward` is a fretted string, which can only be pushed sharp and let back;
   * otherwise the pitch goes `depth` either side. Null for an instrument whose
   * notes stay where they are struck.
   */
  readonly shake: {
    readonly depth: number;
    readonly rate: number;
    readonly after: number;
    readonly grows: number;
    readonly upward: boolean;
  } | null;
}
