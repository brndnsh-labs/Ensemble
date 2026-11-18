// The rock drummer: a straight-eighth backbeat. Kick on 1 and 3 in every
// pattern, the snare cracked on 2 and 4, the hat on every eighth, and fills
// that go round the toms (ST-rock-04 to ST-rock-10).
//
// Reading the grids: sixteen sixteenths to the bar, grouped by beat, "1 e & a".
// The band plays straight eighths, so the time uses only beats and "and"s; the
// sixteenth run is the only thing that uses the "e" and the "a".
// X accent, x normal, o soft, g ghost, "-" the stroke taken away.

import type { DrumStyle, DrumTime, FillShape, GrooveOption } from "@ensemble/engine";

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

// ── in twelve ───────────────────────────────────────────────────────────────
// The rock ballad and the fifties slow dance. A bar of 12/8 is four slow pulses
// of three eighths: twenty-four sixteenths, written in sixes, a pulse to a
// group, and only its three eighths (the first, third and fifth character) are
// ever struck. Nothing swings: the three eighths are the triplet.
//
// The rules of four said in pulses (AU-97): the kick on 1 and 3, the backbeat on
// 2 and 4, and "the and" is a pulse's last eighth, the pickup into the next. From
// the working level up the cymbal plays all twelve eighths, the pulse leaned on.
// Quiet it is rock's quiet hat said in pulses, the pulse and a ghost on its last
// eighth, and never the triplet's middle note: the drums thin out (AU-96, EAR-11).
// Fills are in eighths.

/**
 * The kicks of four, each "and" moved to the pulse's last eighth. All keep 1 and 3, and the
 * same weights, so a section that pushes its kick in four pushes it in twelve. The fifth of
 * four (the "and"s of 1 and 3 together) is left out: with a turn in an answer bar it put the
 * kick and the snare on seven of the twelve eighths, the busy drums heard in six (EAR-11).
 */
const TWELVE_KICKS = [
  { lines: { kick: "x..... ...... x..... ......" }, weights: [6, 3, 1] },
  // The "and" of 3: a pickup into the backbeat on 4.
  { lines: { kick: "x..... ...... x...x. ......" }, weights: [2, 4, 4] },
  // The "and" of 2: a pickup into 3.
  { lines: { kick: "x..... ....x. x..... ......" }, weights: [1, 3, 3] },
  // The "and" of 4, kicking the band into the next bar.
  { lines: { kick: "x..... ...... x..... ....x." }, weights: [1, 2, 3] },
] as const;

/** The section's kicks at a tier: quiet, a kick off the pulse is soft, as in four. */
function twelveKicks(tier: 0 | 1 | 2): GrooveOption[] {
  return TWELVE_KICKS.map((kick) => ({
    weight: kick.weights[tier],
    lines:
      tier === 0
        ? {
            kick: kick.lines.kick.replace(/\S/g, (c, at) => (c === "x" && at % 7 !== 0 ? "o" : c)),
          }
        : kick.lines,
  }));
}

/** Two and four, cracked. */
const TWELVE_BACKBEAT = { snare: "...... X..... ...... X....." };

/** The turns of four, each on a pulse's last eighth. */
const TWELVE_QUIET_TURNS: GrooveOption[] = [
  { weight: 2, lines: { kick: "...... ...... ...... ....o." } },
  { weight: 1, lines: { kick: "...... ...... ....o. ......" } },
];
const TWELVE_KICK_FOUR_AND = { weight: 3, lines: { kick: "...... ...... ...... ....x." } };
const TWELVE_KICK_THREE_AND = { weight: 2, lines: { kick: "...... ...... ....x. ......" } };
const TWELVE_OPEN_FOUR_AND = { weight: 2, lines: { openHat: "...... ...... ...... ....o." } };
const TWELVE_SNARE_FOUR_AND = { weight: 1, lines: { snare: "...... ...... ...... ....o." } };
const TWELVE_HAT_TURNS: GrooveOption[] = [
  TWELVE_KICK_FOUR_AND,
  TWELVE_KICK_THREE_AND,
  TWELVE_OPEN_FOUR_AND,
  TWELVE_SNARE_FOUR_AND,
];
const TWELVE_RIDE_TURNS: GrooveOption[] = [
  TWELVE_KICK_FOUR_AND,
  TWELVE_KICK_THREE_AND,
  TWELVE_SNARE_FOUR_AND,
];

