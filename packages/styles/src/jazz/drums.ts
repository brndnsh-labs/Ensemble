// The jazz drummer: medium swing. The ride carries the time, the hat foot
// closes on 2 and 4, the bass drum is felt and not heard, and the left hand
// comps on the snare where the chart moves. Phrase ends are set up, not
// filled; a fill is played under the time (ST-jazz-08 to ST-jazz-15).
//
// The light head is the low tier: the time moves to the closed hat, the kick
// stops feathering and the snare stops comping, and the step up to the ride
// for the solos is the band opening up (ST-jazz-09, DR-32). The head's place
// in the arc puts it there; nothing here asks whether this is the head. Very
// quiet, under the line a player asks for when he wants a ballad, the low
// tier rides softly instead (ST-jazz-08).
//
// Reading the grids: sixteen sixteenths to the bar, grouped by beat. The band
// swings eighths, lighter than a triplet, so only the beat and its "and" (the
// first and third character of each beat) are ever written: anything on an
// "e" or an "a" would land between the swung eighths and flam (ST-jazz-06).
// X accent, x normal, o soft, g ghost, "-" the stroke taken away.

import type { DrumStyle, DrumTime, FillShape, GrooveLayer, GrooveOption } from "@ensemble/engine";

// ── the time ────────────────────────────────────────────────────────────────

/** Under this the quiet band is a ballad: a soft, spacious ride, not the head on the hat. */
const BALLAD = 0.3;

/** "Spang, spang-a-lang": 2 and 4 leaned on, the skip notes on the "and"s of 2 and 4. */
const RIDE = { ride: "x... X.x. x... X.x." };
/** The ballad's ride: the same figure, soft and spacious. */
const RIDE_SOFT = { ride: "o... x.o. o... x.o." };
/** The light head: the swing pattern on the closed hat, the ride silent (ST-jazz-09). */
const HEAD_HAT = { closedHat: "x... X.x. x... X.x." };
/**
 * The hat foot on 2 and 4 wherever the ride keeps time (ST-jazz-08). Under the
 * light head the stick is on the closed hat on those beats already, and a foot
 * closing the same cymbal at the same moment is one sound struck twice.
 */
const FOOT = { pedalHat: ".... x... .... x..." };
/** Feathered quarters: a bass drum that is felt, not heard. */
const FEATHER = { kick: "g... g... g... g..." };

const ride = (lines: GrooveOption["lines"]): GrooveLayer => ({
  id: "time",
  hold: "section",
  options: [{ weight: 1, lines }],
});
const foot: GrooveLayer = {
  id: "foot",
  hold: "song",
  when: { playing: "ride" },
  options: [{ weight: 1, lines: FOOT }],
};
const feather: GrooveLayer = {
  id: "feather",
  hold: "song",
  options: [{ weight: 1, lines: FEATHER }],
};

// ── snare comping ───────────────────────────────────────────────────────────
// The left hand reads the chart as the pianist does, since it cannot hear him
// (DR-89, ST-surprise-04), with one list for each thing the harmony can do in
// a bar. The figure is chosen per phrase position: the phrase's first and
// third bars share one, its second (and fourth, when the phrase is longer)
// may take another (ST-jazz-10, DR-35). Never on 1 (the kick's) or on 2 or 4
// (the hat foot's). A figure's first stroke is soft; later ones are ghosts at
// mid and soft at high. The empty bar is part of the comping.

/** One figure: where it strikes, by the "and"s (and beat 3) it uses. */
type Figure = readonly number[];
const AND_OF_1 = 2;
const AND_OF_2 = 6;
const BEAT_3 = 8;
const AND_OF_3 = 10;
const AND_OF_4 = 14;

/** A figure written out, its first stroke soft and the rest at `later`. */
function comp(figure: Figure, later: "g" | "o"): GrooveOption["lines"] {
  if (figure.length === 0) return {};
  const steps = new Array<string>(16).fill(".");
  figure.forEach((step, i) => {
    steps[step] = i === 0 ? "o" : later;
  });
  return { snare: steps.join("") };
}

