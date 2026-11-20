// Clips for an ear: slides, hammer-ons, pull-offs and grace notes, each drawn
// alone on the samples, before the soloist is allowed any of them. The guitar's
// study (scripts/pitch-study.ts) drew a slide as a smooth glide and Brandon left
// it out: "we need to snap to pitches/frets to make it sound realistic". Here a
// slide stands on each fret in turn, and a hammer-on is drawn both as one
// struck string and as two notes, so the ways can be told apart by ear.
//
//   node scripts/slide-study.ts [clip-name ...]
//
// With names, renders only those clips (a few at a time keeps each command
// short); with `none`, renders nothing; with no names, renders all. Always
// writes the page, out/slide-study/index.html, with what was measured in the
// clips already rendered. The clips go to out/audio/. Serve it with
// `pnpm audition --host 0.0.0.0` and open /out/slide-study/.
//
// How a step is drawn: `PitchMove` eases from one glide point to the next, so
// two points a millisecond apart are a step. The curve it makes has a point
// every 5 ms (`CURVE_STEP`) and the sampler moves the playback rate in a
// straight line between points, so each step is a 5 ms ramp. Nothing in the
// engine or the sampler is changed for this.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { GlidePoint, PitchMove, TimedNote } from "../packages/engine/src/index.ts";
import { CURVE_STEP, PPQ, pitchCurve, swing } from "../packages/engine/src/index.ts";
import { styleById } from "../packages/styles/src/index.ts";
import { renderAudio } from "./render-audio.ts";

const ROOT = new URL("../", import.meta.url);
const OUT = "out/slide-study";

/** What each note is in the line: the places a way may move. */
type Mark =
  | "slide" // struck where the chord changes, slid into from `from`
  | "third" // the major third, reached from the minor third a fret below
  | "hammer-from"
  | "hammer-to"
  | "pull-from"
  | "pull-to"
  | "grace" // a sixteenth flicked into the next note
  | "graced" // the note a grace flicks into
  | "top"
  | "last";

interface Written {
  readonly bar: number;
  readonly beat: number;
  readonly beats: number;
  readonly pitch: number;
  readonly mark?: Mark;
  /** For a slide: the scale tone SO-56 names as its start. */
  readonly from?: number;
  /** For a bend in the player's choice: semitones it is struck flat. */
  readonly bend?: number;
}

interface Line {
  readonly id: string;
  readonly name: string;
  readonly chart: { readonly library?: string; readonly text?: string };
  readonly style: string;
  readonly tempo: number;
  readonly voice: string;
  /** The part of its written length a note sounds: a picked or tongued line is a touch short. */
  readonly legato: number;
  readonly velocity: { readonly plain: number; readonly landing: number };
  /** Bars the line is played over, after the count-in bar. */
  readonly bars: number;
  readonly notes: readonly Written[];
}

const n = (
  bar: number,
  beat: number,
  beats: number,
  pitch: number,
  mark?: Mark,
  extra: Partial<Written> = {},
): Written => ({ bar, beat, beats, pitch, ...(mark ? { mark } : {}), ...extra });

// The overdriven guitar over the three-chord rocker in E (E E A E | B A E B) at 132.
// Two phrases. The rock pool over E and A is E major pentatonic, the chord's tones and the
// blue third G; over B, the pentatonic and B's tones. Every start note SO-56 names is in it.
const ROCK: Line = {
  id: "rock",
  name: "the overdriven guitar over the three-chord rocker in E",
  chart: { library: "rock-three-chord-e.chart" },
  style: "rock",
  tempo: 132,
  voice: "driven-guitar",
  legato: 0.92,
  velocity: { plain: 96, landing: 108 },
  bars: 8,
  notes: [
    // Phrase 1. Bar 1, E.
    n(1, 1, 0.5, 64),
    n(1, 1.5, 0.5, 66),
    n(1, 2, 0.5, 68),
    // Hammer-on 1: B4, an eighth, up a scale step (two frets) into C-sharp 5, a half note.
    n(1, 2.5, 0.5, 71, "hammer-from"),
    n(1, 3, 2, 73, "hammer-to"),
    // Bar 2, E.
    n(2, 1, 1, 68),
    n(2, 2, 0.5, 71),
    n(2, 2.5, 0.5, 68),
    n(2, 3, 0.5, 66),
    n(2, 3.5, 0.5, 64),
    n(2, 4.5, 0.5, 71),
    // Bar 3, A: C-sharp 5, the major third, from B (2 up to the major third), two frets.
    n(3, 1, 1.5, 73, "slide", { from: 71 }),
    n(3, 2.5, 0.5, 71),
    n(3, 3, 0.5, 69),
    n(3, 3.5, 0.5, 66),
    n(3, 4, 0.5, 69),
    n(3, 4.5, 0.5, 73),
    // Bar 4, E: E5, the root and the line's top note, from C-sharp (the 6th), three frets.
    n(4, 1, 2.5, 76, "slide", { from: 73, bend: 2 }),
    // Phrase 2. The pickup F-sharp, then bar 5, B: B4, the root, from F-sharp (the 5th),
    // five frets (G-sharp, three frets, is the nearer start SO-56 asks to exist).
    n(4, 4.5, 0.5, 66),
    n(5, 1, 1.5, 71, "slide", { from: 66 }),
    // The pull-off: C-sharp 5, an eighth, down a scale step (two frets) to B4, a quarter.
    n(5, 2.5, 0.5, 73, "pull-from"),
    n(5, 3, 1, 71, "pull-to"),
    n(5, 4, 0.5, 68),
    n(5, 4.5, 0.5, 71),
    // Bar 6, A: A4, the root, from above, from B (2 down to the root), two frets.
    n(6, 1, 1.5, 69, "slide", { from: 71 }),
    // Hammer-on 2: E4, an eighth, up a scale step (two frets) into F-sharp 4, a quarter.
    n(6, 2.5, 0.5, 64, "hammer-from"),
    n(6, 3, 1, 66, "hammer-to"),
    n(6, 4, 1, 64),
    // Bar 7, E: G-sharp 4, the major third, reached from G, the minor third a fret below.
    n(7, 1, 1.5, 68, "third", { bend: 1 }),
    n(7, 2.5, 0.5, 71),
    n(7, 3, 0.5, 73),
    n(7, 3.5, 0.5, 71),
    n(7, 4, 0.5, 68),
    n(7, 4.5, 0.5, 64),
    // Bar 8, B: B4, held to the end. Nothing moves in the bar the band ends on (SO-57).
    n(8, 1, 3, 71, "last"),
  ],
};

