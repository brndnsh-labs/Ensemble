// Cut instrument packs from the fetched sample libraries.
//   node scripts/packs/cut.ts [id...]
// Writes `assets/packs/<id>/` afresh for each pack named, or all: the audio,
// `pack.json`, and the sources' licences as `LICENCE`. Then decodes every file
// it wrote and checks that the sound starts at the start, lasts as long as
// `pack.json` says, and sits at the pack's level. Prints what it measured.

import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  PACK_FORMAT,
  type Pack,
  type PackLevel,
  type PackVoice,
} from "../../packages/audio/src/pack.ts";
import { throughAmp } from "./amp.ts";
import type { Recipe, Take } from "./recipe.ts";
import { altoSax } from "./recipes/alto-sax.ts";
import { cleanGuitar } from "./recipes/clean-guitar.ts";
import { drivenGuitar } from "./recipes/driven-guitar.ts";
import { drumKit } from "./recipes/drum-kit.ts";
import { electricBass } from "./recipes/electric-bass.ts";
import { electricPiano } from "./recipes/electric-piano.ts";
import { grandPiano } from "./recipes/grand-piano.ts";
import { nylonGuitar } from "./recipes/nylon-guitar.ts";
import { steelGuitar } from "./recipes/steel-guitar.ts";
import { uprightBass } from "./recipes/upright-bass.ts";
import { vibraphone } from "./recipes/vibraphone.ts";
import {
  bandPowers,
  decode,
  encodeOpus,
  FFMPEG,
  fadeIn,
  fadeOut,
  ffmpegVersion,
  loudness,
  measurePitch,
  mix,
  onset,
  peak,
  powerSpectrum,
  probe,
  RATE,
  scale,
  tailEnd,
} from "./signal.ts";
import { type Source, sourceById, where } from "./sources.ts";

const RECIPES: readonly Recipe[] = [
  drumKit,
  uprightBass,
  grandPiano,
  altoSax,
  vibraphone,
  electricBass,
  cleanGuitar,
  drivenGuitar,
  electricPiano,
  nylonGuitar,
  steelGuitar,
];

const ROOT = join(import.meta.dirname, "..", "..");
const PRE_ROLL = Math.round(0.001 * RATE);
/** A take more than this far from its mapped pitch is the wrong file, not a tuning. */
const WRONG_CENTS = 50;
/** Third-octave bands from 1 to 8 kHz, for the mono-fold check. */
const BANDS: [number, number][] = Array.from({ length: 10 }, (_, k) => {
  const centre = 1000 * 2 ** (k / 3);
  return [centre * 2 ** (-1 / 6), centre * 2 ** (1 / 6)];
});

const db = (g: number) => 20 * Math.log10(g);
const round = (v: number, places: number) => Number(v.toFixed(places));

interface Cut {
  readonly pcm: Float32Array;
  readonly gain: number;
  readonly root?: number;
  readonly clarity?: number;
  readonly octaveUp?: boolean;
  readonly endedBy: "cap" | "decay" | "file";
  /** The two channels of a stereo pack's take, cut and scaled as `pcm` (their fold) was. */
  readonly pair?: readonly [Float32Array, Float32Array];
  /** The fold's loss against its two channels in the worst band, dB, and that band's centre. */
  readonly fold?: { readonly db: number; readonly hz: number; readonly bands: readonly number[] };
}

function fold(recipe: Recipe, channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]!;
  return mix(channels.map((signal) => ({ signal, db: recipe.foldDb })));
}

