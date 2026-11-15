// The funk rhythm guitar: three strings in one place on the neck, a strumming
// hand that never stops, clipped stabs and muted scratches (ST-funk-26 to
// ST-funk-28, CH-47). The bass has the root, so the grip is the 3rd, the 7th
// and the 9th: the top of an "E9". It is a groove: one line for the section,
// the same every time, and nothing takes a stroke out of it.

import type {
  Articulation,
  ChordStyle,
  CompFigure,
  RhythmBook,
  VoicingKind,
} from "@ensemble/engine";

/**
 * The three-note stab (CH-08, ST-funk-23): 3rd, 7th and 9th. Which of them is
 * on top is the fretboard's business and the voice leading's; nothing here
 * says which inversion.
 */
const stab: VoicingKind = {
  position: "close",
  recipes: [
    // A diminished seventh is its four chord tones in every voicing kind (CH-06), on four
    // strings; a diminished triad is its three.
    { when: { family: ["diminished"] }, voices: ["R", "3", "5", "7"] },
    // Half-diminished: flat 3rd, flat 5th, flat 7th (CH-08).
    { when: { family: ["half-diminished"] }, voices: ["3", "5", "7"] },
    // A power chord has two notes: the root goes on the third string as well (CH-21).
    { when: { family: ["power"] }, voices: ["R", "5"] },
    // A plain triad is root, 3rd, 5th (CH-08). A tension the chart writes on it (add9)
    // takes the root's seat, since the bass has the root (X-B-13).
    { when: { lacks: ["7"] }, voices: [["T", "R"], "3", "5"] },
    // A minor 7th (or minor 6th) is played plain: flat 3rd, 7th and 5th, unless the chart
    // writes a colour (a m9 gets its 9th). The notes give every seventh chord the 9th
    // (ST-funk-23), but on a minor chord the 9th sits a half step under the 3rd, which leaves
    // one shape with no rub in it and the hand nowhere near the chords either side: with the
    // 9th the top of the grip moved 4.3 semitones a change on the minor chart, with the 5th
    // 0.9, and Am7 to D9 is one finger moving one fret, as it is played.
    { when: { family: ["minor"], has: ["7"] }, voices: ["3", "7", ["T", "5"]] },
    // Everything else with a 7th or a 6th: 3rd, 7th, and on top of them the tension the
    // chart writes (a 13 wins over a 9 on a dominant, CH-08), else the 9th its scale gives,
    // so a V going to a minor chord plays its b9 (X-B-11).
    { voices: ["3", "7", ["T", "9", "5"]] },
  ],
};

// ── the chicken scratch ─────────────────────────────────────────────────────
// Reading the grids: sixteen sixteenths to the bar, grouped by beat. The hand
// swings down on every beat and "and", up on every "e" and "a", whether or not
// it touches the strings; the guitar idiom reads the direction from the place.
//
//   x  a stab: the chord, clipped         X  the same, leaned on
//   ~  a scratch: the stroke with the fretting hand let go (the notes' `-`)
//   .  the hand passes without touching
//
// The notes give each line once, as it is played hot, and say how it thins
// (ST-funk-27): quiet is the stabs alone; the working level keeps the scratches
// that fall on the eighths; hot scratches every sixteenth the line leaves open.
// Each line is written out here at all three levels so it can be read.
//
// What a phrase gets at its end is new here, not from the notes: in the last
// bar of a phrase the hand flicks the chord once more on the last sixteenth, an
// upstroke into the next One (`turn`). It is the same flick every time. The
// notes' guitar played the line unchanged for the whole section, which on a
// one-bar vamp is sixteen identical bars; the drummer already turns his bar
// and fills there, and this is the guitar's part of the same breath.

/**
 * A stab rings 0.9 of a sixteenth (ST-funk-27); a scratch is half a sixteenth
 * (CH-28). Written at the downstroke's level (stab 86, accent 100, scratch 50):
 * the idiom plays an upstroke 14 lighter, which is the notes' 72 and 36 (CH-27).
 */
const SCRATCH: Articulation = {
  x: { level: 86, steps: 0.9 },
  X: { level: 100, steps: 0.9 },
  "~": { level: 50, steps: 0.5, muted: true },
};

/** One line at one level. A groove: played in every bar, tied over a change it leans into. */
const line = (name: string, grid: string, turn: string): CompFigure => ({
  name,
  weight: 1,
  grid,
  turn,
  groove: true,
  ties: true,
});