// The clean guitar over the four-chord neo-soul loop in D (Dmaj9 Bm9 Gmaj9 Gm9) at 82:
// two short phrases, each starting on a major third struck where the chord changes.
const NEOSOUL: Line = {
  id: "neosoul",
  name: "the clean guitar over the four-chord neo-soul loop in D",
  chart: { library: "neosoul-four-chord-d.chart" },
  style: "neosoul",
  tempo: 82,
  voice: "clean-guitar",
  legato: 0.92,
  velocity: { plain: 90, landing: 100 },
  bars: 4,
  notes: [
    // Bar 1, Dmaj9: F-sharp 4, the major third, from F a fret below.
    n(1, 1, 1.5, 66, "third"),
    n(1, 2.5, 0.5, 69),
    n(1, 3, 0.5, 71),
    n(1, 3.5, 0.5, 69),
    n(1, 4, 1, 64),
    // Bar 2, Bm9.
    n(2, 1, 2, 66),
    n(2, 4, 0.5, 74),
    n(2, 4.5, 0.5, 73),
    // Bar 3, Gmaj9: B4, the major third, from B-flat a fret below.
    n(3, 1, 2, 71, "third"),
    n(3, 3, 0.5, 74),
    n(3, 3.5, 0.5, 76),
    n(3, 4, 0.5, 74),
    // Bar 4, Gm9: D5, held.
    n(4, 1, 3, 74, "last"),
  ],
};

// The steel-string guitar over four open chords in G (G C Em D) at 100, the `.xx-` cell of
// ST-acoustic-26 three times: a grace sixteenth on the "e" flicked up a scale step into the
// note on the "and".
const ACOUSTIC: Line = {
  id: "acoustic",
  name: "the steel-string guitar over four open chords in G",
  chart: { library: "acoustic-four-chord-g.chart" },
  style: "acoustic",
  tempo: 100,
  voice: "steel-guitar",
  legato: 0.92,
  velocity: { plain: 90, landing: 90 },
  bars: 4,
  notes: [
    // Bar 1, G.
    n(1, 1, 1, 67),
    n(1, 2, 1, 62),
    n(1, 3.25, 0.25, 69, "grace"),
    n(1, 3.5, 1.5, 71, "graced"),
    // Bar 2, C.
    n(2, 1, 1, 72),
    n(2, 2, 0.5, 71),
    n(2, 2.5, 0.5, 69),
    n(2, 3.25, 0.25, 62, "grace"),
    n(2, 3.5, 1.5, 64, "graced"),
    // Bar 3, Em.
    n(3, 1, 1, 67),
    n(3, 2, 1, 71),
    n(3, 3.25, 0.25, 74, "grace"),
    n(3, 3.5, 1.5, 76, "graced"),
    // Bar 4, D.
    n(4, 1, 3, 74, "last"),
  ],
};

// The alto over the first four bars of the two-five-one (Dm7 G7 Cmaj7 Cmaj7) at 120,
// swung as the band swings. Two long notes, each with the sixteenth before it free for a
// grace from the scale step below (SO-28).
const ALTO_CHART =
  "title: Two-Five-One, four bars\nkey: C\ntempo: 120\nstyle: jazz\n\n[A]\n| Dm7 | G7 | Cmaj7 | % |\n";
const ALTO: Line = {
  id: "alto",
  name: "the alto over four bars of a two-five-one in C",
  chart: { text: ALTO_CHART },
  style: "jazz",
  tempo: 120,
  voice: "alto-sax",
  legato: 0.95,
  velocity: { plain: 90, landing: 100 },
  bars: 4,
  notes: [
    // Bar 1, Dm7.
    n(1, 2, 0.5, 69),
    n(1, 2.5, 0.5, 72),
    n(1, 3, 0.5, 74),
    n(1, 3.5, 0.5, 77),
    n(1, 4, 0.5, 72),
    // The grace into bar 2's B4: A4, the last sixteenth of bar 1.
    n(1, 4.75, 0.25, 69, "grace"),
    // Bar 2, G7: B4, a half note.
    n(2, 1, 2, 71, "graced"),
    n(2, 3, 0.5, 74),
    n(2, 3.5, 0.5, 77),
    n(2, 4, 0.5, 79),
    // The grace into bar 3's E5: D5, the last sixteenth of bar 2.
    n(2, 4.75, 0.25, 74, "grace"),
    // Bar 3, Cmaj7: E5, three beats.
    n(3, 1, 3, 76, "graced"),
  ],
};

// --- Drawing ---
//
// Every move here is written in seconds: `pitchCurve` is given one second a tick, so a
// glide point's `at` and a shake's `from` and `grow` are seconds into the note.

/** Where a written note falls in seconds, swung as its style swings. */
function placed(line: Line, note: Written): { at: number; written: number } {
  const beat = 60 / line.tempo;
  const feel = styleById(line.style)!.feel;
  const bar = 4 * PPQ;
  const tick = (beats: number) => {
    const t = beats * PPQ;
    return Math.floor(t / bar) * bar + swing(t % bar, feel);
  };
  const start = note.bar * 4 + (note.beat - 1);
  const at = (tick(start) / PPQ) * beat;
  const end = (tick(start + note.beats) / PPQ) * beat;
  return { at, written: end - at };
}

interface Drawn {
  readonly pitch: number;
  readonly velocity: number;
  readonly at: number;
  readonly length: number;
  readonly move?: PitchMove;
}

/** A jump of pitch is drawn as two glide points this far apart, in seconds. */
const JUMP = 0.001;

/**
 * Glide points that stand on each fret in turn, from `from` semitones away to the
 * note, jumping between: the last jump at `arrive` seconds, each fret before it held
 * `each` seconds, the first standing from the strike until its turn comes.
 */
function frets(from: number, each: number, arrive: number): GlidePoint[] {
  const count = Math.abs(from);
  const way = Math.sign(from);
  const points: GlidePoint[] = [{ at: 0, semitones: from }];
  for (let j = 1; j <= count; j++) {
    const at = arrive - (count - j) * each;
    points.push({ at: at - JUMP, semitones: from - way * (j - 1) });
    points.push({ at, semitones: from - way * j });
  }
  return points;
}

/** A thirty-second note and a sixteenth, in seconds, at a line's tempo. */
const thirtySecond = (line: Line) => 60 / line.tempo / 8;
const sixteenth = (line: Line) => 60 / line.tempo / 4;
/** SO-56: one or two frets take a thirty-second note, more take a sixteenth. */
const slideTakes = (line: Line, distance: number) =>
  Math.abs(distance) <= 2 ? thirtySecond(line) : sixteenth(line);
