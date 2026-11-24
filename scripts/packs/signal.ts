// The measurements and edits a take goes through when a pack is cut: decoding
// a source file, finding where the sound starts and where its tail has gone,
// how loud it is, what pitch it sounds at, fading its ends, and encoding it.
// Decoding and encoding go through ffmpeg; everything between is plain arrays
// of 48 kHz samples.

import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";

export const RATE = 48000;

/**
 * The ffmpeg to use: the first of `$FFMPEG`, the one on the path, and
 * `/usr/bin/ffmpeg` that was built with both soxr and libopus. Builds differ
 * (Homebrew's ffmpeg 9 has libopus and no soxr), so the cut says which it used.
 */
export const FFMPEG = (() => {
  const candidates = [process.env.FFMPEG, "ffmpeg", "/usr/bin/ffmpeg"].filter(
    (c): c is string => !!c,
  );
  for (const bin of candidates) {
    try {
      const conf = execFileSync(bin, ["-hide_banner", "-buildconf"], { encoding: "utf8" });
      if (conf.includes("--enable-libsoxr") && conf.includes("--enable-libopus")) return bin;
    } catch {}
  }
  throw new Error("no ffmpeg built with both soxr and libopus; set FFMPEG");
})();

const FFPROBE = FFMPEG.includes("/") ? join(dirname(FFMPEG), "ffprobe") : "ffprobe";

export function ffmpegVersion(): string {
  return execFileSync(FFMPEG, ["-hide_banner", "-version"], { encoding: "utf8" }).split("\n")[0]!;
}

const dbToGain = (db: number) => 10 ** (db / 20);
export const gainToDb = (g: number) => 20 * Math.log10(g);

/** A file's channel count and sample rate. */
export function probe(path: string): { channels: number; rate: number } {
  const [rate, channels] = execFileSync(
    FFPROBE,
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=sample_rate,channels",
      "-of",
      "csv=p=0",
      path,
    ],
    { encoding: "utf8" },
  )
    .trim()
    .split(",")
    .map(Number);
  return { channels: channels!, rate: rate! };
}

/**
 * Decodes a file to floats, one array per channel. `rate` is the rate the
 * samples are made at (soxr resampler); a rate above 48 kHz played back at
 * 48 kHz lowers the pitch, which is how a drum is tuned down.
 */
export function decode(path: string, rate = RATE): Float32Array[] {
  const { channels } = probe(path);
  const raw = execFileSync(
    FFMPEG,
    [
      "-v",
      "error",
      "-i",
      path,
      "-af",
      `aresample=osr=${rate}:resampler=soxr:precision=28`,
      "-f",
      "f32le",
      "-acodec",
      "pcm_f32le",
      "pipe:1",
    ],
    { maxBuffer: 1 << 30 },
  );
  const all = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const frames = all.length / channels;
  const out: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    const ch = new Float32Array(frames);
    for (let i = 0; i < frames; i++) ch[i] = all[i * channels + c]!;
    out.push(ch);
  }
  return out;
}

/** Adds signals sample by sample, each at a gain in dB, padding the shorter ones with silence. */
export function mix(parts: readonly { signal: Float32Array; db: number }[]): Float32Array {
  const length = Math.max(...parts.map((p) => p.signal.length));
  const out = new Float32Array(length);
  for (const { signal, db } of parts) {
    const g = dbToGain(db);
    for (let i = 0; i < signal.length; i++) out[i]! += g * signal[i]!;
  }
  return out;
}

export function peak(x: Float32Array, from = 0, to = x.length): number {
  let p = 0;
  for (let i = from; i < to; i++) {
    const a = Math.abs(x[i]!);
    if (a > p) p = a;
  }
  return p;
}

/** The first sample within `db` of the peak: where the sound starts. */
export function onset(x: Float32Array, db = -50): number {
  const floor = peak(x) * dbToGain(db);
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]!) >= floor) return i;
  return 0;
}

/** One past the last sample within `db` of the peak: where the tail has died. */
export function tailEnd(x: Float32Array, db = -60): number {
  const floor = peak(x) * dbToGain(db);
  for (let i = x.length - 1; i >= 0; i--) if (Math.abs(x[i]!) >= floor) return i + 1;
  return 0;
}

// ITU-R BS.1770 K-weighting at 48 kHz: a high shelf for the head, then a high-pass.
const SHELF = {
  b: [1.53512485958697, -2.69169618940638, 1.19839281085285],
  a: [-1.69065929318241, 0.73248077421585],
};
const HIGHPASS = { b: [1, -2, 1], a: [-1.99004745483398, 0.99007225036621] };

function biquad(x: Float64Array, f: { b: number[]; a: number[] }): Float64Array {
  const [b0, b1, b2] = f.b as [number, number, number];
  const [a1, a2] = f.a as [number, number];
  const y = new Float64Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i]! + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i]!;
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/**
 * The loudness of the loudest 400 ms, K-weighted, in LUFS (a mono signal).
 * Windows step by 100 ms, as momentary loudness does; a take shorter than
 * 400 ms is measured over a 400 ms window padded with silence.
 */
