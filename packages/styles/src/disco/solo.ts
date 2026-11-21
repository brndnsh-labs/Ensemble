// The disco soloist: an alto soaring over the floor. The pentatonic on each
// chord's own root, so it sings and never rubs; changes landed on the 3rd or
// the 7th; funk's sixteenths made legato; a figure pumped on one pitch before
// it lifts off; every phrase ending on a big held note (ST-disco-21 to
// ST-disco-27). A horn's scoop and fall are not in the instrument model and
// are not played.
//
// Reading the rhythms: sixteen sixteenths to the bar, grouped by beat. `x`
// strikes a note, `-` holds it, `.` is silence.

import type { SoloStyle, SoloTime, Way } from "@ensemble/engine";

const NEW: Way = { name: "statement", make: "new", oneRhythm: false };
const NEW_RIFFED: Way = { name: "statement", make: "new", oneRhythm: true };
const ENDING_UP: Way = { name: "new ending, up", make: "ending", direction: 1 };
const ENDING_DOWN: Way = { name: "new ending, down", make: "ending", direction: -1 };
const AS_A_RIFF: Way = {
  name: "the idea, as a riff",
  make: "grown",
  contour: "arch",
  keepOpening: true,
  oneRhythm: true,
};
// A bridge: other rhythms than the idea used, a little higher.
const ELSE = {
  name: "something else",
  make: "new",
  oneRhythm: false,
  apart: true,
  lift: 2,
} satisfies Way;

// The phrase shapes of each level, the same in every meter.
const SPARSE_SHAPES = [
  { weight: 4.3, bars: "L E R R" },
  { weight: 4.3, bars: "R L E R" },
  { weight: 3.6, bars: "E R L E" },
  { weight: 2.4, bars: "L L E R" },
];
const MEDIUM_SHAPES = [
  { weight: 6, bars: "L L E R" },
  { weight: 3.6, bars: "E R L E" },
  { weight: 2, bars: "L E L E" },
];
const BUSY_SHAPES = [
  { weight: 4, bars: "L L L E" },
  { weight: 4.8, bars: "L L E R" },
  { weight: 2, bars: "L E L E" },
];

// ── in twelve and in six ────────────────────────────────────────────────────
// The same alto over the floor on a pulse of three eighths. A bar of 12/8 is
// four pulses, written in sixes; a bar of 6/8 is two. Only the eighths are
// struck. Twelve's rhythms are ST-disco-23's said in pulses (AU-97): a beat a
// pulse, its "e" the triplet's middle eighth, its "and" the pulse's last, and
// its "a" the last as well, or the middle where the "and" is taken; a sixteenth
// burst of three or four is the triplet. The levels, the shapes and the endings
// are four's. Six's are written for a bar of two from the same cells: each a
// strong pulse and the backbeat's answer, and an ending landing in the first
// pulse and holding through the second, which belongs to the next phrase.
//
// A level's notes a bar are counted for a bar of four quarter notes, and a bar of
// twelve is six of them and a bar of six three. At disco's pulse a bar of twelve
// is as long as a bar of four and a bar of six half of it, so each is asked for
// four's notes a pulse: two thirds of four's figure (1.2, 2.4, 4 for 1.8, 3.6, 6).
const rhythmsInTwelve: SoloTime = {
  levels: [
    {
      name: "sparse",
      notesPerBar: 1.2,
      span: 7,
      cells: [
        "x----- ------ x---x- ------",
        "....x- x----- -----. ......",
        "x----- ----x- x----- ------",
        "...... ....x- x---x- ------",
        "x----- x----- -----. ......",
      ],
      shapes: SPARSE_SHAPES,
    },
    {
      name: "medium",
      notesPerBar: 2.4,
      span: 9,
      cells: [
        "x-x-x- --x-x- ----x- --x---",
        "x---x- x-x-x- ------ x---x-",
        "....x- x-x-x- --x--- ------",
        "x---x- ----x- x---x- ------",
        "x---x- x---x- --x--- ------",
      ],
      shapes: MEDIUM_SHAPES,
    },
    {
      // The triplet, where four has its sixteenth bursts.
      name: "busy",
      notesPerBar: 4,
      span: 12,
      cells: [
        "x-x-x- x---x- x-x-x- --x---",
        "x-x-x- x-x-x- x-x-x- x---x-",
        "x-x-x- x-x-x- --x-x- --x---",
        "..x-x- x-x-x- x---x- x-----",
        "x-x-x- x-x-x- x---x- ------",
      ],
      shapes: BUSY_SHAPES,
    },
  ],
  // Every phrase ends on a big held note, the last pulse unstruck.
  endings: [
    "x----- ------ ------ ------",
    "x---x- x----- ------ ------",
    "....x- x----- ------ ------",
    "x...x- x----- ------ ------",
    "x---x- ------ ------ ------",
  ],
  // On the eighths, legato: the last eighth, two, and at the busy level two pulses.
  pickups: [
    { weight: 2, cell: "....x-" },
    { weight: 1, cell: "..x-x-" },
    { weight: 0.5, cell: "....x- x-x-x-", levels: ["busy"] },
  ],
  peak: "x----- -----. ...... ......",
};