function cutTake(recipe: Recipe, level: PackLevel, take: Take, measureRoots: boolean): Cut {
  // A shifted take is made at a higher rate and played at 48 kHz, which lowers it.
  const rate = take.shift ? Math.round(RATE * 2 ** (-take.shift / 12)) : RATE;
  let stereo: Float32Array[] | undefined;
  const parts = take.parts.map((p) => {
    const channels = decode(p.file, rate);
    if (take.parts.length === 1 && channels.length === 2) stereo = channels;
    const skip = p.offset ? Math.round((p.offset * rate) / probe(p.file).rate) : 0;
    return { signal: fold(recipe, channels).subarray(skip), db: p.db };
  });
  const x = parts.length === 1 && parts[0]!.db === 0 ? parts[0]!.signal : mix(parts);

  const o = onset(x, recipe.onsetDb ?? -50);
  const pre = Math.min(o, PRE_ROLL);
  const start = o - pre;
  const cap = Math.round(take.cap * RATE);
  const decay = tailEnd(x) - start;
  const rest = x.length - start;
  const length = Math.min(cap, decay, rest);
  const endedBy = length === cap ? "cap" : length === decay ? "decay" : "file";
  let seg = x.slice(start, start + length);
  if (pre > 0) fadeIn(seg, pre);
  // Through the amp while the note still has its own shape: the clip then eases as the note dies away.
  if (recipe.amp) seg = throughAmp(seg, recipe.amp, take.push);
  const fadeLength = Math.min(length, Math.max(Math.round(0.08 * RATE), Math.round(0.1 * length)));
  fadeOut(seg, fadeLength);

  const measured = levelOf(recipe, level, seg);
  const gain = level.reference - measured;
  const pcm = scale(seg, gain);
  let cut: Cut = { pcm, gain, endedBy };
  if (recipe.channels === 2 && stereo && !take.shift) {
    // The same cut, fades and gain on each channel as on their fold.
    const side = (channel: Float32Array): Float32Array => {
      const part = channel.slice(start, start + length);
      if (pre > 0) fadeIn(part, pre);
      fadeOut(part, fadeLength);
      return scale(part, gain);
    };
    const [l, r] = stereo as [Float32Array, Float32Array];
    cut = { ...cut, pair: [side(l), side(r)] };
  }

  if (recipe.roots && measureRoots && take.mapped !== undefined) {
    const { skip, seconds } = recipe.roots;
    const p = measurePitch(x, o, take.mapped, skip, seconds);
    const up = measurePitch(x, o, take.mapped + 12, skip, seconds);
    cut = { ...cut, root: p.midi, clarity: p.clarity, octaveUp: up.clarity >= p.clarity - 0.01 };
  }
  if (recipe.monoCheck && stereo) {
    const [l, r] = stereo as [Float32Array, Float32Array];
    const range = [start, start + length] as const;
    const pl = bandPowers(powerSpectrum(l, ...range), BANDS);
    const pr = bandPowers(powerSpectrum(r, ...range), BANDS);
    const sum = l.map((v, i) => 0.5 * (v + r[i]!));
    const ps = bandPowers(powerSpectrum(sum, ...range), BANDS);
    const bands = ps.map((p, i) => 10 * Math.log10(p / (0.5 * (pl[i]! + pr[i]!))));
    const worst = bands.indexOf(Math.min(...bands));
    cut = { ...cut, fold: { db: bands[worst]!, hz: 1000 * 2 ** (worst / 3), bands } };
  }
  return cut;
}

/** How far two channels played side by side sit over their fold, in dB, when they share little. */
const PAIR_OVER_FOLD = 3.01;

/**
 * A take's level by the voice's measure. `x` is the mono signal, or a stereo
 * pair's fold: a pair's loudness is its two channels' power together, which
 * for a spaced pair of microphones is about 3 dB over the fold's.
 */
function levelOf(recipe: Recipe, level: PackLevel, x: Float32Array): number {
  if (level.measure === "peak") return db(peak(x));
  return loudness(x) + (recipe.channels === 2 ? PAIR_OVER_FOLD : 0);
}

/**
 * Encodes a take, then decodes it and corrects its one gain by what the codec
 * moved the level, so that the file as a sampler hears it sits at the
 * reference. A sample peak moves by a decibel or so through the codec; a
 * loudness barely moves.
 */
function encodeLevelled(recipe: Recipe, level: PackLevel, cut: Cut, path: string): Cut {
  let current = cut;
  for (let pass = 0; pass < 4; pass++) {
    encodeOpus(current.pair ?? [current.pcm], path, recipe.kbps);
    const off = levelOf(recipe, level, fold(recipe, decode(path))) - level.reference;
    if (Math.abs(off) <= 0.05) break;
    current = {
      ...current,
      pcm: scale(current.pcm, -off),
      gain: current.gain - off,
      ...(current.pair
        ? { pair: [scale(current.pair[0], -off), scale(current.pair[1], -off)] as const }
        : {}),
    };
  }
  return current;
}

