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

import type {
  DrumStyle,
  DrumTime,
  FillShape,
  GrooveLayer,
  GrooveOption,
  Lines,
} from "@ensemble/engine";

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

// ── in twelve and in six-eight ──────────────────────────────────────────────
// A bar of dotted pulses is its own triplet: nothing swings, and nothing is
// struck between the eighths. Twenty-four sixteenths to a bar of twelve and
// twelve to a bar of six, grouped by pulse; a pulse's eighths are its first,
// third and fifth characters. Four's rules said in pulses (AU-97): a beat is
// a pulse, and its "and", the skip of "spang-a-lang", is the pulse's last
// eighth, never its middle one (AU-92: the old band's skip a sixteenth early
// was the most audible fault of its six).
//
// Twelve is the jazz ballad in twelve-eight: four slow pulses. Quiet it is
// four's light head or its ballad's soft ride, said in pulses; once the band
// opens up the ride plays the ballad's triplets, every eighth, the pulse
// played, the middle soft, the last (the skip) full; 2 and 4 leaned on. The
// foot on 2 and 4, the bass drum feathered on every pulse as on every beat
// in four, the left hand comping off the pulses as in four.
//
// Six is jazz's six-eight: two pulses, the strong one and its answer, the
// ride on each pulse and the eighth before the next (AU-92's ride, the six
// the drummers play under a modal tune), the second pulse leaned on. The foot
// on the second pulse, the backbeat of a bar of two; the bass drum feathered
// on the One alone, the bar's one strong pulse; the left hand off both.

/** A comping figure in a bar of `steps` sixteenths, written out as `comp` writes one in four. */
function compIn(steps: number, figure: Figure, later: "g" | "o"): GrooveOption["lines"] {
  if (figure.length === 0) return {};
  const line = new Array<string>(steps).fill(".");
  figure.forEach((step, i) => {
    line[step] = i === 0 ? "o" : later;
  });
  return { snare: line.join("") };
}

type Lists = { still: typeof STILL; into: typeof STILL; moving: typeof STILL };

/** The comping layers of one tier for a bar of `steps`, as `comping` writes them for four. */
function compingIn(steps: number, lists: Lists, later: "g" | "o", nothing: number): GrooveLayer[] {
  const places = [
    { name: "odd", phraseBars: [1, 3, 5, 7] },
    { name: "even", phraseBars: [2, 4, 6, 8] },
  ];
  const kinds = [
    { name: "still", list: lists.still, when: { changeInBar: false, changeAhead: false } },
    { name: "into", list: lists.into, when: { changeInBar: false, changeAhead: true } },
    { name: "moving", list: lists.moving, when: { changeInBar: true } },
  ];
  return places.flatMap((place) =>
    kinds.map(
      (kind): GrooveLayer => ({
        id: `comp-${place.name}-${kind.name}`,
        hold: "phrase",
        when: { phraseBars: place.phraseBars, phraseEnd: false, ...kind.when },
        options: kind.list.map(([figure, weight]) => ({
          weight: figure.length === 0 ? weight * nothing : weight,
          lines: compIn(steps, figure, later),
        })),
      }),
    ),
  );
}

/** The set-ups of a bar whose last eighth is the shot's, as four's are written. */
function setUpsIn(shotAndBomb: Lines, shot: Lines, twoAnds: Lines, whisper: Lines) {
  const loud: GrooveLayer[] = [
    {
      id: "set-up-into",
      hold: "bar",
      when: { ...plainEnd, changeAhead: true },
      options: [
        { weight: 3, lines: shotAndBomb },
        { weight: 1, lines: shot },
        { weight: 1, lines: twoAnds },
        { weight: 1, lines: {} },
      ],
    },
    {
      id: "set-up-still",
      hold: "bar",
      when: { ...plainEnd, changeAhead: false },
      options: [
        { weight: 1, lines: shot },
        { weight: 1, lines: twoAnds },
        { weight: 2, lines: {} },
      ],
    },
  ];
  const quiet: GrooveLayer[] = [
    {
      id: "set-up-into",
      hold: "bar",
      when: { ...plainEnd, changeAhead: true },
      options: [
        { weight: 1, lines: whisper },
        { weight: 1, lines: {} },
      ],
    },
    {
      id: "set-up-still",
      hold: "bar",
      when: { ...plainEnd, changeAhead: false },
      options: [
        { weight: 1, lines: whisper },
        { weight: 3, lines: {} },
      ],
    },
  ];
  return { loud, quiet };
}

