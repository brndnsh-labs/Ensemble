// The funk drummer: sixteenth-note funk. A syncopated kick that has the One and
// stays off the backbeat, the backbeat cracked with ghost notes around it, and
// the hat running eighths when quiet and sixteenths above. The second bar of
// each pair turns its back half round; fills are a beat at most and never run
// down the toms (ST-funk-06 to ST-funk-14).
//
// Reading the grids: sixteen sixteenths to the bar, grouped by beat, "1 e & a".
// The band swings the sixteenths by a trace (ST-funk-02), so every step is
// playable. X accent, x normal, o soft, g ghost, "-" the stroke taken away.

import type { DrumStyle, FillShape, GrooveOption } from "@ensemble/engine";

// ── the time ────────────────────────────────────────────────────────────────

/**
 * The five kicks, one per section, each with the One and none on 2 or 4
 * (ST-funk-06). The weights are low, mid, high: the busier kicks come in as
 * the band gets louder.
 */
const KICKS = [
  { lines: { kick: "x... ...x ..x. ...." }, weights: [3, 3, 2] },
  { lines: { kick: "x.x. .... ..x. .x.." }, weights: [1, 3, 3] },
  { lines: { kick: "x... ..x. ..x. ...." }, weights: [3, 2, 1] },
  { lines: { kick: "x..x .... ..x. .x.." }, weights: [1, 2, 3] },
  { lines: { kick: "x... .... xx.. .x.." }, weights: [1, 2, 3] },
] as const;

function kicks(tier: 0 | 1 | 2): GrooveOption[] {
  return KICKS.map((kick) => ({ weight: kick.weights[tier], lines: kick.lines }));
}

/** Two and four, cracked, at every level: funk keeps its backbeat when quiet (X-A-09). */
const BACKBEAT = { snare: ".... X... .... X..." };

/** The ghost notes around the backbeat, one set per section from mid up (ST-funk-07). */
const GHOSTS: GrooveOption[] = [
  { weight: 1, lines: { snare: ".... ...g .g.. ..g." } },
  { weight: 1, lines: { snare: "..g. ...g .... ...g" } },
  { weight: 1, lines: { snare: ".g.. ...g ..g. ...g" } },
  { weight: 1, lines: { snare: ".... ...g .... ..gg" } },
];

const HAT_EIGHTHS = { closedHat: "x.o. x.o. x.o. x.o." };
/** Sixteenths, the off-sixteenths soft: the right hand never stops (ST-funk-08). */
const HAT_SIXTEENTHS = { closedHat: "xoxo xoxo xoxo xoxo" };

/**
 * The hat opens on the "and" of 4 and rings into the One: the stick that opens
 * it does not close it on the "a" (ST-funk-08).
 */
const OPEN_ON_FOUR = { openHat: ".... .... .... ..x.", closedHat: ".... .... .... ...-" };

/** Where the turns of the two-bar beat go: the second and fourth bars of a phrase (DR-05). */
const ANSWER_BARS = [2, 4, 6];

/**
 * The quiet turn is the foot alone, a soft kick (DR-07): on the "a" of 3, or on
 * the "a" of 4 into the One.
 */
const QUIET_TURNS: GrooveOption[] = [
  { weight: 1, lines: { kick: ".... .... ...o ...." } },
  { weight: 1, lines: { kick: ".... .... .... ...o" } },
];

/**
 * Louder, the hands turn it too (ST-funk-09). In this order, so a turn that
 * would change nothing gives way to the next: the open hat comes last, and in
 * a section whose hat already opens on 4 the bar turns on the kick instead.
 */
const TURNS: GrooveOption[] = [
  { weight: 2, lines: { kick: ".... .... ...x ...." } },
  { weight: 2, lines: { kick: ".... .... .... ...x" } },
  { weight: 2, lines: { snare: ".... .... .... .g.g" } },
  { weight: 1, lines: OPEN_ON_FOUR },
];

// ── fills ───────────────────────────────────────────────────────────────────
// A beat at most, and never down the toms: the left hand and the foot fill
// while the right hand keeps the hat going, except in the hit and the snare
// crescendo, which stop it (ST-funk-10, ST-funk-11, DR-50). Each ends on the
// last sixteenth before the One, the loudest stroke last (DR-18).

/** Ghosts dragging into an accent on the "a" of 4. */
const GHOST_DRAG = {
  two: { closedHat: "xo", snare: "gX" },
  four: { closedHat: "x.x.", snare: "ggxX" },
};
/** The band hit: snare on 4, kick on its "and", snare on the "a". The hat stops. */
const THE_HIT = {
  two: { snare: ".X", kick: "x." },
  four: { snare: "X..X", kick: "..x." },
};
/** Kick and snare trading sixteenths under the hat. */
const KICK_SNARE = {
  two: { closedHat: "xo", snare: ".X", kick: "x." },
  four: { closedHat: "xoxo", snare: ".g.X", kick: "x.x." },
};
/** The hat opens on 4, the foot closes it, the snare on the "a". */
const HAT_CUT = {
  two: { openHat: "x.", pedalHat: ".x", snare: ".X" },
  four: { openHat: "X...", pedalHat: "..x.", snare: "..gX" },
};
/** A snare crescendo in sixteenths. The hat stops. */
const SNARE_SIXTEENTHS = {
  two: { snare: "xX" },
  four: { snare: "oxxX" },
};

