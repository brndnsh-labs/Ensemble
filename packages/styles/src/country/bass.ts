// The country bass: the upright's boom. The root on 1 and the fifth on 3, the
// fifth under the root where the instrument has it; 2 and 4 are the chick's.
// Quiet the two notes ring as half notes and nothing else is played; at the
// working level each boom is short, so the chick answers into air; hot a little
// longer. Above quiet, into a change a third to a tritone away, the root is
// held from 1 and the line steps into the new root on 3 and 4: "G, A-B, C"
// (ST-country-05, BA-51 to BA-53, EN-51).
//
// Reading the grids: sixteen sixteenths to the bar, grouped by beat. x the next
// tone of the line, - held, . silence.

import type { BassStyle, LeadInPolicy, Walk } from "@ensemble/engine";

type Line = BassStyle["lines"]["mid"];

/**
 * Root and fifth; over a slash chord the slash note and the chord's own root
 * (BA-51: over C/G the alternate note is the C). Every tone but a chord's
 * arrival is taken under the root where the instrument has the note.
 */
const tones: Line["tones"] = [
  { when: { slash: true }, bars: [["R", "1"]] },
  { bars: [["R", "5"]] },
];

/** One figure for every bar: the boom on 1 and 3. */
const BOOM = {
  hold: "song",
  options: [{ name: "boom", weight: 1, grid: "x------- x-------", under: true }],
} as const;

/**
 * A tier: how long a note sounds. Quiet, the share of the half note it is
 * written as (BA-52: 92%). Louder, a share of a beat at most (`gap` 4): 55% at
 * the working level, 75% hot. A walking note sounds as long as the line's own.
 */
const line = (length: number, gap?: number): Line => ({
  tones,
  figures: BOOM,
  // In any other meter: the root on the first pulse, held. The waltz's root and fifth bar by
  // bar (ST-country-05) is the country waltz's, a build of its own.
  otherMeters: "downbeat",
  // A3: nothing climbs; a fifth is under its root or a fifth over, a walk two steps over it.
  ceiling: 57,
  length: { note: length, long: length, short: length, ...(gap !== undefined ? { gap } : {}) },
  // 100 then 92 (BA-51). A walk's note on 3 is played as the fifth there would be, 92 (the
  // notes have 96), and its note on 4, the one that leads in, at 102 (BA-53).
  velocity: { arrival: 100, strong: 92, weak: 92, off: 92, restrike: 92, approach: 102 },
});

/** Nothing leads in by one note: the walk is how this bass goes into a change (BA-53). */
const NONE = { below: 0, above: 0, fifth: 0, scale: 0 };

const leadIn: LeadInPolicy = {
  at: "beat",
  chance: {
    inside: { low: 0, mid: 0, high: 0 },
    intoSection: { low: 0, mid: 0, high: 0 },
    intoEnding: 0,
  },
  hold: "pass",
  // Root and fifth only: a fifth that is the next chord's root (D, then A) is played as it is.
  playsNextRoot: true,
  kinds: {
    fallFifth: NONE,
    riseFifth: NONE,
    stepUp: NONE,
    stepDown: NONE,
    third: NONE,
    tritone: NONE,
    same: NONE,
  },
};

/** The root held from 1, two stepping notes on 3 and 4 (BA-53). */
const TWO_STEPS = "x------- x--- x---";
/** Across a third there is one note between: the root held, and a step on 4. */
const ONE_STEP = "x------- ---- x---";

const walk = (
  name: string,
  toward: Walk["toward"],
  walkTones: Walk["tones"],
  last: Walk["last"],
  grid: string,
  when?: Walk["when"],
): Walk => ({ name, weight: 1, toward, tones: walkTones, last, grid, ...(when ? { when } : {}) });

/**
 * Into a change a third to a tritone away (BA-53). Each note fits the chord it
 * is played over, the one on 4 most of all: a tone of the chord or of its scale.
 */
const walks: BassStyle["walks"] = {
  // Never quiet (BA-52); into a new section 90%, otherwise 65% hot and 45% at the working
  // level, offered to plans the critic does not weigh, so the coin is what is played (BA-53).
  offer: {
    end: { low: 0, mid: 0.45, high: 0.65 },
    inside: { low: 0, mid: 0.45, high: 0.65 },
    intoSection: { low: 0, mid: 0.9, high: 0.9 },
  },
  kinds: {
    // Up a fourth: G, A-B, C, the third of the chord on 4. Down a fifth: G, E-D, C.
    fallFifth: [
      walk("up through the third", "up", ["R", "2"], "half", TWO_STEPS, {
        family: ["major", "dominant"],
      }),
      walk("down the scale", "down", ["R", "6"], "whole", TWO_STEPS),
    ],
    // Up a fifth: C, E-F, G. Down a fourth over a dominant: C, Bb-A, G.
    riseFifth: [
      walk("up through the third", "up", ["R", "3"], "whole", TWO_STEPS),
      walk("down from the seventh", "down", ["R", "7"], "whole", TWO_STEPS, {
        family: ["dominant"],
      }),
    ],
    // A tritone up: C, D-E, F#.
    tritone: [walk("up by whole steps", "up", ["R", "2"], "whole", TWO_STEPS)],
    // A third: the scale step between, on 4.
    third: [
      walk("a step up", "up", ["R"], "whole", ONE_STEP),
      walk("a step down", "down", ["R"], "whole", ONE_STEP),
    ],
  },
};

export const countryBass: BassStyle = {
  // An upright in its bottom octave and a half: every root nearest a home drawn for the section
  // between A1 and D2, so a fifth usually has room under it.
  register: {
    lowest: 28,
    highest: 43,
    anchor: { from: 33, to: 38, hold: "section" },
    pull: 1,
  },
  lines: {
    low: line(0.92),
    mid: line(0.55, 4),
    high: line(0.75, 4),
  },
  leadIn,
  walks,
  // No weights: the first plan drawn is played, so a walk is played as often as it is offered.
  phrase: { candidates: 1, answers: 0, halfSteps: { min: 0, max: 1 } },
  // Crash and kick on 1, the low root under them (ST-country-10).
  ending: { velocity: 100 },
};