/** The three lists, as figures with their weights (ST-jazz-10, DR-33). */
const STILL: readonly [Figure, number][] = [
  [[AND_OF_2], 3],
  [[AND_OF_2, AND_OF_3], 1],
  [[AND_OF_1, AND_OF_2], 1],
  [[], 2],
];
const INTO_CHANGE: readonly [Figure, number][] = [
  [[AND_OF_2], 2],
  [[AND_OF_4], 2],
  [[AND_OF_2, AND_OF_4], 2],
  [[], 2],
];
const MOVING: readonly [Figure, number][] = [
  [[AND_OF_3], 2],
  [[AND_OF_4], 2],
  [[AND_OF_3, AND_OF_4], 1],
  [[BEAT_3], 1],
  [[], 1],
];

/**
 * The comping layers of one tier: for each place in the phrase, one per kind
 * of bar. Hot, the empty bar is half as likely (ST-jazz-10).
 */
function comping(later: "g" | "o", nothing: number): GrooveLayer[] {
  const places = [
    { name: "odd", phraseBars: [1, 3, 5, 7] },
    { name: "even", phraseBars: [2, 4, 6, 8] },
  ];
  const kinds = [
    { name: "still", list: STILL, when: { changeInBar: false, changeAhead: false } },
    { name: "into", list: INTO_CHANGE, when: { changeInBar: false, changeAhead: true } },
    { name: "moving", list: MOVING, when: { changeInBar: true } },
  ];
  return places.flatMap((place) =>
    kinds.map(
      (kind): GrooveLayer => ({
        id: `comp-${place.name}-${kind.name}`,
        hold: "phrase",
        when: { phraseBars: place.phraseBars, phraseEnd: false, ...kind.when },
        options: kind.list.map(([figure, weight]) => ({
          weight: figure.length === 0 ? weight * nothing : weight,
          lines: comp(figure, later),
        })),
      }),
    ),
  );
}

// ── the set-up ──────────────────────────────────────────────────────────────
// The last bar of a phrase sets up the next. Where a fill is played, the fill
// is the set-up; at a plain phrase end the drummer plays his own, drawn for
// the bar (ST-jazz-11, DR-36). Before a change: the shot with the bomb,
// the bass drum leaving its feathered 4 to hit the "and" with the snare.
// With no change coming, never the bomb, and nothing half the time.

const SHOT_AND_BOMB = { snare: ".... .... .... ..x.", kick: ".... .... .... -.x." };
const SHOT = { snare: ".... .... .... ..x." };
const TWO_ANDS = { snare: ".... .... ..o. ..x." };
/** Under the light head a phrase end only whispers (DR-38). */
const WHISPER = { snare: ".... .... .... ..o." };

const plainEnd = { phraseEnd: true, fill: false } as const;
const setUps: GrooveLayer[] = [
  {
    id: "set-up-into",
    hold: "bar",
    when: { ...plainEnd, changeAhead: true },
    options: [
      { weight: 3, lines: SHOT_AND_BOMB },
      { weight: 1, lines: SHOT },
      { weight: 1, lines: TWO_ANDS },
      { weight: 1, lines: {} },
    ],
  },
  {
    id: "set-up-still",
    hold: "bar",
    when: { ...plainEnd, changeAhead: false },
    options: [
      { weight: 1, lines: SHOT },
      { weight: 1, lines: TWO_ANDS },
      { weight: 2, lines: {} },
    ],
  },
];
const quietSetUps: GrooveLayer[] = [
  {
    id: "set-up-into",
    hold: "bar",
    when: { ...plainEnd, changeAhead: true },
    options: [
      { weight: 1, lines: WHISPER },
      { weight: 1, lines: {} },
    ],
  },
  {
    id: "set-up-still",
    hold: "bar",
    when: { ...plainEnd, changeAhead: false },
    options: [
      { weight: 1, lines: WHISPER },
      { weight: 3, lines: {} },
    ],
  },
];

// ── fills ───────────────────────────────────────────────────────────────────
// Set-ups at 2, 4 and 8 steps before the barline, swung eighths only, played
// under the time: the cymbal keeps going (ST-jazz-13, ST-jazz-15). The kick
// in a fill line replaces the feathering over the fill, so the shot's bomb
// drops the feathered 4; the eight-step shapes keep the feather on 3.

