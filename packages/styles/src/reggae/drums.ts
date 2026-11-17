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

import {
  type DrumStyle,
  type DrumTime,
  type FillShape,
  type GrooveLayer,
  type GrooveOption,
  TIER_MID,
} from "@ensemble/engine";

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

// ── in twelve and in six ────────────────────────────────────────────────────
// Twelve is the reggae shuffle: the one drop with its hat on the triplet, the
// slow count's four beats each a pulse of three eighths. It is four's drummer
// said in pulses (AU-97): a beat is a pulse, its "and" the pulse's last eighth;
// four's straight eighths on the hat (`x.o.`) are the shuffle's long-short
// (`x...o.`), and its shuffled sixteenths, whose "a" picks up the next beat
// (`x.oo`), are the whole triplet (`x.o.o.`). The drop is on the third pulse,
// the bar's secondary downbeat (ST-reggae-04). Only the eighths are struck: the
// trace of swing on four's sixteenths has none to move here.
//
// Six is a bar of two: the One, empty, and the drop answering it on the second
// pulse, where the backbeat of a bar of two is (ST-reggae-04: the drop lands on
// the secondary downbeat when a bar has one, else on its backbeat pulses). Its
// hat is twelve's first half (`half`); the drop, the answers, the riddims and
// the fills are written for six. Between them the kick and the snare never take
// more than half of a bar's eighths (AU-96, EAR-11).
//
// Reading the grids: a pulse to a group of six sixteenths, "1 . & . a ."; only
// the first, third and fifth character of a group (the pulse's three eighths)
// is ever struck.

/** The first half of a line written for twelve: the same beat in a bar of six. */
const half = (line: string) => line.split(" ").slice(0, 2).join(" ");

const TWELVE_SOFT_DROP = {
  closedHat: "o...g. o...g. o...g. o...g.",
  kick: "...... ...... o..... ......",
  crossStick: "...... ...... x..... ......",
};
const TWELVE_ONE_DROP = {
  kick: "...... ...... X..... ......",
  crossStick: "...... ...... X..... ......",
};
/** The shuffle's long-short (55), or the whole triplet, whose last eighth picks up the next pulse (45). */
const TWELVE_HATS: GrooveOption[] = [
  { weight: 55, lines: { closedHat: "x...o. x...o. x...o. x...o." } },
  { weight: 45, lines: { closedHat: "x.o.o. x.o.o. x.o.o. x.o.o." } },
];
const TWELVE_LIFT = {
  openHat: "...... ...... ...... ....x.",
  closedHat: "...... ...... ...... ....-.",
};
const TWELVE_RIDDIMS: GrooveOption[] = [
  {
    // Steppers: the kick on every pulse, the hat on the pulses, the open hat on every last eighth.
    weight: 1,
    lines: {
      kick: "x..... x..... x..... x.....",
      snare: "...... ...... X..... ......",
      closedHat: "x..... x..... x..... x.....",
      openHat: "....x. ....x. ....x. ....x.",
    },
  },
  {
    // Rockers: the kick on 1 and 3, the hat's triplets.
    weight: 1,
    lines: {
      kick: "x..... ...... x..... ......",
      snare: "...... ...... X..... ......",
      closedHat: "x.o.o. x.o.o. x.o.o. x.o.o.",
    },
  },
];
/** Four's answers said in pulses: the pickup into the empty One, the drop echoed on its last eighth, the lift. */
const twelveAnswers = (hand: "crossStick" | "snare"): GrooveOption[] => [
  { weight: 2, lines: { [hand]: "...... ...... ...... ....o." } },
  { weight: 2, lines: { [hand]: "...... ...... ....o. ......" } },
  { weight: 1, lines: TWELVE_LIFT },
];

const SIX_SOFT_DROP = {
  closedHat: half(TWELVE_SOFT_DROP.closedHat),
  kick: "...... o.....",
  crossStick: "...... x.....",
};
const SIX_ONE_DROP = { kick: "...... X.....", crossStick: "...... X....." };
const SIX_HATS: GrooveOption[] = TWELVE_HATS.map((hat) => ({
  weight: hat.weight,
  lines: { closedHat: half(hat.lines.closedHat!) },
}));
const SIX_LIFT = { openHat: "...... ....x.", closedHat: "...... ....-." };
/**
 * In a bar of two the steppers' kick on every pulse and the rockers' on 1 and 3 are the same
 * two kicks, the One and the drop: the riddims differ by the hat.
 */
const SIX_RIDDIMS: GrooveOption[] = [
  {
    weight: 1,
    lines: {
      kick: "x..... x.....",
      snare: "...... X.....",
      closedHat: "x..... x.....",
      openHat: "....x. ....x.",
    },
  },
  {
    weight: 1,
    lines: {
      kick: "x..... x.....",
      snare: "...... X.....",
      closedHat: half(TWELVE_RIDDIMS[1]!.lines.closedHat!),
    },
  },
];
/**
 * In six the "and" of 3 and the "and" of 4 are one eighth, the drop's last: the pickup into
 * the empty One there (four's two answers on it), or the lift.
 */
const sixAnswers = (hand: "crossStick" | "snare"): GrooveOption[] => [
  { weight: 4, lines: { [hand]: "...... ....o." } },
  { weight: 1, lines: SIX_LIFT },
];

