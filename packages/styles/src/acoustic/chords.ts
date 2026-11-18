// The acoustic guitar: a steel-string guitar (or a nylon-string one) in open position. Quiet, it
// fingerpicks the shape it is holding, one string at a time; louder, it strums
// the same shape on an eighth-note pendulum and lets it ring. With no bassist
// the picking hand is the Travis hand: the thumb alternates basses on the
// beats under the fingers (ST-acoustic-16 to ST-acoustic-22, ST-acoustic-30).

import type {
  Articulation,
  ChordStyle,
  CompFigure,
  RhythmBook,
  VoicingKind,
} from "@ensemble/engine";

/**
 * The chord as written, standing on its root: the triad, or the seventh chord
 * with its seventh, and any 9th, 11th or 13th the chart writes (ST-acoustic-22).
 * Never extended: what the chart does not write is not played. On a seventh
 * chord a written tension takes the fifth's string (CH-24: a seventh chord may
 * drop its fifth), so B7#9 is x2123x at the nut and not a five-note stretch up
 * the neck with the #9 under the 3rd. How many strings a chord rings on and
 * which of them are open is the fretboard's business.
 */
const open: VoicingKind = {
  position: "close",
  recipes: [
    { when: { family: ["power"] }, voices: ["R", "5"] },
    { when: { lacks: ["7"] }, voices: ["R", "3", "5", "T"] },
    { voices: ["R", "3", ["T", "5"], "7"] },
  ],
};

// ── the right hand ──────────────────────────────────────────────────────────
// Reading the grids: sixteen sixteenths to the bar, grouped by beat. Everything
// is on the eighths; the band lilts them a trace (ST-acoustic-02).
//
// Strummed, the hand swings down on every beat and up on every "and", whether
// or not it touches the strings; the guitar idiom reads the direction from the
// place, and an upstroke catches the top three strings.
//
//   x  a strum          X  the same, leaned on          .  the hand passes
//
// Picked, each letter is one string of the shape the hand is holding. With a
// bassist the notes' places 0 to 3 are the thumb and three fingers:
//
//   T  the thumb on the shape's lowest string, on beat 1     t  the same, elsewhere
//   i  m  a   index, middle and ring: the third, second and first strings of the shape
//
// With no bassist the thumb alternates on every beat and the fingers take the "and"s:
//
//   B  the thumb on the bass, on beat 1        u  the thumb on the upper string
//   v  the thumb on the alternate bass, the chord's fifth
//   1  2  3   a finger on the first, second or third string of the shape

const HAND: Articulation = {
  // A strum rings up to two beats and is never choked: the next stroke takes over
  // (ST-acoustic-20). Written at the downstroke's level; an upstroke is played 14 lighter.
  x: { level: 86, steps: 8 },
  X: { level: 100, steps: 8 },
  // A picked string rings until it is plucked again or the chord changes: a bar at most.
  // The thumb 72 on beat 1 and 66 elsewhere, the fingers 56 (ST-acoustic-18).
  T: { level: 72, steps: 16, pluck: ["bass"] },
  t: { level: 66, steps: 16, pluck: ["bass"] },
  i: { level: 56, steps: 16, pluck: [3] },
  m: { level: 56, steps: 16, pluck: [2] },
  a: { level: 56, steps: 16, pluck: [1] },
  // Alone: the thumb 74 on beat 1 and 66 elsewhere, the fingers 58 (ST-acoustic-19).
  B: { level: 74, steps: 16, pluck: ["bass"] },
  u: { level: 66, steps: 16, pluck: ["upper"] },
  v: { level: 66, steps: 16, pluck: ["alternate"] },
  "1": { level: 58, steps: 16, pluck: [1] },
  "2": { level: 58, steps: 16, pluck: [2] },
  "3": { level: 58, steps: 16, pluck: [3] },
};

/**
 * A picked pattern: broken chords on the eighths with a bassist, and the
 * Travis roll it becomes with none. A groove: one pattern for the section,
 * the same in every bar. It never leans into a change (ST-acoustic-30).
 */
const picked = (name: string, weight: number, grid: string, alone: string): CompFigure => ({
  name,
  weight,
  grid,
  alone,
  groove: true,
});

/**
 * The three patterns (ST-acoustic-18), each with the roll its section plays
 * when there is no bassist (ST-acoustic-19): the thumb on the bass, the upper
 * string, the alternate bass, the upper string; the fingers on the "and"s.
 */