// Fills in twelve: the shapes of four in eighths, at an eighth (the pickup), a pulse and
// two pulses, each ending on the bar's last eighth, the last stroke the loudest. The kick
// holds the pulses under a fill that leaves the time (ST-rock-09).

/** The kick on each pulse under a fill of two. */
const TWELVE_KICK_UNDER = "x..... x.....";

const TWELVE_TOM_RUN = {
  two: { lowTom: "X." },
  six: { highTom: "x.....", midTom: "..o...", lowTom: "....X.", kick: "x....." },
  twelve: {
    snare: "x.o... ......",
    highTom: "....o. ......",
    midTom: "...... x.o...",
    lowTom: "...... ....X.",
    kick: TWELVE_KICK_UNDER,
  },
};
/** The sixteenth run of four, as every eighth down the kit. */
const TWELVE_EIGHTH_RUN = {
  two: { highTom: "X." },
  six: { snare: "x.....", highTom: "..o...", lowTom: "....X.", kick: "x....." },
  twelve: {
    snare: "x.o.o. ......",
    highTom: "...... x.....",
    midTom: "...... ..o...",
    lowTom: "...... ....X.",
    kick: TWELVE_KICK_UNDER,
  },
};
const TWELVE_SNARE_BUILD = {
  two: { snare: "X." },
  six: { snare: "o.x.X.", kick: "x....." },
  twelve: { snare: "o.o.x. x.x.X.", kick: TWELVE_KICK_UNDER },
};
const TWELVE_FLOOR_UNISON = {
  two: { snare: "X.", lowTom: "X." },
  six: { snare: "x...X.", lowTom: "x...X.", kick: "x....." },
  twelve: { snare: "x...x. x...X.", lowTom: "x...x. x...X.", kick: TWELVE_KICK_UNDER },
};
/** The pickup: the hat on 4 and the snare into the One, or the last eighth alone. */
const TWELVE_PICKUP = {
  two: { snare: "X." },
  six: { closedHat: "x.....", snare: "..o.X." },
};
const TWELVE_PICKUP_HOT = { two: TWELVE_PICKUP.two, six: { snare: "..o.X." } };

type TwelveShape = {
  two: FillShape["lines"];
  six: FillShape["lines"];
  twelve?: FillShape["lines"];
};

/** Every length of a shape in twelve at one weight. */
function everyInTwelve(weight: number, shape: TwelveShape): FillShape[] {
  return [shape.two, shape.six, ...(shape.twelve ? [shape.twelve] : [])].map((lines) => ({
    weight,
    lines,
  }));
}

