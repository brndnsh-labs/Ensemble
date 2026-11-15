// The rock drummer: a straight-eighth backbeat. Kick on 1 and 3 in every
// pattern, the snare cracked on 2 and 4, the hat on every eighth, and fills
// that go round the toms (ST-rock-04 to ST-rock-10).
//
// Reading the grids: sixteen sixteenths to the bar, grouped by beat, "1 e & a".
// The band plays straight eighths, so the time uses only beats and "and"s; the
// sixteenth run is the only thing that uses the "e" and the "a".
// X accent, x normal, o soft, g ghost, "-" the stroke taken away.

import type { DrumStyle, FillShape, GrooveOption } from "@ensemble/engine";

// ── the time ────────────────────────────────────────────────────────────────

/**
 * The five kicks, one per section, every one with 1 and 3 (ST-rock-04). The
 * weights are low, mid, high: the plain kick when quiet, the pushes as the band
 * gets louder.
 */
const KICKS = [
  { lines: { kick: "x... .... x... ...." }, weights: [6, 3, 1] },
  // The "and" of 3.
  { lines: { kick: "x... .... x.x. ...." }, weights: [2, 4, 4] },
  // The "and" of 2.
  { lines: { kick: "x... ..x. x... ...." }, weights: [1, 3, 3] },
  // The "and" of 4, kicking the band into the next bar.
  { lines: { kick: "x... .... x... ..x." }, weights: [1, 2, 3] },
  { lines: { kick: "x.x. .... x.x. ...." }, weights: [0, 1, 3] },
] as const;

/**
 * The section's kicks at a tier. Quiet, a kick off the beat is soft, as the quiet answer
 * bar's is (ST-rock-07): a push said lightly. It is also what lets a quiet turn be heard
 * where the section's own kick already has that "and": the soft turn would change nothing,
 * so the other one is played.
 */
function kicks(tier: 0 | 1 | 2): GrooveOption[] {
  return KICKS.map((kick) => ({
    weight: kick.weights[tier],
    lines:
      tier === 0
        ? { kick: kick.lines.kick.replace(/\S/g, (c, at) => (c === "x" && at % 5 !== 0 ? "o" : c)) }
        : kick.lines,
  }));
}

/** Two and four, cracked. */
const BACKBEAT = { snare: ".... X... .... X..." };

/** Where the turns go: the second and fourth bars of a phrase (DR-05, ST-rock-07). */
const ANSWER_BARS = [2, 4, 6];

/** Quiet, the turn is the foot alone: a soft kick on the "and" of 4, or of 3 (ST-rock-07). */
const QUIET_TURNS: GrooveOption[] = [
  { weight: 2, lines: { kick: ".... .... .... ..o." } },
  { weight: 1, lines: { kick: ".... .... ..o. ...." } },
];

/**
 * Louder, the hands turn it too (ST-rock-07). In this order, so that a turn
 * the section's kick already plays gives way to the next one that would be heard.
 */
const KICK_FOUR_AND = { weight: 3, lines: { kick: ".... .... .... ..x." } };
const KICK_THREE_AND = { weight: 2, lines: { kick: ".... .... ..x. ...." } };
/** The hat opened on the "and" of 4: only where the hand is on the hat. */
const OPEN_FOUR_AND = { weight: 2, lines: { openHat: ".... .... .... ..o." } };
/** A soft snare on the "and" of 4 answering its own backbeat. */
const SNARE_FOUR_AND = { weight: 1, lines: { snare: ".... .... .... ..o." } };

const HAT_TURNS: GrooveOption[] = [KICK_FOUR_AND, KICK_THREE_AND, OPEN_FOUR_AND, SNARE_FOUR_AND];
const RIDE_TURNS: GrooveOption[] = [KICK_FOUR_AND, KICK_THREE_AND, SNARE_FOUR_AND];

// ── fills ───────────────────────────────────────────────────────────────────
// Whole shapes at each length the style asks for (two, four and eight sixteenths),
// each ending on the "and" of 4, the last stroke the loudest (DR-18). Under any
// fill that leaves the time the kick holds the quarter notes (ST-rock-09).

const TOM_RUN = {
  two: { midTom: "x.", lowTom: ".X" },
  four: { highTom: "x...", lowTom: "..X.", kick: "x..." },
  eight: {
    snare: "x... ....",
    highTom: "..o. ....",
    midTom: ".... o...",
    lowTom: ".... ..X.",
    kick: "x... x...",
  },
};
const SIXTEENTH_RUN = {
  two: { highTom: "o.", lowTom: ".X" },
  four: { snare: "x...", highTom: ".o..", midTom: "..o.", lowTom: "...X", kick: "x..." },
  eight: {
    snare: "xooo ....",
    highTom: ".... oo..",
    midTom: ".... ..o.",
    lowTom: ".... ...X",
    kick: "x... x...",
  },
};
const SNARE_BUILD = {
  two: { snare: "xX" },
  four: { snare: "oxxX", kick: "x..." },
  eight: { snare: "o.o. oxxX", kick: "x... x..." },
};
const FLOOR_UNISON = {
  two: { snare: "X.", lowTom: "X." },
  four: { snare: "x.X.", lowTom: "x.X.", kick: "x..." },
  eight: { snare: "x.x. x.X.", lowTom: "x.x. x.X.", kick: "x... x..." },
};
/** The pickup has no eight-step shape: it is a phrase fill, and those are four at most. */
const PICKUP = {
  two: { snare: "oX" },
  four: { closedHat: "x...", snare: "..oX" },
};
/**
 * Hot, the hand on 4 may be on the ride: the pickup leaves beat 4 to the feet rather than
 * strike a hat the section is not playing.
 */
