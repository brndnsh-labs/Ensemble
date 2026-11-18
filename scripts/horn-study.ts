// Clips for an ear: one short alto line played nine ways (and the vibrato ways
// again at a ballad tempo), to find out which movements of pitch sound like a
// horn on these samples before the soloist is allowed any of them. The soloist
// plays every note plain today (`SoloInstrument.bend` and `.shake` are null for
// the alto). What a player does to a note's pitch is drawn with `PitchMove`, as
// the lead guitar's study drew its bends, and each way is heard alone.
//
//   node scripts/horn-study.ts [clip-name ...]
//
// With names, renders only those clips (a few at a time keeps each command
// short); with none, renders all. Always writes the page, out/horn-study/index.html.
// The clips go to out/audio/. Serve it with `pnpm audition --host 0.0.0.0` and
// open /out/horn-study/.
//
// What `PitchMove` cannot draw: a note has no fade, so a fall drops in pitch at
// a steady loudness and the note ends where it stops. The page says so.

import { mkdirSync, writeFileSync } from "node:fs";
import type { PitchMove, TimedNote } from "../packages/engine/src/index.ts";
import { CURVE_STEP, PPQ, pitchCurve } from "../packages/engine/src/index.ts";
import { renderAudio } from "./render-audio.ts";

/** The library's jazz two-five-one, its first eight bars, at the tempo asked. */
const chartAt = (tempo: number) =>
  `title: Two-Five-One, eight bars\nkey: C\ntempo: ${tempo}\nstyle: jazz\n\n[A]\n| Dm7 | G7 | Cmaj7 | % |\n| Dm7 | G7 | Cmaj7 | % |\n`;

type Role = "arrival" | "last" | undefined;
/** [bar, beat, beats long, pitch, role]. Bar 0 is the count-in. Alto range is 53 to 82. */
const LINE: readonly (readonly [number, number, number, number, Role])[] = [
  // Phrase 1, over Dm7 G7 Cmaj7.
  [1, 2, 0.5, 69, undefined],
  [1, 2.5, 0.5, 72, undefined],
  [1, 3, 0.5, 74, undefined],
  [1, 3.5, 0.5, 77, undefined],
  [1, 4, 1, 76, undefined],
  // D5 lands on the G7.
  [2, 1, 1, 74, "arrival"],
  [2, 2, 0.5, 71, undefined],
  [2, 2.5, 0.5, 74, undefined],
  // F5, a half note, held.
  [2, 3, 2, 77, undefined],
  // E5 lands on the Cmaj7: the last note of phrase 1, a dotted quarter, then silence.
  [3, 1, 1.5, 76, "last"],
  // Phrase 2, over Dm7 G7 Cmaj7.
  [5, 2, 0.5, 74, undefined],
  [5, 2.5, 0.5, 77, undefined],
  [5, 3, 0.5, 81, undefined],
  [5, 3.5, 0.5, 79, undefined],
  [5, 4, 1, 77, undefined],
  // E5 lands on the G7.
  [6, 1, 0.5, 76, "arrival"],
  [6, 1.5, 0.5, 74, undefined],
  [6, 2, 0.5, 71, undefined],
  [6, 2.5, 0.5, 74, undefined],
  // D5, a half note, held.
  [6, 3, 2, 74, undefined],
  // G5 lands on the Cmaj7: the last note of phrase 2, three beats, then silence.
  [7, 1, 3, 79, "last"],
];
/** Where the notes that land on a chord change are (index in LINE), and the first phrase's. */
const FIRST_ARRIVAL = 5;

/** Everything that depends on the tempo. */
function drawer(tempo: number) {
  const beat = 60 / tempo;
  const tick = beat / PPQ;
  const ticks = (seconds: number) => seconds / tick;
  const shake = (depth: number): PitchMove["vibrato"] => ({
    from: ticks(0.4),
    grow: ticks(0.6),
    depth,
    rate: 5,
  });
  /** Struck a half step flat, eased up over `over` seconds. */
  const scoop = (over: number): PitchMove["glide"] => [
    { at: 0, semitones: -1 },
    { at: ticks(over), semitones: 0 },
  ];
  return { beat, tick, ticks, shake, scoop };
}

interface Way {
  readonly name: string;
  readonly title: string;
  readonly said: string;
  readonly tempo: number;
  /** The move for note `index`, which sounds `beats` written beats. */
  readonly move: (
    index: number,
    role: Role,
    beats: number,
    d: ReturnType<typeof drawer>,
  ) => { move?: PitchMove; extend?: number } | undefined;
}

const half = (beats: number) => beats >= 2;
const vibrateHeld =
  (depth: number): Way["move"] =>
  (_i, _role, beats, d) =>
    half(beats) ? { move: { vibrato: d.shake(depth) } } : undefined;