const rockDrumsInTwelve: DrumTime = {
  grooves: {
    // Quiet: the pulse and a ghost on its last eighth, the backbeat (a cross-stick below
    // 0.30), mostly the plain kick, and the turn on the foot.
    low: [
      {
        id: "time",
        hold: "section",
        options: [{ weight: 1, lines: { closedHat: "o...g. o...g. o...g. o...g." } }],
      },
      { id: "kick", hold: "section", options: twelveKicks(0) },
      {
        id: "snare",
        hold: "section",
        when: { energyFrom: 0.3 },
        options: [{ weight: 1, lines: { snare: "...... x..... ...... x....." } }],
      },
      {
        id: "rim",
        hold: "section",
        when: { energyBelow: 0.3 },
        options: [{ weight: 1, lines: { crossStick: "...... x..... ...... x....." } }],
      },
      {
        id: "turn",
        hold: "section",
        when: { phraseBars: ANSWER_BARS },
        audible: true,
        options: TWELVE_QUIET_TURNS,
      },
    ],

    // The working ballad: the hat on every eighth, the pulse leaned on, the backbeat cracked.
    mid: [
      {
        id: "time",
        hold: "section",
        options: [{ weight: 1, lines: { closedHat: "x.o.o. x.o.o. x.o.o. x.o.o." } }],
      },
      { id: "kick", hold: "section", options: twelveKicks(1) },
      { id: "snare", hold: "section", options: [{ weight: 1, lines: TWELVE_BACKBEAT }] },
      {
        id: "turn",
        hold: "section",
        when: { phraseBars: ANSWER_BARS, playing: "closedHat" },
        audible: true,
        options: TWELVE_HAT_TURNS,
      },
    ],

    // Hot: half the sections ride with the hat foot on 2 and 4; the others drive the hat on
    // every eighth, unaccented, as in four.
    high: [
      {
        id: "time",
        hold: "section",
        options: [
          {
            weight: 1,
            lines: {
              ride: "x.o.o. x.o.o. x.o.o. x.o.o.",
              pedalHat: "...... x..... ...... x.....",
            },
          },
          { weight: 1, lines: { closedHat: "x.x.x. x.x.x. x.x.x. x.x.x." } },
        ],
      },
      { id: "kick", hold: "section", options: twelveKicks(2) },
      { id: "snare", hold: "section", options: [{ weight: 1, lines: TWELVE_BACKBEAT }] },
      {
        id: "turn",
        hold: "section",
        when: { phraseBars: ANSWER_BARS, playing: "closedHat" },
        audible: true,
        options: TWELVE_HAT_TURNS,
      },
      {
        id: "turn-on-the-ride",
        hold: "section",
        when: { phraseBars: ANSWER_BARS, playing: "ride" },
        audible: true,
        options: TWELVE_RIDE_TURNS,
      },
    ],
  },

  touches: [],

  fills: {
    // ST-rock-08 in twelve: an eighth, a pulse, two pulses.
    length: {
      phrase: { low: 2, mid: 6, high: 6 },
      section: { low: 6, mid: 6, high: 12 },
    },
    phrase: {
      low: [
        ...everyInTwelve(3, TWELVE_PICKUP),
        ...everyInTwelve(2, TWELVE_SNARE_BUILD),
        ...everyInTwelve(1, TWELVE_TOM_RUN),
      ],
      mid: [
        ...everyInTwelve(3, TWELVE_PICKUP),
        ...everyInTwelve(2, TWELVE_SNARE_BUILD),
        ...everyInTwelve(1, TWELVE_TOM_RUN),
      ],
      high: [
        ...everyInTwelve(3, TWELVE_PICKUP_HOT),
        ...everyInTwelve(2, TWELVE_SNARE_BUILD),
        ...everyInTwelve(1, TWELVE_TOM_RUN),
      ],
    },
    section: [
      ...everyInTwelve(3, TWELVE_TOM_RUN),
      ...everyInTwelve(2, TWELVE_SNARE_BUILD),
      ...everyInTwelve(2, TWELVE_FLOOR_UNISON),
    ],
    top: [
      ...everyInTwelve(3, TWELVE_EIGHTH_RUN),
      ...everyInTwelve(2, TWELVE_FLOOR_UNISON),
      ...everyInTwelve(1, TWELVE_TOM_RUN),
    ],
  },
};

// ── in six ──────────────────────────────────────────────────────────────────
// The rock ballad in six-eight, the heavy two. A bar of 6/8 is two slow pulses
// of three eighths: twelve sixteenths, written in sixes. It is one strong pulse
// and one answering it, not half a bar of twelve: there is no beat 3, so the kick
// has the One and the backbeat the second pulse (SU-D-14). The cymbal and the
// backbeat are twelve's first half (`halfOf`): the basic beat is the same bar cut.
// The kicks, the turns and the fills are written for a bar of two, and held to
// what the notes heard as too busy in six on rock (EAR-11, AU-96): the kick and
// the snare never on more than three of the six eighths, a turn that moves the
// kick's pickup rather than add one, fills of an eighth, two, or a pulse at most.

/** The first half of a line written for twelve: the same beat in a bar of six. */
const halfOf = (line: string) => line.split(" ").slice(0, 2).join(" ");

