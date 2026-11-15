// An amplifier for a guitar recorded clean: thinned at the bottom, clipped
// softly and a little unevenly, then played through a speaker. The speaker
// makes or breaks it (docs/music-notes, SN-25): the first one the old band
// tried was "a little brittle" until it was made darker and given some body.
//
// The clip makes overtones far above anything a 48 kHz file can hold, and
// those would fold back down as tones that belong to no note. So the amp runs
// at four times the rate, and the speaker's own roll-off is what makes it safe
// to come back down.

import type { Amp } from "./recipe.ts";
import { peak, RATE } from "./signal.ts";

const OVER = 4;

interface Biquad {
  readonly b: readonly [number, number, number];
  readonly a: readonly [number, number];
}

/** The textbook second-order sections (Bristow-Johnson), at the amp's rate. */
function section(kind: "low" | "high" | "peak", hz: number, q: number, db = 0): Biquad {
  const w = (2 * Math.PI * hz) / (RATE * OVER);
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  if (kind === "peak") {
    const A = 10 ** (db / 40);
    const a0 = 1 + alpha / A;
    return {
      b: [(1 + alpha * A) / a0, (-2 * cos) / a0, (1 - alpha * A) / a0],
      a: [(-2 * cos) / a0, (1 - alpha / A) / a0],
    };
  }
  const a0 = 1 + alpha;
  const edge = kind === "low" ? (1 - cos) / 2 : (1 + cos) / 2;
  const middle = kind === "low" ? 1 - cos : -(1 + cos);
  return {
    b: [edge / a0, middle / a0, edge / a0],
    a: [(-2 * cos) / a0, (1 - alpha) / a0],
  };
}

function run(x: Float64Array, { b, a }: Biquad): Float64Array {
  const y = new Float64Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i]! + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
    x2 = x1;
    x1 = x[i]!;
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/** A Butterworth filter of an even order, as its second-order sections. */
function butterworth(kind: "low" | "high", hz: number, order: number): Biquad[] {
  return Array.from({ length: order / 2 }, (_, k) =>
    section(kind, hz, 1 / (2 * Math.cos((Math.PI * (2 * k + 1)) / (2 * order)))),
  );
}

/**
 * A take through the amp. The take is brought to full scale first, so every
 * note meets the clip at the same level whatever the recording's own; `push`
 * scales the drive for this take (a softer layer is driven less, as a softer
 * touch is).
 */
export function throughAmp(x: Float32Array, amp: Amp, push = 1): Float32Array<ArrayBuffer> {
  const full = peak(x) || 1;
  // Up to four times the rate: each sample then three of nothing, and everything the
  // gaps add above the old band's top is taken off again.
  let y: Float64Array = new Float64Array(x.length * OVER);
  for (let i = 0; i < x.length; i++) y[i * OVER] = (x[i]! / full) * OVER;
  for (const f of butterworth("low", 20000, 8)) y = run(y, f);

  for (const f of butterworth("high", amp.lowCut, 2)) y = run(y, f);
  const drive = amp.drive * push;
  const rest = Math.tanh(amp.bias);
  for (let i = 0; i < y.length; i++) y[i] = Math.tanh(drive * y[i]! + amp.bias) - rest;
  // The uneven clip leaves a slow push to one side, which is not sound.
  for (const f of butterworth("high", 30, 2)) y = run(y, f);

  for (const f of butterworth("low", amp.speaker.rollOff, 4)) y = run(y, f);
  for (const [hz, db, q] of amp.speaker.peaks) y = run(y, section("peak", hz, q, db));

  const out = new Float32Array(x.length);
  for (let i = 0; i < out.length; i++) out[i] = y[i * OVER]!;
  return out;
}