const vibrateLast =
  (depth: number): Way["move"] =>
  (_i, role, _b, d) =>
    role === "last" ? { move: { vibrato: d.shake(depth) } } : undefined;
/** A fall: a long last note sounds its length, then drops `semitones` over a quarter note; a short one drops inside its own last eighth. */
const fall =
  (long: boolean): Way["move"] =>
  (_i, role, beats, d) => {
    if (role !== "last") return undefined;
    if (long && half(beats)) {
      const drop = {
        glide: [
          { at: d.ticks(beats * d.beat), semitones: 0 },
          { at: d.ticks((beats + 1) * d.beat), semitones: -6 },
        ],
      };
      // The note sounds its whole written length, then the beat of the drop.
      return { move: drop, extend: d.beat + beats * d.beat * 0.05 };
    }
    if (!long && !half(beats)) {
      return {
        move: {
          glide: [
            { at: d.ticks((beats - 0.5) * d.beat), semitones: 0 },
            { at: d.ticks(beats * d.beat), semitones: -4 },
          ],
        },
        // Sounds its whole written length, so the drop is inside the sounding note.
        extend: beats * d.beat * 0.05,
      };
    }
    return undefined;
  };

const SAID_NARROW =
  "15 cents either side of the note, 5 times a second, starting 0.4 seconds into the note and growing over the next 0.6";
const WAYS: readonly Way[] = [
  {
    name: "1-plain",
    title: "Plain",
    said: "No movement of pitch on any note (what you have now).",
    tempo: 120,
    move: () => undefined,
  },
  {
    name: "2-vibrato-narrow",
    title: "Vibrato, narrow",
    said: `The three notes of a half note or longer (the F5, the D5 and the last G5) shaken: ${SAID_NARROW}. Every other note plain.`,
    tempo: 120,
    move: vibrateHeld(15),
  },
  {
    name: "3-vibrato-wide",
    title: "Vibrato, wider",
    said: "The same three notes shaken the same way, 30 cents either side instead of 15.",
    tempo: 120,
    move: vibrateHeld(30),
  },
  {
    name: "4-vibrato-terminal",
    title: "Vibrato, last note of each phrase only",
    said: "Only the last note of each phrase (the E5 of the first, a dotted quarter, and the G5 of the second) shaken, 30 cents either side, as in the last clip. The held F5 and D5 plain.",
    tempo: 120,
    move: vibrateLast(30),
  },
  {
    name: "5-scoop-quick",
    title: "Scoop, quick",
    said: "The four notes that arrive on a chord change (the D5, the E5, the E5 and the G5, bars 2, 3, 6 and 7) struck a half step flat and eased up to pitch in 0.06 seconds. Every other note plain.",
    tempo: 120,
    move: (_i, role, _b, d) => (role ? { move: { glide: d.scoop(0.06) } } : undefined),
  },
  {
    name: "6-scoop-slow",
    title: "Scoop, slow",
    said: "The same four notes struck a half step flat and eased up over 0.15 seconds.",
    tempo: 120,
    move: (_i, role, _b, d) => (role ? { move: { glide: d.scoop(0.15) } } : undefined),
  },
  {
    name: "7-fall-long",
    title: "Fall, long",
    said: "The last note of the second phrase (G5, three beats) sounds its full length, then drops 6 semitones over one beat more, at steady loudness (a note cannot fade here). The first phrase's last note is shorter than a half note, so it stays plain.",
    tempo: 120,
    move: fall(true),
  },
  {
    name: "8-fall-short",
    title: "Fall, short",
    said: "The last note of the first phrase (E5, a dotted quarter) drops 4 semitones inside its own last half beat. The second phrase's last note is a half note or longer, so it stays plain.",
    tempo: 120,
    move: fall(false),
  },
  {
    name: "9-players-choice",
    title: "A player's choice",
    said: "Three things only: the last note of each phrase shaken 30 cents either side (clip 4), one quick scoop (0.06 seconds) on the first phrase's landing at the G7 (the D5 in bar 2), and the second phrase's last G5 dropping 6 semitones over one beat after its full length (clip 7), the shake and the fall on the same note.",
    tempo: 120,
    move: (i, role, beats, d) => {
      if (i === FIRST_ARRIVAL) return { move: { glide: d.scoop(0.06) } };
      if (role !== "last") return undefined;
      const falling = fall(true)(i, role, beats, d);
      const vibrato = d.shake(30);
      return falling
        ? { move: { ...falling.move, vibrato }, extend: falling.extend }
        : { move: { vibrato } };
    },
  },
  {
    name: "10-ballad-plain",
    title: "Plain, ballad tempo",
    said: "The same line at 66 beats a minute with no movement of pitch.",
    tempo: 66,
    move: () => undefined,
  },
  {
    name: "11-ballad-vibrato-narrow",
    title: "Vibrato, narrow, ballad tempo",
    said: "The same line at 66 beats a minute, the notes of a half or longer shaken 15 cents either side as in clip 2.",
    tempo: 66,
    move: vibrateHeld(15),
  },
  {
    name: "12-ballad-vibrato-wide",
    title: "Vibrato, wider, ballad tempo",
    said: "The same line at 66 beats a minute, the notes of a half or longer shaken 30 cents either side as in clip 3.",
    tempo: 66,
    move: vibrateHeld(30),
  },
  {
    name: "13-ballad-vibrato-terminal",
    title: "Vibrato, last notes only, ballad tempo",
    said: "The same line at 66 beats a minute, only the last note of each phrase shaken 30 cents either side as in clip 4.",
    tempo: 66,
    move: vibrateLast(30),
  },
];

