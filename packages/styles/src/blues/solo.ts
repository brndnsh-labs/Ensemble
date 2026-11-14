// The blues soloist: a few notes, said again. It plays the key's blues scale
// over every chord, lands on the chord's own tones where the chords change,
// and builds a chorus the way the form does: a line, the line again over the
// IV, and an answer.
//
// Reading the rhythms: sixteen sixteenths to the bar, grouped by beat. The
// band swings eighths into a hard triplet, so the third character of a beat
// is the swung "and", the second is the middle of the triplet (`xxx-` is a
// triplet), and the fourth is never played. `x` strikes a note, `-` holds it,
// `.` is silence.

import type { SoloStyle } from "@ensemble/engine";

export const bluesSolo: SoloStyle = {
  // The player's to change. Vibes are the default because every sampler has a good set.
  instrument: "vibraphone",
  lift: 0,

  notes: {
    // Not the chord's scale: the same six notes over all three chords is the sound (ST-blues-38).
    chordScale: false,
    // 1 b3 4 b5 5 b7, in a major key and a minor one alike.
    key: { major: [0, 3, 5, 6, 7, 10], minor: [0, 3, 5, 6, 7, 10] },
    // The blue third is blue over the I and the IV. Over the V it is a wrong note held (SO-30).
    blue: [{ degree: 3, over: [0, 5] }],
    passing: [],
  },
  // Over the IV the 3rd is the note that says the chord moved (SO-22).
  arrive: ["third", "root", "seventh", "fifth"],
  settle: ["third", "root", "fifth"],
  // A call is left on the chord's flat 7th, off the key's own triad, for the answer to resolve (KF-B-13).
  hang: ["seventh", "fifth", "third"],

  levels: [
    {
      // A few notes and a long one, with a bar or two of room.
      name: "sparse",
      notesPerBar: 2,
      span: 6,
      cells: [
        "x-x- x--- ---- ....",
        "..x- x-x- ---- ....",
        "x--- x-x- ---- ....",
        ".... x-x- x-x- ----",
      ],
      // The weights are the old band's (SO-09), each a fifth heavier for every bar of rest:
      // the blues leaves room (SO-11).
      shapes: [
        // Only a solo's first phrase may leave two bars empty (SO-10).
        { weight: 4.3, bars: "L E R R" },
        { weight: 4.3, bars: "R L E R" },
        // Two short things with a breath between: a call and its answer inside one phrase.
        { weight: 3.6, bars: "E R L E" },
        { weight: 2.4, bars: "L L E R" },
      ],
    },
    {
      name: "medium",
      notesPerBar: 3.5,
      span: 9,
      cells: [
        "x-x- x-x- x--- ----",
        "..x- x-x- x-x- x---",
        "x-x- x--- x-x- ----",
        "x--- x-x- x-x- ----",
        // These two run over the barline into the next bar.
        "x-x- x--- x--- x-x-",
        "..x- x-x- ---- ..x-",
      ],
      shapes: [
        { weight: 6, bars: "L L E R" },
        { weight: 3.6, bars: "E R L E" },
        { weight: 2, bars: "L E L E" },
      ],
    },
    {
      // Swung eighths, all the way through the bar.
      name: "busy",
      notesPerBar: 5,
      span: 12,
      cells: [
        "x-x- x-x- x-x- x-x-",
        "x-x- x-x- x-x- x---",
        "..x- x-x- x-x- x-x-",
        "x-x- x-x- x--- x-x-",
      ],
      shapes: [
        { weight: 4, bars: "L L L E" },
        { weight: 4.8, bars: "L L E R" },
        { weight: 2, bars: "L E L E" },
      ],
    },
    {
      // Triplets among the eighths. The arc never asks for this: a hot band or a slow
      // tempo pushes a busy phrase up into it, so a slow blues still has somewhere to go.
      name: "flying",
      notesPerBar: 6.5,
      span: 12,
      cells: [
        "xxx- x-x- xxx- x---",
        "x-x- xxx- x-x- xxx-",
        "xxx- xxx- x-x- x---",
        "..x- xxx- x-x- xxx-",
      ],
      shapes: [
        { weight: 4, bars: "L L L E" },
        { weight: 4.8, bars: "L L E R" },
        { weight: 2, bars: "L E L E" },
      ],
    },
  ],
  // Each lands on a long note and leaves beat 4 unstruck.
  endings: [
    "x--- ---- ---- ....",
    "x-x- x--- ---- ----",
    "x--- ---- ---- ----",
    "..x- x-x- ---- ----",
  ],

  forms: [
    // Say it, say it again over the IV, answer it: the twelve bars themselves.
    { weight: 4, phrases: "s r a" },
    // The second time changed.
    { weight: 4, phrases: "s v a" },
    // Pick up the last chorus's idea, changed, and go round with that.
    { weight: 2, phrases: "v r a" },
  ],
  contours: { arch: 4, fall: 3, climb: 2, wave: 2 },

  arc: {
    // Three choruses are one arc, in halves (SO-05): low and sparse, opening out, then
    // busy and high. A shorter solo goes through the same stages faster.
    stages: [
      { density: "sparse", register: -3 },
      { density: "medium", register: -1 },
      { density: "medium", register: 0 },
      { density: "busy", register: 2 },
      { density: "busy", register: 3 },
      { density: "busy", register: 3 },
    ],
    // The one top note: up to a ninth over home, held for three beats, and nothing else
    // in the solo comes within a minor third of it (SO-07).
    peak: { above: 14, clear: 3, density: "busy", ending: "x--- ---- ---- ...." },
    // Then back down at home, so the band can have the tune again.
    windDown: { density: "medium", register: 0 },
  },

  // A bar of the slow blues (66) is over three and a half seconds; of the jazz blues (140), under two.
  tempo: { slowBar: 3.2, fastBar: 1.8 },

  space: {
    // Half a second: a real breath at any tempo (KF-B-12).
    breath: 0.5,
    roomier: 0.3,
    emptyBars: 1,
    // Three bars at the stock tempo. Longer than that without a breath is running on.
    patience: 7,
  },

  habits: {
    riff: 0.35,
    // The half step under a landing: most often the blue third sliding into the third.
    chromatic: 0.2,
    enclosure: 0.05,
    // Two phrases in three that start on the one are led in from beat 4 (ST-blues-42).
    pickup: {
      chance: 0.65,
      figures: [
        // The "and" of 4.
        { weight: 1, beat: "..x-" },
        // Two swung eighths.
        { weight: 1, beat: "x-x-" },
        // A triplet on 4.
        { weight: 1, beat: "xxx-" },
      ],
      rising: 0.6,
    },
  },

  // SO-51: louder as it goes up, a short "and" leaned on, the bottom of a run ghosted.
  touch: {
    level: 88,
    peak: 96,
    perSemitone: 0.8,
    offbeat: 5,
    valley: 10,
    pickup: 6,
    floor: 40,
    ceiling: 118,
    legato: 0.92,
  },
};
