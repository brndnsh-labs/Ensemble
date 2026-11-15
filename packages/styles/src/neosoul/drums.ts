// The neo-soul drummer: a soft loop of two bars, like a sampled break. A lazily
// syncopated kick, one per section; the backbeat on 2 and 4 with ghosts round it
// from the working level up (a cross-stick and no snare when the band is very
// quiet); the hat feathered under everything. On the second bar of each pair
// the four may land a sixteenth late and, when hot, the hat breathes open.
// Fills barely exist (ST-neosoul-06 to ST-neosoul-12).
//
// Reading the grids: sixteen sixteenths to the bar, grouped by beat, "1 e & a".
// The band swings the sixteenths (ST-neosoul-02). X accent, x normal, o soft,
// g ghost, "-" the stroke taken away. The drums never lean: the band does.

import type { DrumStyle, GrooveOption } from "@ensemble/engine";

// ── the time ────────────────────────────────────────────────────────────────

/**
 * The five kicks, one per section, with their weights low, mid, high
 * (ST-neosoul-06). The expressive ones wait for the hot tier, so a quiet
 * section reads as laid back, not busy.
 */
const KICKS = [
  // Boom-bap: the One and the "and" of 3.
  { lines: { kick: "x... .... ..x. ...." }, weights: [3, 3, 1] },
  // Plain 1 and 3.
  { lines: { kick: "x... .... x... ...." }, weights: [2, 2, 1] },
  // A pickup on the "a" of 2 stumbling into the "and" of 3.
  { lines: { kick: "x... ...x ..x. ...." }, weights: [0, 2, 2] },
  // A stumble on the "a" of 1.
  { lines: { kick: "x..x .... ..x. ...." }, weights: [0, 1, 2] },
  // The Dilla skip: the "a" of 4 pushes into the One (ST-neosoul-38).
  { lines: { kick: "x... ...x ..x. ...x" }, weights: [0, 0, 3] },
] as const;

function kicks(tier: 0 | 1 | 2): GrooveOption[] {
  return KICKS.map((kick) => ({ weight: kick.weights[tier], lines: kick.lines }));
}

/** The backbeat, accented on 2 and 4 (ST-neosoul-07). */
const BACKBEAT = { snare: ".... X... .... X..." };
/** Below energy 0.35 the backbeat is a cross-stick, and there is no snare at all. */
const CROSS_STICK = { crossStick: ".... x... .... x..." };

/**
 * The ghost sets on the "e"s and "a"s, one per section (ST-neosoul-07): the
 * working set, and the same set with more when hot. None when quiet.
 */
const GHOSTS = {
  mid: [".... ...g ...g ...g", "...g .... ..g. ...g", ".... .g.g .... ...g"],
  high: ["...g ...g .g.g ...g", "...g ..g. ..gg ...g", "..g. .g.g .... .g.g"],
};
const ghosts = (sets: readonly string[]): GrooveOption[] =>
  sets.map((snare) => ({ weight: 1, lines: { snare } }));

/** Quiet: soft on each beat, a ghost on each "and" (ST-neosoul-09). */
const HAT_QUIET = { closedHat: "o.g. o.g. o.g. o.g." };
/** Sixteenths, swung, with the "e" and the "a" ghosted (ST-neosoul-09). */
const HAT_SIXTEENTHS = { closedHat: "xgog xgog xgog xgog" };

/** The second bar of each pair: the loop is two bars long (ST-neosoul-08, ST-neosoul-41). */
const SECOND_BARS = [2, 4, 6, 8, 10, 12, 14, 16];

/**
 * The displaced four: the backbeat on 4 a whole sixteenth late, on the "e" of 4
 * (ST-neosoul-08). A written rhythm in 35% of sections, not a drag.
 */
const LATE_FOUR: GrooveOption[] = [
  { weight: 65, lines: {} },
  { weight: 35, lines: { snare: ".... .... .... -X.." } },
];

