// The neo-soul soloist: a clean electric guitar behind a singer, over the
// Rhodes. The pentatonic on each chord's own root; changes landed on the 3rd or
// the chord's written colour; phrases left floating on the 9th; late entries on
// the "e"s and "a"s; the most space of any lead (ST-neosoul-29 to ST-neosoul-33).
// A slide into a note is not in the instrument model and is not played; the
// heads (ST-neosoul-32, ST-neosoul-34) are not built, as no style's is.
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

/** Each level's phrase shapes, the same in every meter. */
const neosoulSparseShapes = [
  { weight: 4.3, bars: "L E R R" },
  { weight: 4.3, bars: "R L E R" },
  { weight: 3.6, bars: "E R L E" },
  { weight: 2.4, bars: "L L E R" },
];
const neosoulMediumShapes = [
  { weight: 6, bars: "L L E R" },
  { weight: 3.6, bars: "E R L E" },
  { weight: 2, bars: "L E L E" },
];
const neosoulBusyShapes = [
  { weight: 4, bars: "L L L E" },
  { weight: 4.8, bars: "L L E R" },
  { weight: 2, bars: "L E L E" },
];

// ── in twelve and in six ────────────────────────────────────────────────────
// The same guitarist over the soul ballad. A bar of 12/8 is four slow pulses of
// three eighths, written in sixes; a bar of 6/8 is two. Only the eighths are
// struck. The late entries of four (on the "e"s and the "a"s) come in on the
// triplet's middle eighth and on the pulse's last: twelve's rhythms are
// ST-neosoul-31's said in pulses (a beat a pulse, its "e" the middle eighth, its
// "and" and its "a" the last), so the levels, the shapes and the endings are
// four's, and a sixteenth burst is the triplet. Six's are written for a bar of
// two: a phrase cell leans into the backbeat or comes in late after it, and an
// ending holds through the second pulse, which belongs to the next phrase.
const rhythmsInTwelve: SoloTime = {
  levels: [
    {
      name: "sparse",
      notesPerBar: 1.8,
      span: 7,
      cells: [
        "....x- --x--- ------ ......",
        "....x- x---x- ------ --....",
        "x---x- ------ --.... ......",
        "...... ....x- x-x-x- ------",
        "..x-x- ------ -----. ......",
      ],
      shapes: neosoulSparseShapes,
    },
    {
      name: "medium",
      notesPerBar: 3.4,
      span: 9,
      cells: [
        "....x. ..x--- --x-x- ------",
        "x---x- --x-x- x----- ------",
        "....x- --x-x- x---x- --....",
        "x---x- --x--- --..x- --x---",
        "..x-x- --x--- x---x- ------",
      ],
      shapes: neosoulMediumShapes,
    },
    {
      name: "busy",
      notesPerBar: 5.5,
      span: 12,
      cells: [
        "x---x. x---x- x-x-x- ------",
        "....x. x-x-x- --x-x- x---x-",
        "x-x-x- x---x- x---x- x-----",
        "x---x- x-x-x- x---x- --x---",
        "..x-x. ..x-x- --x-x. ..x---",
      ],
      shapes: neosoulBusyShapes,
    },
  ],
  endings: [
    "....x- x----- ------ ......",
    "x---x- ------ ------ ......",
    "....x- --x--- ------ ......",
    "x----- ------ ------ ......",
    "..x-x- --x--- ------ ......",
  ],
  // On the eighths: the last eighth, two, and at the busy level two pulses.
  pickups: [
    { weight: 2, cell: "....x-" },
    { weight: 1, cell: "..x-x-" },
    { weight: 0.5, cell: "....x- ..x-x-", levels: ["busy"] },
  ],
  peak: "x----- ------ ...... ......",
};