/** Four's tiers, with a compound bar's lines. */
function compoundGrooves(beat: {
  softDrop: GrooveOption["lines"];
  oneDrop: GrooveOption["lines"];
  hats: GrooveOption[];
  lift: GrooveOption["lines"];
  riddims: GrooveOption[];
  answers: (hand: "crossStick" | "snare") => GrooveOption[];
}): DrumTime["grooves"] {
  const answer = (hand: "crossStick" | "snare"): GrooveLayer => ({
    id: "answer",
    hold: "section",
    when: { phraseBars: ANSWER_BARS },
    audible: true,
    options: beat.answers(hand),
  });
  return {
    low: [{ id: "time", hold: "section", options: [{ weight: 1, lines: beat.softDrop }] }],
    mid: [
      { id: "hat", hold: "section", options: beat.hats },
      { id: "drop", hold: "section", options: [{ weight: 1, lines: beat.oneDrop }] },
      {
        id: "lift",
        hold: "section",
        options: [
          { weight: 60, lines: {} },
          { weight: 40, lines: beat.lift },
        ],
      },
      answer("crossStick"),
    ],
    high: [{ id: "riddim", hold: "song", options: beat.riddims }, answer("snare")],
  };
}

// Fills in twelve and six: four's shapes in eighths, short and late, each ending on the
// bar's last eighth. Four's two sixteenths are two eighths, the last two of the bar; its
// beat is the last pulse. In six the fills stay in the last two eighths, so that the drop on
// the second pulse is always played.

/** The two lengths of a shape: the last two eighths, and the last pulse. */
interface CompoundShape {
  readonly two: FillShape["lines"];
  readonly pulse: FillShape["lines"];
}

const RIM_PICKUP_IN_PULSES: CompoundShape = {
  two: { crossStick: "o.X." },
  pulse: { crossStick: "o.x.X." },
};
const THE_DROP_IN_PULSES: CompoundShape = {
  two: { crossStick: "..X." },
  pulse: { crossStick: "....X.", kick: "....x." },
};
const TOM_PICKUP_IN_PULSES: CompoundShape = {
  two: { highTom: "o...", lowTom: "..X." },
  pulse: { crossStick: "x.....", highTom: "..o...", lowTom: "....X." },
};
const SNARE_DRAG_IN_PULSES: CompoundShape = {
  two: { snare: "o.X." },
  pulse: { snare: "g.o.X." },
};
/** Four's roll of four sixteenths is the pulse's three eighths. */
const RIM_ROLL_IN_PULSES: CompoundShape = {
  two: { crossStick: "x.X." },
  pulse: { crossStick: "o.x.X." },
};

/** A shape at one weight: in twelve both its lengths, in six the last two eighths. */
const twelveFill = (weight: number, shape: CompoundShape): FillShape[] => [
  { weight, lines: shape.two },
  { weight, lines: shape.pulse },
];
const sixFill = (weight: number, shape: CompoundShape): FillShape[] => [
  { weight, lines: shape.two },
];

function compoundFills(
  at: (weight: number, shape: CompoundShape) => FillShape[],
  length: DrumTime["fills"]["length"],
): DrumTime["fills"] {
  return {
    length,
    phrase: [...at(3, RIM_PICKUP_IN_PULSES), ...at(2, THE_DROP_IN_PULSES)],
    section: [
      ...at(2, TOM_PICKUP_IN_PULSES),
      ...at(2, SNARE_DRAG_IN_PULSES),
      ...at(1, RIM_ROLL_IN_PULSES),
      ...at(1, RIM_PICKUP_IN_PULSES),
    ],
    top: [...at(3, TOM_PICKUP_IN_PULSES), ...at(1, SNARE_DRAG_IN_PULSES)],
  };
}

const reggaeDrumsInTwelve: DrumTime = {
  grooves: compoundGrooves({
    softDrop: TWELVE_SOFT_DROP,
    oneDrop: TWELVE_ONE_DROP,
    hats: TWELVE_HATS,
    lift: TWELVE_LIFT,
    riddims: TWELVE_RIDDIMS,
    answers: twelveAnswers,
  }),
  touches: [],
  // Four's lengths in eighths: a phrase none quiet, two eighths, a pulse hot; a section two
  // eighths quiet, a pulse from the working level up.
  fills: compoundFills(twelveFill, {
    phrase: { low: 0, mid: 4, high: 6 },
    section: { low: 4, mid: 6, high: 6 },
  }),
};

const reggaeDrumsInSix: DrumTime = {
  grooves: compoundGrooves({
    softDrop: SIX_SOFT_DROP,
    oneDrop: SIX_ONE_DROP,
    hats: SIX_HATS,
    lift: SIX_LIFT,
    riddims: SIX_RIDDIMS,
    answers: sixAnswers,
  }),
  touches: [],
  // The last two eighths at most: a pulse would be the drop's.
  fills: compoundFills(sixFill, {
    phrase: { low: 0, mid: 4, high: 4 },
    section: { low: 4, mid: 4, high: 4 },
  }),
};

export const reggaeDrums: DrumStyle = {
  // The shuffle in twelve and the bar of two in six, written above.
  meters: { "12/8": reggaeDrumsInTwelve, "6/8": reggaeDrumsInSix },

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
