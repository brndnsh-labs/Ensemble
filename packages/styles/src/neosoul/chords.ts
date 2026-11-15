// The neo-soul Rhodes: two hands, chords held for beats and laid in softly. A
// low left-hand shell with the colours stacked in fourths over it, the richest
// colour the chord's own scale allows; one hand under a soloist's line, opening
// out again in the gaps (ST-neosoul-19 to ST-neosoul-25). Every chord is struck
// with all its notes together: the rolled chord was wanted and never built.

import type { ChordStyle, RhythmBook, VoicingKind } from "@ensemble/engine";

/** Each rotation of a close chord, so the register can choose its inversion. */
const rotations = (voices: readonly ("R" | "3" | "5" | "7")[]) =>
  voices.slice(1).map((_, i) => [...voices.slice(i + 1), ...voices.slice(0, i + 1)]);

/**
 * The two-handed spread (ST-neosoul-19), written low to high: the left hand's
 * shell, then the right hand's colours. Each recipe offers the root-and-7th
 * shell and the 3rd-and-7th one (the 7th under the 3rd where that keeps the
 * hands nearer home; a minor or major chord whose root sits high on the keyboard
 * also the fifth and root in the left hand, 5 R | 3 7 9), and the register takes
 * whichever sits where the hands are.
 * Dm9 is F C | E A D (`3 7 9 5 R`), Cmaj9 C B | E A D (`R 7 3 13 9`).
 */
const spread: VoicingKind = {
  position: "spread",
  recipes: [
    // The chords with no colour of their own, as close chords in any inversion.
    {
      when: { family: ["diminished"] },
      voices: ["R", "3", "5", "7"],
      also: rotations(["R", "3", "5", "7"]),
    },
    {
      when: { family: ["half-diminished"] },
      voices: ["R", "7", "3", "5"],
      also: [["3", "7", "R", "5"]],
    },
    { when: { family: ["augmented"] }, voices: ["R", "3", "5"], also: rotations(["R", "3", "5"]) },
    { when: { family: ["power"] }, voices: ["R", "5"], also: [["5", "R"]] },
    // A triad whose scale has the 6th and the 9th: the open 6/9, all fourths (E A D G over C).
    {
      when: { lacks: ["7"], has: ["9", "13"] },
      voices: ["3", "13", "9", "5"],
      also: [["5", "9", "3", "13"]],
    },
    // Where the scale lacks the colour (a 6th over an aeolian triad): the plain close chord.
    { when: { lacks: ["7"] }, voices: ["R", "3", "5"], also: rotations(["R", "3", "5"]) },
    // A dominant: the 13th and 9th over the shell, as written or as its scale implies, so a V
    // going to a minor chord plays b13 and b9 (X-B-11). G13 is G F | B E A.
    {
      when: { family: ["dominant", "suspended"] },
      voices: ["R", "7", "3", ["13", "5"], "9"],
      also: [["7", "3", ["13", "5"], "9", "5"]],
    },
    // A minor 7th over a phrygian scale has no 9th to stack: the plain close chord.
    {
      when: { family: ["minor"], lacks: ["9"] },
      voices: ["R", "3", "5", "7"],
      also: rotations(["R", "3", "5", "7"]),
    },
    // A minor 7th: the 3rd-and-7th shell with the 9th, 5th and root in fourths over it.
    {
      when: { family: ["minor"] },
      voices: ["3", "7", "9", "5", "R"],
      also: [
        ["R", "7", "3", "5", "9"],
        ["5", "R", "3", "7", "9"],
      ],
    },
    // A major 7th or a 6th chord: the root and 7th with the 3rd, 13th and 9th in fourths.
    {
      voices: ["R", "7", "3", "13", "9"],
      also: [
        ["7", "3", "13", "9", "5"],
        ["5", "R", "3", "7", "9"],
      ],
    },
  ],
};

/**
 * One hand, rootless, for while a soloist's phrase is live (ST-neosoul-21): the
 * jazz pianist's four notes, so the whole voicing stays under the line.
 */
const closed: VoicingKind = {
  position: "close",
  recipes: [
    { when: { family: ["diminished"] }, voices: ["R", "3", "5", "7"] },
    { when: { family: ["half-diminished"] }, voices: ["3", "11", "5", "7"] },
    { when: { family: ["dominant"] }, voices: ["3", "7", "9", ["13", "5"]] },
    { when: { family: ["power"] }, voices: ["R", "5"] },
    { when: { lacks: ["7"] }, voices: ["R", "3", "5", "9"] },
    { when: { family: ["minor"], lacks: ["9"] }, voices: ["3", "5", "7", "11"] },
    { voices: ["3", "7", "9", ["T", "5"]] },
  ],
};

