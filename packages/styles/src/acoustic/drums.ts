// The acoustic drummer: restraint. Quiet, a soft kick on the One with a
// cross-stick or a shaker and nothing else; at the working level a cross-stick
// backbeat or brushes over a kick that leans on 1 and breathes on 3; hot, a
// full snare backbeat with the hat and a shaker shimmering between. He varies
// with the foot and the hat, never with a crack (ST-acoustic-05 to ST-acoustic-11).
//
// Reading the grids: sixteen sixteenths to the bar, grouped by beat, "1 e & a".
// X accent, x normal, o soft, g ghost, "-" the stroke taken away. The notes' RM
// is the cross-stick, SH the shaker, TH and TL the high and the floor tom. The
// kit has no brushes: the shaker's sixteenths stand in for the sweep and a soft
// snare tap for the brush's backbeat (ST-acoustic-07).

import {
  type DrumStyle,
  type DrumTime,
  type FillShape,
  type GrooveOption,
  TIER_HIGH,
} from "@ensemble/engine";

// ── the time ────────────────────────────────────────────────────────────────

const SHAKER_EIGHTHS = "o.g. o.g. o.g. o.g.";
const SOFT_KICK = "o... .... .... ....";

/** Quiet, one groove a section (ST-acoustic-05). Never a snare. */
const QUIET: GrooveOption[] = [
  // Half-time: the kick on 1, the cross-stick on 3, shaker eighths.
  {
    weight: 2,
    lines: { kick: SOFT_KICK, crossStick: ".... .... x... ....", shaker: SHAKER_EIGHTHS },
  },
  // The cross-stick on 2 and 4.
  { weight: 2, lines: { kick: SOFT_KICK, crossStick: ".... x... .... x..." } },
  // The shaker alone.
  { weight: 1, lines: { kick: SOFT_KICK, shaker: SHAKER_EIGHTHS } },
];

/** The kick from the working level up, one a section: beat 3 and the pickups soft (ST-acoustic-06). */
const KICKS: GrooveOption[] = [
  { weight: 3, lines: { kick: "x... .... o... ...." } },
  { weight: 1, lines: { kick: "x... ..o. o... ...." } },
  { weight: 1, lines: { kick: "x... .... o... ..o." } },
];

/** A cross-stick backbeat (ST-acoustic-07). */
const STICK = ".... x... .... x...";

/**
 * The working level's hands, one choice a section (ST-acoustic-07): brushes in
 * 35% of sections (the shaker on every sixteenth swelling on each beat, a soft
 * snare tap on 2 and 4 with the hat foot); the rest a cross-stick backbeat over
 * eighths on the hat or on the shaker, half each.
 */
const HANDS: GrooveOption[] = [
  {
    weight: 35,
    lines: {
      shaker: "oggg oggg oggg oggg",
      snare: ".... o... .... o...",
      pedalHat: ".... o... .... o...",
    },
  },
  { weight: 32.5, lines: { crossStick: STICK, closedHat: "o.g. o.g. o.g. o.g." } },
  { weight: 32.5, lines: { crossStick: STICK, shaker: SHAKER_EIGHTHS } },
];

/**
 * Hot: the full snare, the shaker shimmering on the "e"s and "a"s, and the hat
 * on the eighths; in 40% of sections the hat opens softly on the "and" of 4
 * (ST-acoustic-08).
 */
const HOT = { snare: ".... X... .... X...", shaker: ".g.g .g.g .g.g .g.g" };
const HOT_HATS: GrooveOption[] = [
  { weight: 60, lines: { closedHat: "x.o. x.o. x.o. x.o." } },
  { weight: 40, lines: { closedHat: "x.o. x.o. x.o. x...", openHat: ".... .... .... ..o." } },
];

/** The second bar of each pair: where the beat answers itself (DR-05). */
const ANSWER_BARS = [2, 4, 6, 8, 10, 12, 14, 16];

