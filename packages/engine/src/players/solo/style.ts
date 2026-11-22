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

/**
 * One way of leading into a phrase from the end of the bar before (SO-36): the
 * rhythm of the bar's last pulses, as many as the figure needs and half the
 * bar at most (in 4/4 the "and" of 4 is `..x-`, three eighths up into the one
 * `..x-x-x-`). Where the bar before has too little air for it after the
 * phrase before, a shorter figure is taken before none.
 */
export interface Pickup {
  readonly weight: number;
  /** A whole number of the bar's pulses, ending at the barline. */
  readonly cell: Cell;
  /** The levels it is played at, by name. Left out, every level. */
  readonly levels?: readonly string[];
}

/**
 * What the soloist writes as a bar, written for a meter other than 4/4: every
 * rhythm as long as that meter's bar, and a pickup as many of its last pulses
 * as it needs, half the bar at most.
 */
export interface SoloTime {
  /**
   * The style's levels again, in the same order and under the same names (the
   * solo's arc names them), with this meter's rhythms and phrase shapes.
   */
  readonly levels: readonly Density[];
  /** The rhythms an end bar may take: each finishes on a long note and leaves its last pulse unstruck. */
  readonly endings: readonly Cell[];
  /** The ways of leading into a phrase from the end of the bar before. */
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

  /**
   * How much busier than its arc the soloist plays, as the style's own: where
   * the player's setting (`soloDensity`) sits at its middle. At the setting's
   * bottom both are none, which is the soloist as first written; at its top
   * they are the engine's most (`MOST_BUSY` in slots.ts).
   */
  readonly busier: {
    /**
     * Levels above what the arc, the band's energy and the tempo ask, in
     * steps: 0.5 lifts every other phrase of a solo a level, 1 every phrase.
     * The first stretch of a solo is lifted no higher than the arc's second
     * asks, nor to the busiest level, so a solo still opens lower than it ends
     * (SO-05).
     */
    readonly lift: number;
    /**
     * The share of its room it gives up, 0 to 1: of the chance of a roomier
     * shape (`space.roomier`), and of the weight of a shape for each bar of
     * rest in it. From a tenth, the first phrase of a solo leaves no more empty
     * bars than any other (SO-10).
     */
    readonly room: number;
  };