/** A slide as the notes describe it (SO-56), struck at the start note. */
const slideAsWritten = (line: Line, note: Written): PitchMove => {
  const d = note.from! - note.pitch;
  const takes = slideTakes(line, d);
  return { glide: frets(d, takes / Math.abs(d), takes) };
};

/** The guitar's hand as the soloist plays it now (`instruments.ts`, driven-guitar). */
const SHAKE = { depth: 60, rate: 5.5, after: 0.35, grows: 0.3 };
const BEND_TAKES = 0.1;
/** The build's rule (SO-52 and DECISIONS.md): held a dotted quarter, and sounding 0.65 s. */
const isShaken = (note: Written, length: number) => note.beats >= 1.5 && length >= 0.65;
/** The shake, starting its 0.35 s `into` seconds after the note is struck. */
const shake = (into = 0): NonNullable<PitchMove["vibrato"]> => ({
  from: into + SHAKE.after,
  grow: SHAKE.grows,
  depth: SHAKE.depth,
  rate: SHAKE.rate,
  upward: true,
});

/** How much softer the second of two notes is struck, in velocity. */
const SOFTER = 24;

/** Every note at its pitch, struck. */
function struck(line: Line): Drawn[] {
  return line.notes.map((note) => {
    const { at, written } = placed(line, note);
    const landing = note.mark === "slide" || note.mark === "third" || note.mark === "graced";
    return {
      pitch: note.pitch,
      velocity: landing ? line.velocity.landing : line.velocity.plain,
      at,
      length: written * line.legato,
    };
  });
}

/** Two drawn notes made one: struck as the first, sounding to the second's end, at the second's pitch. */
function merge(from: Drawn, to: Drawn, velocity: number, move: PitchMove): Drawn {
  return { pitch: to.pitch, velocity, at: from.at, length: to.at + to.length - from.at, move };
}

/** One string: the first note's pitch until the second's time, then one jump to it. */
const oneString = (from: Drawn, to: Drawn): PitchMove => {
  const d = from.pitch - to.pitch;
  const at = to.at - from.at;
  return {
    glide: [
      { at: 0, semitones: d },
      { at: at - JUMP, semitones: d },
      { at, semitones: 0 },
    ],
  };
};

/**
 * The line drawn note by note. `pair` may take a note and the next as one (it is
 * given both, and returns the one drawn note or nothing); `move` moves a single note.
 */
function drawLine(
  line: Line,
  how: {
    pair?: (
      note: Written,
      next: Written,
      from: Drawn,
      to: Drawn,
      index: number,
    ) => Drawn | undefined;
    move?: (note: Written, drawn: Drawn, index: number) => PitchMove | undefined;
    softer?: (note: Written, next: Written | undefined) => boolean;
  },
  notes: readonly Written[] = line.notes,
): Drawn[] {
  const drawn = struck({ ...line, notes });
  const out: Drawn[] = [];
  for (let i = 0; i < drawn.length; i++) {
    const note = notes[i]!;
    const next = notes[i + 1];
    const joined = next && how.pair?.(note, next, drawn[i]!, drawn[i + 1]!, i);
    if (joined) {
      out.push(joined);
      i++;
      continue;
    }
    const move = how.move?.(note, drawn[i]!, i);
    out.push(move ? { ...drawn[i]!, move } : drawn[i]!);
  }
  return out;
}

/** Two notes both struck: the first cut where the second starts, the second `SOFTER` softer. */
function twoNotes(line: Line, first: Mark, second: Mark): Drawn[] {
  const drawn = struck(line);
  return drawn.map((d, i) => {
    const note = line.notes[i]!;
    if (note.mark === first && line.notes[i + 1]?.mark === second) {
      return { ...d, length: drawn[i + 1]!.at - d.at };
    }
    if (note.mark === second && line.notes[i - 1]?.mark === first) {
      return { ...d, velocity: drawn[i - 1]!.velocity - SOFTER };
    }
    return d;
  });
}

/** Way 6: the eighth before a landing, which is its start note, held and slid from on one string. */
function slideBetween(line: Line): Drawn[] {
  return drawLine(line, {
    pair: (note, next, from, to) => {
      if (next.mark !== "slide" || next.from === undefined) return undefined;
      if (note.pitch !== next.from) throw new Error("the note before a landing is not its start");
      const d = next.from - next.pitch;
      const each = slideTakes(line, d) / Math.abs(d);
      return merge(from, to, from.velocity, { glide: frets(d, each, to.at - from.at) });
    },
  });
}

/** How long the start of a slide between two notes is heard at its pitch, for `distance` frets, in ms. */
function heardBefore(distance: number): number {
  const eighth = 60 / ROCK.tempo / 2;
  const each = slideTakes(ROCK, distance) / distance;
  return Math.round((eighth - (distance - 1) * each) * 1000);
}

const ms = (seconds: number) => `${Math.round(seconds * 1000)} ms`;
const SMOOTH: Readonly<Record<number, number>> = { 2: 0.07, 3: 0.08, 4: 0.09, 5: 0.09 };

interface Way {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly line: Line;
  readonly said: string;
  readonly draw: (line: Line) => Drawn[];
}

const ROCK32 = thirtySecond(ROCK);
const ROCK16 = sixteenth(ROCK);

