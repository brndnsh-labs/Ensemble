// The country drummer: the boom-chick's back half. Quiet, the ballad: quarter
// clicks on the hat, the kick on 1 and softly on 3, a cross-stick on 2 and 4.
// At the working level the two-step (even eighths on the hat, the kick on 1 and
// 3, the snare on 2 and 4) in most sections and the light train in the rest.
// Hot, the train: the hat on the quarters, the kick on 1 and 3, and the snare
// either the sixteenth lattice or steady eighths, its backbeat accented; at the
// very top the kick feathers 2 and 4 and the hat opens on 4. Fills are pickups
// into the One that keep the backbeat they start on (ST-country-03,
// ST-country-04, DR-58 to DR-60).
//
// Reading the grids: sixteen sixteenths to the bar, grouped by beat, "1 e & a".
// X accent, x normal, o soft, g ghost, "-" the stroke taken away. RM in the
// notes is the cross-stick.

import type { DrumStyle, FillShape, GrooveOption } from "@ensemble/engine";

// ── the time ────────────────────────────────────────────────────────────────

const KICK_ONE_AND_THREE = "x... .... x... ....";
const BACKBEAT = ".... X... .... X...";
const HAT_QUARTERS = "x... x... x... x...";

/** The ballad (DR-58 low): soft quarter clicks, the kick on 1 and softly on 3, the cross-stick on 2 and 4. */
const BALLAD: GrooveOption[] = [
  {
    weight: 1,
    lines: {
      closedHat: "o... o... o... o...",
      kick: "x... .... o... ....",
      crossStick: ".... x... .... x...",
    },
  },
];

/**
 * The working level, one a section (DR-58 mid): the two-step in 70% of
 * sections, its hat eighths even (a soft off-beat made it limp); the light
 * train in 30%, quarter clicks over the ghosted snare.
 */
const WORKING: GrooveOption[] = [
  {
    weight: 70,
    lines: { closedHat: "x.x. x.x. x.x. x.x.", kick: KICK_ONE_AND_THREE, snare: BACKBEAT },
  },
  {
    weight: 30,
    lines: {
      closedHat: "o... o... o... o...",
      kick: KICK_ONE_AND_THREE,
      snare: "g.g. X.g. g.g. X.g.",
    },
  },
];

/**
 * The train (DR-59): the hat on the quarters, the kick on 1 and 3, and the
 * snare's sixteenth lattice, continuous. In 4/4, 40% of sections play steady
 * eighths on the snare instead, the lattice's ghosts taken away; that is four's
 * own figure (two strokes to every beat are every eighth of a fitted bar of
 * twelve), so a bar of another meter keeps the lattice.
 */
const LATTICE: GrooveOption[] = [
  {
    weight: 1,
    lines: { closedHat: HAT_QUARTERS, kick: KICK_ONE_AND_THREE, snare: "gggg Xggg gggg Xggg" },
  },
];
const TRAIN_IN_FOUR: GrooveOption[] = [
  { weight: 60, lines: {} },
  { weight: 40, lines: { snare: "o-o- X-o- o-o- X-o-" } },
];

/** The second bar of each pair: where the beat answers itself (DR-05). */
const ANSWER_BARS = [2, 4, 6, 8, 10, 12, 14, 16];

// The turns (DR-60): a soft kick on the "and" of 4, the snare doubling the backbeat on the
// "and" of 4, or a soft kick on the "and" of 3. A ballad uses only the first. In this order, so
// that a turn the section already plays (the lattice has the "and" of 4) gives way to one heard.
const KICK_AND_OF_FOUR = { kick: ".... .... .... ..o." };
const SNARE_AND_OF_FOUR = { snare: ".... .... .... ..x." };
const KICK_AND_OF_THREE = { kick: ".... .... ..o. ...." };
const BALLAD_TURNS: GrooveOption[] = [{ weight: 1, lines: KICK_AND_OF_FOUR }];
const TURNS: GrooveOption[] = [
  { weight: 2, lines: KICK_AND_OF_FOUR },
  { weight: 1, lines: SNARE_AND_OF_FOUR },
  { weight: 1, lines: KICK_AND_OF_THREE },
];

