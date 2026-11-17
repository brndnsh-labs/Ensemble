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
  TakeRecipe,
} from "@ensemble/engine";
import {
  chordText,
  PPQ,
  parse,
  planBar,
  pulseStarts,
  RECIPE_VERSION,
  render,
  seatChoice,
  secondsAt,
  tempoRange,
  timedNotes,
  transpose,
} from "@ensemble/engine";
import { styleById } from "@ensemble/styles";
import type { Chair } from "./rig.ts";
import { chairName } from "./rig.ts";

/** What the player chose on the play screen. */
export interface JamSetup {
  readonly text: string;
  readonly style: StylePack;
  /** The chart once through, as written and arranged: `minutes` is then not asked. */
  readonly song: boolean;
  /** A loose length in minutes, or null to go round until stopped. */
  readonly minutes: number | null;
  /** Null for the chart's tempo, or the style's when the chart names none. */
  readonly tempo: number | null;
  /** Null for the key the chart is written in. */
  readonly key: Key | null;
  /** Who plays. */
  readonly band: Readonly<Record<Seat, boolean>>;
  readonly soloInstrument: string;
  /** The instrument a seat is played on, where the player chose one of the style's others. */
  readonly instruments: HowPlayed["instruments"];
}

/** How a take is played, with or without the seed that makes it one take. */
export type HowPlayed = Omit<TakeOptions, "seed"> & { readonly seed?: TakeOptions["seed"] };

/** The tune as called: what a press of play starts. */
export interface Call {
  /** The chart's name, for a take that is kept. */
  readonly name: string;
  readonly text: string;
  readonly style: StylePack;
  /** Without a seed, each press of play is a new take. With one, it is that take again. */
  readonly options: HowPlayed;
}

export const SEAT_ORDER: readonly Seat[] = ["drums", "bass", "chords", "solo"];

/** How many times round a jam with no set length is made at first, and how many more each time it runs short. */
export const OPEN_PASSES = 2;

export function takeOptions(setup: JamSetup): HowPlayed {
  // A song has its own length: the chart once through.
  const length: Pick<HowPlayed, "mode" | "open" | "passes" | "minutes"> = setup.song
    ? { mode: "song" }
    : setup.minutes === null
      ? { mode: "jam", open: true, passes: OPEN_PASSES }
      : { mode: "jam", minutes: setup.minutes };
  return {
    ...length,
    ...(setup.tempo === null ? {} : { tempo: setup.tempo }),
    ...(setup.key === null ? {} : { key: setup.key }),
    solo: setup.band.solo,
    soloInstrument: setup.soloInstrument,
    ...(setup.instruments && Object.keys(setup.instruments).length > 0
      ? { instruments: setup.instruments }
      : {}),
    without: SEAT_ORDER.filter((seat) => seat !== "solo" && !setup.band[seat]),
  };
}

/**
 * The tempo a chart is played at in a style, or null for the engine's own
 * choice (the chart's written tempo, or the style's where it names none).
 * Each style has its usual tempo and its limits. A tempo the player set is
 * kept, held to the style's limits. Without one, a chart played in a style it
 * was not written for goes at that style's usual tempo, since a rhythm
 * changes at 176 is no reggae; in its own style, or naming none this version
 * has, as written.
 */
export function tempoFor(
  chart: Chart,
  style: StylePack,
  chosen: number | undefined,
): number | null {
  const { min, max, default: usual } = tempoRange(style, chart.meter);
  if (chosen !== undefined) return Math.min(max, Math.max(min, chosen));
  // A style this version does not have is no style: the chart is played as written.
  const written = styleById(chart.styleId ?? "");
  if (!written || written.id === style.id) return null;
  return usual;
}

/** The take a call becomes when play is pressed: everything that decides what is heard. */
export function recipeOf(call: Call, seed: TakeOptions["seed"]): TakeRecipe {
  return {
    version: RECIPE_VERSION,
    chartName: call.name,
    chartText: call.text,
    style: call.style.id,
    options: { ...call.options, seed },
  };
}

/** A take as the play screen needs it: the chart in the jam's key, the roadmap, and the sounds. */
export interface Performance {
  readonly chart: Chart;
  readonly plan: Plan;
  /** In the order they start. Only those from `since` on, when one was asked for. */
  readonly sounds: readonly Sound[];
}

/**
 * Play a take through: the engine makes it, and its notes become sounds.
 * `since` leaves out the sounds that start before that second, which have been played.
 */
export function performanceOf(recipe: TakeRecipe, style: StylePack, since = 0): Performance {
  const take = render(recipe.chartText, style, recipe.options);
  const sounds = soundsOf(take, style, recipe.options);
  return {
    chart: take.chart,
    plan: take.plan,
    sounds: since > 0 ? sounds.filter((sound) => sound.at >= since) : sounds,
  };
}

/** The chart as it will be read while playing: in the key the jam is in. */
export function chartOf(text: string, key: Key | null | undefined): Chart {
  const { chart } = parse(text);
  return key ? transpose(chart, key) : chart;
}