const WAYS: readonly Way[] = [
  {
    id: "1-plain",
    number: "1",
    title: "Plain",
    line: ROCK,
    said: "Every note struck at its pitch. No note’s pitch moves.",
    draw: struck,
  },
  {
    id: "2-smooth",
    number: "2",
    title: "The smooth slide, for comparison",
    line: ROCK,
    said: "The four landings (C♯5 at bar 3 beat 1, E5 at bar 4 beat 1, B4 at bar 5 beat 1, A4 at bar 6 beat 1) struck at the start note clip 5 uses and eased in one smooth glide to pitch, as the guitar study’s ninth clip drew its slides: 2 frets in 0.07 s (up into the C♯5, down into the A4), 3 frets in 0.08 s (the E5), 5 frets in 0.09 s (the B4). Everything else plain.",
    draw: (line) =>
      drawLine(line, {
        move: (note) => {
          if (note.mark !== "slide") return undefined;
          const d = note.from! - note.pitch;
          return {
            glide: [
              { at: 0, semitones: d },
              { at: SMOOTH[Math.abs(d)]!, semitones: 0 },
            ],
          };
        },
      }),
  },
  {
    id: "3-frets-short",
    number: "3",
    title: "Stepped by frets, short",
    line: ROCK,
    said: `The same four landings each struck two frets (200 cents) below and stepped up a fret at a time, standing ${ms(ROCK32 / 2)} on each, on pitch a thirty-second note (${ms(ROCK32)}) after the strike: the C♯5 from B, the E5 from D, the B4 from A, the A4 from G (all from below, the A4 too). Everything else plain.`,
    draw: (line) =>
      drawLine(line, {
        move: (note) =>
          note.mark === "slide" ? { glide: frets(-2, ROCK32 / 2, ROCK32) } : undefined,
      }),
  },
  {
    id: "4-frets-long",
    number: "4",
    title: "Stepped by frets, long",
    line: ROCK,
    said: `The same four landings each struck five frets (500 cents) below and stepped up a fret at a time, standing ${ms(ROCK16 / 5)} on each, on pitch a sixteenth (${ms(ROCK16)}) after the strike: the C♯5 from G♯, the E5 from B, the B4 from F♯, the A4 from E. Everything else plain.`,
    draw: (line) =>
      drawLine(line, {
        move: (note) =>
          note.mark === "slide" ? { glide: frets(-5, ROCK16 / 5, ROCK16) } : undefined,
      }),
  },
  {
    id: "5-frets-as-written",
    number: "5",
    title: "Stepped by frets, as the notes have it",
    line: ROCK,
    said: `Each landing slid into from the scale tone SO-56 names, by its own distance, struck at the start note on the beat: the C♯5 (bar 3 beat 1) from B, 2 frets up in a thirty-second (${ms(ROCK32 / 2)} a fret); the E5 (bar 4 beat 1) from C♯, 3 frets up in a sixteenth (${ms(ROCK16 / 3)} a fret); the B4 (bar 5 beat 1) from F♯, 5 frets up in a sixteenth (${ms(ROCK16 / 5)} a fret); the A4 (bar 6 beat 1) from B, 2 frets down in a thirty-second. Everything else plain.`,
    draw: (line) =>
      drawLine(line, {
        move: (note) => (note.mark === "slide" ? slideAsWritten(line, note) : undefined),
      }),
  },
  {
    id: "6-frets-between",
    number: "6",
    title: "Stepped by frets, between two notes",
    line: ROCK,
    said: `Each landing’s start note is the eighth before it in the line (B4 at bar 2 beat 4½, C♯5 at bar 3 beat 4½, F♯4 at bar 4 beat 4½, B4 at bar 5 beat 4½). Here that eighth is struck and the landing is not: the start is heard at its pitch (${heardBefore(2)} ms before a 2-fret slide, ${heardBefore(3)} ms before the 3-fret, ${heardBefore(5)} ms before the 5-fret), then slid on the same string fret by fret as in clip 5, arriving on the landing’s beat with no attack of its own. Everything else plain.`,
    draw: slideBetween,
  },
  {
    id: "7-one-fret",
    number: "7",
    title: "The one-fret slide, minor third up to major third",
    line: ROCK,
    said: `Only the G♯4 at bar 7 beat 1 (the major third of E) moves: struck as G, a fret (100 cents) below, held there a thirty-second note (${ms(ROCK32)}), then one jump up to G♯. Everything else plain.`,
    draw: (line) =>
      drawLine(line, {
        move: (note) => (note.mark === "third" ? { glide: frets(-1, ROCK32, ROCK32) } : undefined),
      }),
  },
  {
    id: "neosoul-plain",
    number: "7, plain",
    title: "Plain, the clean guitar over neo-soul",
    line: NEOSOUL,
    said: "Every note struck at its pitch.",
    draw: struck,
  },
  {
    id: "7-one-fret-neosoul",
    number: "7, neo-soul",
    title: "The one-fret slide on the clean guitar",
    line: NEOSOUL,
    said: `The two major thirds struck where the chord changes, the F♯4 at bar 1 beat 1 (over Dmaj9) and the B4 at bar 3 beat 1 (over Gmaj9): each struck a fret below, held there a thirty-second note (${ms(thirtySecond(NEOSOUL))} at 82), then one jump up. Everything else plain.`,
    draw: (line) =>
      drawLine(line, {
        move: (note) =>
          note.mark === "third"
            ? { glide: frets(-1, thirtySecond(line), thirtySecond(line)) }
            : undefined,
      }),
  },
  {
    id: "8-hammer-one-string",
    number: "8",
    title: "Hammer-ons as one string",
    line: ROCK,
    said: "The two hammer-ons, B4 into C♯5 (bar 1 beats 2½ and 3) and E4 into F♯4 (bar 6 beats 2½ and 3), each one struck note: struck at the eighth’s time and pitch, then one jump up two frets (200 cents) at the longer note’s time, with no second attack. Everything else plain.",
    draw: (line) =>
      drawLine(line, {
        pair: (note, next, from, to) =>
          note.mark === "hammer-from" && next.mark === "hammer-to"
            ? merge(from, to, from.velocity, oneString(from, to))
            : undefined,
      }),
  },
  {
    id: "9-hammer-two-notes",
    number: "9",
    title: "Hammer-ons as two notes",
    line: ROCK,
    said: `The same two hammer-ons with both notes struck: the eighth cut off exactly where the longer note starts (its 60 ms release overlaps the next note), the longer note struck ${SOFTER} softer in velocity (72 for 96: 5.0 dB quieter, on the same recordings, as the guitar’s soft recordings are for 70 and under). Everything else plain.`,
    draw: (line) => twoNotes(line, "hammer-from", "hammer-to"),
  },
  {
    id: "10a-pull-one-string",
    number: "10a",
    title: "A pull-off as one string",
    line: ROCK,
    said: "The pull-off, C♯5 to B4 (bar 5 beats 2½ and 3), drawn as clip 8 draws a hammer-on: one struck note, then one jump down two frets at the B’s time, with no second attack. Everything else plain.",
    draw: (line) =>
      drawLine(line, {
        pair: (note, next, from, to) =>
          note.mark === "pull-from" && next.mark === "pull-to"
            ? merge(from, to, from.velocity, oneString(from, to))
            : undefined,
      }),
  },
  {
    id: "10b-pull-two-notes",
    number: "10b",
    title: "A pull-off as two notes",
    line: ROCK,
    said: `The same pull-off drawn as clip 9 draws a hammer-on: both struck, the C♯ cut where the B starts, the B ${SOFTER} softer (72 for 96). Everything else plain.`,
    draw: (line) => twoNotes(line, "pull-from", "pull-to"),
  },
  {
    id: "acoustic-plain",
    number: "11, plain",
    title: "Plain, the steel-string guitar over open chords",
    line: ACOUSTIC,
    said: "Every note struck at its pitch, the grace sixteenths too.",
    draw: struck,
  },
  {
    id: "11a-acoustic-one-string",
    number: "11a",
    title: "The acoustic hammer-on as one string",
    line: ACOUSTIC,
    said: "The three .xx- cells (A4 into B4 at bar 1 beat 3, D4 into E4 at bar 2 beat 3, D5 into E5 at bar 3 beat 3): the grace struck on the “e”, then one jump up two frets on the “and”, with no second attack. Everything else plain.",
    draw: (line) =>
      drawLine(line, {
        pair: (note, next, from, to) =>
          note.mark === "grace" && next.mark === "graced"
            ? merge(from, to, from.velocity, oneString(from, to))
            : undefined,
      }),
  },
  {
    id: "11b-acoustic-two-notes",
    number: "11b",
    title: "The acoustic hammer-on as two notes",
    line: ACOUSTIC,
    said: `The same three cells with both notes struck, the grace cut where the note starts, the note ${SOFTER} softer (66 for 90: 5.4 dB quieter, on the same layer of recordings). Everything else plain.`,
    draw: (line) => twoNotes(line, "grace", "graced"),
  },
  {
    id: "alto-plain",
    number: "12, plain",
    title: "Plain, the alto",
    line: ALTO,
    said: "The line with no grace notes: the B4 at bar 2 beat 1 and the E5 at bar 3 beat 1 tongued on their beat, the sixteenth before each a rest.",
    draw: (line) => struck({ ...line, notes: line.notes.filter((note) => note.mark !== "grace") }),
  },
  {
    id: "12a-alto-tongued",
    number: "12a",
    title: "Grace notes on the alto, tongued",
    line: ALTO,
    said: "A4 tongued in the last sixteenth of bar 1, before the B4, and D5 in the last sixteenth of bar 2, before the E5: two notes each time, the grace at 90 and the long note at 100 as in the plain clip. Everything else plain.",
    draw: struck,
  },
  {
    id: "12b-alto-one-note",
    number: "12b",
    title: "Grace notes on the alto, one note",
    line: ALTO,
    said: "The same two places, each grace and its long note one note: tongued once at the grace’s time a whole step (200 cents) low, one jump up to the long note on the beat, at the long note’s level (100). Everything else plain.",
    draw: (line) =>
      drawLine(line, {
        pair: (note, next, from, to) =>
          note.mark === "grace" && next.mark === "graced"
            ? merge(from, to, to.velocity, oneString(from, to))
            : undefined,
      }),
  },
  {
    id: "13-players-choice",
    number: "13",
    title: "A player’s choice",
    line: ROCK,
    said: "What the soloist plays now, and one of each of the new moves: the top note, E5 at bar 4 beat 1, bent up a whole step from D in 0.1 s; the G♯4 at bar 7 beat 1 bent up a half step from G in 0.1 s; the shake (pushed 60 cents sharp and back 5.5 times a second, from 0.35 s into the note, growing over 0.3 s) on the three notes held long enough, the C♯5 of bar 1, the E5 of bar 4 and the B4 of bar 8; one stepped slide, into the C♯5 at bar 3 beat 1 from B, as clip 5; one hammer-on, B4 into C♯5 in bar 1, as clip 8 (one string), its shake counted from the C♯’s arrival; one pull-off, C♯5 to B4 in bar 5, as clip 10a (one string). Nothing else.",
    draw: (line) => {
      const hammer = line.notes.findIndex((note) => note.mark === "hammer-from");
      const pull = line.notes.findIndex((note) => note.mark === "pull-from");
      const slide = line.notes.findIndex((note) => note.mark === "slide");
      return drawLine(line, {
        pair: (_note, _next, from, to, i) => {
          if (i === hammer) {
            return merge(from, to, from.velocity, {
              ...oneString(from, to),
              vibrato: shake(to.at - from.at),
            });
          }
          if (i === pull) return merge(from, to, from.velocity, oneString(from, to));
          return undefined;
        },
        move: (note, drawn, i) => {
          const vibrato = isShaken(note, drawn.length) ? { vibrato: shake() } : {};
          if (note.bend !== undefined && note.mark !== "last") {
            return {
              glide: [
                { at: 0, semitones: -note.bend },
                { at: BEND_TAKES, semitones: 0 },
              ],
              ...vibrato,
            };
          }
          if (i === slide) return { ...slideAsWritten(line, note), ...vibrato };
          return "vibrato" in vibrato ? vibrato : undefined;
        },
      });
    },
  },
];