// ── fills ───────────────────────────────────────────────────────────────────
// Pickups, two steps or four, into the One: "4-and, ONE" on the snare, or a
// rimshot with the kick on the "and" of 4. A four-step fill starts on beat 4,
// the backbeat, and keeps its accent (DR-60). A sixteenth roll or a floor-tom
// push only at the top of the form when the band is hot (ST-country-04).

type Pickup = { readonly two: FillShape["lines"]; readonly four: FillShape["lines"] };

const SNARE_PICKUP: Pickup = { two: { snare: "x." }, four: { snare: "X.x." } };
const RIMSHOT: Pickup = {
  two: { snare: "X.", kick: "x." },
  four: { snare: "X.X.", kick: "..x." },
};
/** The ballad's pickup, on the cross-stick and soft. */
const CROSS_PICKUP: Pickup = { two: { crossStick: "o." }, four: { crossStick: "x.o." } };
const ROLL: Pickup = { two: { snare: "xx" }, four: { snare: "Xxxx" } };
const FLOOR_PUSH: Pickup = {
  two: { lowTom: "x.", kick: "x." },
  four: { snare: "X...", lowTom: "..x.", kick: "..x." },
};

const both = (weight: number, shape: Pickup): FillShape[] => [
  { weight, lines: shape.two },
  { weight, lines: shape.four },
];

export const countryDrums: DrumStyle = {
  grooves: {
    low: [
      { id: "time", hold: "section", options: BALLAD },
      { id: "turn", hold: "section", when: { phraseBars: ANSWER_BARS }, options: BALLAD_TURNS },
    ],
    mid: [
      { id: "time", hold: "section", options: WORKING },
      {
        id: "turn",
        hold: "section",
        when: { phraseBars: ANSWER_BARS },
        audible: true,
        options: TURNS,
      },
    ],
    high: [
      { id: "time", hold: "section", options: LATTICE },
      { id: "train", hold: "section", when: { meters: ["4/4"] }, options: TRAIN_IN_FOUR },
      // Above 0.80 the kick feathers 2 and 4; above 0.82 the hat opens on 4 (DR-59).
      {
        id: "feather",
        hold: "section",
        when: { energyFrom: 0.8 },
        options: [{ weight: 1, lines: { kick: ".... o... .... o..." } }],
      },
      {
        id: "open",
        hold: "section",
        when: { energyFrom: 0.82 },
        options: [
          {
            weight: 1,
            lines: { closedHat: ".... .... .... -...", openHat: ".... .... .... x..." },
          },
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
  },

  // Time is on the hat.
  timekeepers: ["closedHat"],

  touches: [],

  fills: {
    // Two steps or four (ST-country-04): none inside a quiet section, a two-step pickup at a
    // phrase's end above it; four into a new section, two in a ballad.
    length: {
      phrase: { low: 0, mid: 2, high: 2 },
      section: { low: 2, mid: 4, high: 4 },
    },
    phrase: {
      low: both(1, CROSS_PICKUP),
      mid: [...both(2, SNARE_PICKUP), ...both(1, RIMSHOT)],
      high: [...both(2, SNARE_PICKUP), ...both(1, RIMSHOT)],
    },
    section: {
      low: both(1, CROSS_PICKUP),
      mid: [...both(2, SNARE_PICKUP), ...both(1, RIMSHOT)],
      high: [...both(2, SNARE_PICKUP), ...both(1, RIMSHOT)],
    },
    // Into the top of the form, a bigger section, or the last chord: hot, the roll or the floor
    // tom now and then.
    top: {
      low: both(1, CROSS_PICKUP),
      mid: [...both(2, SNARE_PICKUP), ...both(1, RIMSHOT)],
      high: [
        ...both(2, SNARE_PICKUP),
        ...both(1, RIMSHOT),
        ...both(1, ROLL),
        ...both(1, FLOOR_PUSH),
      ],
    },
  },

  // Crash and kick on 1, as the blues (ST-country-10).
  ending: { strike: { crash: "X", kick: "X" } },
};
