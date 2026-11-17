// The acoustic bass: an upright playing roots and fifths and nothing else.
// Energy adds notes, never harmony: a root and a fifth a bar when quiet, a
// pickup on the "and" of 2 at the working level, a note on every beat when hot.
// The one thing that is not a root or a fifth is a passing tone on beat 4 into
// the next root (ST-acoustic-12 to ST-acoustic-15).
//
// Reading the grids: sixteen sixteenths to the bar, grouped by beat. R the
// chord's bass note, 5 its fifth, - held.

import type { BassStyle, Figure, LeadInPolicy } from "@ensemble/engine";

type Line = BassStyle["lines"]["mid"];

/**
 * One figure a section. The fifth is taken under the root wherever the
 * instrument has the note: an upright's low warmth (ST-acoustic-12).
 */
const figures = (...options: readonly (readonly [name: string, weight: number, grid: string])[]) =>
  ({
    hold: "section",
    options: options.map(([name, weight, grid]): Figure => ({ name, weight, grid, under: true })),
  }) as const;

const ROOT_AND_FIFTH = ["root and fifth", 2, "R--- ---- 5--- ----"] as const;

/** How much of the gap to the next note a note fills, and one figure set, make a tier. */
const line = (length: number, options: Line["figures"]): Line => ({
  // In any other meter: the root on the first pulse, held (ST-acoustic-04; the fifth on a
  // strong pulse above quiet is not played).
  tones: [{ bars: [["R"]] }],
  figures: options,
  otherMeters: "downbeat",
  // A3: the top of the instrument. Nothing here climbs: a fifth is under its root or a fifth over.
  ceiling: 57,
  length: { note: length, long: length, short: length },
  // 96 where a chord arrives, 88 on the fifth (beat 3), 86 on a root played again, 84 on the
  // passing tone (ST-acoustic-13, ST-acoustic-14).
  velocity: { arrival: 96, strong: 88, weak: 86, off: 86, restrike: 86, approach: 84 },
});

/**
 * Into a new root: a step of the scale of the chord being left, a whole step
 * where the scale has one and else the half step (ST-acoustic-14). The fifth of
 * the target is never the way in.
 */
const STEP = { below: 1, above: 1, fifth: 0, scale: 6 };

const leadIn: LeadInPolicy = {
  // Beat 4 becomes the step into the new root: the held fifth is split, or the note on 4
  // is replaced. The bass anticipates nothing (ST-acoustic-33).
  at: "beat",
  // Never when quiet; 40% of changes at the working level and 55% hot; 85% into a new
  // section (ST-acoustic-14).
  chance: {
    inside: { low: 0, mid: 0.4, high: 0.55 },
    intoSection: { low: 0, mid: 0.85, high: 0.85 },
    intoEnding: 0.4,
  },
  hold: "pass",
  // Root and fifth only: the fifth is played where it is the next chord's root too (D, A, then
  // A), and is not traded for the third (ST-acoustic-12).
  playsNextRoot: true,
  kinds: {
    fallFifth: STEP,
    riseFifth: STEP,
    stepUp: STEP,
    stepDown: STEP,
    third: STEP,
    tritone: STEP,
    // The same bass note: nothing to step into.
    same: { below: 0, above: 0, fifth: 0, scale: 0 },
  },
};

// ── in six ──────────────────────────────────────────────────────────────────
// A bar of 6/8 is two slow pulses of three eighths: twelve sixteenths, written
// in sixes, a pulse to a group. The upright is in two, the same player said in
// pulses: the root on the first pulse, and from the working level the fifth on
// the second, which is where a lead-in goes (a "beat" before the change is the
// bar's last pulse). Energy adds the pulse's last eighth, never more than four
// notes a bar and never the six eighths.

/** A line in six: as in four, with the fifth on the second pulse played as the fifth on 3 is. */
const lineInSix = (length: number, options: Line["figures"]): Line => ({
  ...line(length, options),
  // The second pulse is not a strong one in a bar of two, but it is where the fifth is: 88.
  // A note on a pulse's last eighth is a pickup, as the "and" of 2 is in four.
  velocity: { arrival: 96, strong: 88, weak: 88, off: 86, restrike: 86, approach: 84 },
});

const bassInSix: BassStyle["lines"] = {
  // Quiet: the root, held the whole bar. Notes ring into the next: 95% of the gap.
  low: lineInSix(0.95, figures(["root", 1, "R----- ------"])),
  // The working level: root and fifth (2), or the root again on the first pulse's last eighth (1).
  mid: lineInSix(
    0.88,
    figures(["root and fifth", 2, "R----- 5-----"], ["pickup", 1, "R---R- 5-----"]),
  ),
  // Hot: each pulse and its last eighth (2), or the fifth twice (1). 80%: louder notes breathe.
  high: lineInSix(0.8, figures(["lilt", 2, "R---R- 5---5-"], ["fifth twice", 1, "R----- 5---5-"])),
};

export const acousticBass: BassStyle = {
  // An upright in its bottom octave and a half: every root nearest a home drawn for the section
  // between A1 and D2, so a fifth usually has room under it.
  register: {
    lowest: 28,
    highest: 43,
    anchor: { from: 33, to: 38, hold: "section" },
    pull: 1,
  },
  lines: {
    // Quiet: root and fifth (2), or the root alone (1). Notes ring into the next: 95% of the gap.
    low: line(0.95, figures(ROOT_AND_FIFTH, ["root", 1, "R--- ---- ---- ----"])),
    // The working level: root and fifth (2), or with a pickup on the "and" of 2 (1). 88%.
    mid: line(0.88, figures(ROOT_AND_FIFTH, ["pickup", 1, "R--- --R- 5--- ----"])),
    // Hot: a note on every beat (2), or the pickup and two fifths (1). 80%: louder notes breathe.
    high: line(
      0.8,
      figures(["four", 2, "R--- R--- 5--- 5---"], ["pickup and fifths", 1, "R--- --R- 5--- 5---"]),
    ),
  },
  // Six-eight, written above.
  meters: { "6/8": bassInSix },
  leadIn,
  // The soft ending: 80% of 96 (ST-acoustic-35).
  ending: { velocity: 96 },
};