const rhythmsInSix: SoloTime = {
  levels: [
    {
      name: "sparse",
      notesPerBar: 1.2,
      span: 7,
      cells: ["x----- ------", "x---x- ------", "....x- x-----", "x----- ----x-", "x----- x-----"],
      shapes: SPARSE_SHAPES,
    },
    {
      name: "medium",
      notesPerBar: 2.4,
      span: 9,
      cells: ["x-x-x- --x-x-", "x---x- x-x-x-", "....x- x-x-x-", "x---x- ----x-", "x---x- x---x-"],
      shapes: MEDIUM_SHAPES,
    },
    {
      name: "busy",
      notesPerBar: 4,
      span: 12,
      cells: ["x-x-x- x---x-", "x-x-x- --x---", "x-x-x- x-x-x-", "..x-x- x-x-x-", "x---x- x-----"],
      shapes: BUSY_SHAPES,
    },
  ],
  // Each lands in the first pulse and holds through the second; none lands on the first pulse's
  // last eighth alone, which at the top of disco's range leaves less than a breath after it.
  endings: ["x----- ------", "x---x- ------", "..x-x- ------", "x...x- ------", "..x--- ------"],
  // The last eighth, or two.
  pickups: [
    { weight: 2, cell: "....x-" },
    { weight: 1, cell: "..x-x-" },
  ],
  peak: "x----- ------",
};