/** Quiet, the hat in a fill plays eighths, as the time does (ST-funk-11). */
const QUIET_KICK_SNARE = {
  two: { closedHat: "x.", snare: ".X", kick: "x." },
  four: { closedHat: "x.x.", snare: ".g.X", kick: "x.x." },
};
const QUIET_GHOST_DRAG = {
  two: { closedHat: "x.", snare: "gX" },
  four: GHOST_DRAG.four,
};

/** Both lengths of a shape at one weight. */
function both(weight: number, shape: { two: FillShape["lines"]; four: FillShape["lines"] }) {
  return [
    { weight, lines: shape.two },
    { weight, lines: shape.four },
  ];
}

export const funkDrums: DrumStyle = {
  grooves: {
    // Quiet: hat eighths, the backbeat, the section's kick, no ghosts, and the answer on the foot.
    low: [
      { id: "hat", hold: "section", options: [{ weight: 1, lines: HAT_EIGHTHS }] },
      { id: "kick", hold: "section", options: kicks(0) },
      { id: "backbeat", hold: "section", options: [{ weight: 1, lines: BACKBEAT }] },
      {
        id: "turn",
        hold: "section",
        when: { phraseBars: ANSWER_BARS },
        audible: true,
        options: QUIET_TURNS,
      },
    ],

    // The working groove: sixteenth hat, ghosts round the backbeat, and some sections open the
    // hat on the "and" of 4 in every bar.
    mid: [
      { id: "hat", hold: "section", options: [{ weight: 1, lines: HAT_SIXTEENTHS }] },
      { id: "kick", hold: "section", options: kicks(1) },
      { id: "backbeat", hold: "section", options: [{ weight: 1, lines: BACKBEAT }] },
      { id: "ghosts", hold: "section", options: GHOSTS },
      {
        id: "open",
        hold: "section",
        options: [
          { weight: 65, lines: {} },
          { weight: 35, lines: OPEN_ON_FOUR },
        ],
      },
      {
        id: "turn",
        hold: "section",
        when: { phraseBars: ANSWER_BARS },
        audible: true,
        options: TURNS,
      },
    ],

    // Hot: the hat opens on the "and" of 4 in every bar, and the busier kicks come forward.
    high: [
      { id: "hat", hold: "section", options: [{ weight: 1, lines: HAT_SIXTEENTHS }] },
      { id: "kick", hold: "section", options: kicks(2) },
      { id: "backbeat", hold: "section", options: [{ weight: 1, lines: BACKBEAT }] },
      { id: "ghosts", hold: "section", options: GHOSTS },
      { id: "open", hold: "section", options: [{ weight: 1, lines: OPEN_ON_FOUR }] },
      {
        id: "turn",
        hold: "section",
        when: { phraseBars: ANSWER_BARS },
        audible: true,
        options: TURNS,
      },
    ],
  },

  // Time is on the hat throughout; there is no ride pattern (ST-funk-13).
  timekeepers: ["closedHat"],

  touches: [],

  fills: {
    length: {
      phrase: { low: 2, mid: 2, high: 4 },
      section: { low: 4, mid: 4, high: 4 },
    },
    // Quiet, the hat stays on eighths and never opens (DR-07): the hat cut waits for the mid tier.
    phrase: {
      low: [...both(3, QUIET_GHOST_DRAG), ...both(1, QUIET_KICK_SNARE)],
      mid: [...both(3, GHOST_DRAG), ...both(2, HAT_CUT), ...both(1, KICK_SNARE)],
      high: [...both(3, GHOST_DRAG), ...both(2, HAT_CUT), ...both(1, KICK_SNARE)],
    },
    section: {
      low: [
        ...both(2, QUIET_KICK_SNARE),
        ...both(2, THE_HIT),
        ...both(1, QUIET_GHOST_DRAG),
        ...both(1, SNARE_SIXTEENTHS),
      ],
      mid: [
        ...both(2, KICK_SNARE),
        ...both(2, THE_HIT),
        ...both(1, GHOST_DRAG),
        ...both(1, SNARE_SIXTEENTHS),
      ],
      high: [
        ...both(2, KICK_SNARE),
        ...both(2, THE_HIT),
        ...both(1, GHOST_DRAG),
        ...both(1, SNARE_SIXTEENTHS),
      ],
    },
    // Into the top of the form, a louder section, or the dead stop: the band hit first (ST-funk-12).
    top: {
      low: [...both(3, THE_HIT), ...both(2, SNARE_SIXTEENTHS)],
      mid: [...both(3, THE_HIT), ...both(2, SNARE_SIXTEENTHS), ...both(1, HAT_CUT)],
      high: [...both(3, THE_HIT), ...both(2, SNARE_SIXTEENTHS), ...both(1, HAT_CUT)],
    },
  },

  // The dead stop: kick, snare and closed hat on the One, and no cymbal to ring over the
  // silence (ST-funk-41).
  ending: { strike: { kick: "X", snare: "X", closedHat: "X" } },
};