  /**
   * Double time: late in a solo, for half a bar to two bars, the line runs at twice the
   * style's running subdivision, a run with a direction (up, or a cascade down) through the
   * style's notes, a chord tone on every pulse, landing on a chord tone on a pulse, held.
   * Earned: only in a phrase at the style's busiest level (or the climb to the top note)
   * straight after a phrase at the busiest level, out of the line's own notes and never out
   * of a breath; only in a solo's last chorus, never its first phrase; one at most a solo.
   * Offered beside the phrase it doubles, for the critic to judge. Its notes are even as
   * heard, whatever the band's swing; at a tempo where they would come faster than the
   * instrument's `fastest`, it is not offered.
   */
  readonly doubleTime: {
    /**
     * The notes a pulse in a bar of four, three or six-four: twice what the line runs in. (In
     * six-eight and twelve-eight it is six, twice a pulse's three eighths, in every style.) A
     * style that never plays double time still says what it would be, so that a run of it is
     * heard as one.
     */
    readonly perPulse: number;
    /** The chance a phrase that may take a burst is offered one, at the setting's middle. At none, never. */
    readonly chance: number;
    /** Its length in bars, from the pulse it starts on to the pulse it lands on. */
    readonly bars: { readonly shortest: number; readonly longest: number };
    /** Only in the climb to the solo's top note: a flurry before the climax. */
    readonly climbOnly: boolean;
    /**
     * At a slow tempo (a bar of four pulses longer than `tempo.slowBar`: a ballad), only from
     * this setting of `soloDensity` up, and no longer than `longest` bars. Null: as at any tempo.
     */
    readonly slow: { readonly from: number; readonly longest: number } | null;
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
    /**
     * A phrase that would start on a downbeat after a breath is led in from the
     * bar before (SO-36): from inside the solo, or from a bar the band plays
     * into a chorus's first phrase and the solo's own (SO-37 as restated).
     */
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
     * An idea said again bar for bar (a way that makes `again`, by any move) is
     * placed a beat early or a beat late, so it falls across the bar
     * differently: the same rhythm, lengths and contour moved by one of the
     * bar's own pulses (the quarter in 4/4, the dotted quarter in 6/8 and
     * 12/8), its notes fitted to the chords now under them, a chord tone on
     * every beat (SO-33), its bends and shakes kept. Drawn once for a phrase;
     * the idea so moved is offered beside the idea where it was, and the critic
     * judges both. Never at a chorus's top, in a solo's first or last phrase,
     * on the way to the top note or where the tune ends; never pulled before
     * the phrase's first bar or pushed past its last, never held across a
     * barline it was not held across unless the style `holds` it there, never
     * late in a section's last bar, and
     * never with a pickup. Where it fits only the other way it goes that way,
     * if the style goes that way at all (an `early` of 0 or 1 is one way
     * only); where it fits neither it is not offered. What the solo remembers
     * is the idea where it was.
     */
    readonly displace: {
      /** The chance a phrase said again bar for bar is said a beat away. At none, never. */
      readonly chance: number;
      /**
       * Of those, the share drawn a beat early: the rest are drawn late. It is the
       * share among ideas that can go either way: an idea that opens on the one
       * cannot go early without crossing the barline, a pickup's ground, so far
       * fewer go early than this says (`solo.displaced-early` reads it).
       */
      readonly early: number;
      /** The letters of a form it is done for. Left out, every one. */
      readonly roles?: readonly Role[];
      /**
       * A note of the idea that a pulse late would sound past the barline is held
       * over it whole, into the next bar of the phrase, and the downbeat it is held
       * over is not struck: the idea keeps every length it had. It is held only
       * where it is a tone of every chord that arrives while it sounds over the
       * barline (moved to the nearest tone it shares with them, within the
       * landing's reach, where it is not); else the idea is not moved there.
       * Only a moved idea holds a note so: every other phrase treats a barline
       * as it did. Left false, a note that would cross a barline keeps the idea
       * where it was (its last note may still stop at the barline).
       */
      readonly holds: boolean;
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
     * A landing slid into from a fret or two away, on an instrument whose
     * hand slides (SO-56): a note of an eighth or longer struck where the
     * chord changes, that is not bent, never in the bar the band ends on.
     * `chance` is a phrase's, for one of its landings: one at most a phrase.
     * `into` is which slides the style plays: `landing`, each SO-56 names
     * from a tone of the style's notes within two frets (from below where
     * there is one), and the minor third up into the major; `third`, only
     * that one-fret slide into a major third. Left at no chance, the style
     * does not slide.
     */
    readonly slide: { readonly chance: number; readonly into: "landing" | "third" };
    /**
     * The chance a phrase sounds one note by hammering on, and the chance it
     * sounds one by pulling off, on an instrument whose hand does: a note of
     * an eighth or shorter, no longer than the next, steps a fret or two up
     * (or down) to it inside the phrase, and the next is not struck. Neither
     * note is bent, slid, or struck where the chord changes; the first is not
     * the phrase's first; the two pairs, where a phrase has both, are apart.
     */
    readonly hammerOn: number;
    readonly pullOff: number;
    /**
     * Beats a note must be held for before it is shaken, on an instrument
     * that shakes its notes (SO-52): a dotted quarter is 1.5.
     */
    readonly shake: number;
    /**
     * The chance a phrase scoops into one note it arrives on, on an instrument
     * that scoops: one struck where the chord changes, on a pulse, a quarter or
     * longer, come to from below or by a leap (SO-53). One at most a phrase.
     */
    readonly scoop: number;
    /**
     * The chance the last note of a phrase falls, on an instrument that falls,
     * where it may (SO-54): a half note or longer, above the line's home, with
     * the band at its working level or above, and air after it for the fall
     * and a breath. Half as much again in a section's last two bars, seven
     * tenths elsewhere, a third straight after a phrase that fell.
     */
    readonly fall: number;
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
   * A hand that slides into a note from a fret or two away (SO-56): the note
   * is struck at the start fret and stands on each fret in turn, jumping to
   * the next. Two frets stand `fret` seconds each, so the note is on its
   * pitch at twice that; one fret stands `oneFret` seconds. In seconds, as a
   * bend is. Null for an instrument that cannot.
   */
  readonly slide: { readonly fret: number; readonly oneFret: number } | null;
  /**
   * A hand that sounds a note without striking it: a finger hammered onto the
   * string a fret or two above the note ringing, or pulled off it to a fret a
   * fret or two below. Two notes, one attack. False for an instrument that
   * strikes every note.
   */
  readonly hammers: boolean;
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
    /**
     * Which notes it shakes: `held`, every note held as long as the style asks
     * (`habits.shake`), as a guitarist does; `last`, only the last note before
     * a breath, the end of a phrase as heard, as a horn player does.
     */
    readonly on: "held" | "last";
    /**
     * The fewest seconds a note must sound to be shaken. Left out, until the
     * shake has reached its depth (`after` and `grows`).
     */
    readonly shortest?: number;
  } | null;
  /**
   * A horn's scoop: a note the line arrives on is struck `below` semitones
   * flat and eased up to pitch in `takes` seconds. Null for an instrument that
   * does not scoop.
   */
  readonly scoop: { readonly below: number; readonly takes: number } | null;
  /**
   * A horn's fall: the last note of a phrase sounds its full length, then
   * drops `semitones` over `takes` seconds and dies away as it drops. Null for
   * an instrument that does not fall.
   */
  readonly fall: { readonly semitones: number; readonly takes: number } | null;
  /**
   * The most notes a second a run in double time asks of the player: where a burst would be
   * faster, it is not offered. Each instrument says where its number comes from.
   */
  readonly fastest: number;
}