/** A bar of count-in, then the line. */
export const notesOf = (way: Way): TimedNote[] => {
  const d = drawer(way.tempo);
  return LINE.map(([bar, beatInBar, beats, pitch, role], index) => {
    // A touch short of its written length, as a tongued line is.
    const written = beats * d.beat * 0.95;
    const drawn = way.move(index, role, beats, d);
    const length = written + (drawn?.extend ?? 0);
    return {
      seat: "solo",
      voice: "alto-sax",
      pitch,
      velocity: role ? 100 : 90,
      at: (bar * 4 + (beatInBar - 1)) * d.beat,
      length,
      ...(drawn?.move
        ? { bend: { step: CURVE_STEP, cents: pitchCurve(drawn.move, d.tick, length) } }
        : {}),
    };
  });
};

if (import.meta.main) {
  mkdirSync(new URL("../out/horn-study/", import.meta.url), { recursive: true });
  for (const tempo of [120, 66]) {
    writeFileSync(
      new URL(`../out/horn-study/line-${tempo}.chart`, import.meta.url),
      chartAt(tempo),
    );
  }
  const asked = process.argv.slice(2);
  const rows: string[] = [];
  for (const way of WAYS) {
    const file = `out/horn-study/${way.name}.json`;
    writeFileSync(new URL(`../${file}`, import.meta.url), JSON.stringify(notesOf(way)));
    const band = `study-horn-${way.name}-band`;
    const alone = `study-horn-${way.name}-alone`;
    if (asked.length === 0 || asked.includes(way.name)) {
      const take = {
        chartAt: `/out/horn-study/line-${way.tempo}.chart`,
        style: "jazz",
        seed: "1",
        passes: "1",
        notes: `/${file}`,
        // The count-in bar, the eight bars, and the tail of the last note.
        stop: String(9 * 4 * (60 / way.tempo) + 1.2),
      };
      await renderAudio(band, take);
      await renderAudio(alone, { ...take, only: "solo" });
      console.log(way.name);
    }
    rows.push(
      `<section><h2>${way.name.split("-")[0]}. ${way.title}</h2><p class="said">${way.said}</p>` +
        `<p>With the band <audio controls preload="none" src="/out/audio/${band}.wav"></audio></p>` +
        `<p>Alone <audio controls preload="none" src="/out/audio/${alone}.wav"></audio></p></section>`,
    );
  }
  const first = rows.slice(0, 9).join("\n");
  const second = rows.slice(9).join("\n");
  writeFileSync(
    new URL("../out/horn-study/index.html", import.meta.url),
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Alto: how the pitch moves</title>
<style>body{font:16px/1.45 system-ui;max-width:44rem;margin:2rem auto;padding:0 1rem}h2{font-size:1rem;margin:1.6rem 0 .3rem}p{margin:.3rem 0;display:flex;gap:.8rem;align-items:center}p.said{display:block}audio{flex:1}</style>
<h1>Alto: how the pitch moves</h1>
<p class="said">One line of eight bars, two phrases, over the jazz band (Dm7, G7, Cmaj7, Cmaj7, twice) at 120 beats a minute, played nine ways on the alto, plain first. The notes are the alto's own samples; only the pitch is moved. After them, the same line at 66 beats a minute, plain and with the vibrato ways. Each way is heard alone.</p>
<p class="said"><b>Not drawn:</b> a note here cannot fade, so a fall drops in pitch at steady loudness and then stops, where a player's note would also die away as it drops. Nothing else here is approximated. The vibrato is symmetrical about the note's pitch; its speed and depth drift slightly, the same way each time.</p>
${first}
<h1>The same line at 66 beats a minute</h1>
${second}
`,
  );
}
