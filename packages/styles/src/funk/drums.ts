// The funk drummer: sixteenth-note funk. A syncopated kick that has the One and
// stays off the backbeat, the backbeat cracked with ghost notes around it, and
// the hat running eighths when quiet and sixteenths above. The second bar of
// each pair turns its back half round; fills are a beat at most and never run
// down the toms (ST-funk-06 to ST-funk-14).
//
// Reading the grids: sixteen sixteenths to the bar, grouped by beat, "1 e & a".
// The band swings the sixteenths by a trace (ST-funk-02), so every step is
// playable. X accent, x normal, o soft, g ghost, "-" the stroke taken away.

import type { DrumStyle, DrumTime, FillShape, GrooveOption } from "@ensemble/engine";

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

// ── in twelve and in six ────────────────────────────────────────────────────
// Funk has no book of its own in compound time; this is the same drummer handed
// a chart in 12/8 or 6/8, his groove said in pulses of three eighths (AU-97).
// A bar of twelve is four slow pulses, twenty-four sixteenths written in sixes,
// and only a pulse's three eighths (the first, third and fifth character) are
// ever struck: nothing swings, and the trace of swing on the sixteenths has no
// sixteenths to move. A bar of six is two pulses, "ONE two three FOUR five six".
//
// What stays funk: the kick has the One and stays off the backbeat, and is
// syncopated in every bar (each kick has an eighth that is not a pulse); the
// backbeat is cracked at every level, on 2 and 4 in twelve, on the second pulse
// in six, where a bar of two has no beat 3 (SU-D-14); the hat keeps the time,
// quiet on each pulse and its last eighth (four's "x.o." said in pulses, never
// the triplet's middle eighth), and from the working level on every eighth, the
// pulse and its last eighth leaned on and the middle soft (four's "xoxo": its
// eighths leaned on, the sixteenths between soft); ghosts round the backbeat from
// the working level up; the hat opens on the last eighth of the bar and rings
// into the One; the second bar of each pair turns its back half round; fills are
// a pulse at most and never go down the toms. Between them the kick and the
// snare never take more than half the bar's eighths (AU-96, EAR-11): a kick has
// three strokes in twelve and two in six; a turn adds one kick in twelve, and in
// six, where there is no room for one, the quiet turn moves the kick and the
// louder turns are the hands'.
//
// The basic beat of six (the hat, the backbeat) is the first half of twelve's;
// the kicks, the ghosts, the turns and the fills are written for each, since a
// bar of six has one strong pulse and one answering it and room for half as many
// strokes.

/** The first half of a line written for twelve: the same beat in a bar of six. */
const halfOf = (line: string) => line.split(" ").slice(0, 2).join(" ");

const TWELVE_HAT_QUIET = { closedHat: "x...o. x...o. x...o. x...o." };
const TWELVE_HAT = { closedHat: "x.o.x. x.o.x. x.o.x. x.o.x." };
const TWELVE_BACKBEAT = { snare: "...... X..... ...... X....." };

/** Five kicks of three strokes, each with the One, none on 2 or 4, and an eighth off the pulse. */
const TWELVE_KICKS = [
  // The One, the "and" of 2 into 3, the middle of 3.
  { lines: { kick: "x..... ....x. ..x... ......" }, weights: [3, 3, 2] },
  // The One and its middle, 3 and its "and" into the backbeat.
  { lines: { kick: "x.x... ...... x...x. ......" }, weights: [1, 3, 3] },
  // The One and the pushes into 3 and into 4.
  { lines: { kick: "x..... ....x. ....x. ......" }, weights: [3, 2, 1] },
  // The One and its "and", and the middle of 4, straight after the backbeat.
  { lines: { kick: "x...x. ...... ...... ..x..." }, weights: [1, 2, 3] },
  // The One, the middle of 2 straight after the backbeat, the "and" of 3.
  { lines: { kick: "x..... ..x... ....x. ......" }, weights: [1, 2, 3] },
] as const;

