// The jazz soloist: a bebop alto. The line follows the changes: each chord's
// own scale, with the passing tone that keeps chord tones on the beats of an
// eighth-note run, landing on thirds and sevenths. It leans into its phrases
// from the beat before, approaches its landings by half step, and ties a run
// over the barline as often as not.
//
// Reading the rhythms: sixteen sixteenths to the bar, grouped by beat. The
// band swings eighths (the "and" at 60% of the beat), so only the first and
// third characters of a beat are ever struck: a note on the second or fourth
// would land between the swung eighths and read as a flam (ST-jazz-06).
// `x` strikes a note, `-` holds it, `.` is silence.

import type { SoloStyle, Way } from "@ensemble/engine";

// A new line, through-composed: its bars take two rhythms by turns.
const NEW: Way = { name: "statement", make: "new", oneRhythm: false };
// A new line that is one bar in sequence. Rare in the playing (SO-18: 0.08), so one way
// in four here, for the critic to take when it is the better phrase.
const SEQUENCE: Way = { name: "statement, in sequence", make: "new", oneRhythm: true };
const ENDING_UP: Way = { name: "new ending, up", make: "ending", direction: 1 };
const ENDING_DOWN: Way = { name: "new ending, down", make: "ending", direction: -1 };
// The bridge: other rhythms than the A's idea used, and a fourth higher (SO-41, SO-46).
const ELSE = {
  name: "something else",
  make: "new",
  oneRhythm: false,
  apart: true,
  lift: 4,
} satisfies Way;