export function loudness(x: Float32Array): number {
  const w = biquad(biquad(Float64Array.from(x), SHELF), HIGHPASS);
  const window = Math.round(0.4 * RATE);
  const hop = Math.round(0.1 * RATE);
  const sq = new Float64Array(w.length + 1);
  for (let i = 0; i < w.length; i++) sq[i + 1] = sq[i]! + w[i]! * w[i]!;
  let best = 0;
  for (let start = 0; start === 0 || start + window <= w.length; start += hop) {
    const end = Math.min(start + window, w.length);
    const ms = (sq[end]! - sq[start]!) / window;
    if (ms > best) best = ms;
  }
  return -0.691 + 10 * Math.log10(best);
}

export function scale(x: Float32Array, db: number): Float32Array {
  const g = dbToGain(db);
  return x.map((v) => v * g);
}

/**
 * A drum damped, as a pillow in it would: at full for `hold` seconds from sample
 * `from`, then falling evenly in decibels to 60 down over `decay`, then silent.
 */
export function damp(
  x: Float32Array,
  from: number,
  { hold, decay }: { readonly hold: number; readonly decay: number },
  rate = RATE,
): void {
  for (let i = from + Math.round(hold * rate); i < x.length; i++) {
    const t = (i - from) / rate - hold;
    x[i]! *= t >= decay ? 0 : 10 ** ((-3 * t) / decay);
  }
}

/** Everything over `hz` lifted by `db`: a high shelf, the audio EQ cookbook's, slope 1. */
export function highShelf(
  x: Float32Array,
  hz: number,
  db: number,
  rate = RATE,
): Float32Array<ArrayBuffer> {
  const a = 10 ** (db / 40);
  const w = (2 * Math.PI * hz) / rate;
  const [c, r] = [Math.cos(w), Math.sqrt(2 * a) * Math.sin(w)];
  const b0 = a * (a + 1 + (a - 1) * c + r);
  const b1 = -2 * a * (a - 1 + (a + 1) * c);
  const b2 = a * (a + 1 + (a - 1) * c - r);
  const a0 = a + 1 - (a - 1) * c + r;
  const a1 = 2 * (a - 1 - (a + 1) * c);
  const a2 = a + 1 - (a - 1) * c - r;
  const y = new Float32Array(x.length);
  let [x1, x2, y1, y2] = [0, 0, 0, 0];
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i]! + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    [x2, x1, y2, y1] = [x1, x[i]!, y1, v];
    y[i] = v;
  }
  return y;
}

/** Raised-cosine fade over the first `n` samples. */
export function fadeIn(x: Float32Array, n: number): void {
  for (let i = 0; i < n && i < x.length; i++) x[i]! *= 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
}

/** Raised-cosine fade over the last `n` samples, reaching zero on the last one. */
export function fadeOut(x: Float32Array, n: number): void {
  const start = Math.max(0, x.length - n);
  const span = x.length - 1 - start;
  for (let i = start; i < x.length; i++) {
    const t = span > 0 ? (i - start) / span : 1;
    x[i]! *= 0.5 + 0.5 * Math.cos(Math.PI * t);
  }
}

/** Normalised autocorrelation of `x[from..from+n]` against itself `lag` samples later. */
function correlation(x: Float32Array, from: number, n: number, lag: number): number {
  let xy = 0;
  let xx = 0;
  let yy = 0;
  for (let i = from; i < from + n; i++) {
    const a = x[i]!;
    const b = x[i + lag]!;
    xy += a * b;
    xx += a * a;
    yy += b * b;
  }
  return xx > 0 && yy > 0 ? xy / Math.sqrt(xx * yy) : 0;
}

/** The lag in `[lo, hi]` with the best correlation, refined between samples by a parabola. */
function bestLag(x: Float32Array, from: number, n: number, lo: number, hi: number) {
  let best = lo;
  let bestR = -2;
  const r = new Map<number, number>();
  for (let lag = lo; lag <= hi; lag++) {
    const v = correlation(x, from, n, lag);
    r.set(lag, v);
    if (v > bestR) {
      bestR = v;
      best = lag;
    }
  }
  const left = r.get(best - 1) ?? correlation(x, from, n, best - 1);
  const right = r.get(best + 1) ?? correlation(x, from, n, best + 1);
  const curve = left - 2 * bestR + right;
  const shift = curve < 0 ? (0.5 * (left - right)) / curve : 0;
  return { lag: best + shift, r: bestR };
}

export interface Pitch {
  /** The pitch as a fractional MIDI number. */
  readonly midi: number;
  /** How alike the waveform is one period on, 0 to 1: a low number is a doubtful reading. */
  readonly clarity: number;
}