function timed(way: Way): TimedNote[] {
  return way.draw(way.line).map((d) => ({
    seat: "solo",
    voice: way.line.voice,
    pitch: d.pitch,
    velocity: d.velocity,
    at: d.at,
    length: d.length,
    // One second a tick: the moves are written in seconds.
    ...(d.move ? { bend: { step: CURVE_STEP, cents: pitchCurve(d.move, 1, d.length) } } : {}),
  }));
}

// --- The samples: which recording each note is played from, and how far it is retuned ---

interface PackJson {
  readonly voices: Record<
    string,
    {
      readonly layers: readonly {
        readonly top: number;
        readonly zones: readonly { readonly root?: number }[];
      }[];
    }
  >;
}
const packs = new Map<string, PackJson>();
function rootFor(voice: string, velocity: number, pitch: number): number {
  let pack = packs.get(voice);
  if (!pack) {
    pack = JSON.parse(
      readFileSync(new URL(`assets/packs/${voice}/pack.json`, ROOT), "utf8"),
    ) as PackJson;
    packs.set(voice, pack);
  }
  // As the sampler chooses (`packages/audio/src/sampler.ts`): the layer by velocity, the zone nearest the note's pitch.
  const layers = pack.voices[""]!.layers;
  const layer = layers.find((l) => velocity <= l.top) ?? layers.at(-1)!;
  let best = Number.NaN;
  for (const zone of layer.zones) {
    if (zone.root !== undefined && !(Math.abs(zone.root - pitch) >= Math.abs(best - pitch)))
      best = zone.root;
  }
  return best;
}

const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "G♯", "A", "B♭", "B"];
const noteName = (pitch: number) =>
  `${NAMES[Math.round(pitch) % 12]}${Math.floor(Math.round(pitch) / 12) - 1}`;

/** Each moved note of a clip: the recording it is played from, and the cents from that recording it starts and ends at. */
function stretches(way: Way): string[] {
  const rows: string[] = [];
  for (const note of timed(way)) {
    if (!note.bend) continue;
    const root = rootFor(way.line.voice, note.velocity, note.pitch);
    const offset = (note.pitch - root) * 100;
    const cents = note.bend.cents;
    const low = Math.min(...cents) + offset;
    const high = Math.max(...cents) + offset;
    const start = cents[0]! + offset;
    const startPitch = note.pitch + cents[0]! / 100;
    const nearer = rootFor(way.line.voice, note.velocity, startPitch);
    rows.push(
      `${noteName(note.pitch)} at ${note.at.toFixed(2)} s: the ${noteName(root)} recording (root ${root.toFixed(2)}), ` +
        `struck ${signed(start)} cents from it, sounding between ${signed(low)} and ${signed(high)}` +
        (Math.abs(nearer - root) > 0.5
          ? `; the start, ${noteName(startPitch)}, has a nearer recording (${noteName(nearer)}, ${signed((startPitch - nearer) * 100)} cents), which the sampler does not switch to`
          : ""),
    );
  }
  return rows;
}
const signed = (cents: number) => `${cents >= 0 ? "+" : "−"}${Math.abs(Math.round(cents))}`;

