// The disco rhythm guitar: a small bright grip high on the neck, and a hand
// that never stops. Every sixteenth is a stroke; the chord sounds only where
// the line marks it, and the rest are muted scratches (ST-disco-16, ST-disco-17).
// It is a groove: one line for the section, the same every time.

import type {
  Articulation,
  ChordStyle,
  CompFigure,
  RhythmBook,
  VoicingKind,
} from "@ensemble/engine";

/**
 * The stab: 3rd, 7th and 9th on a seventh chord, a triad on a plain chord
 * (ST-disco-16, CH-08). The bass has the root.
 */
const stab: VoicingKind = {
  position: "close",
  recipes: [
    // A diminished seventh is its four chord tones in every voicing kind (CH-06).
    { when: { family: ["diminished"] }, voices: ["R", "3", "5", "7"] },
    // Half-diminished: flat 3rd, flat 5th, flat 7th (CH-08).
    { when: { family: ["half-diminished"] }, voices: ["3", "5", "7"] },
    { when: { family: ["power"] }, voices: ["R", "5"] },
    // A plain triad is root, 3rd, 5th; a tension the chart writes on it takes the root's seat.
    { when: { lacks: ["7"] }, voices: [["T", "R"], "3", "5"] },
    // A minor 7th is played plain, flat 3rd, 7th and 5th, unless the chart writes a colour (a
    // m9 gets its 9th): the funk guitar's measured reason holds here too. With the 9th on every
    // minor chord the top of the grip leapt more than a fourth at 28% of the changes on the
    // falling-fifths chart (B7 to Em7 went from C5 to F#5).
    { when: { family: ["minor"], has: ["7"] }, voices: ["3", "7", ["T", "5"]] },
    // Everything else with a 7th or a 6th: 3rd, 7th, and on top the tension the chart writes,
    // else the 9th its scale gives (ST-disco-16).
    { voices: ["3", "7", ["T", "9", "5"]] },
  ],
};

// ── the chuck ───────────────────────────────────────────────────────────────
// Reading the grids: sixteen sixteenths to the bar, grouped by beat. The hand
// swings down on every beat and "and", up on every "e" and "a", whether or not
// it touches the strings; the guitar idiom reads the direction from the place.
//
//   X  the chop, the chord leaned on     x  a light stroke of the chord
//   ~  a scratch: the stroke with the fretting hand let go (the notes' `-`)
//   .  the hand passes without touching

/**
 * A chop rings 0.9 of a sixteenth (ST-disco-17); a scratch is half a sixteenth
 * (CH-28). Written at the downstroke's level: the idiom plays an upstroke 14
 * lighter, so a light stroke on an "a" is 72 and a scratch 36 (CH-27).
 */
const CHUCK: Articulation = {
  x: { level: 86, steps: 0.9 },
  X: { level: 100, steps: 0.9 },
  "~": { level: 50, steps: 0.5, muted: true },
};
/** Hot, the scratches are louder: 58 down, 44 up (ST-disco-17). */
const HOT_CHUCK: Articulation = { ...CHUCK, "~": { level: 58, steps: 0.5, muted: true } };

/** One line: a groove, played in every bar, tied over a change it leans into. */
const line = (name: string, weight: number, grid: string): CompFigure => ({
  name,
  weight,
  grid,
  groove: true,
  ties: true,
});

/** The chop on every "and", with the open hat. */
const ANDS = "~~X~ ~~X~ ~~X~ ~~X~";
/** A light upstroke on the "a" of 1 and of 3. */
const PICKUP = "~~Xx ~~X~ ~~Xx ~~X~";
/** A light upstroke on each "e" into the chop ("a-CHANK"). */
const PUSH = "~xX~ ~xX~ ~xX~ ~xX~";
/** An accented chop on the One, the "and"s of 2 and 4 kept, "a" pickups. */
const NILE = "X~~~ ~~Xx ~~~~ ~~Xx";

const rhythm: RhythmBook = {
  tiers: {
    // Quiet: the "and"s only, the scratches thinned to eighths.
    low: {
      draw: "low",
      articulation: CHUCK,
      figures: [line("ands", 1, "~.X. ~.X. ~.X. ~.X.")],
      answers: [],
      busy: { from: 8, to: 8 },
      arrival: { level: 86, steps: 0.9 },
    },
    // The working level: the "and"s (1) or the Nile line (1), every sixteenth a stroke.
    mid: {
      draw: "mid",
      articulation: CHUCK,
      figures: [line("ands", 1, ANDS), line("nile", 1, NILE)],
      answers: [],
      busy: { from: 16, to: 16 },
      arrival: { level: 86, steps: 0.9 },
    },
    // Hot: the "and"s (1), the pickup (1), the push (2), the scratches louder.
    high: {
      draw: "high",
      articulation: HOT_CHUCK,
      figures: [line("ands", 1, ANDS), line("pickup", 1, PICKUP), line("push", 2, PUSH)],
      answers: [],
      busy: { from: 16, to: 16 },
      arrival: { level: 86, steps: 0.9 },
    },
  },

  // Nothing is held: a chop is cut at 0.9 of whatever room it has.
  hold: 0.9,

  // The line, four times: a groove takes no answers.
  forms: [{ weight: 1, bars: "a a a a" }],
  candidates: 1,
};

export const discoChords: ChordStyle = {
  // Three strings of the stab (four for a chord too dense for three), no open strings (the hand
  // mutes by letting go, CH-23), the hand parked around the eighth fret, where the top of a
  // grip aimed at C5 is on the high E string. A sixteenth pendulum; an upstroke catches the
  // whole small grip, as the funk guitar's does, so a chop on an "a" still says the chord.
  idiom: {
    instrument: "guitar",
    strings: 3,
    position: 8,
    skip: false,
    open: false,
    rootOnBottom: false,
    strum: { grid: "sixteenth", up: 4, lighter: 14, roll: 6 },
  },
  kinds: { stab },
  voicing: { low: "stab", mid: "stab", high: "stab" },
  // B-flat 3 to G5, the top aimed at C5 and held there (ST-disco-16). It stays up there with
  // no bassist too: the chuck is a texture, not a bottom. The floor is A-flat 3, a whole step
  // under the notes': above B-flat 3 the only Fm9 a four-fret hand can hold is G4 Ab4 Eb5, a half
  // step growling on the bottom, and from A-flat 3 there is Ab3 Eb4 G4.
  register: { floor: 56, ceiling: 79, target: 72, reach: 3 },
  // Any meter but 4/4: a chop on every pulse (CH-54), as short as the rest.
  plain: { length: 0.225, pulse: true, velocity: { beat: 86, offbeat: 86, restrike: 86 } },
  rhythm,
  // Disco changes land on the One with the kick: only hot does the chop on the "and" of 4 play
  // the next chord early, 15% of the time (ST-disco-28), left to ring an eighth into the bar.
  // Otherwise the line is the line and stays on the old chord. Nothing leans in mid-bar.
  anticipation: {
    barline: { low: 0, mid: 0, high: 0.15 },
    midBar: "wait",
    otherwise: "stay",
    stroke: "X",
  },
  // A strummed groove keeps its figure under a soloist (CH-68).
  listening: null,
  // Held: one downstroke at 92 (ST-disco-31, CH-74).
  ending: { velocity: 92, soft: 72, accent: 12 },
};