type Lengths = { two: FillShape["lines"]; four: FillShape["lines"]; eight: FillShape["lines"] };

/** "Ba-BOP": snare and bass drum together on the "and" of 4. */
const THE_SHOT: Lengths = {
  two: { snare: "X.", kick: "X." },
  four: { snare: "..X.", kick: "..X." },
  eight: { snare: "......X.", kick: "g.....X." },
};
/** The "and" of 3, then the shot. */
const TWO_SHOT: Lengths = {
  two: { snare: "X.", kick: "x." },
  four: { snare: "o.X.", kick: "..x." },
  eight: { snare: "..o...X.", kick: "g.....X." },
};
/** Swung eighths on the snare growing into the shot. */
const EIGHTHS: Lengths = {
  two: { snare: "x." },
  four: { snare: "o.X.", kick: "..x." },
  eight: { snare: "o.o.o.X.", kick: "g.....x." },
};
/** Snare, high tom, floor tom: the one shape that takes the stick hand off the cymbal. */
const ROUND_THE_TOMS: Lengths = {
  two: { lowTom: "X.", kick: "x." },
  four: { highTom: "o...", lowTom: "..X.", kick: "..x." },
  eight: { snare: "o.o.....", highTom: "....o...", lowTom: "......X.", kick: "g.....x." },
};
/** The shot played softly, for the light head. */
const SOFT_SHOT: Lengths = {
  two: { snare: "x.", kick: "o." },
  four: { snare: "o.x.", kick: "..o." },
  eight: { snare: "..o...x.", kick: "......o." },
};
/** Ghosts and soft eighths on the snare alone. */
const WHISPER_FILL: Lengths = {
  two: { snare: "o." },
  four: { snare: "g.o." },
  eight: { snare: "g.g.o.o." },
};

/**
 * Every length of a shape at one weight. Round the toms keeps the cymbal for
 * the fill's first stroke only (ST-jazz-15).
 */
function lengths(weight: number, shape: Lengths, handOff?: number): FillShape[] {
  return [shape.two, shape.four, shape.eight].map((lines) =>
    handOff === undefined ? { weight, lines } : { weight, lines, handOff },
  );
}
const toms = (weight: number) => lengths(weight, ROUND_THE_TOMS, 1);

/** Which fill where, at mid and high (ST-jazz-14). */
const PHRASE = [...lengths(2, THE_SHOT), ...lengths(2, TWO_SHOT), ...lengths(1, EIGHTHS)];
const SECTION = [...lengths(2, EIGHTHS), ...lengths(1, TWO_SHOT), ...toms(1)];
const TOP = [...toms(2), ...lengths(1, EIGHTHS), ...lengths(1, TWO_SHOT)];

/** Under the light head the drummer stays off the toms (ST-jazz-14, DR-38). */
const QUIET_PHRASE = lengths(1, WHISPER_FILL);
const QUIET_SECTION = [...lengths(1, WHISPER_FILL), ...lengths(1, SOFT_SHOT)];
const QUIET_TOP = [...lengths(1, EIGHTHS), ...lengths(1, SOFT_SHOT)];

// ── in six ──────────────────────────────────────────────────────────────────
// A bar of 6/4 is six beats in two threes: a waltz twice, with the second
// three answering the first (the modal blues in six). Twenty-four sixteenths
// to the bar, grouped by beat as 4/4 is, and still only beats and their
// "and"s. The bar's strong beats are 1 and 4.
//
// The ride plays every beat with its skip on the "and" of the second beat of
// each three: "ding, ding-a, ding". Never on a sixteenth: a skip a sixteenth
// before the beat was the most audible fault of the old band's six (AU-92).
// The hat foot closes on 2 and 5, the middle of each three; the bass drum is
// felt on 1 and 4 and nowhere else. Quiet, the drums are thinner, not just
// softer (AU-96): the head on the closed hat with no bass drum and no comping,
// and a ballad's ride with no skip at all.

const SIX_RIDE = { ride: "x... X.x. x... x... X.x. x..." };
/** The ballad's ride in six: the beats alone, 2 and 5 leaned on. */
const SIX_RIDE_SOFT = { ride: "o... x... o... o... x... o..." };
const SIX_HEAD_HAT = { closedHat: "x... X.x. x... x... X.x. x..." };
const SIX_FOOT = { pedalHat: ".... x... .... .... x... ...." };
const SIX_FEATHER = { kick: "g... .... .... g... .... ...." };