/**
 * Three kicks, each with the One and at most one pickup: none, the "and" of 1 into the
 * backbeat, or the bar's last eighth into the next One. Twelve's weights for its pickups into
 * 4 and into the One; its pickup into 3 has no bar of six to be in.
 */
const SIX_KICKS = [
  { lines: { kick: "x..... ......" }, weights: [6, 3, 1] },
  { lines: { kick: "x...x. ......" }, weights: [2, 4, 4] },
  { lines: { kick: "x..... ....x." }, weights: [1, 3, 4] },
] as const;

/** The section's kicks at a tier: quiet, a kick off the pulse is soft, as in four and twelve. */
function sixKicks(tier: 0 | 1 | 2): GrooveOption[] {
  return SIX_KICKS.map((kick) => ({
    weight: kick.weights[tier],
    lines:
      tier === 0
        ? {
            kick: kick.lines.kick.replace(/\S/g, (c, at) => (c === "x" && at % 7 !== 0 ? "o" : c)),
          }
        : kick.lines,
  }));
}

const SIX_BACKBEAT = { snare: halfOf(TWELVE_BACKBEAT.snare) };

/**
 * The turns, in an answer bar: four's "and" of 4 and "and" of 3 are the bar's last eighth and
 * the first pulse's last. In a bar of two the kick's pickup is moved, never added, so the kick
 * and the snare stay on half the eighths: where the section's kick already has the turn's
 * eighth, the next turn that would be heard is played.
 */
const SIX_QUIET_TURNS: GrooveOption[] = [
  { weight: 2, lines: { kick: "....-. ....o." } },
  { weight: 1, lines: { kick: "....o. ....-." } },
];
const SIX_KICK_LAST = { weight: 3, lines: { kick: "....-. ....x." } };
const SIX_KICK_FIRST_AND = { weight: 2, lines: { kick: "....x. ....-." } };
const SIX_OPEN_LAST = { weight: 2, lines: { openHat: "...... ....o." } };
/** The snare answering its own backbeat on the last eighth, the kick giving its pickups up. */
const SIX_SNARE_LAST = { weight: 1, lines: { snare: "...... ....o.", kick: "....-. ....-." } };
const SIX_HAT_TURNS: GrooveOption[] = [
  SIX_KICK_LAST,
  SIX_KICK_FIRST_AND,
  SIX_OPEN_LAST,
  SIX_SNARE_LAST,
];
const SIX_RIDE_TURNS: GrooveOption[] = [SIX_KICK_LAST, SIX_KICK_FIRST_AND, SIX_SNARE_LAST];

// Fills in six: an eighth, the bar's last two eighths, or the last pulse; each ends on the
// bar's last eighth, the last stroke the loudest. A fill of a pulse is the backbeat's pulse,
// so it starts on the snare there (DR-46): a bar of six never loses its backbeat.
const SIX_TOM_RUN = {
  two: { lowTom: "X." },
  four: { midTom: "x...", lowTom: "..X." },
  six: { snare: "x.....", midTom: "..o...", lowTom: "....X." },
};
const SIX_EIGHTH_RUN = {
  two: { highTom: "X." },
  four: { highTom: "x...", lowTom: "..X." },
  six: { snare: "x.....", highTom: "..o...", lowTom: "....X." },
};
const SIX_SNARE_BUILD = {
  two: { snare: "X." },
  four: { snare: "o.X." },
  six: { snare: "x.o.X." },
};
const SIX_FLOOR_UNISON = {
  two: { snare: "X.", lowTom: "X." },
  four: { snare: "x.X.", lowTom: "x.X." },
  six: { snare: "x...X.", lowTom: "x...X." },
};
/** The pickup: the snare into the One, or its last two eighths. */
const SIX_PICKUP = { two: { snare: "X." }, four: { snare: "o.X." } };

type SixShape = {
  two: FillShape["lines"];
  four: FillShape["lines"];
  six?: FillShape["lines"];
};

/** Every length of a shape in six at one weight. */
function everyInSix(weight: number, shape: SixShape): FillShape[] {
  return [shape.two, shape.four, ...(shape.six ? [shape.six] : [])].map((lines) => ({
    weight,
    lines,
  }));
}

