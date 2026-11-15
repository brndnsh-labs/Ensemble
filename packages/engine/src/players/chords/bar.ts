// One bar of comping: a written figure laid over the bar's harmony. The
// figure says where the hand comes down; the harmony says which chord each
// strike plays, and the rules every comper follows at a change of chord
// decide the rest (CH-33 to CH-41):
//
// - the eighth before a change belongs to the chord coming. A strike there
//   plays the new chord and ties over (a push), or, in a style that pushes, it
//   is not played: the outgoing chord is never stabbed there (CH-40, KF-B-27);
// - a pushed chord is not struck again on the beat, and rings as long as the
//   strike it stands in for (SU-B-01);
// - a groove (the boogie pump) is the exception: it hammers through, and
//   strikes a pushed chord again on the beat (CH-41); a groove that ties (a
//   strummed line) lets the pushed chord ring and passes over it (CH-36);
// - every chord the chart writes is struck at least once (CH-34), and a muted
//   stroke, a scratch, is not a strike of the chord: it gives way to one;
// - a chord rings only while it is written, and never past its own bar unless
//   it is a push (CH-35). Nothing is struck under N.C. (X-B-18).

import { PPQ } from "../../chart/types.ts";
import { STEP } from "../../perform/grid.ts";
import type { Arrival } from "../../perform/harmony.ts";
import type { PlanBar } from "../../plan/types.ts";
import type { Tier } from "../../style/types.ts";
import type { FigureStroke } from "./figure.ts";
import type { Stretch } from "./plain.ts";
import type { Strike } from "./strike.ts";
import type { ChordStyle, CompFigure, RhythmBook } from "./style.ts";

export const EIGHTH = PPQ / 2;

/** A change of chord the hand is heading for. */
export interface Change {
  /** The chord coming. */
  readonly arrival: Arrival;
  /** Whether the hand plays it early. */
  readonly push: boolean;
  /** How long a pushed chord rings past the change, in ticks. */
  readonly carry: number;
}

export interface BarSetting {
  readonly bar: PlanBar;
  /** The tier whose vocabulary the figure comes from. */
  readonly tier: Tier;
  readonly figure: CompFigure;
  /** The figure's strokes, as `strokesOf` reads them. */
  readonly strokes: readonly FigureStroke[];
  /** The bar's harmony, a stretch per chord. */
  readonly own: readonly Stretch[];
  /** A push from the bar before has already landed on this bar's first chord. */
  readonly pushedInto: boolean;
  /** The change at the barline after this bar; null when the next bar opens on the same chord. */
  readonly ahead: Change | null;
}

/**
 * How long a chord pushed onto a stretch rings once it has landed: as long as
 * the figure's own strike there, which it replaces (a stab stays a stab, a
 * held chord stays held), or an eighth where the figure has none (CH-36,
 * CH-40). A groove strikes the chord again on the beat, so nothing is carried,
 * unless it ties: then the chord rings an eighth into its own time (CH-36).
 */
export function landing(
  book: RhythmBook,
  figure: CompFigure,
  strokes: readonly FigureStroke[],
  stretch: Stretch,
): number {
  const room = Math.round((stretch.end - stretch.start) * book.hold);
  if (figure.groove) return figure.ties ? Math.min(EIGHTH, room) : 0;
  const from = stretch.start - stretch.bar.start;
  const replaced = strokes.filter((stroke) => stroke.at >= from && stroke.at < from + EIGHTH);
  const length =
    replaced.length > 0 ? Math.max(...replaced.map((stroke) => stroke.length)) : EIGHTH;
  return Math.min(length, room);
}

