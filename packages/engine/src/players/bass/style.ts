// The bass seat's part of a style pack: how a bassist plays a genre, as plain
// data. A line is a rhythm figure and the tones that go on it: a sequence of
// tones written apart from the rhythm (the box), tones the figure names for
// itself (a riff), or tones that are walked. The engine fits the tones to each
// chord, places the roots, and leads into the changes.

import type { MeterName } from "../../perform/meter.ts";
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
 * - `7`  the chord's own seventh, whatever kind: major over a major seventh, flat over a
 *        dominant or a minor seventh, the sixth of a sixth chord; on a chord with none, the
 *        major sixth where its scale has one, or else the root (ST-neosoul-14)
 * - `8`  the octave above the bass note
 * - `M7` the seventh of the chord's scale: the major seventh, or the flat seventh where
 *        the scale has that and not the major (a dominant's, a minor chord's). Over a plain
 *        triad, where `7` is the sixth that stands in for a seventh, this is the leading
 *        note down from the root: C, B, A into G (ST-country-05, EN-47)
 * - `1`  the chord's own root: the bass note itself, but under a slash chord the
 *        root its name gives (over C/G, the C), which `R` is not (BA-51: a two-beat
 *        bass over a chord standing on its fifth alternates with the root)
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
export type Tone =
  | "R"
  | "2"
  | "b3"
  | "3"
  | "4"
  | "#4"
  | "5"
  | "b6"
  | "6"
  | "b7"
  | "7"
  | "M7"
  | "8"
  | "1";
export const TONES: readonly Tone[] = [
  "R",
  "2",
  "b3",
  "3",
  "4",
  "#4",
  "5",
  "b6",
  "6",
  "b7",
  "7",
  "M7",
  "8",
  "1",
];

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
 * One bar of rhythm, a character per sixteenth (spaces ignored): sixteen in
 * 4/4, and in a line written for another meter as many as its bar has.
 *
 * - `x` the next tone of the sequence
 * - `o` the same tone struck again (the short note of a long-short)
 * - `-` the note before is still held
 * - `.` silence
 *
 * `x--- x--- x--- x-o-` is three quarter notes and a shuffled fourth beat.
 * The grid is straight; the style's swing turns the written "and" into the
 * triplet's last note afterwards.
 *
 * A figure may also name its tones where they fall, and then it is a riff: a
 * rhythm that belongs to its notes, the same tone on the same sixteenth in
 * every bar whatever chord it is fitted to (X-A-31, BA-38).
 *
 * - `R` the chord's bass note, `8` its octave
 * - `2` `3` `4` `5` `6` the tones of those names, and `7` the flat seventh
 * - `m` a dead note: the string muted and struck, a thump on the root with no
 *   pitch to speak of, as short and as quiet as the line's `dead` level (BA-40)
 *
 * `R..m R.8. m.R. .78.` is a funk riff; `..R- R-.5 8--- 5-3.` a reggae one,
 * its hole on beat 1 written as the rest it is.
 */
export interface Figure {
  /** What a bassist would call it, where it has a name. Reports use it. */
  readonly name?: string;
  /** Relative weight in the draw. Zero never wins. */
  readonly weight: number;
  readonly grid: string;
  /**
   * The tones it names are taken under the root, not over it, wherever the
   * instrument has the note: a pickup that climbs into the One, the deep shape
   * of a riff whose fifth falls a fourth below (BA-68). So are the tones of the
   * line's sequence its `x`s play: a two-beat bass's fifth under its root
   * (BA-51). A chord's arrival is its bass note wherever it falls.
   */
  readonly under?: boolean;
  /**
   * Each tone it names, but the octave, is taken in the octave nearest the
   * note before it, as a hand that stays where it is: from the root the fifth
   * falls a fourth and the seventh a step, from the octave the fifth falls back
   * into the octave between (ST-neosoul-14). Never under the open E or over
   * the line's ceiling.
   */
  readonly near?: boolean;
  /**
   * What a `7` in the grid names: the flat seventh (the default, a riff's b7
   * over any chord), or the chord's own seventh, `7` in the tone list: the
   * major seventh over a major seventh chord, the sixth over a triad
   * (ST-neosoul-14).
   */
  readonly seventh?: "flat" | "own";
}

