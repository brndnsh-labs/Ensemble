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

import type { SoloStyle, SoloTime, Way } from "@ensemble/engine";

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

// Each level's phrase shapes, the same in every meter: SO-09's weights, which jazz's space
// (0.25) leaves as they are (SO-11).
const SPARSE_SHAPES = [
  { weight: 3, bars: "L E R R" },
  { weight: 3, bars: "R L E R" },
  { weight: 3, bars: "E R L E" },
  { weight: 2, bars: "L L E R" },
];
const MEDIUM_SHAPES = [
  { weight: 5, bars: "L L E R" },
  { weight: 3, bars: "E R L E" },
  { weight: 2, bars: "L E L E" },
];
const BUSY_SHAPES = [
  { weight: 4, bars: "L L L E" },
  { weight: 4, bars: "L L E R" },
  { weight: 2, bars: "L E L E" },
];

// ── in six ──────────────────────────────────────────────────────────────────
// A bar of 6/4, six beats in two threes: twenty-four sixteenths, grouped by
// beat, and still nothing but beats and their swung "and"s. The levels are
// the levels of 4/4 (the solo's arc names them), each with rhythms a bar and
// a half as long: a line that phrases across the two threes, not one that
// stops where a bar of four would.
const jazzSoloInSix: SoloTime = {
  levels: [
    {
      name: "sparse",
      notesPerBar: 2,
      span: 6,
      cells: [
        "..x- x-x- ---- .... .... ....",
        "x--- ..x- x--- ---- .... ....",
        ".... .... x-x- x--- ---- ....",
        "x-x- --x- ---- .... x-x- x---",
        "..x- ---- x-x- x--- ---- ....",
      ],
      shapes: SPARSE_SHAPES,
    },
    {
      name: "medium",
      notesPerBar: 3.5,
      span: 9,
      cells: [
        "x--- x-x- x--- --.. x-x- x---",
        // These two end on the "and" of 6: a run that can be tied over the barline.
        "..x- x-x- --.. x-x- x--- x-x-",
        "x-x- x--- --.. x-x- x-x- x-x-",
        ".... x-x- x--- x--- x-x- --..",
        "..x- --x- x--- .... x-x- x---",
      ],
      shapes: MEDIUM_SHAPES,
    },
    {
      name: "busy",
      notesPerBar: 5.5,
      span: 12,
      cells: [
        "x-x- x-x- x-x- x-x- x-x- x-x-",
        "..x- x-x- x-x- x-x- x-x- x-x-",
        "x-x- x-x- x-x- x-x- x-x- x---",
        ".... x-x- x-x- x-x- x-x- x-x-",
        "x-x- x--- x-x- x-x- x--- x-x-",
      ],
      shapes: BUSY_SHAPES,
    },
  ],
  // Each lands on a long note and leaves beat 6 unstruck.
  endings: [
    "x-x- x--- ---- ---- ---- ....",
    "..x- x-x- ---- ---- .... ....",
    "x-x- --.. .... .... .... ....",
    "x--- x--- x--- ---- ---- ....",
    "..x- x-x- x--- x--- ---- ----",
    "x--- ---- ---- .... .... ....",
  ],
  // From beat 6, as from beat 4 in four; the longer ones from beats 5 and 6 (half the bar is
  // three beats, and none is longer than four's).
  pickups: [
    { weight: 2, cell: "..x-" },
    { weight: 1, cell: "x-x-" },
    { weight: 1, cell: "..x-x-x-", levels: ["medium", "busy"] },
    { weight: 0.5, cell: "x-x-x-x-", levels: ["busy"] },
  ],
  peak: "x--- ---- ---- ---- .... ....",
};

// ── in twelve and in six-eight ──────────────────────────────────────────────
// A bar of dotted pulses is its own triplet and is not swung: a rhythm is
// twenty-four sixteenths in twelve and twelve in six, written in sixes, and
// only a pulse's eighths (its first, third and fifth characters) are struck.
// `x-----` is a pulse held, `x---x-` four's swung pair said in pulses (the
// beat and its "and", the long-short), `x-x-x-` the pulse's three eighths,
// the triplet a line in four would have to go to its top level to play.
//
// Twelve is the ballad: four's cells said in pulses at each level (a beat a
// pulse, an "and" the pulse's last eighth), and from the medium level the
// triplet a ballad's horn runs in, as its double time; the busy level is
// mostly triplets. Endings land on a long note and leave the last pulse
// unstruck. Six is a bar of two: one strong pulse and its answer, the line
// mostly long-short and triplet against the ride's skip; its levels are
// written for the bar, not cut from twelve's.
const jazzSoloInTwelve: SoloTime = {
  levels: [
    {
      name: "sparse",
      notesPerBar: 2,
      span: 6,
      cells: [
        "....x- x---x- ------ ......",
        "x---x- ----x- ------ ......",
        "...... x---x- x----- ------",
        "x----- ....x- x----- ......",
        "....x- ------ x---x- x-----",
      ],
      shapes: SPARSE_SHAPES,
    },
    {
      name: "medium",
      notesPerBar: 5.5,
      span: 9,
      cells: [
        "x----- x---x- x-x-x- ----..",
        // These two end on 4's last eighth: a run that can be tied over the barline.
        "....x- x-x-x- ----.. x---x-",
        "x---x- x-x-x- ----.. x---x-",
        "...... x---x- x-x-x- x-----",
        "x-x-x- x----- x---x- ......",
        "....x- x-x-x- x-x-x- ......",
      ],
      shapes: MEDIUM_SHAPES,
    },
    {
      name: "busy",
      notesPerBar: 8,
      span: 12,
      cells: [
        "x-x-x- x-x-x- x-x-x- x-x-x-",
        "....x- x-x-x- x-x-x- x---x-",
        "x-x-x- x---x- x-x-x- x-x-x-",
        "...... x-x-x- x-x-x- x-x-x-",
        "x---x- x-x-x- x---x- x-x-x-",
      ],
      shapes: BUSY_SHAPES,
    },
  ],
  // Each lands on a long note and leaves pulse 4 unstruck.
  endings: [
    "x---x- x----- ------ ......",
    "....x- x---x- ------ ......",
    "x---x- ----.. ...... ......",
    "x----- x----- ------ ......",
    "....x- x---x- x----- ------",
    "x----- ------ ...... ......",
  ],
  // From pulse 4, as from beat 4 in four; the longer ones from pulse 3 (half the bar).
  pickups: [
    { weight: 2, cell: "....x-" },
    { weight: 1, cell: "x---x-" },
    { weight: 1, cell: "....x- x-x-x-", levels: ["medium", "busy"] },
    { weight: 0.5, cell: "x-x-x- x-x-x-", levels: ["busy"] },
  ],
  peak: "x----- ------ ------ ......",
};

