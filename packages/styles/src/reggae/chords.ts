// The reggae guitar: the skank. A small grip high on the neck, chopped on 2
// and 4 and on nothing else that matters: nothing on 1 or 3, which are the
// bass's and the drop's. A chop is cut short, every one on a beat or an "and" a
// downstroke; only the flick after the chop comes up. It never plays a chord
// early: the skank is the clock's off-beat (ST-reggae-18 to ST-reggae-21,
// ST-reggae-29).

import type {
  Articulation,
  ChordStyle,
  CompFigure,
  RhythmBook,
  VoicingKind,
} from "@ensemble/engine";

/**
 * Tight and three-note: the triad, or root, 3rd and 7th on a chord with a
 * seventh (ST-reggae-18, ST-reggae-21). No extensions: what the chart writes
 * past the seventh is left to the soloist, but an alteration (a b5, a #9) is
 * part of the chord and always sounds (X-B-13).
 */
const skank: VoicingKind = {
  position: "close",
  recipes: [
    // A diminished seventh is its four chord tones in every voicing kind (CH-06).
    { when: { family: ["diminished"] }, voices: ["R", "3", "5", "7"] },
    // Half-diminished: flat 3rd, flat 5th, flat 7th (CH-08).
    { when: { family: ["half-diminished"] }, voices: ["3", "5", "7"] },
    { when: { family: ["power"] }, voices: ["R", "5"] },
    { when: { lacks: ["7"] }, voices: ["R", "3", "5"] },
    { voices: ["R", "3", "7"] },
  ],
};

// ── the skank ───────────────────────────────────────────────────────────────
// Reading the grids: sixteen sixteenths to the bar, grouped by beat. The hand
// swings down on every beat and "and", up on every "e" and "a", whether or not
// it touches the strings; the guitar idiom reads the direction from the place.
//
//   X  the chop on 2 and 4         x  a lighter stroke: the flick after the chop
//   .  the hand passes                (an upstroke), or a hot "and" (a downstroke)

/**
 * Each chop 0.8 of a sixteenth (ST-reggae-19). The chop on 2 and 4 at 100, the
 * lighter strokes at 86: the idiom plays an upstroke 14 lighter, so the flick
 * is 72. The chop is 1.16 times a lighter "and" and 1.39 times the flick
 * (ST-reggae-20: 1.15 to 1.4).
 */
const CHOP: Articulation = {
  X: { level: 100, steps: 0.8 },
  x: { level: 86, steps: 0.8 },
};

/** One figure: a groove, played in every bar; it never leans into a change (ST-reggae-29). */
const figure = (name: string, weight: number, grid: string): CompFigure => ({
  name,
  weight,
  grid,
  groove: true,
});

/** The chop on 2 and 4. */
const PLAIN = ".... X... .... X...";
/** The chop and a sixteenth flick after it: "chk-a". */
const DOUBLE = ".... Xx.. .... Xx..";
/** 2 and 4 with lighter "and"s: the rockers and steppers lift. */
const ANDS = "..x. X.x. ..x. X.x.";

const rhythm: RhythmBook = {
  tiers: {
    // Quiet: plain.
    low: {
      draw: "low",
      articulation: CHOP,
      figures: [figure("plain", 1, PLAIN)],
      answers: [],
      busy: { from: 2, to: 2 },
      arrival: { level: 86, steps: 0.8 },
    },
    // The working level: plain (3), double (1).
    mid: {
      draw: "mid",
      articulation: CHOP,
      figures: [figure("plain", 3, PLAIN), figure("double", 1, DOUBLE)],
      answers: [],
      busy: { from: 2, to: 4 },
      arrival: { level: 86, steps: 0.8 },
    },
    // Hot: plain (1), double (2), ands (2).
    high: {
      draw: "high",
      articulation: CHOP,
      figures: [figure("plain", 1, PLAIN), figure("double", 2, DOUBLE), figure("ands", 2, ANDS)],
      answers: [],
      busy: { from: 2, to: 6 },
      arrival: { level: 86, steps: 0.8 },
    },
  },
  // Nothing is held: a chop is cut short of whatever room it has.
  hold: 0.9,
  // The figure, four times: a groove takes no answers.
  forms: [{ weight: 1, bars: "a a a a" }],
  candidates: 1,
};

