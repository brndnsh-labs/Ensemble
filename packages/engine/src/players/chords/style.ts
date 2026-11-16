// The chord seat's part of a style pack: how a comper plays a genre, as plain
// data. A part is made in three steps, each its own module: the rhythm says
// where the hand strikes and which voicing kind it asks for; the voicing
// engine fits that kind to the chord and leads it from the strike before; the
// idiom turns each voiced strike into the notes the instrument plays.

import type { PerTier, Tier } from "../../style/types.ts";
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
  /**
   * In a spread, the same chord stacked other ways, each offered beside
   * `voices`: the 3rd-and-7th shell beside the root-and-7th (ST-neosoul-19).
   */
  readonly also?: readonly (readonly Voice[])[];
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
   * How the tones are stacked.
   *
   * - `close`: every inversion inside an octave (CH-15). The first recipe the
   *   chord meets is played.
   * - `spread`: two hands, the voices exactly in the order the recipe writes
   *   them, low to high, each the nearest of its note above the one before:
   *   a left-hand shell with the colours stacked over it (ST-neosoul-19: Dm9 as
   *   F C | E A D, written `3 7 9 5 R`). A recipe's `also` are further
   *   stackings offered beside it: another shell for the left hand (root and
   *   7th, 3rd and 7th), so the register chooses between them, as a pianist
   *   takes the shell that keeps the hands where they are.
   */
  readonly position: "close" | "spread";
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
  /**
   * How far, in semitones, the top voice may be led from its target before the
   * hand is pulled back. Inside the reach voice leading decides; outside it each
   * semitone costs more than a smooth move saves, so a hand that has crept up or
   * down a chorus at a time turns round instead of leaving its part of the keyboard.
   */
  readonly reach: number;
}

/**
 * A guitar in the chord seat (CH-20 to CH-31, X-C-18, X-C-19). A chord is
 * found on the fretboard in standard tuning: one note to a string, pitch rising
 * string to string, every fretted note inside a four-fret hand, nothing over
 * the 15th fret. The register is its window in pitch and where its top note is
 * aimed; how firmly the hand stays put is what the voicing weights cost.
 *
 * The strumming hand is a pendulum: down on the beat side of each pair of the
 * grid it strums, up on the other, so direction is read from where a stroke
 * falls and is never chosen (CH-27). The grip is held until the chord changes
 * (CH-31).
 */
export interface Guitar {
  readonly instrument: "guitar";
  /**
   * How many strings a grip sounds. A chord with more tones than this is
   * played on as many strings as it has tones before a tone is given up; with
   * fewer, only the root or the fifth is doubled (CH-21).
   */
  readonly strings: number;
  /**
   * The fret the first finger is parked at. The same notes can often be
   * fretted in two places, five frets and a string apart: the one nearer this
   * is played, so the part lives in one region of the neck.
   */
  readonly position: number;
  /** Whether one muted string may sit inside the grip (the swing guitar's 8x89xx, CH-22). */
  readonly skip: boolean;
  /**
   * Whether open strings may sound. Never where the hand mutes by letting go:
   * an open string would ring on through a scratch or a chop (CH-23).
   */
  readonly open: boolean;
  /** Whether a grip stands on the chord's root (a guitar that is also the bottom of the band). */
  readonly rootOnBottom: boolean;
  /**
   * Open position (CH-24): the highest fret of a shape played at the nut (the
   * 4th). Where a chord has a grip with every fretted note at or below it,
   * only such grips are offered, and not wherever voice leading would drift.
   * Grips are looked for on every count of strings from `strings` down to the
   * chord's tones, because x32010 and xx0232 are the chords and no six-string
   * shape is; and the third may be doubled once, one copy on the top two
   * strings (C is C E G C E). Left out, a grip is `strings` strings wherever
   * on the neck the register puts it.
   */
  readonly openPosition?: number;
  readonly strum: {
    /** The note value the pendulum swings on. */
    readonly grid: "eighth" | "sixteenth";
    /** How many of the grip's top strings an upstroke catches (CH-27: three). */
    readonly up: number;
    /** How much lighter an upstroke is than the written level (CH-27: 86 down, 72 up). */
    readonly lighter: number;
    /**
     * Milliseconds between neighbouring strings as a stroke crosses them: low
     * string first going down, high string first coming up (CH-29: 6 on steel
     * strings, 3 on nylon). The whole stroke is centred on its place in the grid.
     */
    readonly roll: number;
  };
}