const PICKED = (weight: number): CompFigure[] => [
  // Up the shape and rocking back: 0 1 2 3 2 1 2 3. Alone, strings 2 3 1 3.
  picked("up and rocking back", weight, "T.i. m.a. m.i. m.a.", "B.2. u.3. v.1. u.3."),
  // Up the shape twice: 0 1 2 3 0 1 2 3. Alone, strings 2 3 2 3.
  picked("up the shape twice", weight, "T.i. m.a. t.i. m.a.", "B.2. u.3. v.2. u.3."),
  // The thumb on 1 and 3, the fingers rocking on top: 0 2 3 2 0 2 3 2. Alone, strings 1 2 3 2.
  picked("thumb and rocking fingers", weight, "T.m. a.m. t.m. a.m.", "B.1. u.2. v.3. u.2."),
];

/**
 * A strum line: a groove, played in every bar. Where the hand leans into a
 * change its last upstroke plays the next chord early and rings over the
 * barline (ST-acoustic-30).
 */
const strummed = (name: string, weight: number, grid: string): CompFigure => ({
  name,
  weight,
  grid,
  groove: true,
  ties: true,
});

const rhythm: RhythmBook = {
  tiers: {
    // Quiet: always fingerpicked, one pattern a section (ST-acoustic-17).
    low: {
      draw: "quiet",
      articulation: HAND,
      figures: PICKED(1),
      answers: [],
      busy: { from: 8, to: 8 },
      // A chord the pattern would pass by (one a sixteenth long) is brushed where it arrives.
      arrival: { level: 72, steps: 8 },
    },
    // The working level: 35% of sections pick, the rest strum, the choice held for the
    // section (ST-acoustic-17). The three patterns share 42 of 120; the strum lines the other
    // 78 in the notes' 3 : 2 : 1 (ST-acoustic-20).
    mid: {
      draw: "working",
      articulation: HAND,
      figures: [
        ...PICKED(14),
        // D-DU-UDU, "old faithful".
        strummed("old faithful", 39, "x... x.x. ..x. x.x."),
        // Down on every beat, up on the "and"s of 2 and 4.
        strummed("ands of two and four", 26, "x... x.x. x... x.x."),
        // D-DU-DU-DU.
        strummed("down, down-up, down-up, down-up", 13, "x... x.x. x.x. x.x."),
      ],
      answers: [],
      busy: { from: 6, to: 8 },
      arrival: { level: 86, steps: 8 },
    },
    // Hot: always strummed, the accents on 2 and 4 with the snare (ST-acoustic-20).
    high: {
      draw: "hot",
      articulation: HAND,
      figures: [
        strummed("backbeat", 1, "x... X.x. ..x. X.x."),
        strummed("driving", 1, "x.x. X.x. x.x. X.x."),
      ],
      answers: [],
      busy: { from: 6, to: 8 },
      arrival: { level: 86, steps: 8 },
    },
  },
  // Nothing is cut short: a strum rings to the next stroke, a picked string to the chord's end.
  hold: 1,
  // The pattern, four times: a groove takes no answers.
  forms: [{ weight: 1, bars: "a a a a" }],
  candidates: 1,
};

// ── in six ──────────────────────────────────────────────────────────────────
// A bar of 6/8 is two slow pulses of three eighths, "ONE two three FOUR five
// six": twelve sixteenths, written in sixes, a pulse to a group. Nothing
// swings. The same two hands as in four, said in pulses.
//
// Picked, the thumb takes both pulses and the fingers the eighths between, as
// six-eight is picked: with a bassist the thumb is on the shape's lowest string
// each time; with none it alternates, the bass on the One and the alternate
// bass (the chord's fifth) on four, so the bar still has a bass in two.
//
// Strummed, the hand swings in eighths through each pulse, down, down, up:
// down on the pulse and on its middle eighth, up on its last (the engine reads
// the direction from the place; DR-10, ST-acoustic-04). The pulses are struck
// full, the strokes between lighter, so the six eighths are never all one
// weight: the middle eighth is written lighter (`o`), and the upstroke on the
// last is lighter by itself.

const HAND_IN_SIX: Articulation = {
  ...HAND,
  // A strum rings up to a pulse and is never choked: the next stroke takes over.
  x: { level: 86, steps: 6 },
  X: { level: 100, steps: 6 },
  // The middle eighth of a pulse, down and lighter.
  o: { level: 76, steps: 6 },
};

