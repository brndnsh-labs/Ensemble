// The shape of a jam across its passes, as an offset added to each section's
// own energy. The form still breathes inside every pass; the arc moves the
// whole pass up or down around it.

import type { ArcStyle } from "../style/types.ts";

export interface ArcPosition {
  readonly pass: number;
  readonly passes: number;
  readonly open: boolean;
  readonly part: "intro" | "body" | "ending";
  /** Where the current phrase starts and ends, as fractions of one pass through the body. */
  readonly phraseStart: number;
  readonly phraseEnd: number;
  /**
   * The pass the band peaks on, when someone's solo says where: a band builds
   * with its soloist. Left out, the jam peaks about two thirds of the way through.
   */
  readonly climax?: number;
}

/** Where a jam of `passes` peaks when nothing else says: its climax pass ends about two thirds in. */
export function defaultClimax(passes: number): number {
  if (passes <= 3) return 1;
  return Math.min(passes - 3, Math.max(1, Math.round((2 * passes) / 3) - 1));
}

export function arcOffset(arc: ArcStyle, at: ArcPosition): number {
  // An open jam cannot know how long it is: later passes are a little fuller, and that is all.
  if (at.open) return Math.min(arc.passLift.cap, arc.passLift.step * at.pass);

  const shape = arc.timed;
  if (at.part === "intro") return shape.first;
  // A written ending is landed on at the last pass's full lift, at its own lower level.
  if (at.part === "ending") return shape.lastTo;

  const n = at.passes;
  const last = n - 1;
  const lift = (from: number) => from + (shape.lastTo - from) * at.phraseEnd;
  const leaning = (mean: number) => mean + shape.lean * (at.phraseStart + at.phraseEnd - 1);

  if (n === 1) return lift(shape.first);
  if (at.pass === 0) return shape.first;
  if (at.pass === last) {
    // With three passes there is no room for a breath pass: the last pass opens on it instead.
    if (n === 3 && at.phraseStart === 0) return shape.breath;
    return lift(shape.lastFrom);
  }
  const climax = at.climax ?? defaultClimax(n);
  if (at.pass < climax) {
    return leaning(shape.first + ((shape.climax - shape.first) * at.pass) / climax);
  }
  if (at.pass === climax) return leaning(shape.climax);
  // One pass of breath before the last; holding back is not building, so it does not lean.
  if (at.pass === last - 1) return shape.breath;
  return shape.settle;
}