/** Who is in a take: a seat left out has no part in it, and the others play differently for that. */
export function seatsOf(options: HowPlayed): Seat[] {
  const out = options.without ?? [];
  return SEAT_ORDER.filter((seat) =>
    seat === "solo" ? options.solo === true : !out.includes(seat),
  );
}

/** The instruments a take needs. Each sounds in the mixer channel named for its seat. */
export function chairsOf(style: StylePack, options: HowPlayed): Chair[] {
  return seatsOf(options).map((seat) => ({
    pack:
      seat === "solo"
        ? (options.soloInstrument ?? style.solo.instrument)
        : seatChoice(style, seat, options.instruments).pack,
    channel: seat,
  }));
}

/** The style's mix, with each seat levelled for the instrument that plays it in this take. */
export function mixOf(style: StylePack, options: HowPlayed): Mix {
  const { seats, room, master } = style.sound.mix;
  const levelled = (seat: Exclude<Seat, "solo">) => ({
    ...seats[seat],
    level: seats[seat].level + (seatChoice(style, seat, options.instruments).level ?? 0),
  });
  return {
    channels: {
      ...seats,
      drums: levelled("drums"),
      bass: levelled("bass"),
      chords: levelled("chords"),
    },
    room,
    master,
  };
}

/** A take as sounds for the sampler, in the order they start. */
export function soundsOf(take: Take, style: StylePack, options: HowPlayed): Sound[] {
  const names = new Map(chairsOf(style, options).map((chair) => [chair.channel, chairName(chair)]));
  const sounds: Sound[] = [];
  for (const note of timedNotes(take.plan, take.events)) {
    const pack = names.get(note.seat);
    if (pack === undefined) continue;
    const touch = note.seat === "solo" ? undefined : style.sound.touch?.[note.seat];
    sounds.push({
      at: note.at,
      length: note.length,
      pack,
      // A drum's voice is its piece and a bass's its articulation; a soloist's only names its instrument.
      voice: note.seat === "solo" ? "" : (note.voice ?? ""),
      pitch: note.pitch,
      velocity: note.velocity,
      // A seat touched more gently than it is heard plays its softer recordings.
      ...(touch ? { touch: Math.max(1, Math.min(127, note.velocity + touch)) } : {}),
      ...(note.bend === undefined ? {} : { bend: note.bend }),
    });
  }
  return sounds;
}

/** Where the band is. */
export interface Place {
  readonly bar: PlanBar;
  /** Which of the bar's chord spans is sounding. */
  readonly span: number;
  /** The beat of the bar, from 0: its pulse, as the tempo counts them. */
  readonly beat: number;
}

export const ticksAt = (plan: Plan, seconds: number): number =>
  (seconds * plan.quarters * PPQ) / 60;

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
  // The beat is the pulse the band counts, not the meter's written unit: four to a bar of 12/8.
  const beat = pulseStarts(bar.meter).findLastIndex((start) => start <= into);
  return { bar, span, beat: Math.max(0, beat) };
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

/** The sections of a song as it plays them: the first bar of each, in order. */
export const sectionStarts = (plan: Plan): PlanBar[] =>
  plan.bars.filter((bar) => bar.kind === "music" && bar.barInSection === 0);

/**
 * On the way home: the last pass of a jam, the last section of a song, or the
 * last chord ringing after either. The final bar there is the ending the band
 * plays, not what is written in it.
 */
export function homeStretch(plan: Plan, bar: PlanBar): boolean {
  if (bar.kind === "tail" || bar.lastPass) return true;
  if (plan.mode !== "song" || bar.kind !== "music") return false;
  const final = plan.bars.findLast((b) => b.kind === "music");
  return final !== undefined && bar.section.occurrence === final.section.occurrence;
}

/** A phrase top counts as far enough ahead only with this to spare, so its downbeat is the ending's too. */
const TOP_MARGIN = 0.05;

/**
 * Where a jam told to finish now turns for home: the pass that becomes its
 * last, and the tick the band is told at. A band is told at the top of a
 * phrase, so that is where the take becomes the ending's: the first phrase top
 * at least `after` seconds in that is not the top of the pass being played
 * (the last pass's first phrase is played as it was going to be, so a later
 * one of this pass is where it can turn; failing that, the top of the next
 * pass). Undefined when the jam is already ending.
 */
export function turnForHome(
  plan: Plan,
  place: Place,
  after: number,
): { readonly endAfter: number; readonly toldAt: number; readonly from: number } | undefined {
  const { bar } = place;
  if (bar.kind === "tail" || bar.lastPass || bar.ending) return undefined;
  const pass = bar.kind === "count-in" ? 0 : bar.pass;
  const earliest = ticksAt(plan, after + TOP_MARGIN);
  // An open jam's roadmap carries the pass after the last one played, which is enough to find a top in.
  const top = [...plan.bars, ...plan.lookahead].find(
    (b) =>
      b.kind === "music" &&
      b.section.role === "body" &&
      b.phrase.bar === 0 &&
      b.start >= earliest &&
      (b.pass > pass || (b.pass === pass && b.barInPass > 0)),
  );
  if (!top) return undefined;
  return {
    endAfter: top.pass,
    toldAt: top.start,
    from: secondsAt(plan, top.start) - TOP_MARGIN,
  };
}
