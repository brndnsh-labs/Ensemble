// The reggae drummer: the one drop. Kick and cross-stick together on beat 3,
// nothing at all on the One, the hat ticking eighths or shuffled sixteenths
// over it. Answer bars put a soft pickup into the empty One. Hot, he plays one
// riddim for the whole performance, steppers or rockers, the drop on 3 a snare
// and the kick back on the One. Fills are short and late, never a bar-long run
// (ST-reggae-05 to ST-reggae-11).
//
// Reading the grids: sixteen sixteenths to the bar, grouped by beat, "1 e & a".
// The band swings the sixteenths by a trace (ST-reggae-02). X accent, x normal,
// o soft, g ghost, "-" the stroke taken away. The notes' RM, the rim, is the
// cross-stick; TH and TL are the high and the floor tom.

import { type DrumStyle, type FillShape, type GrooveOption, TIER_MID } from "@ensemble/engine";

// ── the time ────────────────────────────────────────────────────────────────

/** Quiet: the soft one drop, the hat soft on the eighths with a ghost between (ST-reggae-06). */
const SOFT_DROP = {
  closedHat: "o.g. o.g. o.g. o.g.",
  kick: ".... .... o... ....",
  crossStick: ".... .... x... ....",
};

/** The one drop: kick and cross-stick accented together on 3, nothing on the One (ST-reggae-07). */
const ONE_DROP = { kick: ".... .... X... ....", crossStick: ".... .... X... ...." };

/** The hat, one per section: straight eighths (55), or shuffled sixteenths whose "a" picks up the next beat (45). */
const HATS: GrooveOption[] = [
  { weight: 55, lines: { closedHat: "x.o. x.o. x.o. x.o." } },
  { weight: 45, lines: { closedHat: "x.oo x.oo x.oo x.oo" } },
];

/**
 * The lift: an open hat on the "and" of 4, the closed hat taken off there, in
 * every bar of 40% of sections (ST-reggae-07).
 */
const LIFT = { openHat: ".... .... .... ..x.", closedHat: ".... .... .... ..-." };
const LIFTS: GrooveOption[] = [
  { weight: 60, lines: {} },
  { weight: 40, lines: LIFT },
];

/**
 * Hot, one riddim for the whole performance, an even chance of either, never
 * switched between choruses (ST-reggae-08). Both keep the drop on 3, now a
 * snare, and put the kick back on the One.
 */
const RIDDIMS: GrooveOption[] = [
  {
    // Steppers: the kick on every beat, the hat on the beats, the open hat on every "and".
    weight: 1,
    lines: {
      kick: "x... x... x... x...",
      snare: ".... .... X... ....",
      closedHat: "x... x... x... x...",
      openHat: "..x. ..x. ..x. ..x.",
    },
  },
  {
    // Rockers: the kick on 1 and 3, the shuffled hat.
    weight: 1,
    lines: {
      kick: "x... .... x... ....",
      snare: ".... .... X... ....",
      closedHat: "x.oo x.oo x.oo x.oo",
    },
  },
];

/** The second bar of each pair: where the beat answers itself (DR-05). */
const ANSWER_BARS = [2, 4, 6, 8, 10, 12, 14, 16];

/**
 * The answer, in the bar's back half, one turn to a section (ST-reggae-09): a
 * soft stroke on the "and" of 4 as a pickup into the empty One (2); the drop
 * echoed softly on the "and" of 3 (2); the hat lifted on the "and" of 4 (1),
 * which a section that already lifts there gives way past to the next.
 */
const answers = (hand: "crossStick" | "snare"): GrooveOption[] => [
  { weight: 2, lines: { [hand]: ".... .... .... ..o." } },
  { weight: 2, lines: { [hand]: ".... .... ..o. ...." } },
  { weight: 1, lines: LIFT },
];

// ── fills ───────────────────────────────────────────────────────────────────
// Short and late (ST-reggae-10, ST-reggae-11): two steps or four, each ending on
// the last sixteenth before the One. Over a fill the hand leaves the hat.

/** A pickup on the rim. */
const RIM_PICKUP = { two: { crossStick: "oX" }, four: { crossStick: ".oxX" } };
/** The drop: time stops, then the rim and the kick on the "a" of 4. */
const THE_DROP = { two: { crossStick: ".X" }, four: { crossStick: "...X", kick: "...x" } };
/** "A-di-dum": the high tom, then the floor tom. */
const TOM_PICKUP = {
  two: { highTom: "o.", lowTom: ".X" },
  four: { crossStick: "x...", highTom: "..o.", lowTom: "...X" },
};
/** A drag on the snare. */
const SNARE_DRAG = { two: { snare: "oX" }, four: { snare: ".goX" } };
/** A roll on the rim. */
const RIM_ROLL = { two: { crossStick: "xX" }, four: { crossStick: "ooxX" } };

/** Both lengths of a shape at one weight. */
function both(weight: number, shape: { two: FillShape["lines"]; four: FillShape["lines"] }) {
  return [
    { weight, lines: shape.two },
    { weight, lines: shape.four },
  ];
}

export const reggaeDrums: DrumStyle = {
  grooves: {
    // No lift, no pickups, no answer bars (ST-reggae-06).
    low: [{ id: "time", hold: "section", options: [{ weight: 1, lines: SOFT_DROP }] }],

    mid: [
      { id: "hat", hold: "section", options: HATS },
      { id: "drop", hold: "section", options: [{ weight: 1, lines: ONE_DROP }] },
      { id: "lift", hold: "section", options: LIFTS },
      {
        id: "answer",
        hold: "section",
        when: { phraseBars: ANSWER_BARS },
        audible: true,
        options: answers("crossStick"),
      },
    ],

    high: [
      { id: "riddim", hold: "song", options: RIDDIMS },
      {
        id: "answer",
        hold: "section",
        when: { phraseBars: ANSWER_BARS },
        audible: true,
        options: answers("snare"),
      },
    ],
  },

  // Time is on the hat.
  timekeepers: ["closedHat"],
  // Quiet, a new section is marked by its fill alone: an arrival crash would put its kick on
  // the empty One (ST-reggae-05: ceiling 2% at the low level).
  crashFrom: TIER_MID,

  touches: [],

  fills: {
    // Phrase: none quiet, two steps, four hot. Section: two quiet, four from the working level
    // up (ST-reggae-10).
    length: {
      phrase: { low: 0, mid: 2, high: 4 },
      section: { low: 2, mid: 4, high: 4 },
    },
    // Phrase end: the rim pickup (3), the drop (2).
    phrase: [...both(3, RIM_PICKUP), ...both(2, THE_DROP)],
    // Section end: the tom pickup (2), the snare drag (2), the rim roll (1), the rim pickup (1).
    section: [
      ...both(2, TOM_PICKUP),
      ...both(2, SNARE_DRAG),
      ...both(1, RIM_ROLL),
      ...both(1, RIM_PICKUP),
    ],
    // The top of the form, or the set-up into the ending: the tom pickup (3), the snare drag (1).
    top: [...both(3, TOM_PICKUP), ...both(1, SNARE_DRAG)],
  },

  // The stop: the one drop's own pair, kick and cross-stick, moved onto the One and accented;
  // no cymbal to ring over the silence (ST-reggae-32).
  ending: { strike: { kick: "X", crossStick: "X" } },
};