/** A fill's three lengths in a bar of dotted pulses: an eighth, a pulse, and the longest. */
type CompoundLengths = {
  eighth: FillShape["lines"];
  pulse: FillShape["lines"];
  long: FillShape["lines"];
};

function lengthsIn(weight: number, shape: CompoundLengths, handOff?: number): FillShape[] {
  return [shape.eighth, shape.pulse, shape.long].map((lines) =>
    handOff === undefined ? { weight, lines } : { weight, lines, handOff },
  );
}

/** Four's fill vocabulary and its weights, which fill where (ST-jazz-14), in a meter's shapes. */
function fillsIn(
  shapes: Record<"shot" | "twoShot" | "eighths" | "toms" | "softShot" | "whisper", CompoundLengths>,
  length: DrumTime["fills"]["length"],
): DrumTime["fills"] {
  const toms = (weight: number) => lengthsIn(weight, shapes.toms, 1);
  const phrase = [
    ...lengthsIn(2, shapes.shot),
    ...lengthsIn(2, shapes.twoShot),
    ...lengthsIn(1, shapes.eighths),
  ];
  const section = [...lengthsIn(2, shapes.eighths), ...lengthsIn(1, shapes.twoShot), ...toms(1)];
  const top = [...toms(2), ...lengthsIn(1, shapes.eighths), ...lengthsIn(1, shapes.twoShot)];
  return {
    length,
    phrase: { low: lengthsIn(1, shapes.whisper), mid: phrase, high: phrase },
    section: {
      low: [...lengthsIn(1, shapes.whisper), ...lengthsIn(1, shapes.softShot)],
      mid: section,
      high: section,
    },
    top: {
      low: [...lengthsIn(1, shapes.eighths), ...lengthsIn(1, shapes.softShot)],
      mid: top,
      high: top,
    },
    keepTime: true,
  };
}

// Twelve. Where the left hand falls is four's lists said in pulses: each "and" is the pulse's
// last eighth, and beat 3 is pulse 3, under the feathered kick as it is in four.
const T = { and1: 4, and2: 10, three: 12, and3: 16, and4: 22 };
const TWELVE_LISTS: Lists = {
  still: [
    [[T.and2], 3],
    [[T.and2, T.and3], 1],
    [[T.and1, T.and2], 1],
    [[], 2],
  ],
  into: [
    [[T.and2], 2],
    [[T.and4], 2],
    [[T.and2, T.and4], 2],
    [[], 2],
  ],
  moving: [
    [[T.and3], 2],
    [[T.and4], 2],
    [[T.and3, T.and4], 1],
    [[T.three], 1],
    [[], 1],
  ],
};

/** The ballad's triplets: every eighth, the middle soft, 2 and 4 leaned on. */
const TWELVE_RIDE = { ride: "x.o.x. X.o.x. x.o.x. X.o.x." };
/** The ballad's soft ride, four's said in pulses: each pulse, the skip after 2 and after 4. */
const TWELVE_RIDE_SOFT = { ride: "o..... x...o. o..... x...o." };
/** The light head on the closed hat: four's "spang-a-lang" in pulses (ST-jazz-09). */
const TWELVE_HEAD_HAT = { closedHat: "x..... X...x. x..... X...x." };
const TWELVE_FOOT = { pedalHat: "...... x..... ...... x....." };
const TWELVE_FEATHER = { kick: "g..... g..... g..... g....." };

const twelveSetUps = setUpsIn(
  // The bomb leaves the feathered 4 to hit its last eighth with the snare.
  { snare: "...... ...... ...... ....x.", kick: "...... ...... ...... -...x." },
  { snare: "...... ...... ...... ....x." },
  { snare: "...... ...... ....o. ....x." },
  { snare: "...... ...... ...... ....o." },
);