interface Written {
  readonly voice: string;
  readonly layer: number;
  readonly file: string;
  readonly mapped?: number;
  readonly cut: Cut;
  readonly source: string;
  readonly parts: Take["parts"];
}

function fileName(voice: string, layer: number, mapped: number | undefined, take: number) {
  const note = mapped === undefined ? "" : `n${Math.round(mapped)}-`;
  return `${voice ? `${voice}-` : ""}${note}v${layer + 1}-${take + 1}.webm`;
}

/**
 * The licence texts of a pack's sources: each in turn, under the source's
 * title, or one source's text byte for byte when every source has the same.
 */
function licenceText(sources: readonly Source[]): Buffer {
  const texts = sources.map((s) => readFileSync(join(ROOT, ".sources", s.id, s.licenceFile)));
  if (texts.every((t) => t.equals(texts[0]!))) return texts[0]!;
  return Buffer.concat(
    texts.flatMap((t, i) => [
      Buffer.from(
        `${i > 0 ? "\n\n" : ""}==== ${sources[i]!.title}, ${sources[i]!.author} ====\n\n`,
      ),
      t,
    ]),
  );
}

function cutPack(recipe: Recipe): boolean {
  const sources = recipe.credits.map((c) => sourceById(c.source));
  const dirOf = (id: string) => {
    if (!recipe.credits.some((c) => c.source === id)) {
      throw new Error(`${recipe.id} reads ${id}, which it does not credit`);
    }
    return join(ROOT, ".sources", id);
  };
  const dir = dirOf(sources[0]!.id);
  const out = join(ROOT, "assets", "packs", recipe.id);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const written: Written[] = [];
  const voices: Record<string, PackVoice> = {};
  for (const voice of recipe.voices(dir, dirOf)) {
    const layers = voice.layers.map((layer, li) => ({
      top: layer.top,
      zones: layer.zones.map((zone) => {
        const takes = zone.takes.map((take, ti) => {
          const file = fileName(voice.name, li, take.mapped, ti);
          const level = voice.level ?? recipe.level;
          const cut = encodeLevelled(
            recipe,
            level,
            cutTake(recipe, level, take, voice.measureRoots !== false),
            join(out, file),
          );
          const entry: Written = {
            voice: voice.name,
            layer: li,
            file,
            cut,
            source: take.parts
              .map((p) => p.file.slice(join(ROOT, ".sources").length + 1))
              .join(" + "),
            parts: take.parts,
          };
          written.push(take.mapped === undefined ? entry : { ...entry, mapped: take.mapped });
          return { file, seconds: round(cut.pcm.length / RATE, 6), cut, mapped: take.mapped };
        });
        const mapped = takes[0]!.mapped;
        const measured = takes.filter((t) => t.cut.root !== undefined).map((t) => t.cut.root!);
        const root =
          measured.length > 0 ? measured.reduce((a, b) => a + b, 0) / measured.length : mapped;
        const zoneTakes = takes.map((t) => ({ file: t.file, seconds: t.seconds }));
        return root === undefined
          ? { takes: zoneTakes }
          : { root: round(root, 3), takes: zoneTakes };
      }),
    }));
    const v: PackVoice = {
      layers,
      ...(voice.trim !== undefined && voice.trim !== 0 ? { trim: voice.trim } : {}),
      ...(voice.pan !== undefined && voice.pan !== 0 ? { pan: voice.pan } : {}),
      ...(voice.oneShot ? { oneShot: true } : {}),
      ...(voice.release !== undefined ? { release: voice.release } : {}),
      ...(voice.chokes ? { chokes: voice.chokes } : {}),
      ...(voice.level ? { level: voice.level } : {}),
    };
    voices[voice.name] = v;
  }

  const bytes = written.reduce((sum, w) => sum + statSync(join(out, w.file)).size, 0);
  const samples = written.reduce((sum, w) => sum + w.cut.pcm.length, 0);
  const decodedBytes = samples * recipe.channels * 4;
  const pack: Pack = {
    format: PACK_FORMAT,
    id: recipe.id,
    name: recipe.name,
    credits: recipe.credits.map((c, i) => {
      const source = sources[i]!;
      return {
        title: source.title,
        author: source.author,
        ...where(source),
        licence: source.licence,
        changes: c.changes,
      };
    }),
    audio: {
      container: "webm",
      codec: "opus",
      sampleRate: RATE,
      channels: recipe.channels,
      bytes,
      decodedBytes,
    },
    level: recipe.level,
    voices,
  };
  writeFileSync(join(out, "pack.json"), `${JSON.stringify(pack, null, 2)}\n`);
  writeFileSync(join(out, "LICENCE"), licenceText(sources));

  const ok = report(recipe, pack, written, out);
  const mb = decodedBytes / 1e6;
  if (mb > recipe.budgetMB) {
    console.log(`OVER BUDGET: ${mb.toFixed(1)} MB decoded, budget ${recipe.budgetMB} MB`);
    return false;
  }
  return ok;
}