/** The furthest any plain note of a line is retuned from its recording, in cents. */
function plainStretch(line: Line): number {
  return Math.max(
    ...struck(line).map((d) => Math.abs(d.pitch - rootFor(line.voice, d.velocity, d.pitch)) * 100),
  );
}

// --- Measuring: the pitch read back from the rendered audio ---

function readWav(path: string): { rate: number; mono: Float32Array } {
  const bytes = readFileSync(path);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const channels = view.getUint16(22, true);
  const rate = view.getUint32(24, true);
  const frames = (bytes.length - 44) / (2 * channels);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += view.getInt16(44 + (i * channels + c) * 2, true);
    mono[i] = sum / channels / 32768;
  }
  return { rate, mono };
}

/** Cut a 16-bit WAV file short at `seconds`. */
function trimWav(path: string, seconds: number): void {
  const bytes = readFileSync(path);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frame = view.getUint16(32, true);
  const keep = Math.min(bytes.length - 44, Math.ceil(seconds * view.getUint32(24, true)) * frame);
  view.setUint32(4, 36 + keep, true);
  view.setUint32(40, keep, true);
  writeFileSync(path, bytes.subarray(0, 44 + keep));
}

/** The window and the hop of the pitch reading, in seconds. */
const WINDOW = 0.01;
const HOP = 0.001;

/**
 * The pitch at a time, by normalised autocorrelation of a window centred there, looking
 * only between `low` and `high` (MIDI numbers, less than an octave apart, so that the
 * reading cannot jump an octave). Undefined where the window is not clearly periodic.
 */
function pitchAt(mono: Float32Array, rate: number, t: number, low: number, high: number) {
  const size = Math.round(WINDOW * rate);
  const begin = Math.round(t * rate - size / 2);
  const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
  const shortest = Math.floor(rate / hz(high));
  const longest = Math.ceil(rate / hz(low));
  const r = (lag: number) => {
    let num = 0;
    let den = 0;
    for (let i = 0; i < size - lag; i++) {
      const a = mono[begin + i] ?? 0;
      const b = mono[begin + i + lag] ?? 0;
      num += a * b;
      den += a * a + b * b;
    }
    return den > 0 ? (2 * num) / den : 0;
  };
  let best = shortest;
  let bestR = -1;
  const rs = new Map<number, number>();
  for (let lag = shortest - 1; lag <= longest + 1; lag++) rs.set(lag, r(lag));
  for (let lag = shortest; lag <= longest; lag++) {
    if (rs.get(lag)! > bestR) {
      bestR = rs.get(lag)!;
      best = lag;
    }
  }
  if (bestR < 0.8) return undefined;
  const [a, b, c] = [rs.get(best - 1)!, bestR, rs.get(best + 1)!];
  const shift = (a - c) / (2 * (a - 2 * b + c)) || 0;
  const freq = rate / (best + shift);
  return 69 + 12 * Math.log2(freq / 440);
}

interface Measure {
  readonly clip: string;
  readonly what: string;
  /** The note as drawn: its index among the clip's drawn notes. */
  readonly pick: (drawn: readonly Drawn[]) => Drawn;
  /** The pitch it should end on, and the furthest it starts from, in MIDI numbers. */
  readonly landing: number;
  readonly start: number;
  /** Seconds after the strike to read. */
  readonly until: number;
}

const firstMoved = (pitch: number, at?: number) => (drawn: readonly Drawn[]) =>
  drawn.find(
    (d) => d.move && d.pitch === pitch && (at === undefined || Math.abs(d.at - at) < 0.01),
  )!;
const atBar = (line: Line, bar: number, beat: number) => placed(line, n(bar, beat, 1, 0)).at;

const MEASURES: readonly Measure[] = [
  {
    clip: "5-frets-as-written",
    what: "clip 5, the B4 at bar 5 beat 1, slid five frets up from F♯4 in a sixteenth",
    pick: firstMoved(71, atBar(ROCK, 5, 1)),
    landing: 71,
    start: 66,
    until: 0.2,
  },
  {
    clip: "5-frets-as-written",
    what: "clip 5, the C♯5 at bar 3 beat 1, slid two frets up from B4 in a thirty-second",
    pick: firstMoved(73, atBar(ROCK, 3, 1)),
    landing: 73,
    start: 71,
    until: 0.15,
  },
  {
    clip: "7-one-fret",
    what: "clip 7, the G♯4 at bar 7 beat 1, slid one fret up from G4 in a thirty-second",
    pick: firstMoved(68),
    landing: 68,
    start: 67,
    until: 0.15,
  },
  {
    clip: "8-hammer-one-string",
    what: "clip 8, the hammer-on in bar 1, B4 struck and stepped up to C♯5 at beat 3",
    pick: firstMoved(73, atBar(ROCK, 1, 2.5)),
    landing: 73,
    start: 71,
    until: 0.4,
  },
];

