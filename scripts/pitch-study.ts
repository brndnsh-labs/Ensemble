// Clips for an ear: one short lead-guitar line played eight ways, to find out
// which movements of pitch sound like a guitar on these samples before the
// soloist is allowed any of them. The old band's bends "didn't sound great",
// and nobody recorded why, so how a bend is drawn is asked here apart from
// when one is played.
//
//   node scripts/pitch-study.ts
//
// Writes the clips to out/audio/ and a page of them to out/pitch-study/. Serve
// it with `pnpm audition --host 0.0.0.0` and open /out/pitch-study/.

import { mkdirSync, writeFileSync } from "node:fs";
import type { PitchMove, TimedNote } from "../packages/engine/src/index.ts";
import { CURVE_STEP, PPQ, pitchCurve } from "../packages/engine/src/index.ts";
import { renderAudio } from "./render-audio.ts";

const CHART = "rock-three-chord-e.chart";
const TEMPO = 132;
const BEAT = 60 / TEMPO;
const TICK = BEAT / PPQ;
/** Seconds as ticks at this tempo: a hand moves in time, not in beats. */
const ticks = (seconds: number) => seconds / TICK;

/** The line: [bar, beat, beats long, pitch, which landing it is]. Two phrases over E, E, A, E. */
type Landing = "root" | "fourth" | "third" | "last" | undefined;
const LINE: readonly (readonly [number, number, number, number, Landing])[] = [
  [1, 2, 0.5, 64, undefined],
  [1, 2.5, 0.5, 67, undefined],
  [1, 3, 0.5, 69, undefined],
  [1, 3.5, 0.5, 71, undefined],
  [1, 4, 0.5, 74, undefined],
  // E5, held: the top of the line.
  [1, 4.5, 2.5, 76, "root"],
  [3, 1.5, 0.5, 76, undefined],
  [3, 2, 0.5, 74, undefined],
  [3, 2.5, 0.5, 71, undefined],
  // A4 over the A chord.
  [3, 3, 1.5, 69, "fourth"],
  // G sharp, the major third of E: the note a blues player pushes up to from G.
  [4, 1, 1, 68, "third"],
  // E4, held to the end.
  [4, 2, 2.5, 64, "last"],
];

const shake = (upward: boolean, depth: number): PitchMove["vibrato"] => ({
  from: ticks(0.35),
  grow: ticks(0.3),
  depth,
  rate: 5.5,
  ...(upward ? { upward: true } : {}),
});
/** Struck `semitones` flat, waited `wait` seconds, pushed up over `over` seconds. */
const push = (semitones: number, over: number, wait = 0): PitchMove["glide"] => [
  { at: ticks(wait), semitones: -semitones },
  { at: ticks(wait + over), semitones: 0 },
];

interface Way {
  readonly name: string;
  readonly said: string;
  readonly move: (landing: Landing, seconds: number) => PitchMove | undefined;
}

