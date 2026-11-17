// The neo-soul bass: deep, warm and late, the bottom of the pocket. One line to
// a section on the sixteenth grid, its rests written as carefully as its notes
// so the kick has room to speak (ST-neosoul-13 to ST-neosoul-18). The fifth and
// the seventh sit nearest the note before, so from the root they fall below it.
//
// Reading the grids: sixteen sixteenths to the bar, grouped by beat, "1 e & a".
// R the chord's bass note, 5 its fifth, 7 its own seventh (the sixth over a
// triad), 2 the hammer-on to the 2nd, 8 the octave, m a dead note, - held,
// a dot silence.

import type { BassStyle, Figure, LeadInPolicy } from "@ensemble/engine";

type Line = BassStyle["lines"]["mid"];

/**
 * The five lines, with their weights low, mid, high (ST-neosoul-13). Each names
 * its tones, and each tone but the octave is played nearest the note before
 * (ST-neosoul-14).
 */
const LINES = [
  // A long root and a fifth on the "and" of 4.
  { name: "long root", grid: "R--- ---- ---- ..5-", weights: [3, 1, 0] },
  // A half note, a breath, the fifth on the "a" of 3, the seventh on the "e" of 4.
  { name: "half note and a breath", grid: "R--- ---- ...5 -7-.", weights: [2, 3, 1] },
  // The lazy re-strike on the "a" of 2.
  { name: "lazy re-strike", grid: "R--- --.R --5- ..7-", weights: [0, 3, 2] },
  // The hammer-on to the 2nd; the octave on the "a" of 3 falling to the fifth. The hammer-on
  // is played as a plucked note: the instrument has no hammered articulation.
  { name: "hammer-on", grid: "R--2 -.R- ...8 -5-.", weights: [0, 1, 3] },
  // Dead-note chatter round the backbeat.
  { name: "dead-note chatter", grid: "R-.m R--- ..5- m7-.", weights: [0, 0, 2] },
] as const;

type Written = readonly { name: string; grid: string; weights: readonly number[] }[];

/** A line drawn for each section at each tier, by that tier's weights. */
const lines = (tier: 0 | 1 | 2, list: Written): Line["figures"] => ({
  hold: "section",
  options: list.map(
    (line): Figure => ({
      name: line.name,
      weight: line.weights[tier]!,
      grid: line.grid,
      near: true,
      seventh: "own",
    }),
  ),
});

// ── in twelve and in six ────────────────────────────────────────────────────
// The soul ballad's bass, played by the same bassist: deep, late, the rests
// written as carefully as the notes. A bar of 12/8 is four slow pulses of three
// eighths, written in sixes, a pulse to a group; a bar of 6/8 is two. The lines
// of four said in pulses: a beat is a pulse, its "e" the triplet's middle
// eighth, its "and" and its "a" the pulse's last eighth. In twelve they are the
// five lines of four, each turning over the bar's four pulses as it turns over
// four beats; six has its own five, a bar of one strong pulse and one answering
// it, where the late note sits after the backbeat or leans into the One. The
// lead-in is the bassist's in every meter: the half step from below on the last
// sixteenth before a change (ST-neosoul-17), the one note anyone plays between
// the eighths, as it is the one sixteenth pickup of four.

/** The five lines of four in twelve, with their weights low, mid, high (ST-neosoul-13). */
const TWELVE_LINES = [
  // A long root and a fifth on the "and" of 4, leaning into the One.
  { name: "long root", grid: "R----- ------ ------ ....5-", weights: [3, 1, 0] },
  // Two pulses of root, a breath, the fifth on the "a" of 3, the seventh after 4.
  { name: "half note and a breath", grid: "R----- ------ ....5- --7-..", weights: [2, 3, 1] },
  // The lazy re-strike leaning into 3, the fifth on the "and" of 3, the seventh into the One.
  { name: "lazy re-strike", grid: "R----- --..R- ----5- ....7-", weights: [0, 3, 2] },
  // The hammer-on to the 2nd on the "a" of 1; the octave on the "a" of 3 falling to the fifth.
  { name: "hammer-on", grid: "R---2- --..R- ....8- --5-..", weights: [0, 1, 3] },
  // Dead-note chatter round the backbeat.
  { name: "dead-note chatter", grid: "R-..m. R----- ....5- m.7-..", weights: [0, 0, 2] },
] as const;