/** The ghosts round the backbeat, one set a section from the working level up, off the pulses. */
const TWELVE_GHOSTS: GrooveOption[] = [
  { weight: 1, lines: { snare: "...... ....g. ..g... ..g..." } },
  { weight: 1, lines: { snare: "..g... ....g. ...... ....g." } },
  { weight: 1, lines: { snare: "..g... ..g... ..g... ..g..." } },
  { weight: 1, lines: { snare: "...... ....g. ...... ..g.g." } },
];

/** The hat opens on the bar's last eighth and rings into the One. */
const TWELVE_OPEN = {
  openHat: "...... ...... ...... ....x.",
  closedHat: "...... ...... ...... ....-.",
};

/** Quiet, the turn is the foot alone, a soft kick into 4 or into the One. */
const TWELVE_QUIET_TURNS: GrooveOption[] = [
  { weight: 1, lines: { kick: "...... ...... ....o. ......" } },
  { weight: 1, lines: { kick: "...... ...... ...... ....o." } },
];
/** Louder the hands turn it too, in four's order and weights. */
const TWELVE_TURNS: GrooveOption[] = [
  { weight: 2, lines: { kick: "...... ...... ....x. ......" } },
  { weight: 2, lines: { kick: "...... ...... ...... ....x." } },
  { weight: 2, lines: { snare: "...... ...... ...... ..g.g." } },
  { weight: 1, lines: TWELVE_OPEN },
];

const SIX_HAT_QUIET = { closedHat: halfOf(TWELVE_HAT_QUIET.closedHat) };
const SIX_HAT = { closedHat: halfOf(TWELVE_HAT.closedHat) };
const SIX_BACKBEAT = { snare: halfOf(TWELVE_BACKBEAT.snare) };

/**
 * Four kicks of two strokes, each with the One, none on the backbeat, and an eighth off the
 * pulse. Quiet only the two whose second stroke is in the back half, which the quiet turn
 * moves: a bar of two has room for the kick's two strokes and the backbeat and no more
 * (AU-96), so in six a turn moves a kick rather than add one, and moves only one that is in
 * the half it turns.
 */
const SIX_KICKS = [
  // The One and the push back into it.
  { lines: { kick: "x..... ....x." }, weights: [3, 3, 2] },
  // The One and its middle.
  { lines: { kick: "x.x... ......" }, weights: [0, 3, 3] },
  // The One and its "and", into the backbeat.
  { lines: { kick: "x...x. ......" }, weights: [0, 2, 1] },
  // The One and the middle of the backbeat's pulse, straight after it.
  { lines: { kick: "x..... ..x..." }, weights: [2, 2, 3] },
] as const;

/** None has both of the back half's off eighths, so a turn of ghosts there is always heard. */
const SIX_GHOSTS: GrooveOption[] = [
  { weight: 1, lines: { snare: "..g... ....g." } },
  { weight: 1, lines: { snare: "....g. ..g..." } },
  { weight: 1, lines: { snare: "..g... ..g..." } },
  { weight: 1, lines: { snare: "...... ....g." } },
];

const SIX_OPEN = { openHat: "...... ....x.", closedHat: "...... ....-." };

/** Quiet, the foot turns the bar: the kick in the back half moved to its other eighth. */
const SIX_QUIET_TURNS: GrooveOption[] = [
  { weight: 1, lines: { kick: "...... ..x.-." } },
  { weight: 1, lines: { kick: "...... ..-.x." } },
];
/** Louder the hands turn it, with ghosts round the backbeat or the hat opened into the One. */
const SIX_TURNS: GrooveOption[] = [
  { weight: 2, lines: { snare: "...... ..g.g." } },
  { weight: 1, lines: SIX_OPEN },
];

type Kicks = readonly {
  readonly lines: { readonly kick: string };
  readonly weights: readonly number[];
}[];
const kicksOf = (list: Kicks, tier: 0 | 1 | 2): GrooveOption[] =>
  list.map((kick) => ({ weight: kick.weights[tier]!, lines: kick.lines }));

