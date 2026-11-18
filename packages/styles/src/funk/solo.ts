// The funk soloist: an alto phrased like a horn section. Short figures on
// the sixteenths with holes in them, a bar said again more often than not, a
// figure stabbed on one note before the line moves. It lands the changes on
// fifths and roots, comes in on the bar and never leans over the barline.
//
// Reading the rhythms: sixteen sixteenths to the bar, grouped by beat; the
// band swings sixteenths by a trace. `x` strikes a note, `-` holds it, `.` is
// silence: `x.` is a sixteenth and a hole, which is most of what is played.

import type { SoloStyle, SoloTime, Way } from "@ensemble/engine";

// A new riff: one bar's figure all along its line, said again as the style's habit has it.
const RIFF: Way = { name: "riff", make: "new", oneRhythm: true };
// A new line whose bars take two figures by turns, or one again when the habit says.
const NEW: Way = { name: "statement", make: "new", oneRhythm: false };
const ENDING_UP: Way = { name: "new ending, up", make: "ending", direction: 1 };
const ENDING_DOWN: Way = { name: "new ending, down", make: "ending", direction: -1 };
const AS_A_RIFF: Way = {
  name: "the idea, as a riff",
  make: "grown",
  contour: "arch",
  keepOpening: true,
  oneRhythm: true,
};
// Something else: other figures than the riff used, a little higher.
const ELSE = {
  name: "something else",
  make: "new",
  oneRhythm: true,
  apart: true,
  lift: 3,
} satisfies Way;

/** Each level's phrase shapes, the player's and not the bar's: the same in every meter. */
const SHAPES = {
  // SO-09's weights, each a fifth heavier for every bar of rest: funk leaves room (SO-11).
  sparse: [
    { weight: 4.3, bars: "L E R R" },
    { weight: 4.3, bars: "R L E R" },
    { weight: 3.6, bars: "E R L E" },
    { weight: 2.4, bars: "L L E R" },
  ],
  medium: [
    { weight: 6, bars: "L L E R" },
    { weight: 3.6, bars: "E R L E" },
    { weight: 2, bars: "L E L E" },
  ],
  busy: [
    { weight: 4, bars: "L L L E" },
    { weight: 4.8, bars: "L L E R" },
    { weight: 2, bars: "L E L E" },
  ],
} as const;

// ── in twelve and in six ────────────────────────────────────────────────────
// The same horn handed a chart in 12/8 or 6/8. A rhythm is a bar of the meter
// in sixes, a pulse to a group, and every note starts on an eighth: nothing is
// quicker, and nothing swings. The horn's own clip is kept: `x.` is still a
// note let go after a sixteenth, so an eighth is struck and stopped short, the
// stab of four; `-` holds. The cells are four's said in pulses (a beat a pulse,
// an "and" or an "a" the pulse's last eighth, an "e" its middle): short figures
// with the rest of the bar left open, the busy level's sixteenth bursts the
// pulse's three eighths, never wall to wall. The same three levels by name, the
// same phrase shapes, no pickups and nothing over the barline (ST-funk-33).
//
// A bar of twelve lasts half as long again as a bar of four at the meter's
// usual tempo, so its levels play half as many notes again; a bar of six three
// quarters as many. Each ending lands on the phrase's one long note and leaves
// the last pulse unstruck.

const funkSoloInTwelve: SoloTime = {
  levels: [
    {
      name: "sparse",
      notesPerBar: 3,
      span: 6,
      cells: [
        "x...x. ....x. ...... ......",
        "....x. x...x. ...... ......",
        "x.x... ....x. x..... ......",
        "...... x...x. ..x... ......",
      ],
      shapes: SHAPES.sparse,
    },
    {
      name: "medium",
      notesPerBar: 5,
      span: 9,
      cells: [
        "x...x. ....x. x.x... ......",
        "....x. x.x.x. ....x. x.....",
        "x.x.x. ....x. x...x. ......",
        "x...x. ..x... x...x. ..x...",
      ],
      shapes: SHAPES.medium,
    },
    {
      name: "busy",
      notesPerBar: 8,
      span: 12,
      cells: [
        "x.x.x. ..x.x. x.x... x.x...",
        "x.x... x.x.x. ..x.x. x.....",
        "....x. x.x.x. x...x. x.x...",
        "x...x. x.x... x.x.x. ..x.x.",
      ],
      shapes: SHAPES.busy,
    },
  ],
  endings: [
    "x.x.x. x----- ----.. ......",
    "x----- ------ ...... ......",
    "....x. x.x--- ----.. ......",
    "x...x. ..x--- ------ ......",
  ],
  pickups: [],
  peak: "x----- ------ ...... ......",
};