/** The frets the pitch stood on and for how long: runs of readings within 30 cents of a fret. */
function measured(m: Measure): string[] | undefined {
  const file = new URL(`out/audio/slide-${m.clip}-alone.wav`, ROOT);
  if (!existsSync(file)) return undefined;
  const way = WAYS.find((w) => w.id === m.clip)!;
  const note = m.pick(way.draw(way.line));
  const { rate, mono } = readWav(file.pathname);
  const low = Math.min(m.start, m.landing) - 1.5;
  const high = Math.max(m.start, m.landing) + 1.5;
  const runs: { fret: number; from: number; to: number; sum: number; count: number }[] = [];
  let between = 0;
  let unclear = 0;
  for (let t = 0; t <= m.until + 1e-9; t += HOP) {
    const midi = pitchAt(mono, rate, note.at + t, low, high);
    if (midi === undefined) {
      unclear++;
      continue;
    }
    const cents = (midi - m.landing) * 100;
    const fret = Math.round(cents / 100);
    if (Math.abs(cents - fret * 100) > 30) {
      between++;
      continue;
    }
    const last = runs.at(-1);
    if (last && last.fret === fret && t - last.to <= 2.5 * HOP) {
      last.to = t;
      last.sum += cents - fret * 100;
      last.count++;
    } else runs.push({ fret, from: t, to: t, sum: cents - fret * 100, count: 1 });
  }
  // Runs of three readings or more; one fret read twice either side of a gap is one stand.
  const stands: typeof runs = [];
  for (const run of runs.filter((r) => r.count >= 3)) {
    const last = stands.at(-1);
    if (last && last.fret === run.fret) {
      last.to = run.to;
      last.sum += run.sum;
      last.count += run.count;
    } else stands.push({ ...run });
  }
  // Where the pitch changed, as read (halfway between one stand's last reading and the next's
  // first) against where the curve jumps: the difference is the delay from the note's time
  // to what comes out of the mix.
  const glide = note.move!.glide ?? [];
  const jumps: number[] = [];
  for (let i = 1; i < glide.length; i++) {
    const [a, b] = [glide[i - 1]!, glide[i]!];
    if (a.semitones !== b.semitones && b.at - a.at <= 2 * JUMP) jumps.push((a.at + b.at) / 2);
  }
  const changes = stands.slice(1).map((s, i) => (stands[i]!.to + s.from) / 2);
  const delay =
    changes.length === jumps.length && jumps.length > 0
      ? changes.reduce((sum, c, i) => sum + c - jumps[i]!, 0) / jumps.length
      : undefined;
  const lines = stands.map((run, i) => {
    const next = stands[i + 1];
    const held = next ? ` (${Math.round((next.from - run.from) * 1000)} ms till the next)` : "";
    return (
      `${run.fret === 0 ? "on the note" : `${Math.abs(run.fret)} fret${Math.abs(run.fret) > 1 ? "s" : ""} ${run.fret < 0 ? "below" : "above"}`} ` +
      `(${noteName(m.landing + run.fret)}, ${signed(run.sum / run.count)} cents from it on average): ` +
      `read from ${Math.round(run.from * 1000)} to ${Math.round(run.to * 1000)} ms after the note's time${held}`
    );
  });
  const total = Math.round(m.until / HOP) + 1;
  lines.push(
    `${between} of ${total} readings (one a millisecond) were more than 30 cents from any fret, ${unclear} not periodic enough to read`,
  );
  if (delay !== undefined) {
    lines.push(
      `each change of pitch is read on average ${Math.round(delay * 1000)} ms after the curve's jump (the ${jumps.length} jump${jumps.length > 1 ? "s" : ""} drawn at ${jumps.map((j) => Math.round(j * 1000)).join(", ")} ms, read at ${changes.map((c) => Math.round(c * 1000)).join(", ")} ms)`,
    );
  }
  return lines;
}

/** The pitch as drawn for the same note: where the curve stands, for comparison. */
function drawnStands(m: Measure): string {
  const way = WAYS.find((w) => w.id === m.clip)!;
  const note = m.pick(way.draw(way.line));
  const curve = pitchCurve(note.move!, 1, note.length);
  const runs: { cents: number; from: number; to: number }[] = [];
  for (let i = 0; i < curve.length && i * CURVE_STEP <= m.until + 1e-9; i++) {
    const last = runs.at(-1);
    if (last && Math.abs(curve[i]! - last.cents) <= 1) last.to = i;
    else runs.push({ cents: curve[i]!, from: i, to: i });
  }
  // A lone point between two stands is part of a jump.
  return runs
    .filter((run) => run.to > run.from)
    .map(
      (run) =>
        `${signed(run.cents)} cents from ${Math.round(run.from * CURVE_STEP * 1000)} to ${Math.round(run.to * CURVE_STEP * 1000)} ms`,
    )
    .join("; ");
}

// --- Rendering and the page ---

const stopOf = (line: Line) => (1 + line.bars) * 4 * (60 / line.tempo) + 1.2;
const clipName = (way: Way, how: "band" | "alone") => `slide-${way.id}-${how}`;

async function render(way: Way): Promise<void> {
  const file = `${OUT}/${way.id}.json`;
  writeFileSync(new URL(file, ROOT), JSON.stringify(timed(way)));
  const take = {
    ...(way.line.chart.library
      ? { chart: way.line.chart.library }
      : { chartAt: `/${OUT}/line-${way.line.id}.chart` }),
    style: way.line.style,
    seed: "1",
    passes: "1",
    notes: `/${file}`,
    stop: String(stopOf(way.line)),
  };
  for (const [name, query] of [
    [clipName(way, "band"), take],
    [clipName(way, "alone"), { ...take, only: "solo" }],
  ] as const) {
    const { path } = await renderAudio(name, query);
    // A take is rendered to its end, which can be a minute: keep what is played, and its tail.
    trimWav(path, stopOf(way.line) + 1.5);
  }
  console.log(way.id);
}

const html = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function clip(way: Way): string {
  const measures = MEASURES.filter((m) => m.clip === way.id);
  const read = measures
    .map((m) => {
      const lines = measured(m);
      return lines
        ? `<details><summary>Measured: ${html(m.what)}</summary><p>Drawn: ${html(drawnStands(m))}.</p><p>Read from the clip alone:</p><ul>${lines.map((l) => `<li>${html(l)}</li>`).join("")}</ul></details>`
        : "";
    })
    .join("");
  const samples = stretches(way);
  const stretched = samples.length
    ? `<details><summary>Which recordings the moved notes are played from</summary><ul>${samples.map((s) => `<li>${html(s)}</li>`).join("")}</ul></details>`
    : "";
  return `<section><h3>${html(way.number)}. ${html(way.title)}</h3><p>${html(way.said)}</p>
<div class="play"><span>With the band</span><audio controls preload="none" src="/out/audio/${clipName(way, "band")}.wav"></audio></div>
<div class="play"><span>Alone</span><audio controls preload="none" src="/out/audio/${clipName(way, "alone")}.wav"></audio></div>${read}${stretched}</section>`;
}