// The answers, all soft (ST-acoustic-09).
const KICK_AND_OF_FOUR = { kick: ".... .... .... ..o." };
const KICK_AND_OF_THREE = { kick: ".... .... ..o. ...." };
const HAT_BREATH_ON_FOUR = { openHat: ".... .... .... ..o.", closedHat: ".... .... .... ..-." };

/** Quiet: a soft kick on the "and" of 3 or of 4. */
const QUIET_ANSWERS: GrooveOption[] = [
  { weight: 1, lines: KICK_AND_OF_THREE },
  { weight: 1, lines: KICK_AND_OF_FOUR },
];
/** Where the hat is not keeping time (the shaker, the brushes): the foot alone. */
const FOOT_ANSWERS: GrooveOption[] = [
  { weight: 2, lines: KICK_AND_OF_FOUR },
  { weight: 1, lines: KICK_AND_OF_THREE },
];
/** Where the hat keeps time it may also breathe open on the "and" of 4. */
const HAT_ANSWERS: GrooveOption[] = [...FOOT_ANSWERS, { weight: 1, lines: HAT_BREATH_ON_FOUR }];
/** Hot, a ghost on the snare on the "a" of 4 as well. */
const HOT_ANSWERS: GrooveOption[] = [
  ...HAT_ANSWERS,
  { weight: 1, lines: { snare: ".... .... .... ...g" } },
];

// ── fills ───────────────────────────────────────────────────────────────────
// Pickups, two steps or four, ending on the last sixteenth before the One, and
// never accented: no crack into a verse (ST-acoustic-10, ST-acoustic-11).

type Pickup = { readonly two: FillShape["lines"]; readonly four: FillShape["lines"] };

const SNARE_PICKUP: Pickup = { two: { snare: "ox" }, four: { snare: "o.x." } };
const CROSS_PICKUP: Pickup = { two: { crossStick: "ox" }, four: { crossStick: "o.ox" } };
const HAT_BREATH: Pickup = {
  two: { openHat: "o.", snare: ".o" },
  four: { closedHat: "x...", openHat: "..o.", snare: "...o" },
};
/** The brush's swirl. */
const SWIRL: Pickup = { two: { snare: "go" }, four: { snare: "ggoo" } };
const TOM_PICKUP: Pickup = { two: { lowTom: "x." }, four: { highTom: "o...", lowTom: "..x." } };

/** Both lengths of a shape at one weight. */
const both = (weight: number, shape: Pickup): FillShape[] => [
  { weight, lines: shape.two },
  { weight, lines: shape.four },
];

// ── in six ──────────────────────────────────────────────────────────────────
// A bar of 6/8 is two slow pulses of three eighths, "ONE two three FOUR five
// six": twelve sixteenths, written in sixes, a pulse to a group, and only its
// three eighths (the first, third and fifth character) are ever struck. Nothing
// swings: the three eighths are the triplet. The same drummer as in four, said
// in pulses (AU-97): the kick on the first pulse, the backbeat (a cross-stick,
// a brush tap, the snare when hot) on the second, the eighths on a shaker or
// the hat, and he varies with the foot and the hat. In two there is no beat 3
// for a second kick: the second pulse is the backbeat (SU-D-14), so the kick
// leans on the One alone and its pickups are soft. Quiet it is thinner than in
// four (AU-96, EAR-11): it is under the guitar. Nothing is quicker than the
// eighth, so the shaker's sixteenths (the brushes' sweep, the hot shimmer)
// have no place in six; the brushes are the shaker on the eighths, swelling on
// each pulse, and hot the hat alone keeps the eighths.

const SIX_SHAKER = "o.g.g. o.g.g.";
const SIX_SOFT_KICK = "o..... ......";
const SIX_STICK = "...... x.....";

/** Quiet, one groove a section: the kick on the One and a cross-stick on four over the shaker; the two alone; or the shaker alone. Never a snare. */
const SIX_QUIET: GrooveOption[] = [
  { weight: 2, lines: { kick: SIX_SOFT_KICK, crossStick: SIX_STICK, shaker: SIX_SHAKER } },
  { weight: 2, lines: { kick: SIX_SOFT_KICK, crossStick: SIX_STICK } },
  { weight: 1, lines: { kick: SIX_SOFT_KICK, shaker: SIX_SHAKER } },
];

