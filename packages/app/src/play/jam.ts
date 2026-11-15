// A jam: what the player asked for, the take the engine makes of it, the
// sounds that take becomes, and where in it the band is at a moment.

import type { Mix, Sound } from "@ensemble/audio";
import type {
  Chart,
  Key,
  Plan,
  PlanBar,
  Seat,
  StylePack,
  Take,
  TakeOptions,
} from "@ensemble/engine";
import { chordText, PPQ, parse, planBar, render, timedNotes, transpose } from "@ensemble/engine";
import type { Chair } from "./rig.ts";
import { chairName } from "./rig.ts";

export interface JamSetup {
  readonly text: string;
  readonly style: StylePack;
  /** A loose length in minutes, or null to go round until stopped. */
  readonly minutes: number | null;
  /** Null for the chart's tempo, or the style's when the chart names none. */
  readonly tempo: number | null;
  /** Null for the key the chart is written in. */
  readonly key: Key | null;
  /** Who plays. */
  readonly band: Readonly<Record<Seat, boolean>>;
  readonly soloInstrument: string;
  readonly seed: number;
}

export const SEAT_ORDER: readonly Seat[] = ["drums", "bass", "chords", "solo"];

/** How many times round a jam with no set length is made at first, and how many more each time it runs short. */
export const OPEN_PASSES = 2;

export function takeOptions(setup: JamSetup, passes = OPEN_PASSES): TakeOptions {
  return {
    mode: "jam",
    seed: setup.seed,
    ...(setup.minutes === null ? { open: true, passes } : { minutes: setup.minutes }),
    ...(setup.tempo === null ? {} : { tempo: setup.tempo }),
    ...(setup.key === null ? {} : { key: setup.key }),
    solo: setup.band.solo,
    soloInstrument: setup.soloInstrument,
    without: SEAT_ORDER.filter((seat) => seat !== "solo" && !setup.band[seat]),
  };
}

/** The take of a jam. With `endAfter`, the same jam told to finish on that pass. */
export function takeOf(setup: JamSetup, passes?: number, endAfter?: number): Take {
  return render(setup.text, setup.style, {
    ...takeOptions(setup, passes),
    ...(endAfter === undefined ? {} : { endAfter }),
  });
}

/** The chart as it will be read while playing: in the key the jam is in. */
export function chartOf(setup: Pick<JamSetup, "text" | "key">): Chart {
  const { chart } = parse(setup.text);
  return setup.key === null ? chart : transpose(chart, setup.key);
}

/** The instruments this jam needs. */
export function chairsOf(setup: JamSetup): Chair[] {
  return SEAT_ORDER.filter((seat) => setup.band[seat]).map((seat) => ({
    pack: seat === "solo" ? setup.soloInstrument : setup.style.sound.packs[seat],
    channel: seat,
  }));
}

export function mixOf(style: StylePack): Mix {
  const { seats, room, master } = style.sound.mix;
  return { channels: seats, room, master };
}

/** A take as sounds for the sampler, in the order they start. */
export function soundsOf(take: Take, setup: JamSetup): Sound[] {
  const names = new Map(chairsOf(setup).map((chair) => [chair.channel, chairName(chair)]));
  const sounds: Sound[] = [];
  for (const note of timedNotes(take.plan, take.events)) {
    const pack = names.get(note.seat);
    if (pack === undefined) continue;
    sounds.push({
      at: note.at,
      length: note.length,
      pack,
      // A drum's voice is its piece and a bass's its articulation; a soloist's only names its instrument.
      voice: note.seat === "solo" ? "" : (note.voice ?? ""),
      pitch: note.pitch,
      velocity: note.velocity,
    });
  }
  return sounds;
}

/** Where the band is. */
export interface Place {
  readonly bar: PlanBar;
  /** Which of the bar's chord spans is sounding. */
  readonly span: number;
  /** The beat of the bar, from 0. */
  readonly beat: number;
}

export const ticksAt = (plan: Plan, seconds: number): number => (seconds * plan.tempo * PPQ) / 60;

/** The bar and beat sounding at a second of the performance. Undefined before it starts and after it ends. */
export function placeAt(plan: Plan, seconds: number): Place | undefined {
  const tick = ticksAt(plan, seconds);
  if (tick < 0 || tick >= plan.ticks) return undefined;
  let low = 0;
  let high = plan.bars.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (plan.bars[middle]!.start <= tick) low = middle;
    else high = middle - 1;
  }
  const bar = plan.bars[low]!;
  const into = tick - bar.start;
  const span = Math.max(
    0,
    bar.spans.findLastIndex((s) => s.start <= into),
  );
  const beatTicks = (PPQ * 4) / bar.meter.unit;
  return { bar, span, beat: Math.floor(into / beatTicks) };
}

/** The next change of chord after a place: its bar, and where in that bar it falls (0 to 1). */
export function nextChange(
  plan: Plan,
  place: Place,
): { readonly bar: PlanBar; readonly at: number } | undefined {
  const name = (bar: PlanBar, span: number) => {
    const chord = bar.spans[span]?.chord;
    return chord ? chordText(chord, "name") : "";
  };
  let sounding = name(place.bar, place.span);
  let span = place.span + 1;
  // Far enough to cross a long held chord; a vamp on one chord has no next change at all.
  for (let index = place.bar.index; index < place.bar.index + 16; index++) {
    const bar = planBar(plan, index);
    if (!bar || bar.kind === "tail") return undefined;
    for (; span < bar.spans.length; span++) {
      if (bar.spans[span]!.tied) continue;
      if (name(bar, span) !== sounding) return { bar, at: bar.spans[span]!.start / bar.ticks };
      sounding = name(bar, span);
    }
    span = 0;
  }
  return undefined;
}

/**
 * Where a jam told to finish now turns for home: the pass that becomes its
 * last, and the second from which the music is the ending's. A band is told at
 * the top of a phrase. If this pass still has one coming that is far enough
 * off (`after`, in seconds), it turns there and this pass is the last;
 * otherwise the next pass is. Undefined when the jam is already ending.
 */
export function turnForHome(
  plan: Plan,
  place: Place,
  after: number,
): { readonly endAfter: number; readonly from: number } | undefined {
  const { bar } = place;
  if (bar.kind === "tail" || bar.lastPass || bar.ending) return undefined;
  const pass = bar.kind === "count-in" ? 0 : bar.pass;
  const earliest = ticksAt(plan, after);
  const phrase = plan.bars.find(
    (b) =>
      b.kind === "music" &&
      b.pass === pass &&
      b.section.role === "body" &&
      // Not the pass's first phrase: that one is played as it was going to be anyway.
      b.phrase.bar === 0 &&
      b.barInPass > 0 &&
      b.start >= earliest,
  );
  if (phrase) return { endAfter: pass, from: (phrase.start * 60) / (plan.tempo * PPQ) };
  return { endAfter: pass + 1, from: after };
}