/**
 * Four's fills in pulses: its two sixteenths are the last eighth, its beat the last pulse, its
 * two beats the last two pulses, every stroke on an eighth. The two-pulse shapes keep the
 * feather on 3, as four's two-beat shapes do.
 */
const TWELVE_FILLS = fillsIn(
  {
    shot: {
      eighth: { snare: "X.", kick: "X." },
      pulse: { snare: "....X.", kick: "....X." },
      long: { snare: "..........X.", kick: "g.........X." },
    },
    twoShot: {
      eighth: { snare: "X.", kick: "x." },
      pulse: { snare: "o...X.", kick: "....x." },
      long: { snare: "....o.....X.", kick: "g.........X." },
    },
    eighths: {
      eighth: { snare: "x." },
      pulse: { snare: "o.o.X.", kick: "....x." },
      long: { snare: "o...o.o.o.X.", kick: "g.........x." },
    },
    toms: {
      eighth: { lowTom: "X.", kick: "x." },
      pulse: { highTom: "o.o...", lowTom: "....X.", kick: "....x." },
      long: {
        snare: "o...o.......",
        highTom: "......o.o...",
        lowTom: "..........X.",
        kick: "g.........x.",
      },
    },
    softShot: {
      eighth: { snare: "x.", kick: "o." },
      pulse: { snare: "o...x.", kick: "....o." },
      long: { snare: "....o.....x.", kick: "..........o." },
    },
    whisper: {
      eighth: { snare: "o." },
      pulse: { snare: "g...o." },
      long: { snare: "g...g.o...o." },
    },
  },
  // Four's lengths in pulses: an eighth, a pulse, two pulses (ST-jazz-12).
  { phrase: { low: 0, mid: 2, high: 6 }, section: { low: 6, mid: 6, high: 12 } },
);

const jazzDrumsInTwelve: DrumTime = {
  grooves: {
    low: [
      { ...ride(TWELVE_RIDE_SOFT), when: { energyBelow: BALLAD } },
      { ...ride(TWELVE_HEAD_HAT), id: "head", when: { energyFrom: BALLAD } },
      { ...foot, options: [{ weight: 1, lines: TWELVE_FOOT }] },
      ...twelveSetUps.quiet,
    ],
    mid: [
      ride(TWELVE_RIDE),
      { ...foot, options: [{ weight: 1, lines: TWELVE_FOOT }] },
      { ...feather, options: [{ weight: 1, lines: TWELVE_FEATHER }] },
      ...compingIn(24, TWELVE_LISTS, "g", 1),
      ...twelveSetUps.loud,
    ],
    high: [
      ride(TWELVE_RIDE),
      { ...foot, options: [{ weight: 1, lines: TWELVE_FOOT }] },
      { ...feather, options: [{ weight: 1, lines: TWELVE_FEATHER }] },
      ...compingIn(24, TWELVE_LISTS, "o", 0.5),
      ...twelveSetUps.loud,
    ],
  },
  touches: [],
  fills: TWELVE_FILLS,
};

// Six-eight. The left hand on the eighths between the pulses: the two of the first pulse, the
// last of which pushes the backbeat, and the two of the second, the last pushing the One.
const S = { mid1: 2, and1: 4, mid2: 8, and2: 10 };
const SIX_EIGHT_LISTS: Lists = {
  // One chord, and the same after it: the push into the second pulse most of all.
  still: [
    [[S.and1], 3],
    [[S.and1, S.mid2], 1],
    [[S.mid1, S.and1], 1],
    [[], 2],
  ],
  // A change at the barline: the second pulse leans into it.
  into: [
    [[S.and1], 2],
    [[S.and2], 2],
    [[S.and1, S.and2], 2],
    [[], 2],
  ],
  // A change inside the bar, on the second pulse as a rule: its "and" sets it up.
  moving: [
    [[S.and1], 2],
    [[S.and2], 2],
    [[S.and1, S.and2], 1],
    [[S.mid2], 1],
    [[], 1],
  ],
};