const funkSoloInSix: SoloTime = {
  levels: [
    {
      name: "sparse",
      notesPerBar: 1.5,
      span: 6,
      cells: ["x...x. ......", "....x. x.....", "x.x... ....x.", "...... x...x."],
      shapes: SHAPES.sparse,
    },
    {
      name: "medium",
      notesPerBar: 2.6,
      span: 9,
      cells: ["x...x. ..x...", "..x.x. x.....", "x.x... x...x.", "x...x. x.x..."],
      shapes: SHAPES.medium,
    },
    {
      name: "busy",
      notesPerBar: 4.1,
      span: 12,
      cells: ["x.x.x. ..x.x.", "x.x... x.x.x.", "..x.x. x.x...", "x...x. x.x.x."],
      shapes: SHAPES.busy,
    },
  ],
  // In a bar of two the long note lands in the first pulse and is held into the second.
  endings: ["x----- ----..", "x.x--- --....", "..x.x- ---...", "x...x- ----.."],
  pickups: [],
  peak: "x----- ----..",
};

export const funkSolo: SoloStyle = {
  // The same horn in twelve-eight and six-eight, written above.
  meters: { "12/8": funkSoloInTwelve, "6/8": funkSoloInSix },

  instrument: "alto-sax",
  lift: 0,

  notes: {
    // The chord's own scale, and the key's minor pentatonic where it suits (ST-funk-29).
    chordScale: true,
    key: { major: [0, 3, 5, 7, 10], minor: [0, 3, 5, 7, 10] },
    // In a major key the flat 3rd and flat 7th are the key's colour over the I and the IV
    // only; elsewhere they are in where the chord's own scale has them, which in a minor
    // key is nearly everywhere.
    blue: [
      { degree: 3, over: [0, 5] },
      { degree: 10, over: [0, 5] },
    ],
    passing: [],
  },
  // The fifth, then the third; the root last, or the line is the bass an octave up (SO-22).
  arrive: ["fifth", "third", "seventh", "root"],
  // A riff comes home to the root.
  settle: ["root", "fifth", "third"],
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

  levels: [
    {
      // Three or four stabs and the rest of the bar left open.
      name: "sparse",
      notesPerBar: 2,
      span: 6,
      cells: [
        "x..x ..x. .... ....",
        "..x. x..x .... ....",
        "x.x. ..x. x... ....",
        ".... x..x .x.. ....",
      ],
      shapes: SHAPES.sparse,
    },
    {
      name: "medium",
      notesPerBar: 3.5,
      span: 9,
      cells: [
        "x..x ..x. x.x. ....",
        "..x. xx.x ..x. x...",
        "x.xx ..x. x..x ....",
        "x..x .x.. x..x .x..",
      ],
      shapes: SHAPES.medium,
    },
    {
      // Sixteenths in bursts, still with holes: never a bar played wall to wall.
      name: "busy",
      notesPerBar: 5.5,
      span: 12,
      cells: [
        "x.xx .xx. x.xx .x..",
        "xxx. x.xx .x.x .x..",
        "..xx .x.x x.x. xx..",
        "x.x. xx.x .xx. x.x.",
      ],
      shapes: SHAPES.busy,
    },
  ],
  // Each finishes on the one long note of the phrase and leaves beat 4 unstruck.
  endings: [
    "x.x. x--- --.. ....",
    "x--- ---- .... ....",
    "..x. x.x- --.. ....",
    "x..x ..x- ---- ....",
  ],

  // What a chorus is made of. A funk chorus is a riff worked: said, said again, pushed,
  // and brought home. The notes give only the head's period (ST-funk-31).
  forms: [
    // Sixteen bars, which is what a short vamp's chorus is: the riff, the riff again, the
    // riff changed, and an answer that comes home to the root.
    { weight: 4, phrases: "s r v a" },
    // Or the third phrase is something else, and the answer brings the riff's rhythm back.
    { weight: 2, phrases: "s r c a" },
    // A later chorus may keep the riff it has and push it; more often it brings a new one
    // at the pace the solo has reached.
    { weight: 1.5, phrases: "v r v a" },
    // Twenty-four (a verse, a chorus and a bridge): the bridge is where something else goes.
    { weight: 4, phrases: "s r v a c a" },
    { weight: 1.5, phrases: "v r v a c a" },
    // Thirty-two.
    { weight: 1, phrases: "s r v a c r b a" },
    // Twelve.
    { weight: 4, phrases: "s r a" },
    { weight: 2, phrases: "v r a" },
    // Eight.
    { weight: 4, phrases: "s a" },
    { weight: 2, phrases: "v a" },
    { weight: 2, phrases: "r a" },
  ],
  contours: { arch: 4, fall: 3, climb: 2, wave: 2 },

  book: {
    opening: [RIFF, NEW, RIFF, NEW],
    roles: {
      s: [
        RIFF,
        NEW,
        RIFF,
        {
          name: "the first riff back",
          make: "grown",
          of: "first",
          contour: "arch",
          keepOpening: true,
          oneRhythm: true,
        },
      ],
      // Said again is the point: as it was first, then moved with the chord, then as a
      // riff at this place's own pace, then with a new ending.
      r: [
        { name: "again", make: "again", by: 0 },
        { name: "again, moved with the chord", make: "again", by: "chord" },
        AS_A_RIFF,
        ENDING_UP,
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
      c: [ELSE, ELSE, { ...ELSE, name: "something else, two figures", oneRhythm: false }],
      b: [
        { name: "the opening riff back", make: "again", of: "opening", by: 0 },
        {
          name: "the opening riff, as a riff",
          make: "grown",
          of: "opening",
          contour: "arch",
          keepOpening: true,
          oneRhythm: true,
        },
      ],
    },
    // The way up to the top note: the riff in a rising sequence.
    peak: [
      {
        name: "the idea, climbing",
        make: "grown",
        contour: "climb",
        keepOpening: false,
        oneRhythm: true,
      },
      RIFF,
      NEW,
    ],
    // A riff kept from chorus to chorus keeps the pace it was born at: when it has under
    // three fifths of the notes the arc asks for, a new one is offered beside it.
    outgrown: { levels: 2, thin: 0.6, ways: [RIFF, NEW] },
  },
  // Two unrelated funk phrases share few of their sixteenths. Measured: pairs from
  // different takes score 0.4 or more 8 times in 100 (a half or more, 4 in 100), so the
  // line is drawn lower than in the blues, where chance is as likely at a half.
  likeness: { related: 0.4, same: 0.9 },

  arc: {
    // Three choruses are one arc, in halves (SO-05).
    stages: [
      { density: "sparse", register: -3 },
      { density: "medium", register: -1 },
      { density: "medium", register: 0 },
      { density: "busy", register: 2 },
      { density: "busy", register: 3 },
      { density: "busy", register: 3 },
    ],
    // The riff climbs for two bars and hits the top note on the one of the third, a half
    // note, with a bar of air after it: a horn has the breath for that at any funk tempo,
    // where three bars of line and the note would be more than its lungs.
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

  // Funk lives between 95 and 120, where a bar is two seconds or a little more.
  tempo: { slowBar: 3.2, fastBar: 1.8 },

  space: {
    breath: 0.5,
    roomier: 0.3,
    emptyBars: 1,
    patience: 7,
  },

  // Busier than its arc: six tenths of its phrases a level up, three tenths of its room given
  // up. Funk's rests inside the bar are its idiom (SO-17) and are not touched here; only the
  // bars of rest between phrases are. To move the default, change these two numbers.
  busier: { lift: 0.5, room: 0.3 },

  habits: {
    // A riff repeated bar after bar more often than not (ST-funk-32), and said the same:
    // the same notes, moved only where the chord moved.
    riff: 0.5,
    riffIs: "the same",
    // A figure is stabbed on one note before the line moves, 0.45 of the time (ST-funk-32).
    stab: 0.45,
    // No ties over the barline and no pickups (ST-funk-33): the horn comes in on the bar.
    tie: 0,
    chromatic: 0.25,
    enclosure: 0.05,
    pickup: { chance: 0, figures: [], rising: 0.6, approach: false },
    // No bends (ST-funk-32); a guitar shakes a note held a dotted half or longer (SO-52).
    bend: { third: 0, rootOrFifth: 0, around: 0, elsewhere: 0 },
    shake: 3,
  },

  // Clipped: a note that runs into the next gives up a fifth of its length.
  touch: {
    level: 88,
    peak: 96,
    perSemitone: 0.8,
    offbeat: 5,
    valley: 10,
    pickup: 6,
    floor: 40,
    ceiling: 118,
    legato: 0.8,
  },
};