const footSix: GrooveLayer = { ...foot, options: [{ weight: 1, lines: SIX_FOOT }] };
const featherSix: GrooveLayer = { ...feather, options: [{ weight: 1, lines: SIX_FEATHER }] };

/** A comping figure in six, written out as `comp` writes one in four. */
function compSix(figure: Figure, later: "g" | "o"): GrooveOption["lines"] {
  if (figure.length === 0) return {};
  const steps = new Array<string>(24).fill(".");
  figure.forEach((step, i) => {
    steps[step] = i === 0 ? "o" : later;
  });
  return { snare: steps.join("") };
}

// Where the left hand may fall in six: the "and"s, and beats 3 and 6, which lead to the
// strong beats. Never 1 or 4 (the bass drum's) and never 2 or 5 (the hat foot's).
const SIX = { and1: 2, and2: 6, three: 8, and3: 10, and4: 14, and5: 18, six: 20, and6: 22 };

/** One chord, and the same chord after it: the first three, or both, or nothing. */
const SIX_STILL: readonly [Figure, number][] = [
  [[SIX.and2], 3],
  [[SIX.and2, SIX.and5], 2],
  [[SIX.and3], 1],
  [[SIX.and5], 1],
  [[], 3],
];
/** A change at the barline: the second three leans into it. */
const SIX_INTO_CHANGE: readonly [Figure, number][] = [
  [[SIX.and5], 2],
  [[SIX.and6], 2],
  [[SIX.and2, SIX.and6], 2],
  [[], 2],
];
/** A change inside the bar, on beat 4 as a rule: the "and" of 3 sets it up. */
const SIX_MOVING: readonly [Figure, number][] = [
  [[SIX.and3], 2],
  [[SIX.and6], 2],
  [[SIX.and3, SIX.and6], 1],
  [[SIX.three], 1],
  [[], 1],
];

function compingSix(later: "g" | "o", nothing: number): GrooveLayer[] {
  const places = [
    { name: "odd", phraseBars: [1, 3, 5, 7] },
    { name: "even", phraseBars: [2, 4, 6, 8] },
  ];
  const kinds = [
    { name: "still", list: SIX_STILL, when: { changeInBar: false, changeAhead: false } },
    { name: "into", list: SIX_INTO_CHANGE, when: { changeInBar: false, changeAhead: true } },
    { name: "moving", list: SIX_MOVING, when: { changeInBar: true } },
  ];
  return places.flatMap((place) =>
    kinds.map(
      (kind): GrooveLayer => ({
        id: `comp-${place.name}-${kind.name}`,
        hold: "phrase",
        when: { phraseBars: place.phraseBars, phraseEnd: false, ...kind.when },
        options: kind.list.map(([figure, weight]) => ({
          weight: figure.length === 0 ? weight * nothing : weight,
          lines: compSix(figure, later),
        })),
      }),
    ),
  );
}

// The set-ups in six: the same shots, on the "and" of 6. The bass drum has no feathered
// beat there to leave.
const SIX_SHOT_AND_BOMB = {
  snare: ".... .... .... .... .... ..x.",
  kick: ".... .... .... .... .... ..x.",
};
const SIX_SHOT = { snare: ".... .... .... .... .... ..x." };
const SIX_TWO_ANDS = { snare: ".... .... .... .... ..o. ..x." };
const SIX_WHISPER = { snare: ".... .... .... .... .... ..o." };

