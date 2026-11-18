// The rock bass: roots. Locked to the kick when the band is quiet, driving
// eighth notes from the working level up, with an octave pop or two when hot
// (ST-rock-12 to ST-rock-16). The last eighth before a new root is sometimes an
// approach note, which is the only push the bass has (ST-rock-28).
//
// Reading the grids: sixteen sixteenths to the bar, grouped by beat. `x` the
// next tone (here always the root), `-` held, `.` silence; in a riff, R the
// root and 8 its octave. Everything is on the eighths: no sixteenths at all.

import type { BassStyle, Figure } from "@ensemble/engine";

type Line = BassStyle["lines"]["mid"];

/** Eight roots to the bar: the line's only tone. */
const ROOTS: Line["tones"] = [{ bars: [["R", "R", "R", "R", "R", "R", "R", "R"]] }];

/** Eighth notes, each held for its eighth; the length below makes them 0.85 of it. */
const EIGHTHS = "x-x- x-x- x-x- x-x-";

/**
 * The hot line: the eighths with the octave on the off-beats the section chose
 * once (ST-rock-14). Drawn per section; none is one of the choices.
 */
const POPS: Figure[] = [
  { name: "roots", weight: 1, grid: "R-R- R-R- R-R- R-R-" },
  { name: "pop on the and of 2", weight: 1, grid: "R-R- R-8- R-R- R-R-" },
  { name: "pop on the and of 4", weight: 1, grid: "R-R- R-R- R-R- R-8-" },
  { name: "pops on the ands of 2 and 4", weight: 1, grid: "R-R- R-8- R-R- R-8-" },
  { name: "pop on the and of 3", weight: 1, grid: "R-R- R-R- R-8- R-R-" },
];

/** 102 on a beat, 86 on an "and" (ST-rock-13). */
const DRIVING = {
  arrival: 102,
  strong: 102,
  weak: 102,
  off: 86,
  restrike: 86,
  approach: 86,
} as const;

const driving = {
  tones: ROOTS,
  // In any other meter: a root to every pulse, as the drummer's cells are one to a pulse.
  otherMeters: "pulses",
  // E3: an octave over the highest root, where a pop folds down if it would pass it.
  ceiling: 52,
  // Each eighth sounds for 0.85 of its eighth (ST-rock-13).
  length: { note: 0.85, long: 0.85, short: 0.85 },
  velocity: DRIVING,
} as const;

// ── in twelve ───────────────────────────────────────────────────────────────
// The rock ballad. A bar of 12/8 is four slow pulses of three eighths: a figure
// is twenty-four sixteenths, written in sixes. The eighths that drive in four
// would be all twelve here; the line is a root on each pulse instead, held
// nearly full, and where it wants one, the pickup: the root struck again on the
// pulse's last eighth, into the next. A section chooses where its pickups go
// and keeps them, and wherever the kick takes a pickup the bass takes it too:
// in four the eighths double every kick, so the kick's pushes are the band's
// (ST-rock-12, ST-rock-28). Quiet it is the downbeat and the kick, as in four.

/** The hot line in twelve: every pulse and its pickup, the octave on the pickups the section chose once. */
const TWELVE_POPS: Figure[] = [
  { name: "pickups", weight: 1, grid: "R---R- R---R- R---R- R---R-" },
  { name: "pop into 3", weight: 1, grid: "R---R- R---8- R---R- R---R-" },
  { name: "pop into the One", weight: 1, grid: "R---R- R---R- R---R- R---8-" },
  { name: "pops into 3 and the One", weight: 1, grid: "R---R- R---8- R---R- R---8-" },
  { name: "pop into 4", weight: 1, grid: "R---R- R---R- R---8- R---R-" },
];

const slowDriving = {
  ...driving,
  // A pulse is held for 0.85 of it; the long half of a pulse and its pickup the same.
  length: { note: 0.85, long: 0.85, short: 0.85 },
  followsKick: true,
} as const;

// ── in six ──────────────────────────────────────────────────────────────────
// The rock ballad in six-eight. A bar of 6/8 is two slow pulses: a figure is
// twelve sixteenths, written in sixes. Twelve's line said for a bar of two: a
// root on each pulse, the pickup where the section takes one (into the One, or
// into the backbeat), the kick's pickups always (ST-rock-12), and hot a pickup
// into both pulses with the section's octave pops. Quiet, the downbeat and the kick.

/** The hot line in six: both pulses and their pickups, the octave on the pickups the section chose once. */
const SIX_POPS: Figure[] = [
  { name: "pickups", weight: 1, grid: "R---R- R---R-" },
  { name: "pop into the backbeat", weight: 1, grid: "R---8- R---R-" },
  { name: "pop into the One", weight: 1, grid: "R---R- R---8-" },
  { name: "pops into both", weight: 1, grid: "R---8- R---8-" },
];

