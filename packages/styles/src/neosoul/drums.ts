// The neo-soul drummer: a soft loop of two bars, like a sampled break. A lazily
// syncopated kick, one per section; the backbeat on 2 and 4 with ghosts round it
// from the working level up (a cross-stick and no snare when the band is very
// quiet); the hat feathered under everything. On the second bar of each pair
// the four may land a sixteenth late and, when hot, the hat breathes open.
// Fills barely exist (ST-neosoul-06 to ST-neosoul-12).
//
// Reading the grids: sixteen sixteenths to the bar, grouped by beat, "1 e & a".
// The band swings the sixteenths (ST-neosoul-02). X accent, x normal, o soft,
// g ghost, "-" the stroke taken away. The drums never lean: the band does.

import type { DrumStyle, DrumTime, GrooveLayer, GrooveOption } from "@ensemble/engine";

// ── the time ────────────────────────────────────────────────────────────────

/**
 * The five kicks, one per section, with their weights low, mid, high
 * (ST-neosoul-06). The expressive ones wait for the hot tier, so a quiet
 * section reads as laid back, not busy.
 */
const KICKS = [
  // Boom-bap: the One and the "and" of 3.
  { lines: { kick: "x... .... ..x. ...." }, weights: [3, 3, 1] },
  // Plain 1 and 3.
  { lines: { kick: "x... .... x... ...." }, weights: [2, 2, 1] },
  // A pickup on the "a" of 2 stumbling into the "and" of 3.
  { lines: { kick: "x... ...x ..x. ...." }, weights: [0, 2, 2] },
  // A stumble on the "a" of 1.
  { lines: { kick: "x..x .... ..x. ...." }, weights: [0, 1, 2] },
  // The Dilla skip: the "a" of 4 pushes into the One (ST-neosoul-38).
  { lines: { kick: "x... ...x ..x. ...x" }, weights: [0, 0, 3] },
] as const;

function kicks(tier: 0 | 1 | 2): GrooveOption[] {
  return KICKS.map((kick) => ({ weight: kick.weights[tier], lines: kick.lines }));
}

/** The backbeat, accented on 2 and 4 (ST-neosoul-07). */
const BACKBEAT = { snare: ".... X... .... X..." };
/** Below energy 0.35 the backbeat is a cross-stick, and there is no snare at all. */
const CROSS_STICK = { crossStick: ".... x... .... x..." };

/**
 * The ghost sets on the "e"s and "a"s, one per section (ST-neosoul-07): the
 * working set, and the same set with more when hot. None when quiet.
 */
const GHOSTS = {
  mid: [".... ...g ...g ...g", "...g .... ..g. ...g", ".... .g.g .... ...g"],
  high: ["...g ...g .g.g ...g", "...g ..g. ..gg ...g", "..g. .g.g .... .g.g"],
};
const ghosts = (sets: readonly string[]): GrooveOption[] =>
  sets.map((snare) => ({ weight: 1, lines: { snare } }));

/** Quiet: soft on each beat, a ghost on each "and" (ST-neosoul-09). */
const HAT_QUIET = { closedHat: "o.g. o.g. o.g. o.g." };
/** Sixteenths, swung, with the "e" and the "a" ghosted (ST-neosoul-09). */
const HAT_SIXTEENTHS = { closedHat: "xgog xgog xgog xgog" };

/** The second bar of each pair: the loop is two bars long (ST-neosoul-08, ST-neosoul-41). */
const SECOND_BARS = [2, 4, 6, 8, 10, 12, 14, 16];

/**
 * The displaced four: the backbeat on 4 a whole sixteenth late, on the "e" of 4
 * (ST-neosoul-08). A written rhythm in 35% of sections, not a drag.
 */
const LATE_FOUR: GrooveOption[] = [
  { weight: 65, lines: {} },
  { weight: 35, lines: { snare: ".... .... .... -X.." } },
];

/**
 * Hot, the hat opens on the second bar of each pair, on the "and" of 2 or the
 * "and" of 4, one choice per section (ST-neosoul-10). It rings to the next stroke.
 */
const HAT_BREATH: GrooveOption[] = [
  { weight: 1, lines: { openHat: ".... ..x. .... ....", closedHat: ".... ...- .... ...." } },
  { weight: 1, lines: { openHat: ".... .... .... ..x.", closedHat: ".... .... .... ...-" } },
];