/** The three tiers of a compound bar, as four's are built. */
function compoundGrooves(beat: {
  hatQuiet: GrooveOption["lines"];
  hat: GrooveOption["lines"];
  backbeat: GrooveOption["lines"];
  kicks: Kicks;
  ghosts: GrooveOption[];
  open: GrooveOption["lines"];
  quietTurns: GrooveOption[];
  turns: GrooveOption[];
}): DrumTime["grooves"] {
  const turn = (options: GrooveOption[]) => ({
    id: "turn",
    hold: "section" as const,
    when: { phraseBars: ANSWER_BARS },
    audible: true,
    options,
  });
  return {
    low: [
      { id: "hat", hold: "section", options: [{ weight: 1, lines: beat.hatQuiet }] },
      { id: "kick", hold: "section", options: kicksOf(beat.kicks, 0) },
      { id: "backbeat", hold: "section", options: [{ weight: 1, lines: beat.backbeat }] },
      turn(beat.quietTurns),
    ],
    mid: [
      { id: "hat", hold: "section", options: [{ weight: 1, lines: beat.hat }] },
      { id: "kick", hold: "section", options: kicksOf(beat.kicks, 1) },
      { id: "backbeat", hold: "section", options: [{ weight: 1, lines: beat.backbeat }] },
      { id: "ghosts", hold: "section", options: beat.ghosts },
      {
        id: "open",
        hold: "section",
        options: [
          { weight: 65, lines: {} },
          { weight: 35, lines: beat.open },
        ],
      },
      turn(beat.turns),
    ],
    high: [
      { id: "hat", hold: "section", options: [{ weight: 1, lines: beat.hat }] },
      { id: "kick", hold: "section", options: kicksOf(beat.kicks, 2) },
      { id: "backbeat", hold: "section", options: [{ weight: 1, lines: beat.backbeat }] },
      { id: "ghosts", hold: "section", options: beat.ghosts },
      { id: "open", hold: "section", options: [{ weight: 1, lines: beat.open }] },
      turn(beat.turns),
    ],
  };
}

// Fills in twelve and six: four's shapes in eighths, each ending on the bar's last eighth,
// the loudest stroke last, the right hand on the hat but in the hit and the snare build. The
// shortest is that eighth alone; the longest a pulse in twelve, and in six the bar's last two
// eighths, so that the second pulse's backbeat is still cracked (a pulse there is half the bar).

/** The last eighth alone: the snare under the hat, the band hit, the hat barking open. */
const EIGHTH_SNARE = { closedHat: "x.", snare: "X." };
const EIGHTH_HIT = { kick: "x.", snare: "X." };
const EIGHTH_BARK = { openHat: "x.", snare: "X." };

interface CompoundShape {
  readonly eighth: FillShape["lines"];
  readonly long: FillShape["lines"];
}

const TWELVE_FILL = {
  ghostDrag: { eighth: EIGHTH_SNARE, long: { closedHat: "x.x...", snare: "g.g.X." } },
  hit: { eighth: EIGHTH_HIT, long: { snare: "X...X.", kick: "..x..." } },
  kickSnare: {
    eighth: EIGHTH_SNARE,
    long: { closedHat: "x.x.x.", snare: "..g.X.", kick: "x....." },
  },
  hatCut: { eighth: EIGHTH_BARK, long: { openHat: "X.....", pedalHat: "..x...", snare: "..g.X." } },
  snareBuild: { eighth: { snare: "X." }, long: { snare: "o.x.X." } },
  quietKickSnare: {
    eighth: EIGHTH_SNARE,
    long: { closedHat: "x...x.", snare: "..g.X.", kick: "x....." },
  },
} satisfies Record<string, CompoundShape>;