export const rockBass: BassStyle = {
  meters: {
    "6/8": {
      low: {
        tones: [{ bars: [["R"]] }],
        figures: { hold: "song", options: [{ weight: 1, grid: "x----- ------" }] },
        followsKick: true,
        otherMeters: "downbeat",
        ceiling: 52,
        length: { note: 0.95, long: 0.95, short: 0.95, gap: 12 },
        velocity: { arrival: 98, strong: 92, weak: 92, off: 86, restrike: 86, approach: 84 },
      },
      // A root on both pulses; a section takes a pickup into the One, into the backbeat, or none.
      mid: {
        ...slowDriving,
        figures: {
          hold: "section",
          options: [
            { weight: 2, grid: "x----- x-----" },
            { weight: 2, grid: "x----- x---o-" },
            { weight: 1, grid: "x---o- x-----" },
          ],
        },
      },
      high: {
        ...slowDriving,
        figures: { hold: "section", options: SIX_POPS },
      },
    },
    "12/8": {
      // Quiet: the downbeat, and wherever the kick plays.
      low: {
        tones: [{ bars: [["R"]] }],
        figures: {
          hold: "song",
          options: [{ weight: 1, grid: "x----- ------ ------ ------" }],
        },
        followsKick: true,
        otherMeters: "downbeat",
        ceiling: 52,
        length: { note: 0.95, long: 0.95, short: 0.95, gap: 24 },
        velocity: { arrival: 98, strong: 92, weak: 92, off: 86, restrike: 86, approach: 84 },
      },
      // The working level: a root on every pulse; a section takes a pickup into the One, into
      // 3 and the One, or none.
      mid: {
        ...slowDriving,
        figures: {
          hold: "section",
          options: [
            { weight: 2, grid: "x----- x----- x----- x-----" },
            { weight: 2, grid: "x----- x----- x----- x---o-" },
            { weight: 1, grid: "x----- x---o- x----- x---o-" },
          ],
        },
      },
      // Hot: a pickup into every pulse, with the section's octave pops.
      high: {
        ...slowDriving,
        figures: { hold: "section", options: TWELVE_POPS },
      },
    },
  },

  // One octave a section: the home is drawn between C2 and E2 and every root goes nearest it
  // (ST-rock-16). Nothing above E2, so the line stays where the blues and funk lines were
  // brought down to after gate 3: a home of E2 would otherwise put a tune in A on A2.
  register: {
    lowest: 28,
    highest: 40,
    anchor: { from: 36, to: 40, hold: "section" },
    pull: 1,
  },

  lines: {
    // Quiet: a root on the chord's arrival and wherever the kick plays, each held up to the
    // next (ST-rock-12). The figure is the downbeat alone; the kick gives the rest.
    low: {
      tones: [{ bars: [["R"]] }],
      figures: { hold: "song", options: [{ weight: 1, grid: "x... .... .... ...." }] },
      followsKick: true,
      otherMeters: "downbeat",
      ceiling: 52,
      // 95% of the gap to the next note: the gap counts whatever the figure's rests say.
      length: { note: 0.95, long: 0.95, short: 0.95, gap: 16 },
      velocity: { arrival: 98, strong: 92, weak: 92, off: 86, restrike: 86, approach: 84 },
    },
    // The working level: eighth-note roots.
    mid: {
      ...driving,
      figures: { hold: "song", options: [{ weight: 1, grid: EIGHTHS }] },
    },
    // Hot: the same eighths, with the section's octave pops.
    high: {
      ...driving,
      figures: { hold: "section", options: POPS },
    },
  },

  // The last eighth before a new root becomes an approach 35% of the time, 20% when quiet
  // (ST-rock-15): the fifth of the target (3), the nearest scale tone (3), the half step
  // below (2), the half step above (1).
  leadIn: {
    at: "eighth",
    // A pop that would be followed by a root far below comes through the octave.
    throughOctave: true,
    chance: {
      inside: { low: 0.2, mid: 0.35, high: 0.35 },
      intoSection: { low: 0.2, mid: 0.35, high: 0.35 },
      intoEnding: 0.35,
    },
    hold: "pass",
    kinds: {
      fallFifth: { below: 2, above: 1, fifth: 3, scale: 3 },
      riseFifth: { below: 2, above: 1, fifth: 3, scale: 3 },
      stepUp: { below: 2, above: 1, fifth: 3, scale: 3 },
      stepDown: { below: 2, above: 1, fifth: 3, scale: 3 },
      third: { below: 2, above: 1, fifth: 3, scale: 3 },
      tritone: { below: 2, above: 1, fifth: 3, scale: 3 },
      // The same bass note: nothing to approach.
      same: { below: 0, above: 0, fifth: 0, scale: 0 },
    },
  },

  // The last note, everyone together on the One (ST-rock-30).
  ending: { velocity: 100 },
};