/**
 * Hot, the hat opens on the second bar of each pair, on the "and" of 2 or the
 * "and" of 4, one choice per section (ST-neosoul-10). It rings to the next stroke.
 */
const HAT_BREATH: GrooveOption[] = [
  { weight: 1, lines: { openHat: ".... ..x. .... ....", closedHat: ".... ...- .... ...." } },
  { weight: 1, lines: { openHat: ".... .... .... ..x.", closedHat: ".... .... .... ...-" } },
];

// ── fills ───────────────────────────────────────────────────────────────────
// A busy fill breaks the loop's spell: two steps at most inside a section, four
// into a hot one (ST-neosoul-11). The kick and the hat foot keep the groove's
// part; the hand on the hat keeps it through the two-step figure.

/** Two steps: a short snare figure ending in an accent. */
const SHORT = { weight: 1, lines: { closedHat: "x.", snare: "gX" } };
/** Four steps: the snare on beat 4 and an accented mid tom on its "and". */
const TOM = { weight: 1, lines: { snare: "x...", midTom: "..X." } };

export const neosoulDrums: DrumStyle = {
  grooves: {
    // Quiet: the soft hat, the section's kick, the backbeat (a cross-stick under 0.35), no ghosts.
    low: [
      { id: "hat", hold: "section", options: [{ weight: 1, lines: HAT_QUIET }] },
      { id: "kick", hold: "section", options: kicks(0) },
      {
        id: "backbeat",
        hold: "section",
        when: { energyFrom: 0.35 },
        options: [{ weight: 1, lines: BACKBEAT }],
      },
      {
        id: "cross-stick",
        hold: "section",
        when: { energyBelow: 0.35 },
        options: [{ weight: 1, lines: CROSS_STICK }],
      },
    ],
    // The working loop: sixteenth hat, a ghost set, and in some sections the late four.
    mid: [
      { id: "hat", hold: "section", options: [{ weight: 1, lines: HAT_SIXTEENTHS }] },
      { id: "kick", hold: "section", options: kicks(1) },
      { id: "backbeat", hold: "section", options: [{ weight: 1, lines: BACKBEAT }] },
      { id: "ghosts", hold: "section", options: ghosts(GHOSTS.mid) },
      { id: "late-four", hold: "section", when: { phraseBars: SECOND_BARS }, options: LATE_FOUR },
    ],
    // Hot: more ghosts, the expressive kicks, and the hat breathing open on the second bar.
    high: [
      { id: "hat", hold: "section", options: [{ weight: 1, lines: HAT_SIXTEENTHS }] },
      { id: "kick", hold: "section", options: kicks(2) },
      { id: "backbeat", hold: "section", options: [{ weight: 1, lines: BACKBEAT }] },
      { id: "ghosts", hold: "section", options: ghosts(GHOSTS.high) },
      { id: "late-four", hold: "section", when: { phraseBars: SECOND_BARS }, options: LATE_FOUR },
      { id: "breath", hold: "section", when: { phraseBars: SECOND_BARS }, options: HAT_BREATH },
    ],
  },

  // Time is on the hat.
  timekeepers: ["closedHat"],

  // The feather touch: the whole hat part at 80% of its written level, so the kick and the
  // snare speak through it (ST-neosoul-09).
  touches: [{ voices: ["closedHat", "openHat"], scale: 0.8 }],

  fills: {
    // Steps before the barline: none inside a section until the band is hot (ST-neosoul-11).
    length: {
      phrase: { low: 0, mid: 0, high: 2 },
      section: { low: 2, mid: 2, high: 4 },
    },
    phrase: [SHORT],
    section: [SHORT, TOM],
    top: [SHORT, TOM],
  },

  // The soft ending: a soft kick and a soft open hat on the One, no crash (ST-neosoul-40).
  ending: { strike: { kick: "o", openHat: "o" } },
};