/**
 * The three patterns in six, each with the roll its section plays when there
 * is no bassist. Picked with a bassist the places are the thumb on the shape's
 * lowest string and the fingers on its three top strings, as in four; alone the
 * thumb plays the bass on the One and the alternate bass on four.
 */
const PICKED_IN_SIX = (weight: number): CompFigure[] => [
  // Up the shape from each pulse: thumb, index, middle; thumb, index, middle. Alone, strings 3 2.
  picked("rising in threes", weight, "T.i.m. t.i.m.", "B.3.2. v.3.2."),
  // Up to the top in the second pulse: thumb, index, middle; thumb, ring, middle. Alone, 3 2, 1 2.
  picked("up and over", weight, "T.i.m. t.a.m.", "B.3.2. v.1.2."),
  // The fingers rocking on top: thumb, middle, ring, twice. Alone, strings 2 1.
  picked("thumb and rocking fingers", weight, "T.m.a. t.m.a.", "B.2.1. v.2.1."),
];

const rhythmInSix: RhythmBook = {
  tiers: {
    // Quiet: always fingerpicked, one pattern a section (ST-acoustic-17).
    low: {
      draw: "quiet",
      articulation: HAND_IN_SIX,
      figures: PICKED_IN_SIX(1),
      answers: [],
      busy: { from: 6, to: 6 },
      arrival: { level: 72, steps: 6 },
    },
    // The working level: 35% of sections pick, the rest strum, in the weights of four.
    mid: {
      draw: "working",
      articulation: HAND_IN_SIX,
      figures: [
        ...PICKED_IN_SIX(14),
        // The first pulse left to ring, the second rolled: down; down, down, up.
        strummed("ring and roll", 39, "x...x. x.o.x."),
        // Both pulses rolled: down, down, up; down, down, up.
        strummed("rolling", 26, "x.o.x. x.o.x."),
        // Each pulse left to ring, an upstroke into the One: down; down, up.
        strummed("in two", 13, "x..... x...x."),
      ],
      answers: [],
      busy: { from: 3, to: 6 },
      arrival: { level: 86, steps: 6 },
    },
    // Hot: always strummed, the second pulse leaned on with the snare (ST-acoustic-20).
    high: {
      draw: "hot",
      articulation: HAND_IN_SIX,
      figures: [
        strummed("rolling, four leaned on", 1, "x.o.x. X.o.x."),
        strummed("ring and roll, four leaned on", 1, "x...x. X.o.x."),
      ],
      answers: [],
      busy: { from: 5, to: 6 },
      arrival: { level: 86, steps: 6 },
    },
  },
  hold: 1,
  forms: [{ weight: 1, bars: "a a a a" }],
  candidates: 1,
};

// ── in twelve ───────────────────────────────────────────────────────────────
// A bar of 12/8 is four slow pulses of three eighths, the slow folk ballad's
// bar: twenty-four sixteenths, written in sixes. The same two hands, said in
// pulses, with six's touch (a strum rings a pulse, the middle eighth lighter).
//
// Picked, the ballad's arpeggio: the thumb on 1 and 3, as it is on 1 and 3 in
// four, and the fingers up the shape and back down over two pulses (thumb,
// index, middle, ring, middle, index), a line that turns over the half bar;
// with no bassist the Travis thumb is on every pulse as in four (the bass, the
// upper string, the alternate bass, the upper string) and the fingers between.
// One pattern is six's own "up and over" said twice; the other two are written
// for twelve.
//
// Strummed, the pendulum through each pulse (down, down, up), as in six. The
// working "ring and roll" is written for the bar of four pulses: 1 and 3 left
// to ring, 2 with its upstroke, 4 rolled into the next One. "Rolling" and "in
// two and two" are six's own figures said twice (the second is also four's
// down on every beat and up on the "and"s of 2 and 4). Hot is six's two
// figures said twice, 2 and 4 leaned on with the snare.

/** Six's figure, said twice: where a bar of twelve is a bar of six spread out. */
const twice = (grid: string) => `${grid} ${grid}`;