const rockDrumsInSix: DrumTime = {
  grooves: {
    low: [
      {
        id: "time",
        hold: "section",
        options: [{ weight: 1, lines: { closedHat: halfOf("o...g. o...g. o...g. o...g.") } }],
      },
      { id: "kick", hold: "section", options: sixKicks(0) },
      {
        id: "snare",
        hold: "section",
        when: { energyFrom: 0.3 },
        options: [{ weight: 1, lines: { snare: "...... x....." } }],
      },
      {
        id: "rim",
        hold: "section",
        when: { energyBelow: 0.3 },
        options: [{ weight: 1, lines: { crossStick: "...... x....." } }],
      },
      {
        id: "turn",
        hold: "section",
        when: { phraseBars: ANSWER_BARS },
        audible: true,
        options: SIX_QUIET_TURNS,
      },
    ],
    mid: [
      {
        id: "time",
        hold: "section",
        options: [{ weight: 1, lines: { closedHat: halfOf("x.o.o. x.o.o. x.o.o. x.o.o.") } }],
      },
      { id: "kick", hold: "section", options: sixKicks(1) },
      { id: "snare", hold: "section", options: [{ weight: 1, lines: SIX_BACKBEAT }] },
      {
        id: "turn",
        hold: "section",
        when: { phraseBars: ANSWER_BARS, playing: "closedHat" },
        audible: true,
        options: SIX_HAT_TURNS,
      },
    ],
    high: [
      {
        id: "time",
        hold: "section",
        options: [
          {
            weight: 1,
            lines: {
              ride: halfOf("x.o.o. x.o.o. x.o.o. x.o.o."),
              pedalHat: "...... x.....",
            },
          },
          { weight: 1, lines: { closedHat: halfOf("x.x.x. x.x.x. x.x.x. x.x.x.") } },
        ],
      },
      { id: "kick", hold: "section", options: sixKicks(2) },
      { id: "snare", hold: "section", options: [{ weight: 1, lines: SIX_BACKBEAT }] },
      {
        id: "turn",
        hold: "section",
        when: { phraseBars: ANSWER_BARS, playing: "closedHat" },
        audible: true,
        options: SIX_HAT_TURNS,
      },
      {
        id: "turn-on-the-ride",
        hold: "section",
        when: { phraseBars: ANSWER_BARS, playing: "ride" },
        audible: true,
        options: SIX_RIDE_TURNS,
      },
    ],
  },

  touches: [],

  fills: {
    // ST-rock-08's steps, in a bar of two: a phrase an eighth quiet, two eighths above; a
    // section two eighths quiet, the last pulse above.
    length: {
      phrase: { low: 2, mid: 4, high: 4 },
      section: { low: 4, mid: 6, high: 6 },
    },
    phrase: {
      low: [
        ...everyInSix(3, SIX_PICKUP),
        ...everyInSix(2, SIX_SNARE_BUILD),
        ...everyInSix(1, SIX_TOM_RUN),
      ],
      mid: [
        ...everyInSix(3, SIX_PICKUP),
        ...everyInSix(2, SIX_SNARE_BUILD),
        ...everyInSix(1, SIX_TOM_RUN),
      ],
      high: [
        ...everyInSix(3, SIX_PICKUP),
        ...everyInSix(2, SIX_SNARE_BUILD),
        ...everyInSix(1, SIX_TOM_RUN),
      ],
    },
    section: [
      ...everyInSix(3, SIX_TOM_RUN),
      ...everyInSix(2, SIX_SNARE_BUILD),
      ...everyInSix(2, SIX_FLOOR_UNISON),
    ],
    top: [
      ...everyInSix(3, SIX_EIGHTH_RUN),
      ...everyInSix(2, SIX_FLOOR_UNISON),
      ...everyInSix(1, SIX_TOM_RUN),
    ],
  },
};

export const rockDrums: DrumStyle = {
  // The rock ballad in twelve-eight and in six-eight, written above.
  meters: { "12/8": rockDrumsInTwelve, "6/8": rockDrumsInSix },

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