/** Five lines for a bar of six: the root held over the backbeat, the late note after it. */
const SIX_LINES = [
  // The root, and the fifth leaning into the One.
  { name: "long root", grid: "R----- ....5-", weights: [3, 1, 0] },
  // The root, a breath, the fifth late after the backbeat and the seventh into the One.
  { name: "root and a breath", grid: "R---.. ..5-7-", weights: [2, 3, 1] },
  // The lazy re-strike leaning into the backbeat, the fifth into the One.
  { name: "lazy re-strike", grid: "R-..R- ----5-", weights: [0, 3, 2] },
  // The hammer-on to the 2nd, the root again into the backbeat; the octave late after it falling
  // to the fifth.
  { name: "hammer-on", grid: "R-2-R- ..8-5-", weights: [0, 1, 3] },
  // A dead note into the backbeat, the root late after it, the seventh into the One.
  { name: "dead-note chatter", grid: "R-..m. ..R-7-", weights: [0, 0, 2] },
] as const;

const line = (tier: 0 | 1 | 2, list: Written = LINES): Line => ({
  // In any other meter, the root on each pulse with the fifth leading on (ST-neosoul-05).
  tones: [{ bars: [["R", "5"]] }],
  figures: lines(tier, list),
  otherMeters: "pulses",
  // An octave over the highest root.
  ceiling: 53,
  // Warm, not punchy: 92% of the written hold (ST-neosoul-16).
  length: { note: 0.92, long: 0.92, short: 0.92 },
  // 100 on a chord's arrival, 90 on the other beats, 84 between them, 80 for an approach,
  // 50 for a dead note (ST-neosoul-16).
  velocity: {
    arrival: 100,
    strong: 90,
    weak: 90,
    off: 84,
    restrike: 84,
    approach: 80,
    dead: 50,
  },
});

/** Into a change: the half step from below most, a scale step, the target's fifth, the half step above (ST-neosoul-17, BA-04). */
const INTO = { below: 5, above: 1, fifth: 2, scale: 2 };

const leadIn: LeadInPolicy = {
  // A pickup on the last sixteenth where the line has nothing there (ST-neosoul-17).
  at: "sixteenth",
  chance: {
    // Half the sections lead into every change inside a phrase, the other half let the line's
    // own ending carry them: a coin for each change, held by the section (ST-neosoul-17).
    inside: { low: 0.5, mid: 0.5, high: 0.5 },
    // The last bar of a phrase always leads into the next phrase's first chord.
    intoPhrase: { low: 1, mid: 1, high: 1 },
    intoSection: { low: 1, mid: 1, high: 1 },
    intoEnding: 1,
  },
  hold: "section",
  kinds: {
    fallFifth: INTO,
    riseFifth: INTO,
    stepUp: INTO,
    stepDown: INTO,
    third: INTO,
    tritone: INTO,
    same: { below: 0, above: 0, fifth: 0, scale: 0 },
  },
};

export const neosoulBass: BassStyle = {
  // Deep, and fixed for the whole song at every energy: every root nearest one anchor drawn
  // once a song from A1 to C2 (ST-neosoul-15).
  register: {
    lowest: 28,
    highest: 41,
    anchor: { from: 33, to: 36, hold: "song" },
    pull: 1,
  },
  lines: { low: line(0), mid: line(1), high: line(2) },
  // The soul ballad in twelve and in six, written above.
  meters: {
    "12/8": { low: line(0, TWELVE_LINES), mid: line(1, TWELVE_LINES), high: line(2, TWELVE_LINES) },
    "6/8": { low: line(0, SIX_LINES), mid: line(1, SIX_LINES), high: line(2, SIX_LINES) },
  },
  leadIn,
  // The soft ending plays the last note at four fifths of this (ST-neosoul-40).
  ending: { velocity: 96 },
};