function pad(s: string | number, n: number) {
  return String(s).padStart(n);
}

function report(recipe: Recipe, pack: Pack, written: readonly Written[], out: string): boolean {
  console.log(`\n== ${pack.id}: ${pack.name}`);
  console.log(
    `${"voice".padEnd(12)} ${pad("tops", 16)} ${pad("zones", 6)} ${pad("takes", 6)} ${pad("seconds", 8)} ${pad("bytes", 8)}  gain dB`,
  );
  for (const [name, v] of Object.entries(pack.voices)) {
    const mine = written.filter((w) => w.voice === name);
    const seconds = mine.reduce((s, w) => s + w.cut.pcm.length / RATE, 0);
    const bytes = mine.reduce((s, w) => s + statSync(join(out, w.file)).size, 0);
    const gains = mine.map((w) => w.cut.gain);
    console.log(
      `${(name || '""').padEnd(12)} ${pad(v.layers.map((l) => l.top).join("/"), 16)} ${pad(
        v.layers.map((l) => l.zones.length).join("/"),
        6,
      )} ${pad(mine.length, 6)} ${pad(seconds.toFixed(1), 8)} ${pad(bytes, 8)}  ${Math.min(...gains).toFixed(1)} to ${Math.max(...gains).toFixed(1)}`,
    );
  }
  for (const [name, v] of Object.entries(pack.voices)) {
    v.layers.forEach((layer, li) => {
      const mine = written.filter((w) => w.voice === name && w.layer === li);
      const files = mine.map((w) =>
        w.source
          .split(" + ")[0]!
          .split("/")
          .pop()!
          .replace(/\.\w+$/, ""),
      );
      const shown = files.length > 6 ? [...files.slice(0, 3), "...", ...files.slice(-2)] : files;
      console.log(`  ${(name || '""').padEnd(11)} top ${pad(layer.top, 3)}: ${shown.join(" ")}`);
    });
    const first = written.find((w) => w.voice === name)!;
    if (first.parts.length > 1) {
      console.log(
        `  ${"".padEnd(11)} mixed: ${first.parts.map((p) => `${dirname(p.file.split("/Samples/")[1]!)} ${p.db.toFixed(1)} dB`).join(", ")}`,
      );
    }
  }
  const ended = { cap: 0, decay: 0, file: 0 };
  for (const w of written) ended[w.cut.endedBy]++;
  const mb = pack.audio.decodedBytes / 1e6;
  console.log(
    `${written.length} files, ${pack.audio.bytes} bytes (${(pack.audio.bytes / 1e6).toFixed(2)} MB), decoded ${mb.toFixed(1)} MB of ${recipe.budgetMB} MB; ended by cap ${ended.cap}, decay ${ended.decay}, file end ${ended.file}`,
  );
  const hot = written.filter((w) => db(peak(w.cut.pcm)) > -1);
  if (hot.length > 0) {
    console.log(
      `peaks above -1 dBFS after levelling: ${hot.map((w) => `${w.file} ${db(peak(w.cut.pcm)).toFixed(1)}`).join(", ")}`,
    );
  }

  const roots = written.filter((w) => w.cut.root !== undefined && w.mapped !== undefined);
  if (roots.length > 0) {
    const devs = roots
      .map((w) => ({ w, cents: (w.cut.root! - w.mapped!) * 100 }))
      .sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents));
    console.log(
      `roots: largest deviations from the mapping (cents): ${devs
        .slice(0, 6)
        .map((d) => `${d.w.file} ${d.cents >= 0 ? "+" : ""}${d.cents.toFixed(1)}`)
        .join(", ")}`,
    );
    const mean = devs.reduce((s, d) => s + d.cents, 0) / devs.length;
    console.log(
      `roots: mean deviation ${mean.toFixed(1)} cents over ${devs.length} takes; lowest clarity ${Math.min(...roots.map((w) => w.cut.clarity!)).toFixed(3)}`,
    );
    for (const d of devs.filter((d) => Math.abs(d.cents) > WRONG_CENTS)) {
      console.log(
        `WRONG FILE? ${d.w.file} (${d.w.source}) measures ${d.w.cut.root!.toFixed(2)}, mapped ${d.w.mapped}`,
      );
    }
    for (const w of roots.filter((w) => w.cut.octaveUp)) {
      console.log(`OCTAVE? ${w.file} (${w.source}) correlates as well an octave up`);
    }
  }

  const folds = written.filter((w) => w.cut.fold);
  if (folds.length > 0) {
    const sorted = [...folds].sort((a, b) => a.cut.fold!.db - b.cut.fold!.db);
    const losses = folds.map((w) => w.cut.fold!.db);
    console.log(
      `mono fold, worst third-octave band 1 to 8 kHz against the channels' mean: median ${median(losses).toFixed(1)} dB, worst ${sorted
        .slice(0, 5)
        .map((w) => `${w.file} ${w.cut.fold!.db.toFixed(1)} dB at ${Math.round(w.cut.fold!.hz)} Hz`)
        .join(", ")}`,
    );
    const perBand = BANDS.map((_, i) => median(folds.map((w) => w.cut.fold!.bands[i]!)));
    console.log(
      `mono fold, median loss by band: ${perBand.map((v, i) => `${Math.round(1000 * 2 ** (i / 3))} Hz ${v.toFixed(1)}`).join(", ")}`,
    );
    const lost = sorted.filter((w) => w.cut.fold!.db < -6);
    console.log(`mono fold: ${lost.length} of ${folds.length} takes lose more than 6 dB in a band`);
  }

  return roundTrip(pack, written, out);
}

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/**
 * Where the codec puts a click: one written 1 ms and one 100 ms into a second
 * of silence, encoded and decoded as every take is. An encoder whose lead-in
 * the decoder does not remove would show here as a later sample.
 */