// ── in twelve and in six ────────────────────────────────────────────────────
// A pulse to a group of six sixteenths; only a pulse's three eighths are struck.
// Twelve is four's skank said in pulses: the chop on 2 and 4, now dotted
// quarters; the flick on the eighth after it, the triplet's middle note, where
// four has it a sixteenth after; the hot "and"s on each pulse's last eighth.
// The hand still swings in sixteenths, so every stroke on an eighth is a
// downstroke, the flick too (at the lighter 86, not four's upstroke at 72).
// Six is twelve's first half: the chop on the second pulse, which in a bar of
// two is the drop's (ST-reggae-04: the skank chops every pulse but the first).

/** The first half of a line written for twelve: the same skank in a bar of six. */
const half = (line: string) => line.split(" ").slice(0, 2).join(" ");

const PLAIN_IN_TWELVE = "...... X..... ...... X.....";
const DOUBLE_IN_TWELVE = "...... X.x... ...... X.x...";
const ANDS_IN_TWELVE = "....x. X...x. ....x. X...x.";

/** The book in a compound bar: four's tiers and weights, with the meter's figures. */
function compoundBook(plain: string, double: string, ands: string, chops: number): RhythmBook {
  const { low, mid, high } = rhythm.tiers;
  return {
    ...rhythm,
    tiers: {
      low: { ...low, figures: [figure("plain", 1, plain)], busy: { from: chops, to: chops } },
      mid: {
        ...mid,
        figures: [figure("plain", 3, plain), figure("double", 1, double)],
        busy: { from: chops, to: chops * 2 },
      },
      high: {
        ...high,
        figures: [figure("plain", 1, plain), figure("double", 2, double), figure("ands", 2, ands)],
        busy: { from: chops, to: chops * 3 },
      },
    },
  };
}

export const reggaeChords: ChordStyle = {
  // The shuffle in twelve and the bar of two in six, written above.
  meters: {
    "12/8": compoundBook(PLAIN_IN_TWELVE, DOUBLE_IN_TWELVE, ANDS_IN_TWELVE, 2),
    "6/8": compoundBook(half(PLAIN_IN_TWELVE), half(DOUBLE_IN_TWELVE), half(ANDS_IN_TWELVE), 1),
  },
  // Three strings high on the neck, no open strings (the chop is damped by letting go, CH-23),
  // the hand parked about the eighth fret, where a grip topped near C5 sits on the top three
  // strings. A sixteenth pendulum; an upstroke catches the whole small grip, as the funk and
  // disco guitars' do, so the flick still says the chord.
  idiom: {
    instrument: "guitar",
    strings: 3,
    position: 8,
    skip: false,
    open: false,
    rootOnBottom: false,
    strum: { grid: "sixteenth", up: 4, lighter: 14, roll: 6 },
  },
  kinds: { skank },
  voicing: { low: "skank", mid: "skank", high: "skank" },
  // G3 up, the top aimed at C5 and held there (ST-reggae-18). It stays up there with no
  // bassist too: the skank is a chop, not a bottom. The notes' A5 is over the 15th fret of the
  // top string, so the ceiling is G5, where a guitar's grips end.
  register: { floor: 55, ceiling: 79, target: 72, reach: 3 },
  // Any meter but 4/4: a chop at the start of every pulse but the first (ST-reggae-04).
  plain: { length: 0.2, pulse: "offbeats", velocity: { beat: 100, offbeat: 100, restrike: 100 } },
  rhythm,
  // None from the guitar, at any energy (ST-reggae-29): a stroke in the eighth before a change
  // plays the chord it is on, and a change inside the bar waits for its beat.
  anticipation: {
    barline: { low: 0, mid: 0, high: 0 },
    midBar: "wait",
    otherwise: "stay",
    stroke: "x",
  },
  // A groove keeps its figure under a soloist (CH-68).
  listening: null,
  // The stop: one downstroke at 92, an eighth, with the bass (ST-reggae-32, CH-74).
  ending: { velocity: 92, soft: 72, accent: 12 },
};