const PICKUP_HOT = { two: PICKUP.two, four: { snare: "..oX" } };

type Shape = { two: FillShape["lines"]; four: FillShape["lines"]; eight?: FillShape["lines"] };

/** Every length of a shape at one weight. */
function every(weight: number, shape: Shape): FillShape[] {
  return [shape.two, shape.four, ...(shape.eight ? [shape.eight] : [])].map((lines) => ({
    weight,
    lines,
  }));
}

export const rockDrums: DrumStyle = {
  grooves: {
    // Quiet: a soft hat with its "and"s ghosted, the backbeat, mostly the plain kick, and the
    // turn on the foot. Below 0.30 the backbeat is a cross-stick (ST-rock-05).
    low: [
      {
        id: "time",
        hold: "section",
        options: [{ weight: 1, lines: { closedHat: "o.g. o.g. o.g. o.g." } }],
      },
      { id: "kick", hold: "section", options: kicks(0) },
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
      {
        id: "turn",
        hold: "section",
        when: { phraseBars: ANSWER_BARS },
        audible: true,
        options: QUIET_TURNS,
      },
    ],

    // The working beat: the hat on every eighth, the backbeat accented.
    mid: [
      {
        id: "time",
        hold: "section",
        options: [{ weight: 1, lines: { closedHat: "x.o. x.o. x.o. x.o." } }],
      },
      { id: "kick", hold: "section", options: kicks(1) },
      { id: "snare", hold: "section", options: [{ weight: 1, lines: BACKBEAT }] },
      {
        id: "turn",
        hold: "section",
        when: { phraseBars: ANSWER_BARS, playing: "closedHat" },
        audible: true,
        options: HAT_TURNS,
      },
    ],

    // Hot: half the sections ride (the chorus sound) with the hat foot on 2 and 4; the others
    // drive the hat with every beat accented (ST-rock-05).
    high: [
      {
        id: "time",
        hold: "section",
        options: [
          {
            weight: 1,
            lines: { ride: "x.o. x.o. x.o. x.o.", pedalHat: ".... x... .... x..." },
          },
          { weight: 1, lines: { closedHat: "x.x. x.x. x.x. x.x." } },
        ],
      },
      { id: "kick", hold: "section", options: kicks(2) },
      { id: "snare", hold: "section", options: [{ weight: 1, lines: BACKBEAT }] },
      // One turn per section; which of these two layers plays is the section's cymbal.
      {
        id: "turn",
        hold: "section",
        when: { phraseBars: ANSWER_BARS, playing: "closedHat" },
        audible: true,
        options: HAT_TURNS,
      },
      {
        id: "turn-on-the-ride",
        hold: "section",
        when: { phraseBars: ANSWER_BARS, playing: "ride" },
        audible: true,
        options: RIDE_TURNS,
      },
    ],
  },

  // Time is on the hat or the ride; a crash on an arrival takes that hand.
  timekeepers: ["closedHat", "ride"],

  touches: [],

  fills: {
    // ST-rock-08.
    length: {
      phrase: { low: 2, mid: 4, high: 4 },
      section: { low: 4, mid: 4, high: 8 },
    },
    // ST-rock-10. Inside a section: the pickup, the snare build, now and then the toms.
    phrase: {
      low: [...every(3, PICKUP), ...every(2, SNARE_BUILD), ...every(1, TOM_RUN)],
      mid: [...every(3, PICKUP), ...every(2, SNARE_BUILD), ...every(1, TOM_RUN)],
      high: [...every(3, PICKUP_HOT), ...every(2, SNARE_BUILD), ...every(1, TOM_RUN)],
    },
    // At the end of a section, round the toms.
    section: [...every(3, TOM_RUN), ...every(2, SNARE_BUILD), ...every(2, FLOOR_UNISON)],
    // Into the top of the form, a louder section, or the last hit.
    top: [...every(3, SIXTEENTH_RUN), ...every(2, FLOOR_UNISON), ...every(1, TOM_RUN)],
  },

  // Crash, kick and floor tom on the last chord, accented (ST-rock-30).
  ending: { strike: { crash: "X", kick: "X", lowTom: "X" } },
};