const SIX_FILL = {
  ghostDrag: { eighth: EIGHTH_SNARE, long: { closedHat: "x...", snare: "g.X." } },
  hit: { eighth: EIGHTH_HIT, long: { snare: "..X.", kick: "x..." } },
  kickSnare: { eighth: EIGHTH_SNARE, long: { closedHat: "x.x.", snare: "..X.", kick: "x..." } },
  hatCut: { eighth: EIGHTH_BARK, long: { openHat: "X...", pedalHat: "..x.", snare: "..X." } },
  snareBuild: { eighth: { snare: "X." }, long: { snare: "x.X." } },
  quietKickSnare: {
    eighth: EIGHTH_SNARE,
    long: { closedHat: "x...", snare: "..X.", kick: "x..." },
  },
} satisfies Record<string, CompoundShape>;

/** Both lengths of a compound shape at one weight. */
function bothIn(weight: number, shape: CompoundShape): FillShape[] {
  return [
    { weight, lines: shape.eighth },
    { weight, lines: shape.long },
  ];
}

/** Four's vocabulary and weights, which fill where (ST-funk-12), in a compound bar's shapes. */
function compoundFills(fill: typeof TWELVE_FILL, long: number): DrumTime["fills"] {
  return {
    length: {
      phrase: { low: 2, mid: 2, high: long },
      section: { low: long, mid: long, high: long },
    },
    phrase: {
      low: [...bothIn(3, fill.ghostDrag), ...bothIn(1, fill.quietKickSnare)],
      mid: [...bothIn(3, fill.ghostDrag), ...bothIn(2, fill.hatCut), ...bothIn(1, fill.kickSnare)],
      high: [...bothIn(3, fill.ghostDrag), ...bothIn(2, fill.hatCut), ...bothIn(1, fill.kickSnare)],
    },
    section: {
      low: [
        ...bothIn(2, fill.quietKickSnare),
        ...bothIn(2, fill.hit),
        ...bothIn(1, fill.ghostDrag),
        ...bothIn(1, fill.snareBuild),
      ],
      mid: [
        ...bothIn(2, fill.kickSnare),
        ...bothIn(2, fill.hit),
        ...bothIn(1, fill.ghostDrag),
        ...bothIn(1, fill.snareBuild),
      ],
      high: [
        ...bothIn(2, fill.kickSnare),
        ...bothIn(2, fill.hit),
        ...bothIn(1, fill.ghostDrag),
        ...bothIn(1, fill.snareBuild),
      ],
    },
    top: {
      low: [...bothIn(3, fill.hit), ...bothIn(2, fill.snareBuild)],
      mid: [...bothIn(3, fill.hit), ...bothIn(2, fill.snareBuild), ...bothIn(1, fill.hatCut)],
      high: [...bothIn(3, fill.hit), ...bothIn(2, fill.snareBuild), ...bothIn(1, fill.hatCut)],
    },
  };
}

const funkDrumsInTwelve: DrumTime = {
  grooves: compoundGrooves({
    hatQuiet: TWELVE_HAT_QUIET,
    hat: TWELVE_HAT,
    backbeat: TWELVE_BACKBEAT,
    kicks: TWELVE_KICKS,
    ghosts: TWELVE_GHOSTS,
    open: TWELVE_OPEN,
    quietTurns: TWELVE_QUIET_TURNS,
    turns: TWELVE_TURNS,
  }),
  touches: [],
  fills: compoundFills(TWELVE_FILL, 6),
};

const funkDrumsInSix: DrumTime = {
  grooves: compoundGrooves({
    hatQuiet: SIX_HAT_QUIET,
    hat: SIX_HAT,
    backbeat: SIX_BACKBEAT,
    kicks: SIX_KICKS,
    ghosts: SIX_GHOSTS,
    open: SIX_OPEN,
    quietTurns: SIX_QUIET_TURNS,
    turns: SIX_TURNS,
  }),
  touches: [],
  fills: compoundFills(SIX_FILL, 4),
};

export const funkDrums: DrumStyle = {
  // The same drummer in twelve-eight and six-eight, written above.
  meters: { "12/8": funkDrumsInTwelve, "6/8": funkDrumsInSix },

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