/** AU-92's ride: each pulse and the eighth before the next, the second pulse leaned on. */
const SIX_EIGHT_RIDE = { ride: "x...x. X...x." };
/** The ballad's soft ride: the same, soft. */
const SIX_EIGHT_RIDE_SOFT = { ride: "o...o. x...o." };
const SIX_EIGHT_HEAD_HAT = { closedHat: "x...x. X...x." };
const SIX_EIGHT_FOOT = { pedalHat: "...... x....." };
const SIX_EIGHT_FEATHER = { kick: "g..... ......" };

const sixEightSetUps = setUpsIn(
  { snare: "...... ....x.", kick: "...... ....x." },
  { snare: "...... ....x." },
  { snare: "....o. ....x." },
  { snare: "...... ....o." },
);

/**
 * In a bar of two the longest fill is the second pulse: two pulses would be the whole bar.
 * A pulse's fill takes the backbeat pulse's hand, and the foot keeps it.
 */
const SIX_EIGHT_FILLS = fillsIn(
  {
    shot: {
      eighth: { snare: "X.", kick: "X." },
      pulse: { snare: "..X.", kick: "..X." },
      long: { snare: "....X.", kick: "....X." },
    },
    twoShot: {
      eighth: { snare: "X.", kick: "x." },
      pulse: { snare: "o.X.", kick: "..x." },
      long: { snare: "..o.X.", kick: "....x." },
    },
    eighths: {
      eighth: { snare: "x." },
      pulse: { snare: "o.X.", kick: "..x." },
      long: { snare: "o.o.X.", kick: "....x." },
    },
    toms: {
      eighth: { lowTom: "X.", kick: "x." },
      pulse: { highTom: "o...", lowTom: "..X.", kick: "..x." },
      long: { snare: "o.....", highTom: "..o...", lowTom: "....X.", kick: "....x." },
    },
    softShot: {
      eighth: { snare: "x.", kick: "o." },
      pulse: { snare: "o.x.", kick: "..o." },
      long: { snare: "..o.x.", kick: "....o." },
    },
    whisper: {
      eighth: { snare: "o." },
      pulse: { snare: "g.o." },
      long: { snare: "g.g.o." },
    },
  },
  // An eighth, two eighths, the second pulse: four's lengths, the longest kept to half the bar.
  { phrase: { low: 0, mid: 2, high: 4 }, section: { low: 4, mid: 4, high: 6 } },
);

const jazzDrumsInSixEight: DrumTime = {
  grooves: {
    low: [
      { ...ride(SIX_EIGHT_RIDE_SOFT), when: { energyBelow: BALLAD } },
      { ...ride(SIX_EIGHT_HEAD_HAT), id: "head", when: { energyFrom: BALLAD } },
      { ...foot, options: [{ weight: 1, lines: SIX_EIGHT_FOOT }] },
      ...sixEightSetUps.quiet,
    ],
    mid: [
      ride(SIX_EIGHT_RIDE),
      { ...foot, options: [{ weight: 1, lines: SIX_EIGHT_FOOT }] },
      { ...feather, options: [{ weight: 1, lines: SIX_EIGHT_FEATHER }] },
      ...compingIn(12, SIX_EIGHT_LISTS, "g", 1),
      ...sixEightSetUps.loud,
    ],
    high: [
      ride(SIX_EIGHT_RIDE),
      { ...foot, options: [{ weight: 1, lines: SIX_EIGHT_FOOT }] },
      { ...feather, options: [{ weight: 1, lines: SIX_EIGHT_FEATHER }] },
      ...compingIn(12, SIX_EIGHT_LISTS, "o", 0.5),
      ...sixEightSetUps.loud,
    ],
  },
  touches: [],
  fills: SIX_EIGHT_FILLS,
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

  // Six beats to the bar (the modal blues in six), the ballad in twelve-eight and jazz's
  // six-eight, written above.
  meters: { "6/4": jazzDrumsInSix, "12/8": jazzDrumsInTwelve, "6/8": jazzDrumsInSixEight },

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
