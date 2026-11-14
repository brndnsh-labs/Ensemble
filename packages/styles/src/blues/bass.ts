// The blues bass: a two-feel when the band is quiet, the boogie box when it is
// not. Everything is written on straight eighths; the style's swing turns each
// written "and" into the last note of a triplet, which is what makes the lope
// a shuffle.

import type { BassStyle } from "@ensemble/engine";

type Line = BassStyle["lines"]["mid"];

/**
 * The boogie box, one tone a beat, two bars to a box: up in the bar the chord
 * arrives, down in the next, then up again (BA-29, ST-blues-22). The 6th steps
 * up to the b7, and the 3rd that ends the down bar sits a half step under the
 * IV, which is why the box walks a blues by itself.
 *
 * The box is fitted to the chord (BA-30): the first shape the chord meets wins.
 */
const box: Line["tones"] = [
  // A slash chord: stand on the slash note. A pedal, not a box.
  { when: { slash: true }, bars: [["R", "R", "R", "R"]] },
  // A power chord: the Chuck Berry figure, rocking between the 5th and the 6th.
  {
    when: { family: ["power"] },
    bars: [
      ["R", "5", "6", "5"],
      ["8", "6", "5", "6"],
    ],
  },
  // A minor chord with no major 6th in its scale (the i of a minor blues): the minor
  // pentatonic box. A half-diminished chord plays the same shape on its own flat 5th.
  {
    when: { family: ["minor", "half-diminished"], lacks: ["6"] },
    bars: [
      ["R", "3", "4", "5"],
      ["b7", "5", "4", "3"],
    ],
  },
  // Any other chord whose scale has no major 6th: a dominant on its way to a minor chord
  // (A7 to Dm), an altered or augmented one. It turns at the b7 instead, or the bass plants
  // an F# against the piano's F natural (ST-blues-23).
  {
    when: { lacks: ["6"] },
    bars: [
      ["R", "3", "5", "b7"],
      ["b7", "5", "3", "5"],
    ],
  },
  // A chord with no flat 7th (a plain major triad on the I, a 6th, a major 7th, a
  // diminished 7th): the down bar starts from the octave.
  {
    when: { lacks: ["b7"] },
    bars: [
      ["R", "3", "5", "6"],
      ["8", "6", "5", "3"],
    ],
  },
  // Everything else, which in a blues is nearly everything: a dominant 7th, or a minor
  // chord with a major 6th (its own 3rd is the flat one). A sus chord's 4th or 2nd
  // stands where the 3rd would.
  {
    bars: [
      ["R", "3", "5", "6"],
      ["b7", "6", "5", "3"],
    ],
  },
];

const boxTouch = {
  otherMeters: "pulses",
  // The top of the instrument's ornaments (A3). With roots at or under A2 the box never passes it.
  ceiling: 57,
  // A plain quarter is detached; a beat that lopes is long-short, "da-DUM" (BA-31, BA-32).
  length: { note: 0.85, long: 0.9, short: 0.4 },
  // 100 where a chord lands, 94 on the other strong beats, 88 on 2 and 4 (ST-blues-26).
  // A lead-in takes beat 4's place at beat 4's weight.
  velocity: { arrival: 100, strong: 94, weak: 88, restrike: 70, approach: 88 },
} as const;

export const bluesBass: BassStyle = {
  // The line lives from the open E up to A2 for its roots, so a box built on the
  // highest root still tops out at A3. Each section has a home between C2 and E2;
  // a root goes nearest the note before it, pulled 30% of the way back home. Nearest
  // home alone made the line fall over an octave after the box had climbed (BA-33, BA-90).
  register: {
    lowest: 28,
    highest: 45,
    anchor: { from: 36, to: 40, hold: "section" },
    pull: 0.3,
  },

  lines: {
    // Quiet: a two-feel. The bass note where the chord lands, its 5th on beat 3, both
    // nearly full length (BA-28). The 5th goes under the root when above would leave A2.
    low: {
      tones: [{ when: { slash: true }, bars: [["R", "R"]] }, { bars: [["R", "5"]] }],
      figures: { hold: "song", options: [{ weight: 1, grid: "x--- ---- x--- ----" }] },
      // In three there is no room for a two-feel: one root a bar.
      otherMeters: "downbeat",
      ceiling: 45,
      length: { note: 0.92, long: 0.92, short: 0.4 },
      velocity: { arrival: 98, strong: 88, weak: 88, restrike: 70, approach: 84 },
    },

    // Mid: the box in quarter notes. Each section chooses how much it lopes and keeps it:
    // not at all, beat 4 only, or beats 2 and 4 (BA-32).
    mid: {
      tones: box,
      figures: {
        hold: "section",
        options: [
          { weight: 2, grid: "x--- x--- x--- x---" },
          { weight: 2, grid: "x--- x--- x--- x-o-" },
          { weight: 1, grid: "x--- x-o- x--- x-o-" },
        ],
      },
      ...boxTouch,
    },

    // High: every beat lopes. The box is the same box.
    high: {
      tones: box,
      figures: { hold: "song", options: [{ weight: 1, grid: "x-o- x-o- x-o- x-o-" }] },
      ...boxTouch,
    },
  },

  // The box leads into many changes by itself: its last note is often a step from the
  // next root, and then it is simply kept. These are for the changes where it is not:
  // sometimes the last beat becomes a lead-in instead. A louder band leads in more, and
  // any band leads in more at the top of a chorus than inside one.
  leadIn: {
    // On the last beat before the change.
    at: "beat",
    chance: {
      // Low is the two-feel's own figure: a quarter-note approach on beat 4 about one
      // change in three (BA-28). Mid and high are chosen here; the old box had none.
      inside: { low: 0.35, mid: 0.3, high: 0.5 },
      intoSection: { low: 0.5, mid: 0.6, high: 0.8 },
      // A bassist who hears the last turnaround coming walks into the final chord (EN-04).
      intoEnding: 1,
    },
    // Each chorus has its own lead-ins; the rhythm figure is what a section keeps.
    hold: "pass",
    kinds: {
      // V to I, I to IV. The half step below is the third of the chord being left (B under
      // C from G7), the strongest way in. From above is the blue note falling (Gb into F).
      // The whole step above is the old chord's 5th. The target's own 5th is the root the
      // line is already on, so it is rare.
      fallFifth: { below: 4, above: 2, fifth: 1, scale: 2 },
      // IV to I, I to V. No chord tone leans into the new root, so the plain choices lead:
      // a scale step, or the new root's 5th (G into C over F7). The band's default weights.
      riseFifth: { below: 2, above: 1, fifth: 3, scale: 3 },
      // IV to V: the note between the two roots, from below (F, F#, G).
      stepUp: { below: 4, above: 1, fifth: 2, scale: 1 },
      // V to IV: the note between the two roots, from above (G, Gb, F).
      stepDown: { below: 2, above: 4, fifth: 1, scale: 1 },
      third: { below: 2, above: 1, fifth: 3, scale: 3 },
      tritone: { below: 2, above: 1, fifth: 3, scale: 3 },
      // The bass note is not moving: there is nothing to approach (BA-11).
      same: { below: 0, above: 0, fifth: 0, scale: 0 },
    },
  },

  // The last note: the lowest root on the instrument, as hard as a downbeat (EN-19, EN-27).
  ending: { velocity: 100 },
};