export const discoSolo: SoloStyle = {
  // The alto in twelve and in six, written above.
  meters: { "12/8": rhythmsInTwelve, "6/8": rhythmsInSix },
  instrument: "alto-sax",
  // The line's home is a major third over the instrument's: over the chuck, not inside it
  // (ST-disco-22).
  lift: 4,

  notes: {
    // The pentatonic on each chord's own root (ST-disco-21): major 1 2 3 5 6, a dominant the
    // same with its flat 7th, minor 1 2 b3 4 5 b7. The chord's own tones are always in, so
    // only the 2nd and 6th (the 2nd and 4th on a minor chord) are added. A suspended chord
    // takes the 2nd; anything else (diminished, half-diminished, augmented) its own tones.
    chordScale: false,
    overRoot: { major: [2, 9], dominant: [2, 9], minor: [2, 5], suspended: [2] },
    key: { major: [], minor: [] },
    blue: [],
    passing: [],
  },
  // Changes land on the 3rd or the 7th; phrases rest on the 3rd, the root, the 5th
  // (ST-disco-21).
  arrive: ["third", "seventh"],
  settle: ["third", "root", "fifth"],
  hang: ["fifth", "seventh", "third"],
  landing: { perRank: 1.25, reach: 4 },
  // A pentatonic's step is up to a minor third; the half step is a way into a chord tone.
  line: {
    step: 3,
    skip: 5,
    skipCosts: 1.5,
    leapCosts: 3,
    halfStepOffChord: 2,
    halfStepsInARow: 4,
    offChordOnBeat: 3,
    strandsTheBeat: 0,
  },

  // ST-disco-23's cells.
  levels: [
    {
      name: "sparse",
      notesPerBar: 1.8,
      span: 7,
      cells: [
        "x--- ---- x-x- ----",
        "..x- x--- ---- ....",
        "x--- --x- x--- ----",
        ".... ..x- x-x- ----",
        "x--- x--- ---- ....",
      ],
      shapes: SPARSE_SHAPES,
    },
    {
      name: "medium",
      notesPerBar: 3.6,
      span: 9,
      cells: [
        "x-xx -x-x ---x -x--",
        "x-x- xx-x ---- x-x-",
        "..x- x-xx -x-- ----",
        "x--x --x- x-x- ----",
        "x-x- x--x -x-- ----",
      ],
      shapes: MEDIUM_SHAPES,
    },
    {
      name: "busy",
      notesPerBar: 6,
      span: 12,
      cells: [
        "xxxx x-x- xxxx -x--",
        "x-xx x-xx x-xx x-x-",
        "xxxx xxxx -x-x -x--",
        "..xx xxxx x-x- x---",
        "x-xx xxx- x-x- ----",
      ],
      shapes: BUSY_SHAPES,
    },
  ],
  // ST-disco-23's phrase endings: every phrase ends on a big held note.
  endings: [
    "x--- ---- ---- ----",
    "x-x- x--- ---- ----",
    "..x- x--- ---- ----",
    "x.x- x--- ---- ----",
    "x--x ---- ---- ----",
  ],

  // What a chorus is made of. The notes give only the head's period (ST-disco-24); these are
  // rock's, by length: a disco section is mostly eight or sixteen bars.
  forms: [
    { weight: 4, phrases: "s a" },
    { weight: 2, phrases: "v a" },
    { weight: 2, phrases: "r a" },
    { weight: 4, phrases: "s r a" },
    { weight: 4, phrases: "s v a" },
    { weight: 2, phrases: "v r a" },
    { weight: 4, phrases: "s r v a" },
    { weight: 2, phrases: "s r c a" },
    { weight: 1.5, phrases: "v r v a" },
    { weight: 4, phrases: "s r v a c a" },
    { weight: 1.5, phrases: "v r v a c a" },
    { weight: 1, phrases: "s r v a c r b a" },
  ],
  contours: { arch: 4, fall: 3, climb: 2, wave: 2 },

  book: {
    opening: [NEW, NEW_RIFFED, NEW, NEW_RIFFED],
    roles: {
      s: [
        NEW,
        NEW_RIFFED,
        NEW,
        {
          name: "the first idea back",
          make: "grown",
          of: "first",
          contour: "arch",
          keepOpening: true,
          oneRhythm: false,
        },
      ],
      r: [
        { name: "again", make: "again", by: 0 },
        { name: "again, moved with the chord", make: "again", by: "chord" },
        ENDING_UP,
        AS_A_RIFF,
      ],
      v: [
        ENDING_UP,
        ENDING_DOWN,
        { name: "a step along", make: "again", by: 1 },
        AS_A_RIFF,
        {
          name: "the idea, opened out",
          make: "grown",
          contour: "arch",
          keepOpening: true,
          oneRhythm: false,
        },
      ],
      a: [
        { name: "answer", make: "turned", contour: { rose: "fall", fell: "climb" } },
        { name: "answer", make: "turned", contour: "arch" },
        { name: "answer", make: "turned", contour: { rose: "wave", fell: "fall" } },
        {
          name: "answer, as a riff",
          make: "grown",
          contour: "fall",
          keepOpening: false,
          oneRhythm: true,
        },
      ],
      c: [ELSE, ELSE, { ...ELSE, name: "something else, one rhythm", oneRhythm: true }],
      b: [
        { name: "the opening idea back", make: "again", of: "opening", by: 0 },
        {
          name: "the opening idea, grown",
          make: "grown",
          of: "opening",
          contour: "arch",
          keepOpening: true,
          oneRhythm: false,
        },
      ],
    },
    peak: [
      {
        name: "the idea, climbing",
        make: "grown",
        contour: "climb",
        keepOpening: false,
        oneRhythm: false,
      },
      NEW,
      NEW_RIFFED,
    ],
    outgrown: { levels: 2, ways: [NEW, NEW_RIFFED] },
  },
  likeness: { related: 0.5, same: 0.9 },

  arc: {
    stages: [
      { density: "sparse", register: -3 },
      { density: "medium", register: -1 },
      { density: "medium", register: 0 },
      { density: "busy", register: 2 },
      { density: "busy", register: 3 },
      { density: "busy", register: 3 },
    ],
    peak: {
      above: 12,
      clear: 3,
      density: "busy",
      fromEnd: 1,
      shape: "L L E R",
      contour: "climb",
      sequence: true,
      ending: "x--- ---- .... ....",
    },
    windDown: { density: "medium", register: 0, contour: "fall" },
  },

  // Disco sits near 120: a bar of two seconds.
  tempo: { slowBar: 3.2, fastBar: 1.8 },

  space: {
    breath: 0.5,
    // A phrase takes a roomier shape a fifth of the time (ST-disco-25).
    roomier: 0.2,
    emptyBars: 1,
    patience: 7,
  },

  // Busier than its arc: disco's soloist was already the busiest in notes a second (2.0) and
  // has the least space (0.2, SO-11); half of the phrases that can go a level up do,
  // four tenths of its room given up. To move the default, change these two numbers.
  busier: { lift: 0.5, room: 0.4 },

  // The line already runs in sixteenths (ST-disco-23, funk's sixteenths made legato), so its
  // double is the thirty-second: thirteen notes a second and more at disco's tempos, past
  // what the alto or a guitar is asked anywhere (`fastest`), so it is never offered there.
  doubleTime: {
    perPulse: 8,
    chance: 0.1,
    bars: { shortest: 0.5, longest: 1 },
    climbOnly: true,
    slow: null,
  },

  habits: {
    // A figure said again, as it was, 0.35 (ST-disco-25).
    riff: 0.35,
    riffIs: "the same",
    // A figure pumps one repeated pitch on the eighths before lifting off it, 0.80, and never
    // strikes one pitch twice a sixteenth apart (ST-disco-25).
    stab: 0.8,
    stabEvery: 2,
    // The notes give no barline ties for the solo.
    tie: 0,
    chromatic: 0.15,
    enclosure: 0.05,
    // Three phrases in ten that would start on the one are led in, the horn over the floor
    // reaching for the downbeat the kick lands on (ST-disco-28); the notes gave none because
    // none was built. In its own sixteenths, legato (ST-disco-23).
    pickup: {
      chance: 0.3,
      figures: [
        // The "and" of 4.
        { weight: 2, cell: "..x-" },
        // The "and" and the "a" of 4.
        { weight: 1, cell: "..xx" },
        // The "and" of 3, 4, its "and" and "a", once the line is moving (ST-disco-23's medium).
        { weight: 1, cell: "..x-x-xx", levels: ["medium", "busy"] },
      ],
      rising: 0.6,
      approach: false,
    },
    // Seldom: a disco line rides the four on the floor and its riffs sit where they were
    // stated. Drawn early as often as late where it could go either way; in the takes the
    // suite makes none is moved: its figures run to the barline. Not the opening idea
    // brought back (`b`).
    displace: { chance: 0.15, early: 0.5, roles: ["r", "v"] },
    // On a guitar, a bend into the 3rd 0.30 and into the root 0.20 (ST-disco-25), in phrases
    // the hand gets lyrical in, as the blues and rock have it.
    bend: { third: 0.3, rootOrFifth: 0.2, around: 1, elsewhere: 0.5 },
    // The notes give disco no slide; a guitar picked for it slides seldom, at a quarter of
    // rock's chance: its landings are short and few are bent (a quarter of rock's bends a
    // phrase), and a slide is rarer than a bend.
    slide: { chance: 0.05, into: "landing" },
    // Hammer-ons and pull-offs on a guitar: the notes give none; funk's sixteenths made legato
    // (ST-disco-23) take one now and then, under half rock's chance.
    hammerOn: 0.15,
    pullOff: 0.15,
    // Vibrato on every note of six sixteenths or more (ST-disco-25): a dotted quarter.
    shake: 1.5,
    // A horn scoops into a long note 0.3 (ST-disco-25), a phrase's one arrival, and falls off a
    // phrase end 0.3 (ST-disco-25, SO-54).
    scoop: 0.3,
    fall: 0.3,
  },

  // Legato: funk's sixteenths, held on.
  touch: {
    level: 90,
    peak: 98,
    perSemitone: 0.8,
    offbeat: 5,
    valley: 10,
    pickup: 6,
    floor: 40,
    ceiling: 118,
    legato: 0.92,
  },
};