const rhythm: RhythmBook = {
  tiers: {
    // Quiet: the stabs alone, no scratches.
    low: {
      draw: "line",
      articulation: SCRATCH,
      figures: [
        // Backbeat stabs with a sixteenth pickup (ST-funk-27).
        line("backbeat", "...x X.x. ...x X.x.", "...x X.x. ...x X.xx"),
        // The One, then dotted-eighth stabs, three against four, landing on beat 4 (ST-funk-27).
        line("three against four", "x..x ..x. .x.x X.x.", "x..x ..x. .x.x X.xx"),
        // Stabs on the "and"s and around the backbeat (ST-funk-27).
        line("ands", "..x. X..x .x.. X.x.", "..x. X..x .x.. X.xx"),
      ],
      answers: [],
      busy: { from: 6, to: 7 },
      // A chord the line would pass by is stabbed where it arrives, a downstroke (CH-34).
      arrival: { level: 86, steps: 0.9 },
    },

    // The working level: the same lines, with the scratches that fall on the eighths.
    mid: {
      draw: "line",
      articulation: SCRATCH,
      figures: [
        line("backbeat", "~.~x X.x. ~.~x X.x.", "~.~x X.x. ~.~x X.xx"),
        line("three against four", "x.~x ~.x. ~x~x X.x.", "x.~x ~.x. ~x~x X.xx"),
        line("ands", "~.x. X.~x ~x~. X.x.", "~.x. X.~x ~x~. X.xx"),
      ],
      answers: [],
      busy: { from: 10, to: 11 },
      arrival: { level: 86, steps: 0.9 },
    },

    // Hot: every sixteenth is a stroke.
    high: {
      draw: "line",
      articulation: SCRATCH,
      figures: [
        line("backbeat", "~~~x X~x~ ~~~x X~x~", "~~~x X~x~ ~~~x X~xx"),
        line("three against four", "x~~x ~~x~ ~x~x X~x~", "x~~x ~~x~ ~x~x X~xx"),
        line("ands", "~~x~ X~~x ~x~~ X~x~", "~~x~ X~~x ~x~~ X~xx"),
      ],
      answers: [],
      busy: { from: 16, to: 16 },
      arrival: { level: 86, steps: 0.9 },
    },
  },

  // Nothing is held: a stab is cut at 0.9 of whatever room it has.
  hold: 0.9,

  // The line, four times. A groove takes no answers; its last bar is its own turn.
  forms: [{ weight: 1, bars: "a a a a" }],
  candidates: 1,
};

export const funkChords: ChordStyle = {
  // Three strings, no open strings (the hand mutes by letting go, CH-23), the hand parked
  // around the fifth fret: with the top aimed at F#4 that is mostly the D, G and B strings,
  // where an E9 is `x x 6 7 7 x`. A sixteenth pendulum; a stroke takes 6 ms a string to
  // cross and an upstroke is 14 lighter (CH-27, CH-29). An upstroke catches the whole of
  // these small grips, and all four strings of a chord too dense for three (a diminished
  // seventh, a 7#9b13): CH-27's "top three strings" would take a guide tone out of a stab
  // that is the chord's only statement on that beat (X-B-13).
  idiom: {
    instrument: "guitar",
    strings: 3,
    position: 5,
    skip: false,
    open: false,
    rootOnBottom: false,
    strum: { grid: "sixteenth", up: 4, lighter: 14, roll: 6 },
  },
  kinds: { stab },
  voicing: { low: "stab", mid: "stab", high: "stab" },
  // D3 to G5, the top aimed at F#4 and held there (ST-funk-26): within a minor third of it
  // the grip nearest the last one wins, beyond it the hand is pulled back.
  register: { floor: 50, ceiling: 79, target: 66, reach: 3 },
  // Any meter but 4/4: a downstroke stab on every pulse (CH-54), as short as the rest.
  plain: { length: 0.225, pulse: true, velocity: { beat: 86, offbeat: 86, restrike: 86 } },
  rhythm,
  // A stab on the "and" of 4 leans into a change at the barline one time in ten at the
  // working level and one in five when hot, never when quiet (ST-funk-38), and is left to
  // ring an eighth into the new bar. Otherwise the line is the line and stays on the old
  // chord. Nothing leans into a change inside the bar (ST-funk-36).
  anticipation: {
    barline: { low: 0, mid: 0.1, high: 0.2 },
    midBar: "wait",
    otherwise: "stay",
    stroke: "x",
  },
  // A strummed groove keeps its figure under a soloist (CH-68).
  listening: null,
  // The dead stop: one downstroke at 92 (ST-funk-41, CH-74).
  ending: { velocity: 92, soft: 72, accent: 12 },
};
