// The rock soloist: the key's pentatonic and the chord's own tones, landing
// the changes on fifths first, coming to rest on the root, a lick said again
// as it was. Straight eighths, with sixteenth bursts at the top (ST-rock-21 to
// ST-rock-24).
//
// The lead is the overdriven guitar (ST-rock-21). Its hand bends into the
// notes a phrase lands on and shakes the ones it holds; slides, and a bend let
// back down, are not played (Brandon's ear, on nine ways of drawing them).
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
  lift: 0,
} satisfies Way;

// ── in twelve ───────────────────────────────────────────────────────────────
// The rock ballad. A bar of 12/8 is four slow pulses of three eighths: a rhythm
// is twenty-four sixteenths, written in sixes. ST-rock-22's cells said in
// pulses: a quarter note of four is a pulse held (`x-----`), its eighths the
// pulse and its last eighth (`x---x-`), and the sixteenth bursts of the busy
// level are the triplet (`x-x-x-`). Nothing is quicker than an eighth. The
// levels are the levels of four, by name; the hand is the same player's, so its
// bends and its shake are as they are in four.
const rockSoloInTwelve: SoloTime = {
  levels: [
    {
      name: "sparse",
      notesPerBar: 1.6,
      span: 6,
      cells: [
        "x----- ------ x----- ------",
        "x----- ----x- x----- ------",
        "...... x----- x----- ------",
        "x----- x----- ------ ......",
      ],
      shapes: [
        { weight: 4.3, bars: "L E R R" },
        { weight: 4.3, bars: "R L E R" },
        { weight: 3.6, bars: "E R L E" },
        { weight: 2.4, bars: "L L E R" },
      ],
    },
    {
      name: "medium",
      notesPerBar: 3.5,
      span: 9,
      cells: [
        "x---x- x----- x----- ------",
        "x----- x---x- x----- x-----",
        "....x- x---x- x----- ------",
        "x---x- x---x- x----- ------",
      ],
      shapes: [
        { weight: 6, bars: "L L E R" },
        { weight: 3.6, bars: "E R L E" },
        { weight: 2, bars: "L E L E" },
      ],
    },
    {
      // The triplet at the peak, where four has its sixteenth bursts.
      name: "busy",
      notesPerBar: 6,
      span: 12,
      cells: [
        "x---x- x-x-x- x---x- x-----",
        "x-x-x- x---x- x----- ------",
        "x---x- x---x- x---x- x---x-",
        "x---x- x-x-x- x---x- x-x-x-",
      ],
      shapes: [
        { weight: 4, bars: "L L L E" },
        { weight: 4.8, bars: "L L E R" },
        { weight: 2, bars: "L E L E" },
      ],
    },
  ],
  // Each lands on a long note and leaves the last pulse unstruck.
  endings: [
    "x----- ------ ------ ------",
    "x---x- x----- ------ ------",
    "x----- x----- ------ ------",
    "....x- x---x- ------ ------",
  ],
  // As in four, said in pulses: the last eighth, three eighths up into the one (a pulse's
  // triplet, which is the busy level's figure), and from the medium level two pulses.
  pickups: [
    { weight: 1, cell: "....x-" },
    { weight: 2, cell: "x-x-x-" },
    { weight: 1, cell: "....x- x-x-x-", levels: ["medium", "busy"] },
  ],
  peak: "x----- ------ ...... ......",
};

