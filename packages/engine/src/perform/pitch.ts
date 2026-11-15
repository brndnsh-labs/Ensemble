// A note whose pitch moves while it sounds: a string pushed up to a note, a
// held note shaken. Players write the move in ticks; whatever makes sound
// needs it as a curve in clock time, and the MIDI file as pitch bend, so both
// are drawn from the same move here and say the same thing.

/** A point the pitch passes through: `semitones` away from the note's own, `at` ticks after it starts. */
export interface GlidePoint {
  readonly at: number;
  readonly semitones: number;
}

/** A held note shaken. */
export interface Vibrato {
  /** Ticks into the note at which it starts: a player shakes the part of the note that is held. */
  readonly from: number;
  /** Ticks it takes to reach its full depth. */
  readonly grow: number;
  /** How far the pitch moves, in cents. */
  readonly depth: number;
  /** Times a second. */
  readonly rate: number;
  /**
   * A fretted string can only be pushed sharp: the pitch rises to `depth` and
   * comes back to the note. Left out, it goes `depth` either side, as a horn's does.
   */
  readonly upward?: boolean;
}

/** How a note's pitch moves. Before the first glide point the pitch is that point's; after the last it stays. */
export interface PitchMove {
  /** In order of `at`. The pitch eases from each to the next, as a finger does: slow away, slow to arrive. */
  readonly glide?: readonly GlidePoint[];
  readonly vibrato?: Vibrato;
}

/** Seconds between the points of a pitch curve. */
export const CURVE_STEP = 0.005;

/** Nobody's hand is a machine: the shake's speed and depth drift a little, the same way for the same note. */
const DRIFT = { speed: 0.04, speedRate: 0.6, depth: 0.1, depthRate: 0.43 };

/**
 * The move as a curve: cents away from the note's pitch, every `CURVE_STEP`
 * seconds from its start to its end.
 */
export function pitchCurve(move: PitchMove, secondsPerTick: number, seconds: number): number[] {
  const points = (move.glide ?? []).map((point) => ({
    at: point.at * secondsPerTick,
    cents: point.semitones * 100,
  }));
  const glide = (t: number): number => {
    const first = points[0];
    if (!first) return 0;
    if (t <= first.at) return first.cents;
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1]!;
      const to = points[i]!;
      if (t > to.at) continue;
      const x = (t - from.at) / Math.max(1e-9, to.at - from.at);
      return from.cents + (to.cents - from.cents) * x * x * (3 - 2 * x);
    }
    return points.at(-1)!.cents;
  };

  const { vibrato } = move;
  const from = vibrato ? vibrato.from * secondsPerTick : 0;
  const grow = vibrato ? Math.max(CURVE_STEP, vibrato.grow * secondsPerTick) : 1;
  let turn = 0;
  const curve: number[] = [];
  const count = Math.max(2, Math.ceil(seconds / CURVE_STEP) + 1);
  for (let i = 0; i < count; i++) {
    const t = i * CURVE_STEP;
    let cents = glide(t);
    if (vibrato && t >= from) {
      const into = t - from;
      const speed =
        vibrato.rate * (1 + DRIFT.speed * Math.sin(2 * Math.PI * DRIFT.speedRate * into));
      turn += speed * CURVE_STEP;
      const depth =
        vibrato.depth *
        Math.min(1, into / grow) *
        (1 + DRIFT.depth * Math.sin(2 * Math.PI * DRIFT.depthRate * into + 1));
      cents += vibrato.upward
        ? depth * (0.5 - 0.5 * Math.cos(2 * Math.PI * turn))
        : depth * Math.sin(2 * Math.PI * turn);
    }
    curve.push(Math.round(cents * 10) / 10);
  }
  return curve;
}