/**
 * The kick from the working level up: the One. In four it leans on 1 and breathes on 3 with
 * a soft pickup one section in five; in two the second pulse is the backbeat's, and the foot's
 * pickups are the answers' (below), so that the kick and the snare never take more than half
 * the bar's eighths (AU-96).
 */
const SIX_KICKS: GrooveOption[] = [{ weight: 1, lines: { kick: "x..... ......" } }];

/** The working level's hands: the brushes in 35% of sections (the shaker swelling on each pulse, a soft snare tap on four with the hat foot), the rest a cross-stick on four over the eighths on the hat or on the shaker. */
const SIX_HANDS: GrooveOption[] = [
  {
    weight: 35,
    lines: { shaker: SIX_SHAKER, snare: "...... o.....", pedalHat: "...... o....." },
  },
  { weight: 32.5, lines: { crossStick: SIX_STICK, closedHat: "o.g.g. o.g.g." } },
  { weight: 32.5, lines: { crossStick: SIX_STICK, shaker: SIX_SHAKER } },
];

/** Hot: the full snare on four, the hat on the eighths; in 40% of sections the hat opens softly on the last eighth. */
const SIX_HOT = { snare: "...... X....." };
const SIX_HOT_HATS: GrooveOption[] = [
  { weight: 60, lines: { closedHat: "x.o.o. x.o.o." } },
  { weight: 40, lines: { closedHat: "x.o.o. x.o...", openHat: "...... ....o." } },
];

// The answers, all soft: the foot on the last eighth of either pulse, the hat breathing open
// on the last eighth where it keeps time, hot a ghost on the snare into the One.
const SIX_KICK_LAST = { kick: "...... ....o." };
const SIX_KICK_INTO_FOUR = { kick: "....o. ......" };
const SIX_HAT_BREATH = { openHat: "...... ....o.", closedHat: "...... ....-." };
const SIX_QUIET_ANSWERS: GrooveOption[] = [
  { weight: 1, lines: SIX_KICK_INTO_FOUR },
  { weight: 1, lines: SIX_KICK_LAST },
];
const SIX_FOOT_ANSWERS: GrooveOption[] = [
  { weight: 2, lines: SIX_KICK_LAST },
  { weight: 1, lines: SIX_KICK_INTO_FOUR },
];
const SIX_HAT_ANSWERS: GrooveOption[] = [...SIX_FOOT_ANSWERS, { weight: 1, lines: SIX_HAT_BREATH }];
const SIX_HOT_ANSWERS: GrooveOption[] = [
  ...SIX_HAT_ANSWERS,
  { weight: 1, lines: { snare: "...... ....g." } },
];

// Fills in six: the same pickups, two steps or four before the One, on the eighths. Two steps
// is the bar's last eighth, one stroke; four its last two.
const SIX_SNARE_PICKUP: Pickup = { two: { snare: "x." }, four: { snare: "o.x." } };
const SIX_CROSS_PICKUP: Pickup = { two: { crossStick: "x." }, four: { crossStick: "o.x." } };
const SIX_HAT_BREATH_FILL: Pickup = {
  two: { openHat: "o." },
  four: { closedHat: "x...", openHat: "..o." },
};
/** The brush's swirl, in eighths: soft and growing. */
const SIX_SWIRL: Pickup = { two: { snare: "o." }, four: { snare: "g.o." } };
const SIX_TOM_PICKUP: Pickup = {
  two: { lowTom: "x." },
  four: { highTom: "o...", lowTom: "..x." },
};