/** The strikes of one bar, in no particular order. */
export function barStrikes(chords: ChordStyle, book: RhythmBook, setting: BarSetting): Strike[] {
  const { bar, tier, figure, own, ahead } = setting;
  const vocabulary = book.tiers[tier];
  const kind = figure.voicing ?? chords.voicing[tier];
  const strokes = setting.strokes.map((stroke) => ({ ...stroke, at: bar.start + stroke.at }));

  const strikes: Strike[] = [];
  const strike = (
    tick: number,
    duration: number,
    velocity: number,
    arrival: Arrival,
    how: Pick<Strike, "muted" | "down"> = {},
  ) =>
    strikes.push({
      bar: bar.index,
      tick,
      duration: Math.max(1, duration),
      velocity,
      arrival,
      kind,
      ...how,
    });
  /** A chord rings no longer than it is written, and breathes before what follows it. */
  const ring = (stroke: FigureStroke, stretch: Stretch) =>
    Math.min(stroke.length, Math.round((stretch.end - stroke.at) * book.hold));
  /** A stroke of the figure as written, on the chord the hand is holding. */
  const play = (stroke: FigureStroke, stretch: Stretch) =>
    strike(
      stroke.at,
      ring(stroke, stretch),
      stroke.level,
      stretch.arrival,
      stroke.muted ? { muted: true } : {},
    );
  // A pushed chord that rings over the change is left alone until it has rung.
  const tied = !figure.groove || figure.ties === true;

  // Whether a push has already landed on the chord in hand.
  let landed = setting.pushedInto;
  own.forEach((stretch, i) => {
    if (stretch.chord === null) {
      landed = false;
      return;
    }
    const next = own[i + 1];
    // A chord written for an eighth or less is its own arrival. The eighth before the next
    // change is all it has, so the hand plays it there and does not lean past it: leaning
    // would strike two chords at once, and a chord is always struck (CH-34).
    const room = stretch.end - stretch.start > EIGHTH;
    const change: Change | null = !room
      ? null
      : !next
        ? ahead
        : next.chord === null
          ? null
          : {
              arrival: next.arrival,
              push: chords.anticipation.midBar === "tie",
              carry: landing(book, figure, setting.strokes, next),
            };

    // The figure's strokes over this chord: those in the eighth before a change are the
    // change's business; the rest are played as written.
    const from = landed && tied ? stretch.start + EIGHTH : stretch.start;
    const mine = strokes.filter((stroke) => stroke.at >= from && stroke.at < stretch.end);
    const early = change ? mine.filter((stroke) => stroke.at >= stretch.end - EIGHTH) : [];
    let body = mine.filter((stroke) => !early.includes(stroke));
    const asWritten =
      figure.groove || (change && !change.push && chords.anticipation.otherwise === "stay");
    // A chord is never played early as a scratch (CH-36).
    const sounded = early.filter((stroke) => !stroke.muted);
    const pushing = !asWritten && change?.push === true && (sounded.length > 0 || !next);
    const pushAt = sounded.at(-1)?.at ?? stretch.end - EIGHTH;
    if (pushing) {
      // The last beat before the change is the new chord's alone: the old chord stabbed on
      // the beat and the new one on its "and" is "a quick C7 right before the F7" (KF-B-27).
      // The old chord's strike there gives way, and if it was the only one the chord had,
      // the chord is laid in where it arrives instead (CH-34). A chord that arrives inside
      // that beat keeps its strike: it has nowhere else to sound.
      if (landed || stretch.start < pushAt - EIGHTH) {
        body = body.filter((stroke) => stroke.at < pushAt - EIGHTH);
      }
    }
    for (const stroke of body) play(stroke, stretch);
    // A pushed chord has been struck already, and is not struck again on the beat (CH-40).
    // A scratch is not a strike of the chord (CH-34).
    let struck = landed || body.some((stroke) => !stroke.muted);
    landed = false;

    if (change && asWritten) {
      // The figure is played as written: the new chord early where the hand leans in (a
      // groove strikes it again on the beat, or ties it over), the old chord where it does
      // not. A scratch before the push deadens the old chord, which the hand still holds.
      let pushed = false;
      for (const stroke of early) {
        if (!change.push || (stroke.muted && !pushed)) play(stroke, stretch);
        else if (pushed && tied) continue;
        else if (stroke.muted)
          strike(stroke.at, stroke.length, stroke.level, change.arrival, { muted: true });
        else {
          strike(stroke.at, stretch.end - stroke.at + change.carry, stroke.level, change.arrival);
          pushed = true;
        }
      }
      struck ||= sounded.length > 0 && !change.push;
      landed = pushed && tied;
    } else if (change && pushing) {
      // The push: the figure's own strike there, or at a barline one put there for it,
      // since a figure that happens to pass the last eighth by would never lean in (KF-B-36).
      const written = sounded.at(-1);
      const leaned = vocabulary.articulation[chords.anticipation.stroke] ?? vocabulary.arrival;
      strike(
        pushAt,
        stretch.end - pushAt + change.carry,
        written?.level ?? leaned.level,
        change.arrival,
      );
      landed = true;
    }

    // A figure may skip beats, never a chord (CH-34). The chord is laid in where it
    // arrives, the hand coming down for it, and a scratch sitting there gives way to it.
    if (!struck) {
      const { level, steps } = vocabulary.arrival;
      const stroke = { at: stretch.start, level, length: steps * STEP };
      const sitting = strikes.findIndex((other) => other.muted && other.tick === stroke.at);
      if (sitting >= 0) strikes.splice(sitting, 1);
      strike(stroke.at, ring(stroke, stretch), level, stretch.arrival, { down: true });
    }
  });
  return strikes;
}