const rhythmsInSix: SoloTime = {
  levels: [
    {
      name: "sparse",
      notesPerBar: 1.3,
      span: 7,
      cells: ["....x- --x---", "x---x- ------", "..x--- ------", "...... ..x-x-", "..x-x- ------"],
      shapes: neosoulSparseShapes,
    },
    {
      name: "medium",
      notesPerBar: 2.3,
      span: 9,
      cells: ["..x-x- ..x---", "x---x- --x-x-", "....x- x-x---", "x---x- ..x---", "..x-x- x-----"],
      shapes: neosoulMediumShapes,
    },
    {
      name: "busy",
      notesPerBar: 3.3,
      span: 12,
      cells: ["x-x-x- x-x-x-", "..x-x- x-x-x-", "x-x-x- ..x-x-", "x---x- x-x-x-", "..x-x- x---x-"],
      shapes: neosoulBusyShapes,
    },
  ],
  // Each lands in the first pulse and holds through the second.
  endings: ["....x- ------", "x---x- ------", "..x--- ------", "x----- ------", "..x-x- ------"],
  // The last eighth, or two.
  pickups: [
    { weight: 2, cell: "....x-" },
    { weight: 1, cell: "..x-x-" },
  ],
  peak: "x----- ------",
};

export const neosoulSolo: SoloStyle = {
  // The soul ballad in twelve and in six, written above.
  meters: { "12/8": rhythmsInTwelve, "6/8": rhythmsInSix },
  instrument: "clean-guitar",
  // Home a major third over the instrument's own, over the Rhodes (ST-neosoul-30).
  lift: 4,

  notes: {
    // The pentatonic on each chord's own root (ST-neosoul-29): major 1 2 3 5 6, a dominant the
    // same with its flat 7th, minor 1 b3 4 5 b7. The chord's own tones are always in, so only
    // the 2nd and 6th (the 4th on a minor chord) are added. A suspended chord takes the 2nd.
    chordScale: false,
    overRoot: { major: [2, 9], dominant: [2, 9], minor: [5], suspended: [2] },
    key: { major: [], minor: [] },
    blue: [],
    passing: [],
  },
  // Changes land on the 3rd, then the chord's written colour, then the 7th, 5th and root;
  // phrases float on the written 9th where there is one, else the 3rd (ST-neosoul-29). An
  // altered tension is a written ninth or thirteenth too, which the ranking cannot tell apart.
  arrive: ["third", "ninth", "eleventh", "thirteenth", "seventh", "fifth", "root"],
  settle: ["ninth", "third", "fifth", "root"],
  hang: ["fifth", "seventh", "ninth", "third"],
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

  // ST-neosoul-31's cells: late entries on the "e"s and "a"s.
  levels: [
    {
      name: "sparse",
      notesPerBar: 1.8,
      span: 7,
      cells: [
        "...x -x-- ---- ....",
        "..x- x--x ---- -...",
        "x--x ---- -... ....",
        ".... ..x- xx-x ----",
        ".x-x ---- ---. ....",
      ],
      shapes: neosoulSparseShapes,
    },
    {
      name: "medium",
      notesPerBar: 3.4,
      span: 9,
      cells: [
        "..xx -x-- -x-x ----",
        "x--x -xx- x--- ----",
        "...x -x-x x-x- -...",
        "x-.x -x-- -..x -x--",
        ".x-x -x-- x-x- ----",
      ],
      shapes: neosoulMediumShapes,
    },
    {
      name: "busy",
      notesPerBar: 5.5,
      span: 12,
      cells: [
        "x-xx x-x- xx-x ----",
        "..xx xx-x -x-x x-x-",
        "xxx- x--x x-x- x---",
        "x-x- xxx- x--x -x--",
        ".xxx -x-x -xxx -x--",
      ],
      shapes: neosoulBusyShapes,
    },
  ],
  // ST-neosoul-31's phrase endings.
  endings: [
    "..x- x--- ---- ----",
    "x--x ---- ---- ----",
    "...x -x-- ---- ----",
    "x--- ---- ---- ....",
    ".x-x -x-- ---- ----",
  ],

  // What a chorus is made of. The notes give only the heads' period (ST-neosoul-32); these are
  // the rock and disco forms, by length.
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
      { density: "sparse", register: -1 },
      { density: "medium", register: 0 },
      { density: "medium", register: 1 },
      { density: "busy", register: 3 },
      { density: "medium", register: 2 },
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
    windDown: { density: "sparse", register: 0, contour: "fall" },
  },

  // A neo-soul bar is nearly three seconds at 85.
  tempo: { slowBar: 3.4, fastBar: 1.8 },

  space: {
    breath: 0.6,
    // A phrase takes a roomier shape almost half the time: the most space of any lead
    // (ST-neosoul-33).
    roomier: 0.45,
    emptyBars: 1,
    patience: 7,
  },

  // Busier than its arc: six tenths of the phrases that can go a level up do, but only a fifth of its room
  // given up. Neo-soul leaves the most space of any lead (0.45, SO-11; ST-neosoul-33), and at its
  // tempos (60 to 88) it played about one note a second, which is what KF-B-12 says goes
  // unrecognised. To move the default, change these two numbers.
  busier: { lift: 0.6, room: 0.2 },

  habits: {
    // A riff repeated 0.15; a chromatic approach 0.30, an enclosure 0.12 (ST-neosoul-33).
    riff: 0.15,
    riffIs: "the same",
    stab: 0,
    tie: 0,
    chromatic: 0.3,
    enclosure: 0.12,
    // Seldom: a neo-soul line enters late, on the "e"s and "a"s after the one (ST-neosoul-31),
    // not before it. A phrase that would start on the one is led in one time in five, by a
    // sixteenth or two on the "a"s, a grace into it; its last the half step under as often as
    // the line approaches that way (the slide into the 3rd, ST-neosoul-33).
    pickup: {
      chance: 0.2,
      figures: [
        // The "a" of 4.
        { weight: 2, cell: "...x" },
        // The "e" and the "a" of 4.
        { weight: 1, cell: ".x-x" },
        // The "a" of 3, the "e" and the "a" of 4, once the line is moving.
        { weight: 0.5, cell: "...x.x-x", levels: ["medium", "busy"] },
      ],
      rising: 0.6,
      approach: true,
    },
    // An idea said again behind where it was is the style's laid-back feel written into the
    // phrase, mostly late (early 0.2 where it could go either way). Its long notes reach the
    // barline, which a beat late would cross, so few are moved. Not the opening idea brought
    // back (`b`).
    displace: { chance: 0.35, early: 0.2, roles: ["r", "v"] },
    // On a guitar, a bend into the root 0.08 (ST-neosoul-33, SO-53), in phrases the hand gets
    // lyrical in, as every guitar style has it. Its move into the 3rd is not a bend: the notes
    // write it as a half-step slide (below), which was played as a bend while there was none.
    bend: { third: 0, rootOrFifth: 0.08, around: 1, elsewhere: 0.5 },
    // The half-step slide up into the 3rd 0.40 (ST-neosoul-33): the one-fret slide from the
    // minor third, and no other.
    slide: { chance: 0.4, into: "third" },
    // Hammer-ons and pull-offs: the notes give no figure, and this lead leaves the most space of
    // any (ST-neosoul-33): under half rock's chance.
    hammerOn: 0.15,
    pullOff: 0.15,
    // Vibrato only on notes of eight sixteenths or longer: a half note (ST-neosoul-33, SO-52).
    shake: 2,
    // A horn scoops 0.35 (ST-neosoul-33, SO-53), a phrase's one arrival; the notes give it no
    // fall.
    scoop: 0.35,
    fall: 0,
  },

  // Behind a singer: a touch under the horns, legato.
  touch: {
    level: 86,
    peak: 96,
    perSemitone: 0.8,
    offbeat: 4,
    valley: 10,
    pickup: 6,
    floor: 40,
    ceiling: 116,
    legato: 0.92,
  },
};