const acousticDrumsInSix: DrumTime = {
  grooves: {
    low: [
      { id: "quiet", hold: "section", options: SIX_QUIET },
      {
        id: "answer",
        hold: "section",
        when: { phraseBars: ANSWER_BARS },
        options: SIX_QUIET_ANSWERS,
      },
    ],
    mid: [
      { id: "kick", hold: "section", options: SIX_KICKS },
      { id: "hands", hold: "section", options: SIX_HANDS },
      {
        id: "answer",
        hold: "section",
        when: { phraseBars: ANSWER_BARS, playing: "closedHat" },
        audible: true,
        options: SIX_HAT_ANSWERS,
      },
      {
        id: "foot",
        hold: "section",
        when: { phraseBars: ANSWER_BARS, playing: "shaker" },
        audible: true,
        options: SIX_FOOT_ANSWERS,
      },
    ],
    high: [
      { id: "kick", hold: "section", options: SIX_KICKS },
      { id: "backbeat", hold: "section", options: [{ weight: 1, lines: SIX_HOT }] },
      { id: "hat", hold: "section", options: SIX_HOT_HATS },
      {
        id: "answer",
        hold: "section",
        when: { phraseBars: ANSWER_BARS },
        audible: true,
        options: SIX_HOT_ANSWERS,
      },
    ],
  },
  touches: [],
  fills: {
    // As in four (ST-acoustic-10).
    length: {
      phrase: { low: 0, mid: 0, high: 2 },
      section: { low: 2, mid: 2, high: 4 },
    },
    phrase: {
      low: both(1, SIX_CROSS_PICKUP),
      mid: [...both(2, SIX_SNARE_PICKUP), ...both(1, SIX_HAT_BREATH_FILL)],
      high: [...both(2, SIX_SNARE_PICKUP), ...both(1, SIX_HAT_BREATH_FILL)],
    },
    section: {
      low: [...both(2, SIX_CROSS_PICKUP), ...both(1, SIX_SWIRL)],
      mid: [...both(2, SIX_SNARE_PICKUP), ...both(1, SIX_HAT_BREATH_FILL), ...both(1, SIX_SWIRL)],
      high: [
        ...both(1, SIX_SNARE_PICKUP),
        ...both(1, SIX_TOM_PICKUP),
        ...both(1, SIX_HAT_BREATH_FILL),
      ],
    },
    top: {
      low: [...both(1, SIX_CROSS_PICKUP), ...both(1, SIX_SWIRL)],
      mid: [...both(2, SIX_HAT_BREATH_FILL), ...both(1, SIX_SNARE_PICKUP)],
      high: [...both(2, SIX_TOM_PICKUP), ...both(1, SIX_SNARE_PICKUP)],
    },
  },
};

// ── in twelve ───────────────────────────────────────────────────────────────
// A bar of 12/8 is four slow pulses of three eighths, the slow folk ballad's
// bar: twenty-four sixteenths, written in sixes, a pulse to a group, and only
// its three eighths are ever struck. Nothing swings. Four's drummer said in
// pulses (AU-97), each beat of four a pulse: the kick on 1 with a soft one on
// 3, the backbeat (a cross-stick, a brush tap, the snare when hot) on 2 and 4,
// the answers on the foot and the hat on a pulse's last eighth, which is "the
// and" (ST-acoustic-04 to -09). What is six's and not four's: the eighths on the
// shaker or the hat are all three of each pulse, the pulse leaned on (six's
// `o.g.g.`, four times), and nothing is quicker than the eighth, so the brushes
// are the shaker's eighths and hot has no shimmer. The fills are six's: a
// pickup of an eighth or two before the barline, the same in any bar of
// dotted pulses.

/** Six's line, said twice: where a bar of twelve is a bar of six spread out. */
const twice = (line: string) => `${line} ${line}`;

const TWELVE_SHAKER = twice(SIX_SHAKER);
const TWELVE_SOFT_KICK = "o..... ...... ...... ......";
/** The backbeat on 2 and 4: six's on its second pulse, twice. */
const TWELVE_STICK = twice(SIX_STICK);