/**
 * The instrument the seat is being. It decides what a voicing candidate is
 * (keys: any stack of the tones the hand can reach; a guitar: a grip on the
 * fretboard) and how a strike becomes notes (keys: every pitch at once; a
 * guitar: a grip rolled across its strings, held from strike to strike).
 */
export type Idiom = "keys" | Guitar;
/** The instruments the seat knows, by name. */
export const INSTRUMENTS: readonly string[] = ["keys", "guitar"];

/**
 * The plain rhythm: one strike where each chord arrives, held most of the way
 * to the next (the blues pad, ST-blues-31 low). It is what a meter other than
 * 4/4 plays, and what a voicing audition plays with no rhythm in the way.
 */
export interface PlainRhythm {
  /** How long a strike sounds, as a share of the time until the next strike or the barline. */
  readonly length: number;
  /** Written levels, before the bar's energy scales them. */
  /**
   * Struck on every pulse of the bar, not only where a chord arrives: what a
   * strummed or chopped part falls back to in a meter its book is not written
   * for (CH-54). Left out, the chord is a pad.
   *
   * `"offbeats"`: every pulse but the bar's first, the One left to the bass
   * and the drop (ST-reggae-04: the skank chops at the start of every pulse
   * but the first). A chord that sounds only on the first pulse is still
   * struck where it arrives.
   */
  readonly pulse?: boolean | "offbeats";
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

/**
 * A place in the grip a guitarist is holding, as the picking hand finds it
 * (CH-32). The thumb has three:
 *
 * - `bass`: the grip's lowest string
 * - `alternate`: the chord's fifth as an alternating thumb plays it: a string
 *   under the bass at the same fret (a fourth below: C3 with G2 under it, A2
 *   with the open E) where the hand can hold that with the grip; or else the
 *   fifth on one of the two strings over the bass (E2 with B2); and with no
 *   fifth there, the bass again
 * - `upper`: the next string of the grip above those two
 *
 * and each finger one: `1`, `2`, `3` are the grip's strings counted from the
 * top, as a guitarist numbers them. On a grip with fewer strings than a place
 * asks for, the place is the nearest string the grip has. Under a new chord
 * the thumb's first note is its bass, whichever of its places is written.
 */
export type PickPlace = "bass" | "alternate" | "upper" | 1 | 2 | 3;
export const PICK_PLACES: readonly PickPlace[] = ["bass", "alternate", "upper", 1, 2, 3];

/**
 * How the hand plays one written symbol of a figure: how hard, and for how
 * long when the grid does not hold it on.
 */
export interface Attack {
  /** Written level, before the bar's energy scales it. */
  readonly level: number;
  /** Length in sixteenths of a strike the grid does not hold: a stab. */
  readonly steps: number;
  /**
   * The hand comes down with the notes deadened: a guitar's scratch, the
   * fretting hand let go (CH-28); a clavinet's dead key. It is a stroke of the
   * rhythm and not a statement of the chord. It deadens whatever the hand is
   * holding at that moment, it never counts as striking a chord (CH-34), a
   * chord is never played early as one (CH-36), and it gives way to a chord
   * struck in its place.
   */
  readonly muted?: boolean;
  /**
   * The stroke is plucked, not strummed: only these places of the grip the
   * hand is holding sound, a string each (one, or two pinched together). On a
   * guitar only. The grip is the one a strum would sound, so picking and
   * strumming a chord are one left hand. A plucked string rings until it is
   * plucked again, or the hand strums or moves to another grip, and no longer
   * than its chord is written for; `steps` is the longest it may ring. It
   * strikes its chord (CH-34), but a chord is never played early as one: a
   * single string cannot state a chord (ST-acoustic-30).
   */
  readonly pluck?: readonly PickPlace[];
}

/** The symbols a figure may be written in, and how each is played. */
export type Articulation = Readonly<Record<string, Attack>>;

/**
 * One bar of comping rhythm, written whole (X-A-31). A character per
 * sixteenth of a 4/4 bar, spaces ignored:
 *
 * - a symbol of the articulation (`x`, `X`, `o`): the hand comes down. A symbol
 *   whose attack is muted is a scratch: the stroke with the notes deadened
 * - `-` the chord before is still held
 * - `.` silence. In a strummed line the hand keeps swinging and passes over
 *   the strings without touching them
 *
 * `x--- --X- ---- ----` is the Charleston as a pad; `.... X... .... X...` is
 * chops on 2 and 4. The grid is straight: the style's swing bends it afterwards.
 */
export interface CompFigure {
  /** What a musician would call it. Reports and scorecards name figures by this. */
  readonly name: string;
  /** Relative weight in the draw. Zero never wins. */
  readonly weight: number;
  readonly grid: string;
  /** Its own articulation, where it is not played like the rest of the tier (the pump's long-short). */
  readonly articulation?: Articulation;
  /** The voicing kind it asks for, where that is not the tier's (the pump's close position). */
  readonly voicing?: string;
  /**
   * A groove, not a conversation: it is played in every bar of the phrase,
   * never as an answer, and nothing takes a stroke out of it. Where it does
   * not lean into a change it stays on the old chord; where it does, it plays
   * the new chord early and strikes it again on the beat, because a hole would
   * break it (CH-41).
   */
  readonly groove?: boolean;
  /**
   * A groove that lets a chord it plays early ring over the change: the first
   * stroke that sounds the chord in the eighth before is the push, held an
   * eighth into the new chord, and until it has rung the hand passes without
   * touching (CH-36). A strumming hand can do that and not leave a hole: it
   * keeps swinging. Without this a groove strikes the chord again on the beat
   * (the pump, CH-41).
   */
  readonly ties?: boolean;
  /**
   * The figure as it is played in the last bar of a phrase: the same bar with
   * its end turned, written whole like any figure. It is the figure's own
   * answer, the same every time, where a conversation would answer with
   * another figure. Left out, the last bar is the figure again.
   */
  readonly turn?: string;
  /**
   * The figure as it is played in a bar where no bassist plays (the seat is
   * switched off, or the arrangement lays it out), written whole like any
   * figure: the hand is the bottom of the band too (CH-26), so a broken chord
   * becomes a thumb that alternates basses under the fingers (CH-32). Left
   * out, the figure is the same with or without a bassist.
   */
  readonly alone?: string;
}

/** The comping vocabulary at one level of energy. */
export interface RhythmTier {
  /**
   * Names the section's draw of its figure. Tiers that share a name share the
   * draw: with their figures listed in the same order and weights, a section's
   * riff when quiet is the same riff, thinned, that it plays when loud. Tiers
   * with different names choose independently.
   */
  readonly draw: string;
  readonly articulation: Articulation;
  /**
   * The figures a section may take as its own. One is drawn per section and
   * played every time the section returns (X-B-14); the others can answer it.
   */
  readonly figures: readonly CompFigure[];
  /** Figures that are only ever answers: a bar that turns the section's figure. */
  readonly answers: readonly CompFigure[];
  /** Strikes a bar the hand aims for, from the bottom of the tier's energy to its top. */
  readonly busy: { readonly from: number; readonly to: number };
  /**
   * The strike a chord gets where it arrives when the figure would pass it
   * by (CH-34): its level, and its length in sixteenths or to the chord's end.
   */
  readonly arrival: Attack;
  /**
   * The level of the figure's strike on the downbeat when the bar opens on the
   * chord the bar before ended on: the chord is not new, and the hand only keeps
   * it alive on an instrument that dies away, more softly than it first struck
   * it (CH-48: 64 against 80). Left out, that strike is played as written.
   */
  readonly restrike?: number;
}

/**
 * The shape of a four-bar phrase, a letter per bar: `a` is the section's own
 * figure, `b` and `c` the two figures answering it this time through. Every
 * form opens on `a`: the top of a phrase states the figure. A longer phrase
 * plays `a` again at the front; a shorter one keeps its first bar and its end.
 */
export interface PhraseForm {
  readonly weight: number;
  /** Four letters, spaces ignored: `a a b a`. */
  readonly bars: string;
}

/**
 * The rhythm book: written figures, how they are articulated, and how a phrase
 * is built from them. A phrase is chosen whole: several plans are drawn from the
 * forms and the critic picks one (`critic.weights.comping`).
 */
export interface RhythmBook {
  readonly tiers: PerTier<RhythmTier>;
  /** How much of a held chord's written length sounds: a pad that breathes (ST-blues-31). */
  readonly hold: number;
  readonly forms: readonly PhraseForm[];
  /** How many plans the comper weighs for each phrase. One is no choice at all. */
  readonly candidates: number;
}

/** Playing a chord before the chart writes it (CH-36, CH-40). */
export interface Anticipation {
  /**
   * The chance, at a barline where the chord changes, that the hand leans in:
   * the new chord on the last eighth, tied over, whether or not the figure has
   * a strike there (a figure that passes the last eighth by would otherwise
   * never lean in, KF-B-36). When it does not, the change lands on the beat.
   */
  readonly barline: PerTier<number>;
  /**
   * A change inside the bar. `tie`: a strike in the eighth before it plays the
   * new chord and ties over (CH-40). `wait`: the change waits for the beat.
   */
  readonly midBar: "tie" | "wait";
  /**
   * What becomes of a strike in the eighth before a change when the hand does
   * not lean in. `rest`: it is left out, because a stab of the outgoing chord
   * just before the new one was heard as a wrong chord (jazz, blues; KF-B-27).
   * `stay`: it plays the old chord, because the figure is the figure (funk, rock).
   */
  readonly otherwise: "rest" | "stay";
  /** The symbol of the tier's articulation a push is played as when the figure has no strike there. */
  readonly stroke: string;
  /**
   * A strike the figure writes held, falling in the eighth before a change inside the bar,
   * keeps ringing as written once it has become the new chord (to the end of that chord, at
   * most). Left out, a push rings only as long as what it replaces in the new chord's time:
   * an eighth where the figure has nothing there (CH-40).
   */
  readonly held?: boolean;
}

/**
 * How the hand listens to a soloist (CH-59 to CH-71). Its voicings keep off
 * the soloist's note and out of its register, by the critic's voicing weights;
 * and a phrase may be played around the line, leaving out what would come
 * down under it and speaking in its breaths. Whether a phrase is played that
 * way is the critic's choice (`critic.weights.comping`); this says what the
 * ways are made of.
 */
export interface Listening {
  /** The shortest silence of the soloist the hand hears as a breath, in sixteenths (CH-71: six, a dotted quarter). */
  readonly breath: number;
  /** The stab put into a breath the figure leaves empty: its written level, and its length in sixteenths (an eighth at most). */
  readonly answer: Attack;
  /** How much harder a strike of the figure is played when it falls in a breath. */
  readonly lift: number;
  /**
   * The busiest level of the rhythm book the hand plays from while a soloist
   * has the lead. A band at its loudest under a solo has a soloist at its
   * busiest, and a comp that goes to its own busiest figures with them is
   * talking over the line: the drums and the bass carry the heat, the hand
   * plays harder but no busier. Left out, the hand follows the band's level.
   */
  readonly busiest?: Tier;
  /**
   * The voicing kind the hands close up to in a bar the soloist sounds in: a
   * two-handed spread becomes one hand under the line, and opens again in the
   * gaps (ST-neosoul-21). Every strike in such a bar takes it, so a bar is
   * played with one pair of hands. Left out, the kinds are the rhythm's.
   */
  readonly closes?: string;
}

export interface ChordStyle {
  readonly idiom: Idiom;
  /** The ways of voicing a chord, by name. A strike asks for one of them by name. */
  readonly kinds: Readonly<Record<string, VoicingKind>>;
  /** The kind a strike asks for when nothing in the rhythm asks otherwise, by tier. */
  readonly voicing: PerTier<string>;
  readonly register: ChordRegister;
  readonly plain: PlainRhythm;
  /**
   * The comping rhythm in 4/4. Null plays the plain rhythm everywhere: a pad,
   * or a voicing audition with no rhythm in the way.
   */
  readonly rhythm: RhythmBook | null;
  readonly anticipation: Anticipation;
  /**
   * How the seat listens to a soloist. Null for a seat that does not: it plays
   * as if nobody were soloing, as the organ does (CH-60, CH-68). Where it
   * listens, every voicing hears the line, and a phrase may be played around
   * it; a figure marked `groove` keeps its rhythm whatever this says, as a
   * funk chop and the boogie pump do (CH-68, ST-blues-33).
   */
  readonly listening: Listening | null;
  /** The final chord (CH-74, EN-14 to EN-19). */
  readonly ending: {
    /** The written level of the final chord. */
    readonly velocity: number;
    /** The same in a soft ending. */
    readonly soft: number;
    /** How much harder a short final hit (the button) is than the held chord. */
    readonly accent: number;
  };
}