const jazzSoloInSixEight: SoloTime = {
  levels: [
    {
      name: "sparse",
      notesPerBar: 1.5,
      span: 6,
      cells: ["....x- x-----", "x---x- ------", "x----- ....x-", "....x- ----x-", "x----- x-----"],
      shapes: SPARSE_SHAPES,
    },
    {
      name: "medium",
      notesPerBar: 2.6,
      span: 9,
      cells: ["x---x- x-----", "....x- x---x-", "x-x-x- x-----", "...... x-x-x-", "x----- x---x-"],
      shapes: MEDIUM_SHAPES,
    },
    {
      name: "busy",
      notesPerBar: 4.2,
      span: 12,
      cells: ["x-x-x- x-x-x-", "x---x- x-x-x-", "....x- x-x-x-", "x-x-x- x---x-", "x-x-x- x-x---"],
      shapes: BUSY_SHAPES,
    },
  ],
  // Each lands in the first pulse and holds through the second, which is the next phrase's;
  // none lands on the first pulse's last eighth alone, which at the top of the range (a pulse
  // is 0.38 s at 160) leaves less than a breath after it, and each opens on the One, so that a
  // pickup into a phrase that opens on its ending leads into a note on the One.
  endings: ["x----- ------", "x---x- ------", "x-x-x- ------", "x...x- ------"],
  // From the second pulse: its last eighth most of all, the long-short, and once the line is
  // moving its three eighths (half the bar).
  pickups: [
    { weight: 2, cell: "....x-" },
    { weight: 1, cell: "x---x-" },
    { weight: 1, cell: "x-x-x-", levels: ["medium", "busy"] },
  ],
  peak: "x----- ----..",
};

export const jazzSolo: SoloStyle = {
  meters: { "6/4": jazzSoloInSix, "12/8": jazzSoloInTwelve, "6/8": jazzSoloInSixEight },
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
      shapes: SPARSE_SHAPES,
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
      shapes: MEDIUM_SHAPES,
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
      shapes: BUSY_SHAPES,
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
    outgrown: { levels: 2, ways: [NEW, NEW] },
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

  // Busier than its arc: a bebop alto's line is eighth notes, and its room is the 25% space
  // jazz shares with rock (SO-11). Half of the phrases that can go a level up do, and four tenths of
  // its room is given up: its line is near all eighths by then, so the setting's top half has
  // somewhere to go. To move the default, change these two numbers (DECISIONS.md, a busier soloist).
  busier: { lift: 0.5, room: 0.4 },

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
        { weight: 2, cell: "..x-" },
        // Two swung eighths.
        { weight: 1, cell: "x-x-" },
        // Three eighths from the "and" of 3: the way ST-jazz-35's lines start, off the beat
        // and running in eighths, once the line is moving.
        { weight: 1, cell: "..x-x-x-", levels: ["medium", "busy"] },
        // Half a bar of eighths from beat 3, as the busy level's runs are (ST-jazz-35).
        { weight: 0.5, cell: "x-x-x-x-", levels: ["busy"] },
      ],
      rising: 0.6,
      // It ends on the half step under the line's first note as often as the line itself
      // approaches a landing that way.
      approach: true,
    },
    // No bends (ST-jazz-37); a guitar shakes a note held a half note or longer (SO-52).
    bend: { third: 0, rootOrFifth: 0, around: 0, elsewhere: 0 },
    // No slide: the notes give jazz none, as they give it no bend (ST-jazz-37).
    slide: { chance: 0, into: "landing" },
    shake: 2,
    // On a horn: a scoop into a long note 0.15 (ST-jazz-37), here a phrase's one arrival. The
    // notes give jazz no fall; Brandon chose one over the jazz band (horn-study clip 9), so the
    // horn styles' 0.3 (SO-54).
    scoop: 0.15,
    fall: 0.3,
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