/** Quiet, as four's: half-time (the cross-stick on 3), the cross-stick on 2 and 4, or the shaker alone. Never a snare. */
const TWELVE_QUIET: GrooveOption[] = [
  {
    weight: 2,
    lines: {
      kick: TWELVE_SOFT_KICK,
      crossStick: "...... ...... x..... ......",
      shaker: TWELVE_SHAKER,
    },
  },
  { weight: 2, lines: { kick: TWELVE_SOFT_KICK, crossStick: TWELVE_STICK } },
  { weight: 1, lines: { kick: TWELVE_SOFT_KICK, shaker: TWELVE_SHAKER } },
];

/** Four's kicks in pulses: 1 leaned on and 3 breathing, a soft pickup into 3 or into the next One one section in five each. */
const TWELVE_KICKS: GrooveOption[] = [
  { weight: 3, lines: { kick: "x..... ...... o..... ......" } },
  { weight: 1, lines: { kick: "x..... ....o. o..... ......" } },
  { weight: 1, lines: { kick: "x..... ...... o..... ....o." } },
];

/** The working hands, as four's: the brushes in 35% of sections, else the cross-stick over the eighths on the hat or the shaker. */
const TWELVE_HANDS: GrooveOption[] = [
  {
    weight: 35,
    lines: {
      shaker: TWELVE_SHAKER,
      snare: twice("...... o....."),
      pedalHat: twice("...... o....."),
    },
  },
  { weight: 32.5, lines: { crossStick: TWELVE_STICK, closedHat: twice("o.g.g. o.g.g.") } },
  { weight: 32.5, lines: { crossStick: TWELVE_STICK, shaker: TWELVE_SHAKER } },
];

/** Hot: the snare on 2 and 4, the hat on every eighth; in 40% of sections it opens softly on the bar's last eighth. */
const TWELVE_HOT = { snare: twice(SIX_HOT.snare) };
const TWELVE_HOT_HATS: GrooveOption[] = [
  { weight: 60, lines: { closedHat: twice("x.o.o. x.o.o.") } },
  {
    weight: 40,
    lines: { closedHat: "x.o.o. x.o.o. x.o.o. x.o...", openHat: "...... ...... ...... ....o." },
  },
];

// The answers, as four's: a soft kick on the "and" of 3 or of 4 (a pulse's last eighth), the hat
// breathing open on the "and" of 4 where it keeps time, hot a ghost on the snare into the One.
const TWELVE_KICK_AND_OF_FOUR = { kick: "...... ...... ...... ....o." };
const TWELVE_KICK_AND_OF_THREE = { kick: "...... ...... ....o. ......" };
const TWELVE_HAT_BREATH = {
  openHat: "...... ...... ...... ....o.",
  closedHat: "...... ...... ...... ....-.",
};
const TWELVE_QUIET_ANSWERS: GrooveOption[] = [
  { weight: 1, lines: TWELVE_KICK_AND_OF_THREE },
  { weight: 1, lines: TWELVE_KICK_AND_OF_FOUR },
];
const TWELVE_FOOT_ANSWERS: GrooveOption[] = [
  { weight: 2, lines: TWELVE_KICK_AND_OF_FOUR },
  { weight: 1, lines: TWELVE_KICK_AND_OF_THREE },
];
const TWELVE_HAT_ANSWERS: GrooveOption[] = [
  ...TWELVE_FOOT_ANSWERS,
  { weight: 1, lines: TWELVE_HAT_BREATH },
];
const TWELVE_HOT_ANSWERS: GrooveOption[] = [
  ...TWELVE_HAT_ANSWERS,
  { weight: 1, lines: { snare: "...... ...... ...... ....g." } },
];

