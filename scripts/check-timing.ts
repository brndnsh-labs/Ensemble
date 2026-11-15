// Does a rendered take put its notes where the engine asked for them? Renders
// one seat alone, then looks in the audio for a rise at each note's time.
//
//   node scripts/check-timing.ts chart=jazz-two-five-one-c.chart [seat=drums] [seed=1] [passes=2]
//
// A measurement, not a test: it prints how far the sound's onsets are from
// the written times. A sampler or codec that starts sounds late shows here.

import { readFileSync } from "node:fs";
import { render, timedNotes } from "../packages/engine/src/index.ts";
import { STYLES, styleById } from "../packages/styles/src/index.ts";
import { renderAudio } from "./render-audio.ts";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)]),
);
const chart = args.chart ?? "jazz-two-five-one-c.chart";
const seat = args.seat ?? "drums";
const seed = Number(args.seed ?? 1);
const passes = Number(args.passes ?? 2);
const style =
  styleById(args.style ?? "") ?? STYLES.find((s) => chart.startsWith(s.id)) ?? STYLES[0]!;

const text = readFileSync(new URL(`../library/${chart}`, import.meta.url), "utf8");
const take = render(text, style, { mode: "jam", seed, passes });
const notes = timedNotes(take.plan, take.events).filter((note) => note.seat === seat);

const { path } = await renderAudio("timing-check", {
  chart,
  style: style.id,
  seed: String(seed),
  passes: String(passes),
  only: seat,
  // Dry and flat, so that what is measured is the sampler and not the room.
  mix: JSON.stringify({
    seats: Object.fromEntries(["drums", "bass", "chords", "solo"].map((s) => [s, { level: 0 }])),
    room: { seconds: 0.2, predelay: 0, level: -100 },
    master: -12,
  }),
});

const wav = readFileSync(path);
const rate = wav.readUInt32LE(24);
const channels = wav.readUInt16LE(22);
const frames = (wav.length - 44) / (2 * channels);
const level = new Float32Array(frames);
for (let i = 0; i < frames; i++) {
  let sum = 0;
  for (let c = 0; c < channels; c++) sum += Math.abs(wav.readInt16LE(44 + (i * channels + c) * 2));
  level[i] = sum / channels / 32768;
}

/** Mean level over a stretch of seconds. */
const mean = (from: number, to: number): number => {
  const a = Math.max(0, Math.round(from * rate));
  const b = Math.min(frames, Math.round(to * rate));
  let sum = 0;
  for (let i = a; i < b; i++) sum += level[i]!;
  return b > a ? sum / (b - a) : 0;
};

// Only notes with a quiet moment before them can be timed: at least 60 ms since the last one began.
const errors: number[] = [];
let judged = 0;
let last = Number.NEGATIVE_INFINITY;
for (const note of notes) {
  const clear = note.at - last >= 0.06;
  last = note.at;
  if (!clear || note.velocity < 50) continue;
  judged++;
  const before = mean(note.at - 0.004, note.at - 0.0005);
  // The onset: the first 0.5 ms window after which the level has at least tripled.
  let found: number | undefined;
  for (let t = note.at - 0.003; t < note.at + 0.03; t += 0.00025) {
    if (mean(t, t + 0.0005) > Math.max(3 * before, 0.002)) {
      found = t;
      break;
    }
  }
  if (found !== undefined) errors.push((found - note.at) * 1000);
}
errors.sort((a, b) => a - b);
const at = (p: number) => errors[Math.min(errors.length - 1, Math.floor(p * errors.length))]!;
console.log(
  `${chart} ${style.id} ${seat}: ${notes.length} notes, ${judged} with a clear moment before them, ${errors.length} onsets found`,
);
if (errors.length > 0) {
  console.log(
    `onset minus written time, ms: least ${at(0).toFixed(2)}, median ${at(0.5).toFixed(2)}, 95th ${at(0.95).toFixed(2)}, most ${at(1).toFixed(2)}`,
  );
}