function codecDelay(kbps: number): string {
  const dir = join(ROOT, ".cut-tmp");
  mkdirSync(dir, { recursive: true });
  const at = [PRE_ROLL, Math.round(0.1 * RATE)];
  const x = new Float32Array(RATE);
  for (const i of at) x[i] = 0.5;
  const file = join(dir, "click.webm");
  encodeOpus([x], file, kbps);
  const d = decode(file)[0]!;
  const found = at.map((i) => {
    let best = i - PRE_ROLL;
    for (let j = i - PRE_ROLL; j <= i + PRE_ROLL; j++)
      if (Math.abs(d[j]!) > Math.abs(d[best]!)) best = j;
    return best;
  });
  return `clicks written at samples ${at.join(" and ")} decode at ${found.join(" and ")}; ${d.length} samples back for ${x.length}`;
}

/** A 2 ms running RMS of `x`: its loudness from moment to moment, without the waveform. */
function envelope(x: Float32Array, length: number): Float64Array {
  const w = Math.round(0.002 * RATE);
  const out = new Float64Array(length);
  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += (x[i] ?? 0) ** 2 - (i >= w ? (x[i - w] ?? 0) ** 2 : 0);
    out[i] = Math.sqrt(Math.max(0, sum) / w);
  }
  return out;
}