const acousticDrumsInTwelve: DrumTime = {
  grooves: {
    low: [
      { id: "quiet", hold: "section", options: TWELVE_QUIET },
      {
        id: "answer",
        hold: "section",
        when: { phraseBars: ANSWER_BARS },
        options: TWELVE_QUIET_ANSWERS,
      },
    ],
    mid: [
      { id: "kick", hold: "section", options: TWELVE_KICKS },
      { id: "hands", hold: "section", options: TWELVE_HANDS },
      {
        id: "answer",
        hold: "section",
        when: { phraseBars: ANSWER_BARS, playing: "closedHat" },
        audible: true,
        options: TWELVE_HAT_ANSWERS,
      },
      {
        id: "foot",
        hold: "section",
        when: { phraseBars: ANSWER_BARS, playing: "shaker" },
        audible: true,
        options: TWELVE_FOOT_ANSWERS,
      },
    ],
    high: [
      { id: "kick", hold: "section", options: TWELVE_KICKS },
      { id: "backbeat", hold: "section", options: [{ weight: 1, lines: TWELVE_HOT }] },
      { id: "hat", hold: "section", options: TWELVE_HOT_HATS },
      {
        id: "answer",
        hold: "section",
        when: { phraseBars: ANSWER_BARS },
        audible: true,
        options: TWELVE_HOT_ANSWERS,
      },
    ],
  },
  touches: [],
  // Six's pickups: so many sixteenths before the barline, on the eighths, whatever the bar.
  fills: acousticDrumsInSix.fills,
};

export const acousticDrums: DrumStyle = {
  // Six-eight and twelve-eight, written above.
  meters: { "6/8": acousticDrumsInSix, "12/8": acousticDrumsInTwelve },

  grooves: {
    low: [
      { id: "quiet", hold: "section", options: QUIET },
      {
        id: "answer",
        hold: "section",
        when: { phraseBars: ANSWER_BARS },
        options: QUIET_ANSWERS,
      },
    ],

    mid: [
      { id: "kick", hold: "section", options: KICKS },
      { id: "hands", hold: "section", options: HANDS },
      {
        id: "answer",
        hold: "section",
        when: { phraseBars: ANSWER_BARS, playing: "closedHat" },
        audible: true,
        options: HAT_ANSWERS,
      },
      {
        id: "foot",
        hold: "section",
        when: { phraseBars: ANSWER_BARS, playing: "shaker" },
        audible: true,
        options: FOOT_ANSWERS,
      },
    ],

    high: [
      { id: "kick", hold: "section", options: KICKS },
      { id: "backbeat", hold: "section", options: [{ weight: 1, lines: HOT }] },
      { id: "hat", hold: "section", options: HOT_HATS },
      {
        id: "answer",
        hold: "section",
        when: { phraseBars: ANSWER_BARS },
        audible: true,
        options: HOT_ANSWERS,
      },
    ],
  },

  // Time is on the hat where there is one.
  timekeepers: ["closedHat"],
  // No crash below the hot level: a quiet band marks a new section with its pickup alone
  // (ST-acoustic-09: never with a crack). The notes give no crash at all; hot, the engine's
  // arrival crash stays.
  crashFrom: TIER_HIGH,

  touches: [],

  fills: {
    // Phrase: none until the band is hot, then two steps. Section: two, four hot (ST-acoustic-10).
    length: {
      phrase: { low: 0, mid: 0, high: 2 },
      section: { low: 2, mid: 2, high: 4 },
    },
    phrase: {
      low: both(1, CROSS_PICKUP),
      mid: [...both(2, SNARE_PICKUP), ...both(1, HAT_BREATH)],
      high: [...both(2, SNARE_PICKUP), ...both(1, HAT_BREATH)],
    },
    section: {
      low: [...both(2, CROSS_PICKUP), ...both(1, SWIRL)],
      mid: [...both(2, SNARE_PICKUP), ...both(1, HAT_BREATH), ...both(1, SWIRL)],
      high: [...both(1, SNARE_PICKUP), ...both(1, TOM_PICKUP), ...both(1, HAT_BREATH)],
    },
    top: {
      low: [...both(1, CROSS_PICKUP), ...both(1, SWIRL)],
      mid: [...both(2, HAT_BREATH), ...both(1, SNARE_PICKUP)],
      high: [...both(2, TOM_PICKUP), ...both(1, SNARE_PICKUP)],
    },
  },

  // The soft ending: a soft kick and a soft snare tap on the One, no cymbal (ST-acoustic-35).
  ending: { strike: { kick: "o", snare: "o" } },
};
