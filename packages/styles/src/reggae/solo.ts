// The reggae soloist: an alto sax, the nearest thing in the band to a
// melodica. Dark and modal in a minor key, sweet in a major one; phrases that
// start after the One and come to rest on the drop; a call said again on new
// chords; a lift, not a scream (ST-reggae-24 to ST-reggae-28). A horn's scoop
// is not in the instrument model and is not played; the heads (ST-reggae-26,
// ST-reggae-28) are not built, as no style's is.
//
// Reading the rhythms: sixteen sixteenths to the bar, grouped by beat. `x`
// strikes a note, `-` holds it, `.` is silence.

import type { SoloStyle, Way } from "@ensemble/engine";

const NEW: Way = { name: "statement", make: "new", oneRhythm: false };
const NEW_RIFFED: Way = { name: "statement", make: "new", oneRhythm: true };
const ENDING_UP: Way = { name: "new ending, up", make: "ending", direction: 1 };
const ENDING_DOWN: Way = { name: "new ending, down", make: "ending", direction: -1 };
/** A whole phrase played again on the new chords (ST-reggae-27). */
const ON_THE_NEW_CHORDS: Way = { name: "again, moved with the chord", make: "again", by: "chord" };
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

export const reggaeSolo: SoloStyle = {
  instrument: "alto-sax",
  // Home a major third over the instrument's own (ST-reggae-27).
  lift: 4,

  notes: {
    // In a minor key, the key's minor pentatonic over everything, with each chord's own tones
    // (dark and modal); in a major key, the major scale, which is each diatonic chord's own
    // scale (sweet, no blue third). A key note that would rub on a chord outside the key only
    // passes (ST-reggae-24).
    chordScale: false,
    key: { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 3, 5, 7, 10] },
    blue: [],
    passing: [],
  },
  // Changes land on the 3rd, then the root, the 5th; phrases come home to the root
  // (ST-reggae-24).
  arrive: ["third", "root", "fifth"],
  settle: ["root", "third", "fifth"],
  hang: ["fifth", "third", "seventh"],
  landing: { perRank: 1.25, reach: 4 },
  // In a major key the line runs a whole-step scale; in a minor one a pentatonic, whose step is
  // up to a minor third.
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

  // ST-reggae-25's cells: phrases start after the One and rest on the drop.
  levels: [
    {
      name: "sparse",
      notesPerBar: 1.8,
      span: 7,
      cells: [
        "..x- x--- ---- ....",
        ".... x--- x--- ----",
        ".... ..x- x-x- ----",
        "..x- --.. x--- ----",
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
      notesPerBar: 3.2,
      span: 9,
      cells: [
        "..x- x-x- x--- ----",
        "x--- ..x- x--- x---",
        "..x- x-.. x-x- x---",
        ".... x-x- x--- ..x-",
      ],
      shapes: [
        { weight: 6, bars: "L L E R" },
        { weight: 3.6, bars: "E R L E" },
        { weight: 2, bars: "L E L E" },
      ],
    },
    {
      name: "busy",
      notesPerBar: 5,
      span: 10,
      cells: [
        "..x- x-x- x-x- x---",
        "x-x- ..x- x-x- x-x-",
        "..xx x-x- x--- x-x-",
        ".... x-xx x-x- x---",
      ],
      shapes: [
        { weight: 4, bars: "L L L E" },
        { weight: 4.8, bars: "L L E R" },
        { weight: 2, bars: "L E L E" },
      ],
    },
  ],
  // ST-reggae-25's phrase endings, but the last (`......x-x-------`): its last note is struck on
  // beat 3, and in a bar of three at a fast tempo the engine cannot cut it short enough to
  // leave the style's breath before a phrase that opens on the next One.
  endings: ["..x- x--- ---- ----", ".... x--- ---- ----", "..x- x-x- ---- ----"],

  // What a chorus is made of: the disco and neo-soul forms, by length. The notes give only the
  // head's period, a call, the call again and an answer (ST-reggae-26).
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
      // Said again: on the new chords first (ST-reggae-27), then as it was, or with a new end.
      r: [ON_THE_NEW_CHORDS, { name: "again", make: "again", by: 0 }, ENDING_UP, AS_A_RIFF],
      v: [
        ENDING_UP,
        ENDING_DOWN,
        ON_THE_NEW_CHORDS,
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
      { density: "busy", register: 2 },
      { density: "medium", register: 1 },
    ],
    // The peak stays within 10 semitones of home: a lift, not a scream (ST-reggae-27).
    peak: {
      above: 10,
      clear: 3,
      density: "busy",
      fromEnd: 1,
      shape: "L L E R",
      contour: "climb",
      sequence: true,
      ending: "..x- ---- .... ....",
    },
    windDown: { density: "sparse", register: 0, contour: "fall" },
  },

  // A reggae bar is about three seconds at 76.
  tempo: { slowBar: 3.4, fastBar: 1.8 },

  space: {
    breath: 0.6,
    // A phrase takes a roomier shape 45% of the time (ST-reggae-27).
    roomier: 0.45,
    emptyBars: 1,
    patience: 7,
  },

  habits: {
    // A riff repeated 0.45; a chromatic approach 0.10; no enclosures (ST-reggae-27).
    riff: 0.45,
    riffIs: "the same",
    stab: 0,
    tie: 0,
    chromatic: 0.1,
    enclosure: 0,
    pickup: { chance: 0, figures: [], rising: 0.6, approach: false },
    // No bends (ST-reggae-27): on a guitar too, the line is sung, not bent.
    bend: { third: 0, rootOrFifth: 0, around: 0, elsewhere: 0 },
    // Vibrato on notes of eight sixteenths or longer (ST-reggae-27).
    shake: 2,
  },

  // The horn laid back: a touch under disco's, legato.
  touch: {
    level: 88,
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
