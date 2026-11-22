// The country soloist: a clean electric guitar with a Telecaster's snap. The
// songwriter's pentatonic and the chord's own tones, landing the changes as
// the blues does (the 3rd, the root, the b7, the 5th), a lick said again, room
// between phrases; it curls up into the major third and pushes a whole step
// into the root and the fifth, the steel's bend, and shakes only a half note
// (ST-country-08). Its rhythms are rock's: a straight-eighth guitar's lines.
//
// Reading the rhythms: sixteen sixteenths to the bar, grouped by beat. `x`
// strikes a note, `-` holds it, `.` is silence.

import type { SoloStyle, Way } from "@ensemble/engine";

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

export const countrySolo: SoloStyle = {
  instrument: "clean-guitar",
  lift: 0,

  notes: {
    // The songwriter's pentatonic over everything, plus the chord's own tones: the major
    // pentatonic with the minor third under its third, the minor one in a minor key
    // (ST-country-08). The minor third is the note the curl pushes up from: it is in the
    // hand over the I and the IV only, as rock's blue third is.
    chordScale: false,
    key: { major: [0, 2, 3, 4, 7, 9], minor: [0, 3, 5, 7, 10] },
    blue: [{ degree: 3, over: [0, 5] }],
    passing: [],
  },
  // Changes land like the blues: the 3rd, the root, the b7, the 5th (ST-country-08). Phrases
  // rest on the root, a statement is left on the 3rd.
  arrive: ["third", "root", "seventh", "fifth"],
  settle: ["root", "third", "fifth"],
  hang: ["third", "fifth", "seventh"],
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

  // Rock's cells (ST-rock-22): the notes give country none.
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
  // Rock's phrase endings (ST-rock-22): each lands on a long note and leaves beat 4 unstruck.
  endings: [
    "x--- ---- ---- ----",
    "x-x- x--- ---- ----",
    "x--- x--- ---- ----",
    "..x- x-x- ---- ----",
  ],

  // What a chorus is made of: the notes give none; these are rock's, which are
  // the blues' and funk's by length: a country section is eight or sixteen bars too.
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

  // Country runs 66 to 160: a bar from 3.6 seconds down to 1.5.
  tempo: { slowBar: 3.6, fastBar: 1.5 },

  space: {
    breath: 0.5,
    // Space 0.25 (ST-country-08).
    roomier: 0.25,
    emptyBars: 1,
    patience: 7,
  },

  // As rock's: half of the phrases that can go a level up do, four tenths of its room given up.
  busier: { lift: 0.5, room: 0.4 },

  // No double time: rock's run, written and never played (its chance is nought).
  doubleTime: {
    perPulse: 4,
    chance: 0,
    bars: { shortest: 0.75, longest: 1 },
    climbOnly: true,
    slow: { from: 0.75, longest: 1 },
  },

  habits: {
    // A lick said again 0.35 (ST-country-08), as it was.
    riff: 0.35,
    riffIs: "the same",
    stab: 0,
    tie: 0,
    // Chromatic 0.25 (ST-country-08).
    chromatic: 0.25,
    enclosure: 0,
    // The notes give no pickups; rock's guitarist's are kept.
    pickup: {
      chance: 0.45,
      figures: [
        { weight: 1, cell: "..x-" },
        { weight: 2, cell: "..x-x-x-" },
        { weight: 1, cell: "x-x-x-x-", levels: ["medium", "busy"] },
      ],
      rising: 0.75,
      approach: false,
    },
    displace: { chance: 0.35, early: 0.3, roles: ["r", "v"], holds: false },
    // The curl into the major third 0.60, the steel's whole-step bend into the root or the 5th
    // 0.40 (ST-country-08), in the phrases where the hand gets lyrical, as rock's.
    bend: { third: 0.6, rootOrFifth: 0.4, around: 1, elsewhere: 0.5 },
    // The notes give no slide.
    slide: { chance: 0, into: "landing" },
    // The guitarist's hammer-ons and pull-offs, as rock's.
    hammerOn: 0.4,
    pullOff: 0.4,
    // Vibrato only on half notes (ST-country-08).
    shake: 2,
    scoop: 0,
    fall: 0,
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