/** The tones a figure can name in its grid, by the character that names each. */
export const RIFF_TONES: Readonly<Record<string, Tone>> = {
  R: "R",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "b7",
  "8": "8",
};
/** A dead note in a figure's grid. */
export const DEAD_NOTE = "m";

/**
 * A line that is walked: not written but made, a note to each stroke of the
 * figure, from where the harmony is and where it is going (BA-17 to BA-21).
 * The chord arrives on its bass note; the last note before the next chord is
 * an approach to it, chosen first (its kinds weighted by the style's lead-in
 * policy); the notes between move toward that approach, each a tone of the
 * chord or of its scale. Each note is one weighted draw, and these are the
 * weights. A walk is drawn whole for every plan the bassist weighs for a
 * phrase, and the critic picks the line.
 */
export interface WalkedLine {
  /** The widest move from one note to the next, in semitones: a fourth is 5 (BA-19). */
  readonly reach: number;
  /** The widest move onto the approach note: a major third is 4 (BA-20). */
  readonly intoApproach: number;
  /**
   * What a note is worth by what it is and where it falls: a tone of the chord
   * or only of its scale, on a strong beat (the bar's first pulse and its
   * middle one) or a weak one. Each is divided by the size of the move, so
   * steps beat leaps.
   */
  readonly weights: {
    readonly chord: { readonly strong: number; readonly weak: number };
    readonly scale: { readonly strong: number; readonly weak: number };
  };
  /** A move toward where the line is going counts this many times over; */
  readonly toward: number;
  /** and one away from it, this. */
  readonly away: number;
  /** A move that carries on the way the last one went counts this many times over: a line has a direction. */
  readonly onward: number;
  /** A move straight back to the note before the last counts this much: three notes rocking are not a line. */
  readonly back: number;
  /**
   * A note that is the next chord's bass note counts this much before its
   * time: touched on the way, the arrival has been given away (BA-74). On the
   * beat before the approach it is never played at all.
   */
  readonly early: number;
  /**
   * How likely a plan is to place the next root in its other octave, the one
   * the register would not have chosen, where the walk can get there: up to
   * the root instead of down to it. It is how a line climbs on purpose.
   */
  readonly otherOctave: number;
}

/**
 * Turning a riff round: the end of a phrase's last bar played on another
 * figure, as a drummer turns the back half of his answer bar. A turn's grid
 * is one or two beats long (4 or 8 sixteenths) and is laid over the end of
 * the bar; the section's own figure plays up to it. Whether a phrase turns is
 * the critic's choice among the plans weighed for it.
 */
export interface Turns {
  /** How likely a plan the bassist weighs is to turn the phrase's last bar. */
  readonly offer: number;
  /** How long a section keeps to one turn. */
  readonly hold: Hold;
  readonly options: readonly Figure[];
}

/** Sixteenths in a figure's grid: one bar of 4/4. */
export const FIGURE_STEPS = 16;