export const rockSolo: SoloStyle = {
  meters: { "12/8": rockSoloInTwelve },
  instrument: "driven-guitar",
  lift: 0,

  notes: {
    // The key's pentatonic over everything, plus the chord's own tones (ST-rock-21).
    chordScale: false,
    // Major pentatonic with the blue minor third; minor pentatonic in a minor key.
    key: { major: [0, 2, 3, 4, 7, 9], minor: [0, 3, 5, 7, 10] },
    // The blue third is blue over the I and the IV only (ST-rock-21).
    blue: [{ degree: 3, over: [0, 5] }],
    passing: [],
  },
  // Changes land on the 5th first, then 3rd, 7th, root; phrases rest on the root (ST-rock-21).
  arrive: ["fifth", "third", "seventh", "root"],
  settle: ["root", "fifth", "third"],
  // A statement is left on the 5th, a question the root answers.
  hang: ["fifth", "third", "seventh"],
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

  // ST-rock-22's cells.
  levels: [
    {
      name: "sparse",
      notesPerBar: 1.6,
      span: 6,
      cells: [
        "x--- ---- x--- ----",
        "x--- --x- x--- ----",
        ".... x--- x--- ----",
        "x--- x--- ---- ....",
      ],
      shapes: [
        { weight: 4.3, bars: "L E R R" },
        { weight: 4.3, bars: "R L E R" },
        { weight: 3.6, bars: "E R L E" },
        { weight: 2.4, bars: "L L E R" },
      ],
    },
    {
      name: "medium",
      notesPerBar: 3.5,
      span: 9,
      cells: [
        "x-x- x--- x--- ----",
        "x--- x-x- x--- x---",
        "..x- x-x- x--- ----",
        "x-x- x-x- x--- ----",
      ],
      shapes: [
        { weight: 6, bars: "L L E R" },
        { weight: 3.6, bars: "E R L E" },
        { weight: 2, bars: "L E L E" },
      ],
    },
    {
      // Sixteenth bursts at the peak.
      name: "busy",
      notesPerBar: 6,
      span: 12,
      cells: [
        "x-x- xxxx x-x- x---",
        "xxxx x-x- x--- ----",
        "x-x- x-x- x-x- x-x-",
        "x-xx x-x- x-xx x---",
      ],
      shapes: [
        { weight: 4, bars: "L L L E" },
        { weight: 4.8, bars: "L L E R" },
        { weight: 2, bars: "L E L E" },
      ],
    },
  ],
  // ST-rock-22's phrase endings: each lands on a long note and leaves beat 4 unstruck.
  endings: [
    "x--- ---- ---- ----",
    "x-x- x--- ---- ----",
    "x--- x--- ---- ----",
    "..x- x-x- ---- ----",
  ],

  // What a chorus is made of. The notes give only the head's period (ST-rock-23); these are
  // the blues' and funk's, by length: a rock section is mostly eight or sixteen bars.
  forms: [
    // Eight bars: a line and its answer.
    { weight: 4, phrases: "s a" },
    { weight: 2, phrases: "v a" },
    { weight: 2, phrases: "r a" },
    // Twelve.
    { weight: 4, phrases: "s r a" },
    { weight: 4, phrases: "s v a" },
    { weight: 2, phrases: "v r a" },
    // Sixteen: said, said again, changed, answered.
    { weight: 4, phrases: "s r v a" },
    { weight: 2, phrases: "s r c a" },
    { weight: 1.5, phrases: "v r v a" },
    // Twenty-four: a verse, a chorus and a bridge.
    { weight: 4, phrases: "s r v a c a" },
    { weight: 1.5, phrases: "v r v a c a" },
    // Thirty-two.
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
      above: 14,
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

  // Rock runs 85 to 140: a bar from 2.8 seconds down to 1.7.
  tempo: { slowBar: 3.2, fastBar: 1.8 },

  space: {
    breath: 0.5,
    // A phrase takes a roomier shape a quarter of the time (ST-rock-24).
    roomier: 0.25,
    emptyBars: 1,
    patience: 7,
  },

  // Busier than its arc: half of the phrases that can go a level up do, four tenths of its room given
  // up (rock's space is jazz's, 0.25, SO-11). To move the default, change these two numbers.
  busier: { lift: 0.5, room: 0.4 },

  habits: {
    // A lick said again, as it was, 0.40 (ST-rock-24).
    riff: 0.4,
    riffIs: "the same",
    stab: 0,
    // No pickups and no barline ties (ST-rock-24).
    tie: 0,
    chromatic: 0.1,
    enclosure: 0,
    // A phrase that would start on the one is led in a little under half the time: three
    // eighths up the pentatonic into it most of all (Brandon, 2026-11-17; ST-rock-24 had none,
    // because none was built). From below three times in four: up into the one.
    pickup: {
      chance: 0.45,
      figures: [
        // The "and" of 4.
        { weight: 1, cell: "..x-" },
        // Three eighths from the "and" of 3, up into the one.
        { weight: 2, cell: "..x-x-x-" },
        // Half a bar of eighths, once the line is moving (ST-rock-22's medium cells).
        { weight: 1, cell: "x-x-x-x-", levels: ["medium", "busy"] },
        // The busy level's sixteenth burst on beat 4, after the "and" of 3 (ST-rock-22).
        { weight: 1, cell: "..x-xxxx", levels: ["busy"] },
      ],
      rising: 0.75,
      approach: false,
    },
    // The blue third pushed up into the third, the flat 7th into the root or the 4th into the
    // 5th (SO-53, ST-rock-24).
    bend: { third: 0.45, rootOrFifth: 0.55, around: 1, elsewhere: 0.5 },
    // A note held a dotted quarter is shaken (SO-52).
    shake: 1.5,
  },

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