// ── fills ───────────────────────────────────────────────────────────────────
// A busy fill breaks the loop's spell: two steps at most inside a section, four
// into a hot one (ST-neosoul-11). The kick and the hat foot keep the groove's
// part; the hand on the hat keeps it through the two-step figure.

/** Two steps: a short snare figure ending in an accent. */
const SHORT = { weight: 1, lines: { closedHat: "x.", snare: "gX" } };
/** Four steps: the snare on beat 4 and an accented mid tom on its "and". */
const TOM = { weight: 1, lines: { snare: "x...", midTom: "..X." } };

// ── in twelve and in six ────────────────────────────────────────────────────
// The soul ballad in twelve-eight that neo-soul comes out of, played by the
// same drummer: the loop, the lazy kick, the backbeat with its ghosts, the
// feathered hat. A bar of 12/8 is four slow pulses of three eighths, written in
// sixes, a pulse to a group; a bar of 6/8 is two. Only the eighths are struck
// and nothing swings: the three eighths are the triplet, so the sixteenth swing
// of four has nothing to bend.
//
// Four said in pulses: a beat is a pulse; its "e" the triplet's middle eighth;
// its "and" and its "a", the notes that lean into the next beat, the pulse's
// last eighth. So the hat's sixteenths ("x g o g") are the triplets with the
// middle eighth ghosted ("x.g.o."), the kick's pushes are the pulses' last
// eighths, and the ghosts sit on the triplet's inner notes. The late four is the
// backbeat a sixteenth late, as in four (ST-neosoul-08: a written rhythm, not a
// drag). It was first written on the triplet's middle eighth, twice as late in
// time as four's (0.34 s against 0.18), and Brandon heard that it "might drag a
// little": the sixteenth is the one drum stroke here that is not on an eighth.
//
// Six is not half of twelve but for its basic beat: the hat and the backbeat
// are twelve's first two pulses (`half` below), the kick on the One and the
// snare on the second pulse (SU-D-14). Its kicks and ghosts are written for a
// bar of two: there is no "beat 3" for a second kick, and the kick and the snare
// keep to half the bar's eighths (AU-96), so the Dilla skip, three kicks and a
// snare in six eighths, is not played in six.

/** The first two pulses of a line written for twelve: the same beat, a bar of six. */
const half = (line: string): string => line.split(" ").slice(0, 2).join(" ");
const halves = (lines: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(lines).map(([voice, line]) => [voice, half(line)]));

/** The five kicks of four in twelve, with the same weights (ST-neosoul-06). */
const TWELVE_KICKS = [
  // Boom-bap: the One and the "and" of 3, the last eighth of the third pulse.
  { lines: { kick: "x..... ...... ....x. ......" }, weights: [3, 3, 1] },
  // Plain 1 and 3.
  { lines: { kick: "x..... ...... x..... ......" }, weights: [2, 2, 1] },
  // A pickup into 3 stumbling into the "and" of 3.
  { lines: { kick: "x..... ....x. ....x. ......" }, weights: [0, 2, 2] },
  // A stumble on the "a" of 1, into the backbeat.
  { lines: { kick: "x...x. ...... ....x. ......" }, weights: [0, 1, 2] },
  // The Dilla skip: the last eighth of the bar pushes into the One (ST-neosoul-38).
  { lines: { kick: "x..... ....x. ....x. ....x." }, weights: [0, 0, 3] },
] as const;

/** The kicks of six: the One, a push into the next One, or a stumble into the backbeat. */
const SIX_KICKS = [
  { lines: { kick: "x..... ......" }, weights: [3, 3, 1] },
  { lines: { kick: "x..... ....x." }, weights: [2, 2, 2] },
  { lines: { kick: "x...x. ......" }, weights: [0, 2, 2] },
] as const;

const drawn = (
  list: readonly { lines: Readonly<Record<string, string>>; weights: readonly number[] }[],
  tier: 0 | 1 | 2,
): GrooveOption[] => list.map((kick) => ({ weight: kick.weights[tier]!, lines: kick.lines }));

/** The pulse and a ghost on its last eighth, never the triplet's middle note (four's "o.g."). */
const TWELVE_HAT_QUIET = { closedHat: "o...g. o...g. o...g. o...g." };
/** The triplets, the middle eighth ghosted and the last soft (four's "xgog"). */
const TWELVE_HAT = { closedHat: "x.g.o. x.g.o. x.g.o. x.g.o." };
const TWELVE_BACKBEAT = { snare: "...... X..... ...... X....." };
const TWELVE_CROSS_STICK = { crossStick: "...... x..... ...... x....." };