const PICKED_IN_TWELVE = (weight: number): CompFigure[] => [
  // Up the shape and back down, from 1 and from 3: 0 1 2 3 2 1, twice. Alone, strings 3 2, 1 2.
  picked("up and back", weight, twice("T.i.m. a.m.i."), "B.3.2. u.1.2. v.3.2. u.1.2."),
  // Six's up and over, twice: the thumb on every pulse. Alone, strings 3 2, 2 1.
  picked("up and over", weight, twice("T.i.m. t.a.m."), "B.3.2. u.2.1. v.3.2. u.2.1."),
  // The fingers rocking on top, turning over the bar: from 1 thumb, middle, ring, middle,
  // index, middle; from 3 the same. Alone, strings 2 1, 2 3.
  picked("rocking", weight, twice("T.m.a. m.i.m."), "B.2.1. u.2.3. v.2.1. u.2.3."),
];

const rhythmInTwelve: RhythmBook = {
  tiers: {
    // Quiet: always fingerpicked, one pattern a section (ST-acoustic-17).
    low: {
      draw: "quiet",
      articulation: HAND_IN_SIX,
      figures: PICKED_IN_TWELVE(1),
      answers: [],
      busy: { from: 12, to: 12 },
      arrival: { level: 72, steps: 6 },
    },
    // The working level: 35% of sections pick, the rest strum, in the weights of four.
    mid: {
      draw: "working",
      articulation: HAND_IN_SIX,
      figures: [
        ...PICKED_IN_TWELVE(14),
        strummed("ring and roll", 39, "x..... x...x. x..... x.o.x."),
        strummed("rolling", 26, twice("x.o.x. x.o.x.")),
        strummed("in two and two", 13, twice("x..... x...x.")),
      ],
      answers: [],
      busy: { from: 6, to: 12 },
      arrival: { level: 86, steps: 6 },
    },
    // Hot: always strummed, 2 and 4 leaned on with the snare (ST-acoustic-20).
    high: {
      draw: "hot",
      articulation: HAND_IN_SIX,
      figures: [
        strummed("rolling, 2 and 4 leaned on", 1, twice("x.o.x. X.o.x.")),
        strummed("ring and roll, 2 and 4 leaned on", 1, twice("x...x. X.o.x.")),
      ],
      answers: [],
      busy: { from: 10, to: 12 },
      arrival: { level: 86, steps: 6 },
    },
  },
  hold: 1,
  forms: [{ weight: 1, bars: "a a a a" }],
  candidates: 1,
};

export const acousticChords: ChordStyle = {
  // Open position (ST-acoustic-16, CH-24): up to six strings, open strings on, every fretted
  // note at or below the 4th fret where the chord has such a shape, one muted string allowed
  // inside the grip (G over its low root is 3x0003), the chord standing on its root. An eighth
  // pendulum; an upstroke catches the top three strings and is 14 lighter (CH-27); the
  // strings roll 3 ms apart (ST-acoustic-39).
  idiom: {
    instrument: "guitar",
    strings: 6,
    position: 1,
    skip: true,
    open: true,
    rootOnBottom: true,
    openPosition: 4,
    strum: { grid: "eighth", up: 3, lighter: 14, roll: 3 },
  },
  kinds: { open },
  voicing: { low: "open", mid: "open", high: "open" },
  // The guitar's low E to C5, the top aimed at E4 (ST-acoustic-16). Under C3 a grip has only
  // its root and the fifth over it: that is the low-interval limits at work on a grip that
  // stands on its root (the voicing weights in the critic), with or without a bassist.
  register: { floor: 40, ceiling: 72, target: 64, reach: 4 },
  // Any meter but 4/4: a downstroke on every pulse, left to ring (ST-acoustic-04; the upstroke
  // on a pulse's last eighth is not played).
  plain: { length: 1, pulse: true, velocity: { beat: 86, offbeat: 86, restrike: 86 } },
  rhythm,
  // Six-eight and twelve-eight, written above.
  meters: { "6/8": rhythmInSix, "12/8": rhythmInTwelve },
  // The last upstroke of a strummed bar changes early 20% of the time at the working level
  // and 30% hot, never quiet; a picked bar never does (ST-acoustic-30). Nothing leans into a
  // change inside the bar (ST-acoustic-33).
  anticipation: {
    barline: { low: 0, mid: 0.2, high: 0.3 },
    midBar: "wait",
    otherwise: "stay",
    stroke: "x",
  },
  // A strummed or picked groove keeps its figure under a soloist (CH-68).
  listening: null,
  // The soft ending: one strum on 1 at 72, left to ring (ST-acoustic-35).
  ending: { velocity: 92, soft: 72, accent: 12 },
};
