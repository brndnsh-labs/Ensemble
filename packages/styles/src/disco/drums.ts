// The disco drummer: four on the floor that never lets up. The kick on every
// beat at every level and straight through every fill, the snare on 2 and 4,
// and from the working level up the open hat barking on every "and"
// (ST-disco-04 to ST-disco-10). Energy changes how hard the kit digs in, never
// the pulse.
//
// Reading the grids: sixteen sixteenths to the bar, grouped by beat, "1 e & a".
// The band plays straight sixteenths. X accent, x normal, o soft, g ghost, a dot
// a rest.

import type { DrumStyle, DrumTime, FillShape } from "@ensemble/engine";

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

// ── in twelve and in six ────────────────────────────────────────────────────
// Disco has no tradition in compound time to take from, so this is disco's
// drummer handed a bar of pulses of three eighths: the floor on every pulse at
// every level and through every fill, the backbeat on the pulses between the
// strong ones, the open hat barking on each pulse's last eighth (ST-disco-03,
// the old band's rule for any other meter). A bar of 12/8 is four pulses,
// written in sixes; a bar of 6/8 is two. Only the eighths are struck and
// nothing swings: the three eighths are the triplet.
//
// Four said in pulses (AU-97): a beat is a pulse, its "and" (where the open hat
// barks) the pulse's last eighth, and the "e" the triplet's middle eighth, which
// takes what four puts on the "e" and the "a" (the shaker, the closed hat's
// sixteenths): the "a" has nowhere else to go, since the "and" holds the open
// hat. So the working hat is a triplet, closed, closed, open ("ts-ts-TSS"), or
// the skeleton's chick on the pulse with the shaker on the middle eighth.
//
// Six is not half of twelve but for its basic beat: the floor, the bark, the
// backbeat and the hat are twelve's first two pulses (`half` below), the kick on
// both pulses and the snare on the second (SU-D-14). The lift and the fills are
// written for a bar of two: a fill is never longer than a pulse there, since the
// bar less its first pulse is one pulse.

/** The first two pulses of a line written for twelve: the same beat, a bar of six. */
const half = (line: string): string => line.split(" ").slice(0, 2).join(" ");
const halves = (lines: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(lines).map(([voice, line]) => [voice, half(line)]));

const FLOOR_12 = { kick: "x..... x..... x..... x....." };
const SOFT_FLOOR_12 = { kick: "o..... o..... o..... o....." };
const BARK_12 = { openHat: "....x. ....x. ....x. ....x." };
const BACKBEAT_12 = { snare: "...... X..... ...... X....." };
const QUIET_SNARE_12 = { snare: "...... x..... ...... x....." };
const RIM_12 = { crossStick: "...... x..... ...... x....." };
/** Quiet: the chick on each pulse and a ghost on its "and", four's `o.g.` (never the middle eighth). */
const QUIET_HAT_12 = { closedHat: "o...g. o...g. o...g. o...g." };
/** A closed chick on each pulse, the shaker on the middle eighth between it and the bark. */
const SKELETON_12 = {
  closedHat: "x..... x..... x..... x.....",
  shaker: "..g... ..g... ..g... ..g...",
};
/** Pulse and middle eighth closed, the bark on the last: four's `xo.o`, the next pulse choking it. */
const TRIPLETS_12 = { closedHat: "x.o... x.o... x.o... x.o..." };
const SHAKER_12 = { shaker: "..g... ..g... ..g... ..g..." };
/**
 * Hot, every second bar: the bark on the bar's last "and" accented, and the snare with it at
 * full weight, kicking into the next bar (ST-disco-07). Four's snare is on the "a", a sixteenth
 * after the bark; in pulses the "a" is that same last eighth.
 */
const LIFT_12 = { openHat: "...... ...... ...... ....X.", snare: "...... ...... ...... ....x." };
const LIFT_6 = { openHat: "...... ....X.", snare: "...... ....x." };

// Fills in pulses, on the eighths. Four's lengths said in pulses: its two sixteenths (the bark)
// are the last eighth, its beat a pulse, its two beats two pulses. None writes a kick line, so
// the floor goes on under every one; from the working level up the hat foot keeps the "and"s.
/** The bark: the open hat on the last "and" and the snare cracked with it, into the One. */
const BARK_FILL = { openHat: "X.", snare: "X." };
/** Quiet, the hat stays closed (ST-disco-10). */
const QUIET_BARK_FILL = { closedHat: "x.", snare: "X." };
/** A pulse on the snare: four's `.oxX` and `oxxX` in three eighths, the last the loudest. */
const QUIET_PULSE = { snare: "..o.X." };
const SNARE_PULSE = { snare: "o.x.X.", pedalHat: "....x." };
/** The disco roll in two pulses: the long-short on 3, the triplet crescendo into the One. */
const ROLL_12 = { snare: "x...x. x.x.X.", pedalHat: "....x. ....x." };
const QUIET_ROLL_12 = { snare: "o...o. o.x.X." };
/** The Philly fill down the kit, an eighth a drum: snare, mid tom, floor tom in a pulse. */
const PHILLY_PULSE = { snare: "x.....", midTom: "..x...", lowTom: "....X.", pedalHat: "....x." };
/** In two pulses: the snare twice, the high tom, the mid tom twice, the floor tom accented. */
const PHILLY_TWO = {
  snare: "x.x... ......",
  highTom: "....x. ......",
  midTom: "...... x.x...",
  lowTom: "...... ....X.",
  pedalHat: "....x. ....x.",
};

