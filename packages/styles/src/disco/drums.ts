// The disco drummer: four on the floor that never lets up. The kick on every
// beat at every level and straight through every fill, the snare on 2 and 4,
// and from the working level up the open hat barking on every "and"
// (ST-disco-04 to ST-disco-10). Energy changes how hard the kit digs in, never
// the pulse.
//
// Reading the grids: sixteen sixteenths to the bar, grouped by beat, "1 e & a".
// The band plays straight sixteenths. X accent, x normal, o soft, g ghost, a dot
// a rest.

import type { DrumStyle, FillShape } from "@ensemble/engine";

// ── the time ────────────────────────────────────────────────────────────────

/** Every beat, at every level (ST-disco-04). Quiet, it is softer and still every beat. */
const FLOOR = { kick: "x... x... x... x..." };
const SOFT_FLOOR = { kick: "o... o... o... o..." };

/** The open hat barks on every "and" (ST-disco-06). */
const BARK = { openHat: "..x. ..x. ..x. ..x." };

const BACKBEAT = { snare: ".... X... .... X..." };

/** A closed chick on each beat, with the shaker on the "e"s and "a"s (ST-disco-06). */
const SKELETON = { closedHat: "x... x... x... x...", shaker: ".g.g .g.g .g.g .g.g" };
/** Beat, "e" and "a" closed; the "a" chokes the open hat ("ts-TSS-t", ST-disco-06). */
const SIXTEENTHS = { closedHat: "xo.o xo.o xo.o xo.o" };
const SHAKER = { shaker: ".g.g .g.g .g.g .g.g" };

/**
 * Hot, every second bar: the open hat on the "and" of 4 accented and a snare on
 * the "a" of 4, at full weight, kicking into the next bar (ST-disco-07).
 */
const LIFT = { openHat: ".... .... .... ..X.", snare: ".... .... .... ...x" };
const EVERY_SECOND_BAR = [2, 4, 6, 8];

// ── fills ───────────────────────────────────────────────────────────────────
// None writes a kick line, so the foot plays the floor through every one of
// them (DR-12, ST-disco-04). From the working level up, a fill that takes the
// hand off the open hat has the hat foot on the "and"s, so the off-beat motion
// never stops (ST-disco-09). Each ends on the last sixteenth before the One,
// the loudest stroke last (DR-18).

/** The bark: the open hat on the "and" of 4 and the snare on its "a". */
const THE_BARK = { openHat: "X.", snare: ".X" };
/**
 * Quiet, the hat stays closed (ST-disco-10): the same bark on the closed hat. The
 * notes' only two-step fill opens the hat, and a quiet phrase ends in one bar of four.
 */
const QUIET_BARK = { closedHat: "x.", snare: ".X" };
const QUIET_FOUR = { snare: ".oxX" };
const SNARE_FOUR = { snare: "oxxX", pedalHat: "..x." };
/** The disco roll: eighths on 3, sixteenths crescendo into the One. */
const ROLL = { snare: "x.x. xxxX", pedalHat: "..x. ..x." };
const QUIET_ROLL = { snare: "o.o. oxxX" };
/** The Philly fill: sixteenths down the kit, snare, high, mid, floor, a quarter each. */
const PHILLY_FOUR = {
  snare: "x...",
  highTom: ".x..",
  midTom: "..x.",
  lowTom: "...X",
  pedalHat: "..x.",
};
const PHILLY_EIGHT = {
  snare: "xx.. ....",
  highTom: "..xx ....",
  midTom: ".... xx..",
  lowTom: ".... ..xX",
  pedalHat: "..x. ..x.",
};

const shape = (weight: number, lines: FillShape["lines"]): FillShape => ({ weight, lines });

/**
 * One vocabulary a tier, every length in it: the length comes from where the
 * music is going (CO-43) and picks the shapes of that length.
 */
const QUIET: FillShape[] = [shape(1, QUIET_BARK), shape(1, QUIET_FOUR), shape(1, QUIET_ROLL)];
const WORKING: FillShape[] = [shape(1, THE_BARK), shape(1, SNARE_FOUR), shape(1, ROLL)];
const HOT: FillShape[] = [
  shape(1, THE_BARK),
  shape(2, PHILLY_FOUR),
  shape(1, SNARE_FOUR),
  shape(2, PHILLY_EIGHT),
  shape(1, ROLL),
];
/** Into the top of the form, a louder section, or the last chord: down the toms when hot. */
const HOT_TOP: FillShape[] = [shape(1, THE_BARK), shape(1, PHILLY_FOUR), shape(1, PHILLY_EIGHT)];

export const discoDrums: DrumStyle = {
  grooves: {
    // Quiet: the soft floor, closed eighths with no open hat yet, the backbeat; a cross-stick
    // under 0.30 (ST-disco-05). The hat is written a step softer than the notes' `x.o.`, which is
    // as hard as the quiet backbeat: the cymbal that keeps time sits under the snare.
    low: [
      {
        id: "time",
        hold: "section",
        options: [{ weight: 1, lines: { ...SOFT_FLOOR, closedHat: "o.g. o.g. o.g. o.g." } }],
      },
      {
        id: "snare",
        hold: "section",
        when: { energyFrom: 0.3 },
        options: [{ weight: 1, lines: { snare: ".... x... .... x..." } }],
      },
      {
        id: "rim",
        hold: "section",
        when: { energyBelow: 0.3 },
        options: [{ weight: 1, lines: { crossStick: ".... x... .... x..." } }],
      },
    ],

    // The working beat: the floor, the bark on every "and", the backbeat, and the hat the
    // section chose, the skeleton with the shaker (1) or the sixteenths (2) (ST-disco-06).
    mid: [
      { id: "floor", hold: "section", options: [{ weight: 1, lines: { ...FLOOR, ...BARK } }] },
      { id: "snare", hold: "section", options: [{ weight: 1, lines: BACKBEAT }] },
      {
        id: "hat",
        hold: "section",
        options: [
          { weight: 1, lines: SKELETON },
          { weight: 2, lines: SIXTEENTHS },
        ],
      },
    ],

    // Hot: the sixteenths and the shaker always, and every second bar the lift (ST-disco-06, 07).
    high: [
      { id: "floor", hold: "section", options: [{ weight: 1, lines: { ...FLOOR, ...BARK } }] },
      { id: "snare", hold: "section", options: [{ weight: 1, lines: BACKBEAT }] },
      { id: "hat", hold: "section", options: [{ weight: 1, lines: { ...SIXTEENTHS, ...SHAKER } }] },
      {
        id: "lift",
        hold: "section",
        when: { phraseBars: EVERY_SECOND_BAR },
        options: [{ weight: 1, lines: LIFT }],
      },
    ],
  },

  // Time is on the closed hat; a crash on an arrival takes its stroke on the One.
  timekeepers: ["closedHat"],

  touches: [],

  fills: {
    // ST-disco-08.
    length: {
      phrase: { low: 2, mid: 2, high: 4 },
      section: { low: 4, mid: 8, high: 8 },
    },
    phrase: { low: QUIET, mid: WORKING, high: HOT },
    section: { low: QUIET, mid: WORKING, high: HOT },
    top: { low: QUIET, mid: WORKING, high: HOT_TOP },
  },

  // Crash, kick and snare accented on the last chord, and the shaker (ST-disco-31).
  ending: { strike: { crash: "X", kick: "X", snare: "X", shaker: "x" } },
};