/**
 * How many samples later `b` sounds than `a`: the shift, within 1 ms either
 * way, that best lines up their envelopes over the first 50 ms. Envelopes,
 * not waveforms, so that a shift by a whole period of the note is no match.
 */
function lag(a: Float32Array, b: Float32Array): number {
  const n = Math.round(0.05 * RATE);
  const ea = envelope(a, n + 2 * PRE_ROLL);
  const eb = envelope(b, n + 2 * PRE_ROLL);
  let best = 0;
  let bestErr = Infinity;
  for (let k = -PRE_ROLL; k <= PRE_ROLL; k++) {
    let err = 0;
    for (let i = PRE_ROLL; i < n + PRE_ROLL; i++) err += (ea[i]! - eb[i + k]!) ** 2;
    if (err < bestErr) {
      bestErr = err;
      best = k;
    }
  }
  return best;
}

/**
 * Decodes what was written and compares it with what was meant: whether the
 * codec moved the sound in time (the lag of the envelopes, and where each
 * crosses 30 dB under its peak, which noise moves in a slow attack), where the onset is (the first sample within
 * 50 dB of the peak), the length, and the level.
 */
function roundTrip(pack: Pack, written: readonly Written[], out: string): boolean {
  let worstLag = 0;
  let strike = 0;
  let onsetMs = 0;
  let lengthOff = 0;
  let levelOff = 0;
  let worstLevel = "";
  const late: string[] = [];
  const recipe = RECIPES.find((r) => r.id === pack.id)!;
  for (const w of written) {
    // A stereo file is judged as it was cut: on its fold.
    const d = fold(recipe, decode(join(out, w.file)));
    const l = lag(w.cut.pcm, d);
    if (Math.abs(l) > Math.abs(worstLag)) worstLag = l;
    strike = Math.max(strike, Math.abs(onset(d, -30) - onset(w.cut.pcm, -30)));
    const ms = (onset(d) / RATE) * 1000;
    onsetMs = Math.max(onsetMs, ms);
    if (ms > 1) late.push(`${w.file} ${ms.toFixed(2)} ms`);
    lengthOff = Math.max(lengthOff, Math.abs(d.length - w.cut.pcm.length));
    const voiceLevel = pack.voices[w.voice]?.level ?? pack.level;
    const off = levelOf(recipe, voiceLevel, d) - voiceLevel.reference;
    if (Math.abs(off) > Math.abs(levelOff)) {
      levelOff = off;
      worstLevel = w.file;
    }
  }
  const ok = Math.abs(worstLag) <= PRE_ROLL / 2 && lengthOff === 0 && Math.abs(levelOff) <= 0.5;
  console.log(
    `round trip, all ${written.length} files: envelope lag ${worstLag} samples at most; the point 30 dB under the peak moved by at most ${strike} samples; ` +
      `onset (50 dB under) at most ${onsetMs.toFixed(2)} ms from the start; length off by at most ${lengthOff} samples; ` +
      `level off by at most ${levelOff >= 0 ? "+" : ""}${levelOff.toFixed(2)} dB (${worstLevel}): ${ok ? "pass" : "FAIL"}`,
  );
  if (late.length > 0) console.log(`onset later than 1 ms in ${late.length}: ${late.join(", ")}`);
  return ok;
}

const wanted = process.argv.slice(2);
const unknown = wanted.filter((id) => !RECIPES.some((r) => r.id === id));
if (unknown.length > 0) {
  console.error(
    `no recipe for ${unknown.join(", ")}; there are ${RECIPES.map((r) => r.id).join(", ")}`,
  );
  process.exit(2);
}
console.log(`${ffmpegVersion()} (${FFMPEG})`);
console.log(`codec timing: ${codecDelay(80)}`);
let fine = true;
for (const recipe of RECIPES) {
  if (wanted.length > 0 && !wanted.includes(recipe.id)) continue;
  fine = cutPack(recipe) && fine;
}
if (!fine) process.exit(1);
