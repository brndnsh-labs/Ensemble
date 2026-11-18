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

import type { SoloStyle, SoloTime, Way } from "@ensemble/engine";

// The ways a blues phrase is made. A new statement, and one that keeps to a single rhythm
// all along its line, so the critic hears the difference.
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

// ── in twelve ───────────────────────────────────────────────────────────────
// The slow blues. A bar of 12/8 is four slow beats of three eighths: a rhythm
// is twenty-four sixteenths, written in sixes. `x-x-x-` on a beat is its
// triplet, `x---x-` the shuffle's long-short, `x-----` the beat held. The
// levels are the levels of four (the solo's arc names them): what the shuffle
// plays as swung eighths is the long-short here, and the triplets that only
// "flying" has in four come in two levels sooner, because a slow blues is
// where they live. Nothing is quicker than the eighth: a note between the
// triplet's would flam against the band, as a shuffle's last sixteenth does.
const bluesSoloInTwelve: SoloTime = {
  levels: [
    {
      name: "sparse",
      notesPerBar: 2,
      span: 6,
      cells: [
        "x---x- x----- ------ ......",
        "....x- x---x- ------ ......",
        "x----- x---x- ------ ......",
        "...... x---x- x---x- ------",
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
        "x---x- x---x- x----- ------",
        "....x- x---x- x-x-x- x-----",
        "x-x-x- x----- x---x- ------",
        "x----- x---x- x-x-x- ------",
        // These two run over the barline into the next bar.
        "x---x- x----- x----- x---x-",
        "....x- x-x-x- ------ ....x-",
      ],
      shapes: [
        { weight: 6, bars: "L L E R" },
        { weight: 3.6, bars: "E R L E" },
        { weight: 2, bars: "L E L E" },
      ],
    },
    {
      // Triplets and the long-short by turns, all the way through the bar.
      name: "busy",
      notesPerBar: 5,
      span: 12,
      cells: [
        "x-x-x- x---x- x-x-x- x---x-",
        "x---x- x-x-x- x---x- x-----",
        "....x- x-x-x- x-x-x- x---x-",
        "x-x-x- x-x-x- x----- x---x-",
      ],
      shapes: [
        { weight: 4, bars: "L L L E" },
        { weight: 4.8, bars: "L L E R" },
        { weight: 2, bars: "L E L E" },
      ],
    },
    {
      // Triplets throughout.
      name: "flying",
      notesPerBar: 6.5,
      span: 12,
      cells: [
        "x-x-x- x-x-x- x-x-x- x-----",
        "x-x-x- x-x-x- x-x-x- x---x-",
        "x-x-x- x-x-x- x-x-x- x-x-x-",
        "....x- x-x-x- x-x-x- x-x-x-",
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
    "x----- ------ ------ ......",
    "x---x- x----- ------ ------",
    "x----- ------ ------ ------",
    "....x- x---x- ------ ------",
    "x-x-x- x----- ------ ......",
  ],
  // From beat 4: its last eighth, the long-short, or the triplet.
  pickups: [
    { weight: 1, beat: "....x-" },
    { weight: 1, beat: "x---x-" },
    { weight: 1, beat: "x-x-x-" },
  ],
  peak: "x----- ------ ------ ......",
};

export const bluesSolo: SoloStyle = {
  meters: { "12/8": bluesSoloInTwelve },
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
  // A better tone wins unless the next is more than a step closer (SO-21); a remembered
  // note moves a major third at most to land.
  landing: { perRank: 1.25, reach: 4 },
  // A step of the blues scale is a whole step or a minor third; a fourth is a skip. A half
  // step is a way into a chord tone (the blue third up to the third, the fourth down to
  // it): onto anything else, or two in a row, it is a crawl. Nothing here runs the changes.
  line: {
    step: 3,
    skip: 5,
    skipCosts: 1.5,
    leapCosts: 3,
    halfStepOffChord: 2,
    halfStepsInARow: 4,
    offChordOnBeat: 1.5,
    strandsTheBeat: 0,
  },

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

  // Fresh material is rare on purpose: a statement is new, and everything else in its
  // chorus is made out of it.
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
      // Again: as it was, moved to the IV with the chord, with a new ending, or as a riff.
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
        { name: "two steps along", make: "again", by: 2 },
        AS_A_RIFF,
        {
          name: "the idea, opened out",
          make: "grown",
          contour: "arch",
          keepOpening: true,
          oneRhythm: false,
        },
      ],
      // An answer keeps the question's rhythm and turns its line the other way (AU-36).
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
        {
          name: "answer, opened out",
          make: "grown",
          contour: "fall",
          keepOpening: false,
          oneRhythm: false,
        },
      ],
    },
    // The climb to the top note: the idea in a rising sequence if there is one (SO-05).
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
  // Two unrelated blues phrases score under a half; nine tenths is the phrase again.
  likeness: { related: 0.5, same: 0.9 },

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
    // in the solo comes within a minor third of it (SO-07). The phrase before the last
    // climbs to it, three bars in a rising sequence and the note (SO-05, SO-09).
    peak: {
      above: 14,
      clear: 3,
      density: "busy",
      fromEnd: 1,
      shape: "L L L E",
      contour: "climb",
      sequence: true,
      ending: "x--- ---- ---- ....",
    },
    // Then back down at home, so the band can have the tune again.
    windDown: { density: "medium", register: 0, contour: "fall" },
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

  busier: { lift: 0, room: 0 },

  habits: {
    riff: 0.35,
    // A blues riff is a sequence: the bar again, moved along the line.
    riffIs: "sequence",
    // No figure stabbed on one note, and nothing tied over the barline (SO-38: not built
    // for the blues at stage 3).
    stab: 0,
    tie: 0,
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
      // Walked in by the scale.
      approach: false,
    },
    // On a guitar: the blue third pushed up into the third, the flat 7th into the root
    // (SO-53, ST-blues-41).
    bend: { third: 0.65, rootOrFifth: 0.45, around: 1, elsewhere: 0.5 },
    // A note held a dotted quarter is shaken (SO-52).
    shake: 1.5,
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