export const jazzSolo: SoloStyle = {
  instrument: "alto-sax",
  lift: 0,

  notes: {
    // The chord's own scale and nothing of the key's: a line that spells the changes (ST-jazz-34).
    chordScale: true,
    key: { major: [], minor: [] },
    blue: [],
    // The bebop scale's extra note, which passes and is never landed on: the major 7th
    // over a mixolydian dominant, the major 3rd over a dorian minor, the sharp 5th over a
    // major chord. None over altered or diminished chords (ST-jazz-34, SO-29).
    passing: [
      { scale: "mixolydian", interval: 11 },
      { scale: "dorian", interval: 4 },
      { scale: "ionian", interval: 8 },
      { scale: "lydian", interval: 8 },
    ],
  },
  // Thirds and sevenths say the chord moved (SO-22).
  arrive: ["third", "seventh", "ninth", "fifth", "root"],
  settle: ["third", "root", "fifth"],
  // A question is left on the seventh, or a written ninth: the colour, not the triad.
  hang: ["seventh", "ninth", "fifth", "third"],
  // A seventh chord has a tone within a whole step of anywhere, so a remembered note
  // need not move far to land.
  landing: { perRank: 1.25, reach: 3 },
  // A step is a half or a whole step, and the half step is the idiom: free, and nearly
  // free twice running (the bebop scale's own three-note crawl). A third is an arpeggio's
  // step. A note on the beat is a chord tone if it can be, and the note before it is
  // chosen so that it can (AU-35).
  line: {
    step: 2,
    skip: 4,
    skipCosts: 0.75,
    leapCosts: 3,
    halfStepOffChord: 0,
    halfStepsInARow: 0.5,
    offChordOnBeat: 3,
    strandsTheBeat: 2,
  },

  levels: [
    {
      // Three or four notes and room: lines start on an upbeat as often as on a beat (SO-16).
      name: "sparse",
      notesPerBar: 2,
      span: 6,
      cells: [
        "..x- x-x- ---- ....",
        "x-x- --x- ---- ....",
        ".... x-x- x--- ----",
        "x--- ..x- x--- ....",
        "..x- ---- x-x- x---",
      ],
      // SO-09's weights; jazz's space (0.25) leaves them as they are (SO-11).
      shapes: [
        { weight: 3, bars: "L E R R" },
        { weight: 3, bars: "R L E R" },
        { weight: 3, bars: "E R L E" },
        { weight: 2, bars: "L L E R" },
      ],
    },
    {
      name: "medium",
      notesPerBar: 3.5,
      span: 9,
      cells: [
        "x--- x-x- x--- --..",
        // These two end on the "and" of 4: a run that can be tied over the barline.
        "..x- x-x- --.. x-x-",
        "x-x- x--- --.. x-x-",
        ".... x-x- x--- x---",
        "..x- --x- x--- ....",
      ],
      shapes: [
        { weight: 5, bars: "L L E R" },
        { weight: 3, bars: "E R L E" },
        { weight: 2, bars: "L E L E" },
      ],
    },
    {
      // Eighth notes, all the way through the bar. There is no level above this: nothing
      // is quicker than an eighth under this swing.
      name: "busy",
      notesPerBar: 5.5,
      span: 12,
      cells: [
        "x-x- x-x- x-x- x-x-",
        "..x- x-x- x-x- x-x-",
        "x-x- x-x- x-x- x---",
        ".... x-x- x-x- x-x-",
        "x-x- x--- x-x- x-x-",
      ],
      shapes: [
        { weight: 4, bars: "L L L E" },
        { weight: 4, bars: "L L E R" },
        { weight: 2, bars: "L E L E" },
      ],
    },
  ],
  // Each lands on a long note and leaves beat 4 unstruck. The third is the "doo-dat".
  endings: [
    "x-x- x--- ---- ....",
    "..x- x-x- ---- ....",
    "x-x- --.. .... ....",
    "x--- x--- ---- ....",
    "..x- x-x- x--- ----",
    "x--- ---- .... ....",
  ],

  // What a chorus is made of. The notes give the old band's head as a period (statement,
  // answer, contrast, statement back: ST-jazz-36) and nothing for a solo chorus; this is
  // that period, played out over the form a soloist reads.
  forms: [
    // Thirty-two bars with a bridge, in four-bar phrases. First A: an idea and its answer.
    // Second A: the idea back, changed, and answered again. Bridge: something else, and
    // that again (over a bridge that moves by sequence it moves with the chord). Last A:
    // the idea the chorus opened on, and an answer that closes.
    { weight: 4, phrases: "s a v a c r b a" },
    // The second A says the idea again plainly, and the bridge develops its own.
    { weight: 2, phrases: "s a r a c v b a" },
    // A later chorus may pick up the last one's idea, changed; mostly it brings its own.
    { weight: 1, phrases: "v a v a c r b a" },
    // Sixteen bars: two eights, the second the first one changed.
    { weight: 4, phrases: "s a v a" },
    // Or the second eight goes somewhere else before it closes.
    { weight: 2, phrases: "s a c a" },
    { weight: 1, phrases: "v a v a" },
    // Twenty-four.
    { weight: 1, phrases: "s a v a b a" },
    // Twelve bars are a blues, whoever plays them.
    { weight: 4, phrases: "s r a" },
    { weight: 4, phrases: "s v a" },
    { weight: 2, phrases: "v r a" },
    // Eight.
    { weight: 4, phrases: "s a" },
    { weight: 2, phrases: "v a" },
  ],
  contours: { arch: 4, fall: 3, climb: 2, wave: 2 },

  book: {
    opening: [NEW, NEW, SEQUENCE, NEW],
    roles: {
      s: [
        NEW,
        NEW,
        SEQUENCE,
        {
          name: "the first idea back",
          make: "grown",
          of: "first",
          contour: "arch",
          keepOpening: true,
          oneRhythm: false,
        },
      ],
      // Said again, a line this long is not pasted: it moves. Over a bridge of dominants
      // falling by fifths, moving with the chord is the sequence itself.
      r: [
        { name: "again, moved with the chord", make: "again", by: "chord" },
        { name: "again, a step along", make: "again", by: 1 },
        ENDING_UP,
        ENDING_DOWN,
        { name: "again", make: "again", by: 0 },
      ],
      // The idea come back in the second A is the idea changed, not the idea pasted.
      v: [
        ENDING_UP,
        ENDING_DOWN,
        { name: "a step along", make: "again", by: 1 },
        { name: "two steps along", make: "again", by: 2 },
        {
          name: "the idea, opened out",
          make: "grown",
          contour: "arch",
          keepOpening: true,
          oneRhythm: false,
        },
        {
          name: "the idea, under another line",
          make: "turned",
          contour: { rose: "wave", fell: "arch" },
        },
      ],
      a: [
        { name: "answer", make: "turned", contour: { rose: "fall", fell: "climb" } },
        { name: "answer", make: "turned", contour: "arch" },
        { name: "answer", make: "turned", contour: { rose: "wave", fell: "fall" } },
        {
          name: "answer, opened out",
          make: "grown",
          contour: "fall",
          keepOpening: false,
          oneRhythm: false,
        },
      ],
      c: [ELSE, ELSE, { ...ELSE, name: "something else, in sequence", oneRhythm: true }, ELSE],
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
        { name: "the opening idea, new ending", make: "ending", of: "opening", direction: -1 },
        { name: "the opening idea, a step along", make: "again", of: "opening", by: 1 },
      ],
    },
    // The way up to the top note falls in the last A: made of the idea the chorus opened
    // on if it can be, so the last A is still the A coming back.
    peak: [
      {
        name: "the opening idea, climbing",
        make: "grown",
        of: "opening",
        contour: "climb",
        keepOpening: false,
        oneRhythm: false,
      },
      {
        name: "the idea, climbing",
        make: "grown",
        contour: "climb",
        keepOpening: false,
        oneRhythm: false,
      },
      NEW,
      NEW,
    ],
    // An idea is carried by its rhythm, so one stated sparse stays sparse however often it
    // is changed: when it has under three fifths of the notes the arc asks for, a new line
    // is offered beside it.
    outgrown: { levels: 2, thin: 0.6, ways: [NEW, NEW] },
  },
  // Measured: two jazz phrases from different takes score a half or more 8 times in 100,
  // as two blues phrases do, so the line is drawn in the same place.
  likeness: { related: 0.5, same: 0.9 },

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
    // The top of the horn, less a semitone (SO-07). The phrase before the last runs up to
    // it in eighths, three bars of line and the note: a run, not a sequence.
    peak: {
      above: 14,
      clear: 3,
      density: "busy",
      fromEnd: 1,
      shape: "L L L E",
      contour: "climb",
      sequence: false,
      ending: "x--- ---- ---- ....",
    },
    windDown: { density: "medium", register: 0, contour: "fall" },
  },

  // Bebop at 200 is still eighth notes (a bar is 1.2 seconds), so only past about 220
  // does the line thin out. Under about 92 a bar is long enough to want more in it: a
  // ballad at 66 plays a level busier.
  tempo: { slowBar: 2.6, fastBar: 1.1 },

  space: {
    breath: 0.5,
    roomier: 0.25,
    emptyBars: 1,
    patience: 7,
  },

  habits: {
    // A bar seldom comes straight back (SO-18); when it does it is a sequence.
    riff: 0.08,
    riffIs: "sequence",
    stab: 0,
    // Half the barlines a run could be tied over (ST-jazz-38).
    tie: 0.5,
    chromatic: 0.45,
    enclosure: 0.25,
    // Most phrases that would start on the one are led in from beat 4 (ST-jazz-38). The
    // triplet figure is left out: its middle note is not an eighth (ST-jazz-06).
    pickup: {
      chance: 0.85,
      figures: [
        // The "and" of 4, twice as often.
        { weight: 2, beat: "..x-" },
        // Two swung eighths.
        { weight: 1, beat: "x-x-" },
      ],
      rising: 0.6,
      // It ends on the half step under the line's first note as often as the line itself
      // approaches a landing that way.
      approach: true,
    },
  },

  // SO-51: louder as it goes up, the "and"s leaned on, the bottom of a run ghosted.
  touch: {
    level: 88,
    peak: 96,
    perSemitone: 0.8,
    offbeat: 5,
    valley: 10,
    pickup: 6,
    floor: 40,
    ceiling: 118,
    legato: 0.95,
  },
};