const QUIET_12: FillShape[] = [
  shape(1, QUIET_BARK_FILL),
  shape(1, QUIET_PULSE),
  shape(1, QUIET_ROLL_12),
];
const WORKING_12: FillShape[] = [shape(1, BARK_FILL), shape(1, SNARE_PULSE), shape(1, ROLL_12)];
const HOT_12: FillShape[] = [
  shape(1, BARK_FILL),
  shape(2, PHILLY_PULSE),
  shape(1, SNARE_PULSE),
  shape(2, PHILLY_TWO),
  shape(1, ROLL_12),
];
const HOT_TOP_12: FillShape[] = [shape(1, BARK_FILL), shape(1, PHILLY_PULSE), shape(1, PHILLY_TWO)];
/** Six's fills are twelve's that fit a pulse: the bark and the pulse. */
const inSix = (shapes: readonly FillShape[]): FillShape[] =>
  shapes.filter((fill) => Object.values(fill.lines).every((line) => line.length <= 6));

/** The floor's layers for a meter, as four's are: the same ids, holds and conditions. */
function floor(
  w: Readonly<
    Record<
      | "floor"
      | "softFloor"
      | "bark"
      | "backbeat"
      | "quietSnare"
      | "rim"
      | "quietHat"
      | "skeleton"
      | "triplets"
      | "shaker"
      | "lift",
      Readonly<Record<string, string>>
    >
  >,
): DrumTime["grooves"] {
  return {
    low: [
      {
        id: "time",
        hold: "section",
        options: [{ weight: 1, lines: { ...w.softFloor, ...w.quietHat } }],
      },
      {
        id: "snare",
        hold: "section",
        when: { energyFrom: 0.3 },
        options: [{ weight: 1, lines: w.quietSnare }],
      },
      {
        id: "rim",
        hold: "section",
        when: { energyBelow: 0.3 },
        options: [{ weight: 1, lines: w.rim }],
      },
    ],
    mid: [
      { id: "floor", hold: "section", options: [{ weight: 1, lines: { ...w.floor, ...w.bark } }] },
      { id: "snare", hold: "section", options: [{ weight: 1, lines: w.backbeat }] },
      {
        id: "hat",
        hold: "section",
        options: [
          { weight: 1, lines: w.skeleton },
          { weight: 2, lines: w.triplets },
        ],
      },
    ],
    high: [
      { id: "floor", hold: "section", options: [{ weight: 1, lines: { ...w.floor, ...w.bark } }] },
      { id: "snare", hold: "section", options: [{ weight: 1, lines: w.backbeat }] },
      {
        id: "hat",
        hold: "section",
        options: [{ weight: 1, lines: { ...w.triplets, ...w.shaker } }],
      },
      {
        id: "lift",
        hold: "section",
        when: { phraseBars: EVERY_SECOND_BAR },
        options: [{ weight: 1, lines: w.lift }],
      },
    ],
  };
}

const TWELVE = {
  floor: FLOOR_12,
  softFloor: SOFT_FLOOR_12,
  bark: BARK_12,
  backbeat: BACKBEAT_12,
  quietSnare: QUIET_SNARE_12,
  rim: RIM_12,
  quietHat: QUIET_HAT_12,
  skeleton: SKELETON_12,
  triplets: TRIPLETS_12,
  shaker: SHAKER_12,
  lift: LIFT_12,
};

const discoDrumsInTwelve: DrumTime = {
  grooves: floor(TWELVE),
  touches: [],
  fills: {
    // ST-disco-08 in pulses: the bark (an eighth) at a phrase's end below hot, a pulse hot;
    // into a section a pulse when quiet, two pulses from the working level up.
    length: {
      phrase: { low: 2, mid: 2, high: 6 },
      section: { low: 6, mid: 12, high: 12 },
    },
    phrase: { low: QUIET_12, mid: WORKING_12, high: HOT_12 },
    section: { low: QUIET_12, mid: WORKING_12, high: HOT_12 },
    top: { low: QUIET_12, mid: WORKING_12, high: HOT_TOP_12 },
  },
};

const discoDrumsInSix: DrumTime = {
  // The basic beat is twelve's, halved; the lift is six's own.
  grooves: floor({
    ...(Object.fromEntries(
      Object.entries(TWELVE).map(([part, lines]) => [part, halves(lines)]),
    ) as typeof TWELVE),
    lift: LIFT_6,
  }),
  touches: [],
  fills: {
    // A bar of six has room for a pulse of fill: the bark, or the last pulse.
    length: {
      phrase: { low: 2, mid: 2, high: 6 },
      section: { low: 6, mid: 6, high: 6 },
    },
    phrase: { low: inSix(QUIET_12), mid: inSix(WORKING_12), high: inSix(HOT_12) },
    section: { low: inSix(QUIET_12), mid: inSix(WORKING_12), high: inSix(HOT_12) },
    top: { low: inSix(QUIET_12), mid: inSix(WORKING_12), high: inSix(HOT_TOP_12) },
  },
};

export const discoDrums: DrumStyle = {
  // The floor in twelve and in six, written above.
  meters: { "12/8": discoDrumsInTwelve, "6/8": discoDrumsInSix },

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