const way = (id: string) => WAYS.find((w) => w.id === id)!;
const GROUPS: readonly { title: string; about: string; ways: readonly string[] }[] = [
  {
    title: "Slides on the overdriven guitar (clips 1 to 7)",
    about:
      "Eight bars at 132 over the rock band, the three-chord rocker in E (E, E, A, E, B, A, E, B), two phrases. Four notes struck where the chord changes are the landings a slide goes into: C♯5 at bar 3 beat 1 (over A, from B, 2 frets below), E5 at bar 4 beat 1 (over E, from C♯, 3 below), B4 at bar 5 beat 1 (over B, from F♯, 5 below) and A4 at bar 6 beat 1 (over A, from B, 2 above). The G♯4 at bar 7 beat 1 is the major third of E, with G a fret below. No bends and no vibrato in any clip but the last; only the thing named moves.",
    ways: [
      "1-plain",
      "2-smooth",
      "3-frets-short",
      "4-frets-long",
      "5-frets-as-written",
      "6-frets-between",
      "7-one-fret",
    ],
  },
  {
    title: "The one-fret slide on the clean guitar (clip 7, neo-soul)",
    about:
      "Four bars at 82 over the neo-soul band, the four-chord loop in D (Dmaj9, Bm9, Gmaj9, Gm9), two short phrases. Each starts on a major third struck where the chord changes: F♯4 at bar 1 beat 1 and B4 at bar 3 beat 1.",
    ways: ["neosoul-plain", "7-one-fret-neosoul"],
  },
  {
    title: "Hammer-ons and the pull-off on the overdriven guitar (clips 8 to 10)",
    about:
      "The same eight bars as clips 1 to 7. Two hammer-ons, each a short note stepping up a scale step (two frets) into a longer one: B4 (an eighth, bar 1 beat 2½) into C♯5 (a half note, beat 3), and E4 (an eighth, bar 6 beat 2½) into F♯4 (a quarter, beat 3). One pull-off, stepping down: C♯5 (an eighth, bar 5 beat 2½) to B4 (a quarter, beat 3). Clip 1 again first.",
    ways: [
      "1-plain",
      "8-hammer-one-string",
      "9-hammer-two-notes",
      "10a-pull-one-string",
      "10b-pull-two-notes",
    ],
  },
  {
    title: "The hammer-on cell on the steel-string guitar (clip 11)",
    about:
      "Four bars at 100 over the acoustic band, four open chords in G (G, C, Em, D), the band’s light eighth swing on the line too. ST-acoustic-26’s cell .xx- three times, a grace sixteenth on the “e” of beat 3 flicked up a scale step (two frets) into the note on its “and”: A4 into B4 in bar 1, D4 into E4 in bar 2, D5 into E5 in bar 3.",
    ways: ["acoustic-plain", "11a-acoustic-one-string", "11b-acoustic-two-notes"],
  },
  {
    title: "Grace notes on the alto (clip 12)",
    about:
      "Four bars at 120 over the jazz band (Dm7, G7, Cmaj7, Cmaj7), the line swung as the band swings (the “and” at 60% of the beat). Two long notes, each flicked into from the scale step below by a sixteenth (SO-28): B4 at bar 2 beat 1 (a half note) from A4, E5 at bar 3 beat 1 (three beats) from D5.",
    ways: ["alto-plain", "12a-alto-tongued", "12b-alto-one-note"],
  },
  {
    title: "A player’s choice (clip 13)",
    about:
      "The eight bars of clips 1 to 10 with the bends and the shake the soloist already plays, and one of each new move. Clip 1 again first.",
    ways: ["1-plain", "13-players-choice"],
  },
];

function page(): string {
  const groups = GROUPS.map(
    (g) =>
      `<h2>${html(g.title)}</h2><p class="about">${html(g.about)}</p>\n${g.ways.map((id) => clip(way(id))).join("\n")}`,
  ).join("\n");
  const plain = [ROCK, NEOSOUL, ACOUSTIC, ALTO]
    .map((line) => `${line.voice} ${Math.round(plainStretch(line))}`)
    .join(", ");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Slides and grace notes</title>
<style>
:root{color-scheme:light dark;--fg:#1d1d1f;--bg:#fbfbf8;--dim:#5b5b60;--line:#d8d8d2}
@media (prefers-color-scheme:dark){:root{--fg:#ececea;--bg:#161618;--dim:#a3a3a8;--line:#38383c}}
body{font:16px/1.5 system-ui,sans-serif;color:var(--fg);background:var(--bg);max-width:44rem;margin:1.5rem auto;padding:0 16px}
h1{font-size:1.4rem;margin:0 0 .5rem}h2{font-size:1.1rem;margin:2.4rem 0 .4rem;padding-top:1rem;border-top:2px solid var(--line)}
h3{font-size:1rem;margin:1.6rem 0 .3rem}p{margin:.35rem 0}p.about{color:var(--dim)}
.play{display:flex;flex-wrap:wrap;gap:.2rem .8rem;align-items:center;margin:.35rem 0}.play span{min-width:7rem;color:var(--dim)}audio{flex:1 1 16rem;min-width:0;width:100%}
details{margin:.4rem 0;font-size:.92rem}summary{cursor:pointer;color:var(--dim)}ul{padding-left:1.2rem;margin:.3rem 0}
</style>
<h1>Slides and grace notes</h1>
<p>Each way drawn alone on the band’s own samples, plain first in every group, so only the thing named moves. Bars count from 1 after the count-in bar. “With the band” and “Alone” are the same notes.</p>
<p class="about"><b>How a step is drawn.</b> A note’s pitch here is a curve with a point every 5 ms, and the sampler moves between points in a straight line, so each jump from fret to fret is a 5 ms ramp, not an instant. A slide is one recording played faster and slower: the sampler chooses the recording by the note’s pitch (the landing) and does not change recording while the note sounds, so the start of a five-fret slide is the landing’s recording played a fourth low. The plain notes are already retuned up to this far from their nearest recording, in cents: ${html(plain)}. Under each clip: which recording each moved note is played from, and for four notes (in clips 5, 7 and 8) the pitch read back from the clip alone, by autocorrelation in 10 ms windows a millisecond apart. Read that way, each slide stood on every fret it was drawn on, within 2 cents of it, for 20 to 25 ms a fret in the five-fret slide (drawn 23) and 30 ms in the two-fret (drawn 28), and every change of pitch came out about 14 ms after it was drawn; the attack of the second note of clip 9’s first hammer-on, struck at 227 ms, is read late by as much, so that is the mix’s output and not the step.</p>
${groups}
`;
}

if (import.meta.main) {
  mkdirSync(new URL(`${OUT}/`, ROOT), { recursive: true });
  writeFileSync(new URL(`${OUT}/line-alto.chart`, ROOT), ALTO_CHART);
  const asked = process.argv.slice(2);
  for (const w of WAYS) {
    writeFileSync(new URL(`${OUT}/${w.id}.json`, ROOT), JSON.stringify(timed(w)));
    if (asked.length === 0 || asked.includes(w.id)) await render(w);
  }
  writeFileSync(new URL(`${OUT}/index.html`, ROOT), page());
  for (const m of MEASURES) {
    const lines = measured(m);
    if (!lines) continue;
    console.log(`\n${m.what}\n  drawn: ${drawnStands(m)}`);
    for (const line of lines) console.log(`  ${line}`);
  }
}