// ── the rhythm book ─────────────────────────────────────────────────────────
// Reading the grids: sixteen sixteenths to the bar, grouped by beat. `x` is a
// strike on a beat, laid in softly at 72; `o` one off the beat, leaning at 80
// (ST-neosoul-23); `-` holds the chord on; `.` is silence. Chords are held for
// beats, not stabbed; the lazy re-strikes sit on the "a" of 2 dragging into 3, or
// on the "e" of 1 leaving the One to the bass (ST-neosoul-22).

const TOUCH = { x: { level: 72, steps: 4 }, o: { level: 80, steps: 4 } };

const rhythm: RhythmBook = {
  tiers: {
    low: {
      draw: "quiet",
      articulation: TOUCH,
      figures: [
        { name: "held", weight: 3, grid: "x--- ---- ---- --.." },
        { name: "held, the and of 3", weight: 2, grid: "x--- ---- -.o- ----" },
        { name: "the e of 1, held", weight: 1, grid: ".o-- ---- ---- --.." },
      ],
      answers: [],
      busy: { from: 1, to: 1.5 },
      arrival: { level: 72, steps: 16 },
    },
    mid: {
      draw: "working",
      articulation: TOUCH,
      figures: [
        { name: "the a of 2, the and of 4", weight: 3, grid: "x--- --.o ---- --o-" },
        { name: "the e of 1, the and of 3, the and of 4", weight: 2, grid: ".o-- ---- -.o- --o-" },
        { name: "the and of 2, the a of 3", weight: 2, grid: "x--. ..o- ---- .o--" },
      ],
      answers: [],
      busy: { from: 2.5, to: 3 },
      arrival: { level: 72, steps: 4 },
    },
    high: {
      draw: "hot",
      articulation: TOUCH,
      figures: [
        { name: "the as and the ands", weight: 2, grid: "x--o ---o --o- --o-" },
        { name: "the e of 1, then the ands", weight: 2, grid: ".o-- --o- --o- -o--" },
        { name: "the a of 2, the and of 3, the a of 4", weight: 1, grid: "x--- --.o --o- --.o" },
      ],
      answers: [],
      busy: { from: 3.5, to: 5 },
      arrival: { level: 72, steps: 4 },
    },
  },
  // A held chord breathes a little before the next.
  hold: 0.95,
  // One figure a section, every bar (ST-neosoul-22).
  forms: [{ weight: 1, bars: "a a a a" }],
  candidates: 1,
};

export const neosoulChords: ChordStyle = {
  idiom: "keys",
  kinds: { spread, closed },
  voicing: { low: "spread", mid: "spread", high: "spread" },
  // The left hand may reach down to C3 (ST-neosoul-20); the top of the spread aimed at C5, so
  // Dm9 sits F3 to D5 and Cmaj9 C3 to D5.
  register: { floor: 48, ceiling: 79, target: 72, reach: 4 },
  // Any meter but 4/4: the keyboard strikes each pulse and holds (ST-neosoul-05).
  plain: { length: 0.95, pulse: true, velocity: { beat: 72, offbeat: 80, restrike: 64 } },
  rhythm,
  // Over the barline 10%, 25%, 35% (ST-neosoul-35); a strike in the eighth before a change
  // inside the bar always plays the new chord and ties over it, held as written
  // (ST-neosoul-36). Where the hand does not lean in, nothing is struck in that eighth.
  anticipation: {
    barline: { low: 0.1, mid: 0.25, high: 0.35 },
    midBar: "tie",
    otherwise: "rest",
    stroke: "o",
    held: true,
  },
  // Under a soloist: a breath is a dotted quarter and an empty one may get a stab an eighth
  // long; the hands close up to one under the line (ST-neosoul-21, ST-neosoul-24), and play
  // no busier than the working level, however hot the band.
  listening: {
    breath: 6,
    answer: { level: 86, steps: 2 },
    lift: 6,
    busiest: "mid",
    closes: "closed",
  },
  // The soft ending: struck on 1 at 72 and left to ring (ST-neosoul-40).
  ending: { velocity: 92, soft: 72, accent: 12 },
};
