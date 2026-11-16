// A study for an ear, not part of the band: the same picked and strummed part on three
// guitars, straight from their source recordings, to choose the acoustic style's instrument.
//   node scripts/steel-study.ts <folder with fss/ and shiny/>   ->  out/steel-study/
// The sources: the nylon guitar already cut (FreePats' Spanish classical, CC0); FreePats' FSS
// steel-string, a Seagull flat-top (GPL 3 with the FreePats exception); Karoryfer's
// Shinyguitar, an archtop through a microphone (CC0).

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RATE = 48000;
const scratch = process.argv[2]!;
const out = "out/steel-study";
mkdirSync(out, { recursive: true });

const NAMES: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
/** `C#4`, `eb3`, `gb2` as a MIDI note, middle C at 60. */
function midiOf(name: string): number {
  const [, letter, accidental, octave] = /^([a-g])([#b]?)(-?\d)$/i.exec(name)!;
  const shift = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
  return NAMES[letter!.toLowerCase()]! + shift + 12 * (Number(octave) + 1);
}

const cache = new Map<string, Float32Array>();
function load(file: string): Float32Array {
  let pcm = cache.get(file);
  if (!pcm) {
    const raw = execFileSync(
      "ffmpeg",
      ["-v", "error", "-i", file, "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"],
      { maxBuffer: 1 << 28 },
    );
    pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4).slice();
    // Start at the attack: the first sample within 40 dB of the loudest.
    let peak = 0;
    for (const v of pcm) peak = Math.max(peak, Math.abs(v));
    let from = 0;
    while (from < pcm.length && Math.abs(pcm[from]!) < peak / 100) from++;
    pcm = pcm.subarray(Math.max(0, from - 48));
    cache.set(file, pcm);
  }
  return pcm;
}

interface Guitar {
  readonly name: string;
  /** The recording for a note and how hard it is played (0 soft, 1 hard), with its own pitch. */
  sample(midi: number, hard: number, turn: number): { file: string; root: number };
  /** Milliseconds between strings in a strum. */
  readonly roll: number;
}

function nearest(have: readonly number[], midi: number): number {
  return have.reduce((best, n) => (Math.abs(n - midi) < Math.abs(best - midi) ? n : best));
}

const nylonDir =
  ".sources/spanish-classical-guitar/SpanishClassicalGuitar-SFZ+FLAC-20190618/samples";
const nylonNotes = new Map(
  readdirSync(nylonDir).map((file) => [midiOf(file.replace(".flac", "")), join(nylonDir, file)]),
);
const fssDir = join(scratch, "fss/FSS-SteelStringGuitar-SFZ-20200521/samples");
const fss = { HV: [] as number[], MV: [] as number[] };
for (const file of readdirSync(fssDir)) {
  const [, layer, midi] = /^(HV|MV)_(\d+)\.wav$/.exec(file)!;
  fss[layer as "HV" | "MV"].push(Number(midi));
}
const shinyDir = join(scratch, "shiny/Samples/acoustic");
const shinyNotes = [
  ...new Set(
    readdirSync(shinyDir)
      .filter((file) => /_vl\d_rr\d_1\.wav$/.test(file))
      .map((file) => file.split("_")[0]!),
  ),
].map((name) => ({ name, midi: midiOf(name) }));

const GUITARS: Guitar[] = [
  {
    name: "nylon",
    roll: 3,
    sample(midi) {
      const root = nearest([...nylonNotes.keys()], midi);
      return { file: nylonNotes.get(root)!, root };
    },
  },
  {
    name: "steel-flat-top",
    roll: 6,
    sample(midi, hard) {
      // Two dynamics where the bank has them: the softer one for a picked note.
      const soft =
        hard < 0.5 &&
        fss.MV.includes(nearest(fss.MV, midi)) &&
        Math.abs(nearest(fss.MV, midi) - midi) <= 1;
      const layer = soft ? "MV" : "HV";
      const root = nearest(fss[layer], midi);
      return { file: join(fssDir, `${layer}_${root}.wav`), root };
    },
  },
  {
    name: "steel-archtop",
    roll: 6,
    sample(midi, hard, turn) {
      const root = nearest(
        shinyNotes.map((note) => note.midi),
        midi,
      );
      const name = shinyNotes.find((note) => note.midi === root)!.name;
      const layer = hard < 0.35 ? 2 : hard < 0.75 ? 3 : 4;
      return { file: join(shinyDir, `${name}_vl${layer}_rr${1 + (turn % 4)}_1.wav`), root };
    },
  },
];

/** Open-position shapes, low string to high. */
const SHAPES: Record<string, number[]> = {
  C: [48, 52, 55, 60, 64],
  G: [43, 47, 50, 55, 59, 67],
  Am: [45, 52, 57, 60, 64],
  F: [41, 48, 53, 57, 60, 65],
};
const SONG = ["C", "G", "Am", "F", "C", "G", "F", "C"];
const BEAT = 60 / 92;

interface Note {
  midi: number;
  at: number;
  until: number;
  level: number;
  hard: number;
}

function picked(): Note[] {
  const notes: Note[] = [];
  SONG.forEach((chord, bar) => {
    const shape = SHAPES[chord]!;
    const top = shape.slice(-3);
    // Thumb on the bass, fingers on the top three strings, in eighths.
    const places = [shape[0]!, top[1]!, top[2]!, top[0]!, shape[1]!, top[1]!, top[2]!, top[1]!];
    places.forEach((midi, eighth) => {
      const at = (bar * 4 + eighth / 2) * BEAT;
      notes.push({
        midi,
        at,
        until: (bar + 1) * 4 * BEAT,
        level: eighth === 0 ? 0.8 : 0.6,
        hard: 0.3,
      });
    });
  });
  return notes;
}

function strummed(roll: number): Note[] {
  const notes: Note[] = [];
  // Down, down-up, up-down-up: the eighths a strummer's hand plays of the pendulum.
  const hand: [eighth: number, down: boolean][] = [
    [0, true],
    [2, true],
    [3, false],
    [5, false],
    [6, true],
    [7, false],
  ];
  SONG.forEach((chord, bar) => {
    const shape = SHAPES[chord]!;
    hand.forEach(([eighth, down], i) => {
      const at = (bar * 4 + eighth / 2) * BEAT;
      const next = hand[i + 1];
      const until = (bar * 4 + (next ? next[0] / 2 : 4)) * BEAT;
      const strings = down ? shape : shape.slice(-4).reverse();
      strings.forEach((midi, s) => {
        notes.push({
          midi,
          at: at + (s * roll) / 1000,
          until,
          level: (down ? 0.75 : 0.5) * (eighth === 0 ? 1.15 : 1),
          hard: down ? 0.8 : 0.5,
        });
      });
    });
  });
  // The last chord rings.
  const end = SONG.length * 4 * BEAT;
  SHAPES.C!.forEach((midi, s) => {
    notes.push({ midi, at: end + (s * roll * 2) / 1000, until: end + 4, level: 0.8, hard: 0.6 });
  });
  return notes;
}

function render(guitar: Guitar, notes: readonly Note[]): Float32Array {
  const length = Math.ceil((Math.max(...notes.map((n) => n.until)) + 0.5) * RATE);
  const mix = new Float32Array(length);
  notes.forEach((note, turn) => {
    const { file, root } = guitar.sample(note.midi, note.hard, turn);
    const pcm = load(file);
    // Level each recording by its own loudest moment, so the three guitars are compared at one level.
    let peak = 0;
    for (let i = 0; i < Math.min(pcm.length, RATE / 2); i++)
      peak = Math.max(peak, Math.abs(pcm[i]!));
    const rate = 2 ** ((note.midi - root) / 12);
    const start = Math.round(note.at * RATE);
    const stop = Math.round(note.until * RATE);
    const fade = Math.round(0.06 * RATE);
    for (let i = 0; start + i < stop + fade && start + i < length; i++) {
      const at = i * rate;
      const a = Math.floor(at);
      if (a + 1 >= pcm.length) break;
      const value = pcm[a]! + (pcm[a + 1]! - pcm[a]!) * (at - a);
      const over = start + i - stop;
      const gain = over <= 0 ? 1 : Math.max(0, 1 - over / fade);
      mix[start + i]! += (value / peak) * note.level * gain * 0.2;
    }
  });
  return mix;
}

function write(name: string, pcm: Float32Array): void {
  const raw = join(out, `${name}.f32`);
  writeFileSync(raw, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  // One loudness for every clip, so level is not what is being compared.
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "f32le",
    "-ar",
    String(RATE),
    "-ac",
    "1",
    "-i",
    raw,
    "-af",
    "loudnorm=I=-18:TP=-1.5:LRA=11:linear=true",
    "-ar",
    String(RATE),
    "-b:a",
    "192k",
    join(out, `${name}.mp3`),
  ]);
  execFileSync("rm", [raw]);
}

for (const guitar of GUITARS) {
  write(`${guitar.name}-picked`, render(guitar, picked()));
  write(`${guitar.name}-strummed`, render(guitar, strummed(guitar.roll)));
  console.log(guitar.name);
}