/** The ghost sets in twelve, on the triplet's inner notes: three a bar working, five hot. */
const TWELVE_GHOSTS = {
  mid: [
    "...... ..g... ..g... ..g...",
    "....g. ...... ..g... ..g...",
    "...... ..g.g. ...... ..g...",
  ],
  high: [
    "..g... ..g... ..g.g. ..g...",
    "....g. ..g... ..g... ..g.g.",
    "..g... ..g.g. ....g. ..g...",
  ],
};
/** The ghost sets in six: two a bar working, three hot. */
const SIX_GHOSTS = {
  mid: ["..g... ..g...", "....g. ..g...", "..g... ....g."],
  high: ["..g.g. ..g...", "....g. ..g.g.", "..g... ..g.g."],
};

/** The late four: the last backbeat a sixteenth after its pulse, as late in time as it is in four, in 35% of sections. */
const lateFour = (snare: string): GrooveOption[] => [
  { weight: 65, lines: {} },
  { weight: 35, lines: { snare } },
];

/** Hot, the hat breathes open on the last eighth of the second or the last pulse (ST-neosoul-10). */
const TWELVE_BREATH: GrooveOption[] = [
  {
    weight: 1,
    lines: { openHat: "...... ....x. ...... ......", closedHat: "...... ....-. ...... ......" },
  },
  {
    weight: 1,
    lines: { openHat: "...... ...... ...... ....x.", closedHat: "...... ...... ...... ....-." },
  },
];
const SIX_BREATH: GrooveOption[] = [
  { weight: 1, lines: { openHat: "....x. ......", closedHat: "....-. ......" } },
  { weight: 1, lines: { openHat: "...... ....x.", closedHat: "...... ....-." } },
];

interface Written {
  readonly kick: (tier: 0 | 1 | 2) => GrooveOption[];
  readonly hatQuiet: Readonly<Record<string, string>>;
  readonly hat: Readonly<Record<string, string>>;
  readonly backbeat: Readonly<Record<string, string>>;
  readonly crossStick: Readonly<Record<string, string>>;
  readonly ghosts: { readonly mid: readonly string[]; readonly high: readonly string[] };
  readonly late: string;
  readonly breath: readonly GrooveOption[];
}

/** The loop's layers for a meter, as four's are: the same ids, holds and conditions. */
function loop(w: Written): DrumTime["grooves"] {
  const hat = (lines: Readonly<Record<string, string>>): GrooveLayer => ({
    id: "hat",
    hold: "section",
    options: [{ weight: 1, lines }],
  });
  const backbeat: GrooveLayer = {
    id: "backbeat",
    hold: "section",
    options: [{ weight: 1, lines: w.backbeat }],
  };
  const late: GrooveLayer = {
    id: "late-four",
    hold: "section",
    when: { phraseBars: SECOND_BARS },
    options: lateFour(w.late),
  };
  return {
    low: [
      hat(w.hatQuiet),
      { id: "kick", hold: "section", options: w.kick(0) },
      { ...backbeat, when: { energyFrom: 0.35 } },
      {
        id: "cross-stick",
        hold: "section",
        when: { energyBelow: 0.35 },
        options: [{ weight: 1, lines: w.crossStick }],
      },
    ],
    mid: [
      hat(w.hat),
      { id: "kick", hold: "section", options: w.kick(1) },
      backbeat,
      { id: "ghosts", hold: "section", options: ghosts(w.ghosts.mid) },
      late,
    ],
    high: [
      hat(w.hat),
      { id: "kick", hold: "section", options: w.kick(2) },
      backbeat,
      { id: "ghosts", hold: "section", options: ghosts(w.ghosts.high) },
      late,
      { id: "breath", hold: "section", when: { phraseBars: SECOND_BARS }, options: w.breath },
    ],
  };
}

// Fills in twelve and six, the same few strokes before the barline in either, on the eighths:
// two eighths (the ghost with the hand still on the hat, then the accent), or the last pulse
// (the snare on it and the accented mid tom on its last eighth).
const SHORT_IN_PULSES = { weight: 1, lines: { closedHat: "x...", snare: "g.X." } };
const TOM_IN_PULSES = { weight: 1, lines: { snare: "x.....", midTom: "....X." } };
const FILLS_IN_PULSES: DrumTime["fills"] = {
  // ST-neosoul-11 in eighths: none inside a section until hot, then two eighths; a section's
  // end two eighths, hot the last pulse.
  length: {
    phrase: { low: 0, mid: 0, high: 4 },
    section: { low: 4, mid: 4, high: 6 },
  },
  phrase: [SHORT_IN_PULSES],
  section: [SHORT_IN_PULSES, TOM_IN_PULSES],
  top: [SHORT_IN_PULSES, TOM_IN_PULSES],
};