export interface BassLine {
  /** Tried in order; the first whose condition the chord meets is played. The last has no condition. */
  readonly tones: readonly ToneSequence[];
  /**
   * The rhythm, drawn whole from these and kept for the span `hold` names
   * (X-A-29, X-A-31). `draw` names the draw: tiers that share a name share it,
   * so with their figures listed in the same order and weights a section's riff
   * when quiet is the same riff, thinned, that it plays when loud. Tiers with
   * no name choose independently.
   */
  readonly figures: {
    readonly hold: Hold;
    readonly options: readonly Figure[];
    readonly draw?: string;
  };
  /** The line's tones are walked, not read from `tones`, which is then only what a walk falls back on. */
  readonly walked?: WalkedLine;
  /** Ways to turn the figure round at the end of a phrase. Without them the figure never changes. */
  readonly turns?: Turns;
  /**
   * The line follows the kick the drummer actually played in this bar, fills
   * included (BA-13, X-C-12): wherever a kick sounds and the figure is silent,
   * the bass plays the chord's bass note with it. A floor under the figure,
   * never in place of it (BA-94). Feathered and ghosted kicks are not kicks
   * to lock to.
   *
   * `"one"`: only the kick on the bar's downbeat, for a line that leaves the
   * One open while the drummer does (BA-47, ST-reggae-13). Where the kick
   * plays the One the bass plays the root with it for a beat at most, and the
   * figure's own notes inside that beat give way to it: root and root again an
   * eighth later is a stutter, not a line.
   */
  readonly followsKick?: boolean | "one";
  /**
   * A chord that arrives at the barline is stated by the figure's first note
   * in the bar, wherever that falls, and not forced onto the downbeat: a riff
   * with a hole on the One keeps it across a change (ST-reggae-14). A chord
   * that changes inside the bar is still stated where it lands, and a bar
   * whose figure has nothing under the chord still gets its root there.
   * Left out, every chord is struck where it arrives (BA-01).
   */
  readonly keepsHole?: boolean;
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
    /**
     * Set, a note's space is the gap to the next note, whatever rests the
     * figure writes between them, counted as this many sixteenths at most:
     * with 3 and a share of 0.75 a note is never longer than two and a quarter
     * sixteenths, which is how short a funk note is (X-C-14, ST-funk-18).
     */
    readonly gap?: number;
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
    /** A note between the pulses (an "e", an "and", an "a"). Without it, such a note is `weak`. */
    readonly off?: number;
    /** A dead note. Without it, as quiet as a re-strike. */
    readonly dead?: number;
    /**
     * A note a riff names as the octave (`8`): the pop, which a bassist plucks
     * harder than the roots around it (ST-disco-13: roots off the beat 78, the
     * octave 94). Without it, as any note in its place.
     */
    readonly octave?: number;
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
  /**
   * Where it sits in a bar of dotted pulses the style has written its line for (6/8, 12/8),
   * where that is not `at`: funk's sixteenth has no place in a line that is all eighths, and
   * leads in on the eighth there; neo-soul's lazy sixteenth is kept as it is.
   */
  readonly inDotted?: "beat" | "eighth" | "sixteenth";
  /** How likely a change is led into, 0 to 1. */
  readonly chance: {
    readonly inside: PerTier<number>;
    /** Into the first bar of a section or of a new time through it (EN-51). */
    readonly intoSection: PerTier<number>;
    /**
     * Into the first bar of a phrase inside a section: the line marks where
     * the next phrase starts as well as where the next section does
     * (ST-disco-14: the last bar of a phrase always leads in). Left out, as
     * `inside`.
     */
    readonly intoPhrase?: PerTier<number>;
    /** Into the final chord. */
    readonly intoEnding: number;
  };
  /**
   * What the coin belongs to. `section`: the same changes are led into every
   * time the section returns. `pass`: each time through has its own.
   */
  readonly hold: Hold;
  /**
   * Whether the bassist may add a note to lead in with: a held note split in
   * two (the two-feel's fourth beat), a pickup after the figure's last note.
   * Default true. False: only a note the figure already plays in the lead-in's
   * place becomes one, so the riff keeps its rhythm (BA-41). A leap of more
   * than an octave onto the arrival is still bridged.
   */
  readonly pickup?: boolean;
  /**
   * A line whose last note is more than an octave from where it lands comes
   * through the octave: that note is played an octave nearer (a pop before a
   * root far below it becomes the root under the pop), and any lead-in is
   * decided from there. Without this such a leap is bridged by a lead-in.
   */
  readonly throughOctave?: boolean;
  /**
   * A held note that is already the next chord's bass note is played as
   * written, and the root arrives on the note the line has just left: a
   * root-and-fifth line's fifth on beat 3 is its fifth whatever follows
   * (ST-acoustic-12: energy adds notes, never harmony). A lead-in still splits
   * it when the coin says so, and a note in the lead-in's own place always
   * gives way to one, by the weights below: the arrival is never sounded a beat
   * early. Left out, it is not heard early at all (BA-34): a held note is split
   * by a lead-in or traded for the chord's third, and a note in the lead-in's
   * place becomes the half step below.
   */
  readonly playsNextRoot?: boolean;
  /**
   * The line keeps its shape toward a change: a note that already lies a step
   * from the next root, in any octave, is played where the figure put it, and
   * no step is added from it, unless the coin asks for a lead-in. Left out (or
   * false), such a note is moved beside the next root, or a step into it added
   * on the last beat, whatever the coin says (BA-07): a two-beat bass's fifth
   * under its root would go over it, and a quiet bar would gain a third note
   * (BA-51, BA-52). A leap of more than an octave onto the arrival is still
   * bridged.
   */
  readonly keepsShape?: boolean;
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
  /**
   * The walk's own rhythm, one bar of the grid a figure is written in (`x` a
   * note, `-` held, `.` silence), striking one more note than `tones` has:
   * `x------- x--- x---` is the root held from 1 and two steps on 3 and 4
   * (BA-53). It replaces the bar's figure where the walk is played, so a line
   * whose figure strikes fewer notes than the walk needs (a two-beat bass) can
   * still walk. A bar of another length than the grid is never walked this
   * way, and a grid must be a bar of 4/4 or of a meter the line is written
   * for. The grid may also name tones as a riff does (`5` the chord's fifth):
   * those are the figure's, played around the walk under the root where the
   * instrument has the note, and are not steps of it, so `x------- 5--- x---`
   * keeps the boom-chick and walks in on beat 4 alone (EN-47). Left out, the
   * walk is played on the bar's own figure's strokes.
   */
  readonly grid?: string;
  /**
   * How much of its space each note of the walk sounds, the gap a line's notes
   * keep (`length.gap`) aside: a walk connects, where the line's own notes may
   * be short (BA-52: walking notes at 92%). Left out, as the line's notes.
   */
  readonly length?: number;
}

