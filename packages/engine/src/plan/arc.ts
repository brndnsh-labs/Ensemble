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
   * The pass the band was told to finish on, when it was told: a jam ended
   * before its time, or an open jam ended at all.
   */
  readonly told?: number;
  /**
   * The pass the band peaks on, when someone's solo says where: a band builds
   * with its soloist. Left out, the jam peaks about two thirds of the way through.
   */
  readonly climax?: number;
  /**
   * The pass the band takes its breath on, when a solo says where; -1 for no
   * breath at all. Left out, it is the pass before the last.
   */
  readonly breath?: number;
  /**
   * How far through its build a solo after the peak is on this pass, 0 to 1:
   * the band comes back up under it, from where it settled to the peak again.
   */
  readonly rise?: number;
}

/** Where a jam of `passes` peaks when nothing else says: its climax pass ends about two thirds in. */
export function defaultClimax(passes: number): number {
  if (passes <= 3) return 1;
  return Math.min(passes - 3, Math.max(1, Math.round((2 * passes) / 3) - 1));
}

export function arcOffset(arc: ArcStyle, at: ArcPosition): number {
  // The first time round is the tune; an open jam always has a next pass to open up on.
  const head = at.part === "body" && at.pass === 0 && (at.open || at.passes > 1) ? arc.head : 0;
  const asPlanned = head + shapeOffset(arc, at);
  if (at.told === undefined || at.pass < at.told || at.part === "intro") return asPlanned;
  // Told to finish: a written ending is landed on as any is, and the pass before it lifts
  // to the same place from wherever it was. Its first phrase is left as it was, so the
  // band walks into the pass exactly as it would have.
  if (at.part === "ending") return arc.timed.lastTo;
  const firstPhrase = at.phraseStart === 0 && at.phraseEnd < 1;
  return firstPhrase ? asPlanned : asPlanned + (arc.timed.lastTo - asPlanned) * at.phraseEnd;
}

function shapeOffset(arc: ArcStyle, at: ArcPosition): number {
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
  if (at.pass === (at.breath ?? last - 1)) return shape.breath;
  if (at.rise !== undefined) return shape.settle + (shape.climax - shape.settle) * at.rise;
  return shape.settle;
}