const neosoulDrumsInTwelve: DrumTime = {
  grooves: loop({
    kick: (tier) => drawn(TWELVE_KICKS, tier),
    hatQuiet: TWELVE_HAT_QUIET,
    hat: TWELVE_HAT,
    backbeat: TWELVE_BACKBEAT,
    crossStick: TWELVE_CROSS_STICK,
    ghosts: TWELVE_GHOSTS,
    late: "...... ...... ...... -X....",
    breath: TWELVE_BREATH,
  }),
  touches: [{ voices: ["closedHat", "openHat"], scale: 0.8 }],
  fills: FILLS_IN_PULSES,
};

const neosoulDrumsInSix: DrumTime = {
  grooves: loop({
    kick: (tier) => drawn(SIX_KICKS, tier),
    // The basic beat is twelve's, halved.
    hatQuiet: halves(TWELVE_HAT_QUIET),
    hat: halves(TWELVE_HAT),
    backbeat: halves(TWELVE_BACKBEAT),
    crossStick: halves(TWELVE_CROSS_STICK),
    ghosts: SIX_GHOSTS,
    late: "...... -X....",
    breath: SIX_BREATH,
  }),
  touches: [{ voices: ["closedHat", "openHat"], scale: 0.8 }],
  fills: FILLS_IN_PULSES,
};

export const neosoulDrums: DrumStyle = {
  // The soul ballad in twelve and in six, written above.
  meters: { "12/8": neosoulDrumsInTwelve, "6/8": neosoulDrumsInSix },

  grooves: {
    // Quiet: the soft hat, the section's kick, the backbeat (a cross-stick under 0.35), no ghosts.
    low: [
      { id: "hat", hold: "section", options: [{ weight: 1, lines: HAT_QUIET }] },
      { id: "kick", hold: "section", options: kicks(0) },
      {
        id: "backbeat",
        hold: "section",
        when: { energyFrom: 0.35 },
        options: [{ weight: 1, lines: BACKBEAT }],
      },
      {
        id: "cross-stick",
        hold: "section",
        when: { energyBelow: 0.35 },
        options: [{ weight: 1, lines: CROSS_STICK }],
      },
    ],
    // The working loop: sixteenth hat, a ghost set, and in some sections the late four.
    mid: [
      { id: "hat", hold: "section", options: [{ weight: 1, lines: HAT_SIXTEENTHS }] },
      { id: "kick", hold: "section", options: kicks(1) },
      { id: "backbeat", hold: "section", options: [{ weight: 1, lines: BACKBEAT }] },
      { id: "ghosts", hold: "section", options: ghosts(GHOSTS.mid) },
      { id: "late-four", hold: "section", when: { phraseBars: SECOND_BARS }, options: LATE_FOUR },
    ],
    // Hot: more ghosts, the expressive kicks, and the hat breathing open on the second bar.
    high: [
      { id: "hat", hold: "section", options: [{ weight: 1, lines: HAT_SIXTEENTHS }] },
      { id: "kick", hold: "section", options: kicks(2) },
      { id: "backbeat", hold: "section", options: [{ weight: 1, lines: BACKBEAT }] },
      { id: "ghosts", hold: "section", options: ghosts(GHOSTS.high) },
      { id: "late-four", hold: "section", when: { phraseBars: SECOND_BARS }, options: LATE_FOUR },
      { id: "breath", hold: "section", when: { phraseBars: SECOND_BARS }, options: HAT_BREATH },
    ],
  },

  // Time is on the hat.
  timekeepers: ["closedHat"],

  // The feather touch: the whole hat part at 80% of its written level, so the kick and the
  // snare speak through it (ST-neosoul-09).
  touches: [{ voices: ["closedHat", "openHat"], scale: 0.8 }],

  fills: {
    // Steps before the barline: none inside a section until the band is hot (ST-neosoul-11).
    length: {
      phrase: { low: 0, mid: 0, high: 2 },
      section: { low: 2, mid: 2, high: 4 },
    },
    phrase: [SHORT],
    section: [SHORT, TOM],
    top: [SHORT, TOM],
  },

  // The soft ending: a soft kick and a soft open hat on the One, no crash (ST-neosoul-40).
  ending: { strike: { kick: "o", openHat: "o" } },
};