export interface WalkPolicy {
  /**
   * How likely a plan the bassist weighs is to walk into the next line, and
   * into a change inside one. The critic decides which plan is played.
   *
   * `intoSection`: into the first bar of a section or of a new time through it
   * (EN-51: a country bass walks up into a new section far more often than
   * inside one). Left out, as `end`. The final chord is always `end`'s.
   */
  readonly offer: {
    readonly end: PerTier<number>;
    readonly inside: PerTier<number>;
    readonly intoSection?: PerTier<number>;
  };
  /** The walks for each way the bass note can move. A move with none is never walked. */
  readonly kinds: Readonly<Partial<Record<RootMotion, readonly Walk[]>>>;
  /**
   * The walk home (EN-45 to EN-48): the bar before an ending that is one chord
   * struck on its downbeat, in 4/4, is walked into the final root every time,
   * at any level, whatever is offered above. The root on 1, then the 5th, 6th
   * and 7th counted from the landing on beats 2, 3 and 4, the 7th the chord's
   * own tone a whole step under the landing where it has one, else the leading
   * tone; over the V its root, the run's 5th, holds through beat 2; from the IV
   * the line walks down (its root held, the landing's 3rd and 2nd); a root
   * inside the run keeps the line and goes in on beat 4 alone; a chord struck
   * on beat 3 keeps its root there and adds at most one note on 4. The run and
   * the final root lie in the lowest octave whose 5th is on the instrument.
   * A note on 4 never rubs a half step over the chord it is played on.
   * `velocity`: the written level on each beat, 1 to 4 (a note held from 1 is
   * played at the first); the final root is at least as loud as the last
   * (`BassStyle.ending.velocity`). `length`: how much of its beat each note
   * sounds.
   */
  readonly ending?: {
    readonly velocity: readonly [number, number, number, number];
    readonly length: number;
  };
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
  /**
   * The part for each tier written for a bar of another meter, by the meter's
   * name as a chart writes it (`"12/8"`, `"6/4"`): its figures and its turns
   * are as long as that meter's bar. A bar of a meter written here is played
   * from it; any other plays the 4/4 lines plainly (`BassLine.otherMeters`).
   * Where roots sit, how changes are led into and how a phrase is chosen are
   * the bassist's in every meter.
   */
  readonly meters?: Readonly<Partial<Record<MeterName, PerTier<BassLine>>>>;
  readonly leadIn: LeadInPolicy;
  /** Walks into a change. Without them the bass leads in with one note at most. */
  readonly walks?: WalkPolicy;
  /**
   * Choosing between plans for a phrase. Without it, or with nothing to choose
   * (one shape for every chord, no walks, no walked line and no turns), the
   * line plays its first shape.
   */
  readonly phrase?: PhrasePolicy;
  /**
   * The bar before the band steps up a tier already plays the part of the
   * tier it is going to, so the change is set up across the barline and not
   * switched on at the downbeat (BA-25: the last bar of a head in two walks
   * into the first blowing chorus).
   */
  readonly stepsUpEarly?: boolean;
  readonly ending: {
    /** The written level of the last note (EN-19). A soft ending plays it at four fifths. */
    readonly velocity: number;
  };
}