const held = (landing: Landing) => landing === "root" || landing === "last";
const WAYS: readonly Way[] = [
  { name: "1-plain", said: "Plain: no movement at all (what you have now)", move: () => undefined },
  {
    name: "2-shake-guitar",
    said: "Vibrato only, a guitarist's: the two held notes pushed sharp and let back, 35 cents, starting a third of a second in",
    move: (landing) => (held(landing) ? { vibrato: shake(true, 35) } : undefined),
  },
  {
    name: "3-shake-horn",
    said: "Vibrato only, the old band's: 18 cents either side of the note",
    move: (landing) => (held(landing) ? { vibrato: shake(false, 18) } : undefined),
  },
  {
    name: "4-shake-wide",
    said: "Vibrato only, a guitarist's and wide: 60 cents",
    move: (landing) => (held(landing) ? { vibrato: shake(true, 60) } : undefined),
  },
  {
    name: "5-bend-quick",
    said: "Bends, quick (a tenth of a second): up a whole step into the top E, up a half step into the G sharp; guitar vibrato on the held notes",
    move: (landing) =>
      landing === "root"
        ? { glide: push(2, 0.1), vibrato: shake(true, 35) }
        : landing === "third"
          ? { glide: push(1, 0.1) }
          : landing === "last"
            ? { vibrato: shake(true, 35) }
            : undefined,
  },
  {
    name: "6-bend-slow",
    said: "The same bends, slower (a quarter of a second)",
    move: (landing) =>
      landing === "root"
        ? { glide: push(2, 0.25), vibrato: shake(true, 35) }
        : landing === "third"
          ? { glide: push(1, 0.25) }
          : landing === "last"
            ? { vibrato: shake(true, 35) }
            : undefined,
  },
  {
    name: "7-bend-struck-first",
    said: "The same bends, the low note heard first (struck, a twelfth of a second, then pushed up over a sixth)",
    move: (landing) =>
      landing === "root"
        ? { glide: push(2, 0.16, 0.08), vibrato: shake(true, 35) }
        : landing === "third"
          ? { glide: push(1, 0.16, 0.08) }
          : landing === "last"
            ? { vibrato: shake(true, 35) }
            : undefined,
  },
  {
    name: "8-bend-and-release",
    said: "Bend and release: the top E pushed up, held, and let back down to D before the phrase ends",
    move: (landing, seconds) =>
      landing === "root"
        ? {
            glide: [
              ...push(2, 0.1)!,
              { at: ticks(seconds - 0.4), semitones: 0 },
              { at: ticks(seconds - 0.2), semitones: -2 },
            ],
          }
        : landing === "last"
          ? { vibrato: shake(true, 35) }
          : undefined,
  },
  {
    name: "9-slides",
    said: "Slides, not bends: into the top E from five frets below, into the A from two below, quickly",
    move: (landing) =>
      landing === "root"
        ? { glide: push(5, 0.09), vibrato: shake(true, 35) }
        : landing === "fourth"
          ? { glide: push(2, 0.07) }
          : landing === "last"
            ? { vibrato: shake(true, 35) }
            : undefined,
  },
];

/** A bar of count-in, then the line. */
const notesOf = (way: Way): TimedNote[] =>
  LINE.map(([bar, beat, beats, pitch, landing]) => {
    // A touch short of its written length, as a picked line is.
    const length = beats * BEAT * 0.92;
    const move = way.move(landing, length);
    return {
      seat: "solo",
      voice: "driven-guitar",
      pitch,
      velocity: landing ? 108 : 96,
      at: (bar * 4 + (beat - 1)) * BEAT,
      length,
      ...(move ? { bend: { step: CURVE_STEP, cents: pitchCurve(move, TICK, length) } } : {}),
    };
  });

mkdirSync(new URL("../out/pitch-study/", import.meta.url), { recursive: true });
const rows: string[] = [];
for (const way of WAYS) {
  const file = `out/pitch-study/${way.name}.json`;
  writeFileSync(new URL(`../${file}`, import.meta.url), JSON.stringify(notesOf(way)));
  const take = { chart: CHART, style: "rock", seed: "1", passes: "1", notes: `/${file}` };
  // Five bars in: the count, and the four the line is played over.
  const stop = String(5 * 4 * BEAT + 0.6);
  await renderAudio(`study-${way.name}-band`, { ...take, stop });
  await renderAudio(`study-${way.name}-alone`, { ...take, stop, only: "solo" });
  rows.push(
    `<section><h2>${way.said}</h2>` +
      `<p>With the band <audio controls preload="none" src="/out/audio/study-${way.name}-band.wav"></audio></p>` +
      `<p>Alone <audio controls preload="none" src="/out/audio/study-${way.name}-alone.wav"></audio></p></section>`,
  );
  console.log(way.name);
}
writeFileSync(
  new URL("../out/pitch-study/index.html", import.meta.url),
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lead guitar: how the pitch moves</title>
<style>body{font:16px/1.45 system-ui;max-width:44rem;margin:2rem auto;padding:0 1rem}h2{font-size:1rem;margin:1.6rem 0 .3rem}p{margin:.3rem 0;display:flex;gap:.8rem;align-items:center}audio{flex:1}</style>
<h1>Lead guitar: how the pitch moves</h1>
<p>One line, four bars over E, E, A, E, played nine ways on the overdriven guitar. Which of these sound like a guitarist, and which sound like a pitch wheel?</p>
${rows.join("\n")}
`,
);