const setUpsSix: GrooveLayer[] = [
  {
    id: "set-up-into",
    hold: "bar",
    when: { ...plainEnd, changeAhead: true },
    options: [
      { weight: 3, lines: SIX_SHOT_AND_BOMB },
      { weight: 1, lines: SIX_SHOT },
      { weight: 1, lines: SIX_TWO_ANDS },
      { weight: 1, lines: {} },
    ],
  },
  {
    id: "set-up-still",
    hold: "bar",
    when: { ...plainEnd, changeAhead: false },
    options: [
      { weight: 1, lines: SIX_SHOT },
      { weight: 1, lines: SIX_TWO_ANDS },
      { weight: 2, lines: {} },
    ],
  },
];
const quietSetUpsSix: GrooveLayer[] = [
  {
    id: "set-up-into",
    hold: "bar",
    when: { ...plainEnd, changeAhead: true },
    options: [
      { weight: 1, lines: SIX_WHISPER },
      { weight: 1, lines: {} },
    ],
  },
  {
    id: "set-up-still",
    hold: "bar",
    when: { ...plainEnd, changeAhead: false },
    options: [
      { weight: 1, lines: SIX_WHISPER },
      { weight: 3, lines: {} },
    ],
  },
];

/**
 * A fill is so many sixteenths before the barline in any meter, so six plays
 * the shapes four plays, over beats 5 and 6. The two-beat shapes keep a
 * feathered beat under their start in four; in six beat 5 has none to keep.
 */
const unfeathered = (shapes: readonly FillShape[]): FillShape[] =>
  shapes.map((shape) =>
    shape.lines.kick?.startsWith("g")
      ? { ...shape, lines: { ...shape.lines, kick: `.${shape.lines.kick.slice(1)}` } }
      : shape,
  );

const jazzDrumsInSix: DrumTime = {
  grooves: {
    low: [
      { ...ride(SIX_RIDE_SOFT), when: { energyBelow: BALLAD } },
      { ...ride(SIX_HEAD_HAT), id: "head", when: { energyFrom: BALLAD } },
      footSix,
      ...quietSetUpsSix,
    ],
    mid: [ride(SIX_RIDE), footSix, featherSix, ...compingSix("g", 1), ...setUpsSix],
    high: [ride(SIX_RIDE), footSix, featherSix, ...compingSix("o", 0.5), ...setUpsSix],
  },
  touches: [],
  fills: {
    length: {
      phrase: { low: 0, mid: 2, high: 4 },
      section: { low: 4, mid: 4, high: 8 },
    },
    phrase: {
      low: unfeathered(QUIET_PHRASE),
      mid: unfeathered(PHRASE),
      high: unfeathered(PHRASE),
    },
    section: {
      low: unfeathered(QUIET_SECTION),
      mid: unfeathered(SECTION),
      high: unfeathered(SECTION),
    },
    top: { low: unfeathered(QUIET_TOP), mid: unfeathered(TOP), high: unfeathered(TOP) },
    keepTime: true,
  },
};

export const jazzDrums: DrumStyle = {
  grooves: {
    // The light head on the hat, or a ballad's soft ride; no kick, no comping, phrase ends
    // only whispered.
    low: [
      { ...ride(RIDE_SOFT), when: { energyBelow: BALLAD } },
      { ...ride(HEAD_HAT), id: "head", when: { energyFrom: BALLAD } },
      foot,
      ...quietSetUps,
    ],

    // The band opened up: the ride, the feathered kick, the snare comping where the chart moves.
    mid: [ride(RIDE), foot, feather, ...comping("g", 1), ...setUps],

    // Hot: the comping strokes all soft, and the empty bar half as likely.
    high: [ride(RIDE), foot, feather, ...comping("o", 0.5), ...setUps],
  },

  // Six beats to the bar: the modal blues in six, written above.
  meters: { "6/4": jazzDrumsInSix },

  // The ride keeps time, or the hat under the light head; an arrival crash takes that hand.
  timekeepers: ["ride", "closedHat"],

  touches: [],

  fills: {
    // A quiet jazz band plays straight through its phrase ends (ST-jazz-12).
    length: {
      phrase: { low: 0, mid: 2, high: 4 },
      section: { low: 4, mid: 4, high: 8 },
    },
    phrase: { low: QUIET_PHRASE, mid: PHRASE, high: PHRASE },
    section: { low: QUIET_SECTION, mid: SECTION, high: SECTION },
    top: { low: QUIET_TOP, mid: TOP, high: TOP },
    keepTime: true,
  },

  // The button: ride and kick on 1 while the band holds, then snare and kick together on the
  // "and" of 4 with the band's short hit, "doo-BOP" (ST-jazz-48).
  ending: {
    strike: { ride: "X", kick: "x" },
    button: { snare: "X", kick: "X" },
  },
};