/** A second-order Butterworth low-pass at `hz`. */
function lowpass(x: Float32Array, hz: number): Float32Array {
  const w = Math.tan((Math.PI * hz) / RATE);
  const n = 1 / (1 + Math.SQRT2 * w + w * w);
  const b0 = w * w * n;
  const f = { b: [b0, 2 * b0, b0], a: [2 * (w * w - 1) * n, (1 - Math.SQRT2 * w + w * w) * n] };
  return Float32Array.from(biquad(Float64Array.from(x), f));
}

/**
 * The pitch of a steady stretch of a note, searched within three semitones of
 * the pitch the mapping expects. The note is low-passed first, at one and a
 * half times that pitch, so that a struck bar's inharmonic overtones do not
 * pull the reading. The stretch starts `skip` seconds after the
 * onset and lasts up to `seconds`. The period is found coarsely, then again at
 * a multiple of it of at least 256 samples, for a precision of a cent or so on
 * high notes.
 */
export function measurePitch(
  source: Float32Array,
  start: number,
  expected: number,
  skip: number,
  seconds: number,
): Pitch {
  const hz = 440 * 2 ** ((expected - 69) / 12);
  const period = RATE / hz;
  const from = start + Math.round(skip * RATE);
  const x = lowpass(lowpass(source, 1.5 * hz), 1.5 * hz);
  const span = 2 ** (3 / 12);
  const maxLag = Math.ceil(period * span) + 2;
  const k = Math.max(1, Math.round(256 / period));
  const n = Math.min(Math.round(seconds * RATE), x.length - from - k * maxLag - 2);
  if (n < 4 * maxLag) throw new Error("too short to measure a pitch");
  const coarse = bestLag(x, from, n, Math.floor(period / span), maxLag);
  let lag = coarse.lag;
  if (k > 1) {
    const centre = k * coarse.lag;
    const fine = bestLag(
      x,
      from,
      n,
      Math.floor(centre - coarse.lag / 3),
      Math.ceil(centre + coarse.lag / 3),
    );
    lag = fine.lag / k;
  }
  return { midi: 69 + 12 * Math.log2(RATE / lag / 440), clarity: coarse.r };
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const step = (-2 * Math.PI) / size;
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < size / 2; k++) {
        const cr = Math.cos(step * k);
        const ci = Math.sin(step * k);
        const a = i + k;
        const b = a + size / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a]! += tr;
        im[a]! += ti;
      }
    }
  }
}

/**
 * The power spectrum of `x[from..to]`, averaged over Hann windows of 4096
 * samples overlapping by half. Bin `i` is at `i * RATE / 4096` Hz.
 */
export function powerSpectrum(x: Float32Array, from: number, to: number): Float64Array {
  const size = 4096;
  const out = new Float64Array(size / 2);
  const hann = new Float64Array(size).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
  let count = 0;
  for (let s = from; s + size <= to; s += size / 2) {
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    for (let i = 0; i < size; i++) re[i] = x[s + i]! * hann[i]!;
    fft(re, im);
    for (let i = 0; i < size / 2; i++) out[i]! += re[i]! * re[i]! + im[i]! * im[i]!;
    count++;
  }
  return count > 0 ? out.map((v) => v / count) : out;
}

/** Summed power in each band `[lo, hi)` Hz of a spectrum from `powerSpectrum`. */
export function bandPowers(spectrum: Float64Array, bands: readonly [number, number][]): number[] {
  const hz = RATE / (spectrum.length * 2);
  return bands.map(([lo, hi]) => {
    let sum = 0;
    for (let i = Math.ceil(lo / hz); i < Math.min(spectrum.length, hi / hz); i++)
      sum += spectrum[i]!;
    return sum;
  });
}

/** Encodes mono or stereo floats as Opus in WebM at 48 kHz. */
export function encodeOpus(channels: readonly Float32Array[], path: string, kbps: number): void {
  const frames = channels[0]!.length;
  const inter = new Float32Array(frames * channels.length);
  for (let c = 0; c < channels.length; c++) {
    const ch = channels[c]!;
    for (let i = 0; i < frames; i++) inter[i * channels.length + c] = ch[i]!;
  }
  const run = spawnSync(
    FFMPEG,
    [
      "-v",
      "error",
      "-y",
      "-f",
      "f32le",
      "-ar",
      String(RATE),
      "-ac",
      String(channels.length),
      "-i",
      "pipe:0",
      "-c:a",
      "libopus",
      "-b:a",
      `${kbps}k`,
      "-application",
      "audio",
      "-map_metadata",
      "-1",
      "-fflags",
      "+bitexact",
      "-flags:a",
      "+bitexact",
      "-f",
      "webm",
      path,
    ],
    { input: Buffer.from(inter.buffer, inter.byteOffset, inter.byteLength), maxBuffer: 1 << 26 },
  );
  if (run.status !== 0) throw new Error(`ffmpeg could not encode ${path}: ${run.stderr}`);
}
