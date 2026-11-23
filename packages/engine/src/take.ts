// A take: one performance, fully determined by chart text, style, options,
// and a seed. This is the engine's front door.

import { expand } from "./chart/expand.ts";
import type { Chart } from "./chart/model.ts";
import { parse } from "./chart/parse.ts";
import { fits, remeter, sameMeter } from "./chart/remeter.ts";
import { transpose } from "./chart/transpose.ts";
import type { Diagnostic } from "./chart/types.ts";
import { PPQ } from "./chart/types.ts";
import type { PerformanceEvent } from "./perform/notes.ts";
import { performed } from "./perform/perform.ts";
import { quartersAt } from "./perform/time.ts";
import { planBars } from "./plan/plan.ts";
import type { Plan, PlanBar, PlanOptions } from "./plan/types.ts";
import type { MovedIdea } from "./players/solo/play.ts";
import { tempoRange } from "./style/meters.ts";
import type { Seat, StylePack } from "./style/types.ts";
import type { Key } from "./theory/pitch.ts";

export interface TakeOptions extends PlanOptions {
  /** The same chart, style, options, and seed always give the same events. */
  readonly seed: number | string;
  /** Play the chart in another key. */
  readonly key?: Key;
  /**
   * The soloist's instrument, by its name in the instrument list, in place of
   * the style's default. The instrument is the player's choice (BRIEF 5.3).
   */
  readonly soloInstrument?: string;
  /**
   * The instrument a seat is heard on, by its pack, where the style offers
   * more than one (`SoundStyle.choices`) and the player chose. The notes are
   * the same on any of them: nothing the engine plays reads this. It is here
   * because it is part of what a take is when it is kept and played again.
   */
  readonly instruments?: Readonly<Partial<Record<Exclude<Seat, "solo">, string>>>;
  /**
   * With `endAfter`: the tick at which the band was told, the top of a phrase.
   * Up to there the take is the jam as it was going to be, and from there it is
   * the jam told to finish, which is what was heard when the word came partway
   * through. Left out, the band knew from the start.
   */
  readonly toldAt?: number;
}

export const RECIPE_VERSION = 1;

/** Everything that decides a take, as it is saved. Options go in whole, so new ones round-trip untouched. */
export interface TakeRecipe {
  readonly version: number;
  readonly chartName: string;
  readonly chartText: string;
  /** The style, by its id. */
  readonly style: string;
  readonly options: TakeOptions;
}

/**
 * A recipe as a file: pretty JSON, keys sorted at every level, a trailing
 * newline. The app and the CLI write the same text for the same take, so a
 * file from either reads the same in a diff.
 */
export function recipeText(recipe: TakeRecipe): string {
  const sorted = (_key: string, value: unknown): unknown =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : value;
  return `${JSON.stringify(recipe, sorted, 2)}\n`;
}

export interface Take {
  readonly chart: Chart;
  /** Problems found in the text. A chart with errors still plays. */
  readonly diagnostics: readonly Diagnostic[];
  readonly plan: Plan;
  readonly events: readonly PerformanceEvent[];
  /**
   * The phrases where the soloist drew an idea to say a beat away, and what became of each
   * (`solo.moved-played`): what the take's notes cannot show. Not kept with a take: a take
   * made again from its recipe makes it again.
   */
  readonly moved: readonly MovedIdea[];
}

/**
 * The chart as a take plays it: in the meter the options ask for, if any (`PlanOptions.meter`),
 * read as `remeter` reads it, its written tempo held inside the style's range in that meter.
 * In its own meter, the chart itself. A meter the chart does not fit is refused with the reason
 * `fits` gives.
 */
export function chartIn(chart: Chart, style: StylePack, options: PlanOptions): Chart {
  const meter = options.meter;
  if (meter === undefined || sameMeter(meter, chart.meter)) return chart;
  const fit = fits(chart, meter);
  if (!fit.ok) throw new Error(fit.reason);
  const read = remeter(chart, meter);
  if (read.tempo === null) return read;
  const { min, max } = tempoRange(style, meter);
  return { ...read, tempo: Math.min(max, Math.max(min, read.tempo)) };
}

/** The roadmap of a performance, without playing it. Give it the chart as written: `options.meter` is read here. */
export function plan(chart: Chart, style: StylePack, options: PlanOptions): Plan {
  const played = chartIn(chart, style, options);
  // A chart with an arrangement of its own is played as its writer arranged it: the band lays
  // nobody out of a jam on it by itself either.
  const arranged = played.arrangement?.lines != null;
  return planBars(expand(played), played.tempo, played.meter, style, options, arranged);
}

/**
 * The two takes are joined this many seconds before the bar line the band was
 * told at, so a downbeat leaning a hair early comes from the ending's take.
 */
const JOIN_LEAD = 0.03;

export function render(text: string, style: StylePack, options: TakeOptions): Take {
  if (options.endAfter === undefined || options.toldAt === undefined)
    return whole(text, style, options);
  // Told partway: the jam as it was going to be, then the jam told to finish.
  const { endAfter, toldAt, ...before } = options;
  const untold = whole(text, style, {
    ...before,
    // An open jam is made long enough to reach the point it was told at.
    ...(before.open ? { passes: Math.max(before.passes ?? 1, Math.floor(endAfter) + 1) } : {}),
  });
  const told = whole(text, style, options);
  const join = toldAt - (JOIN_LEAD * quartersAt(told.plan, toldAt) * PPQ) / 60;
  const time = (event: PerformanceEvent) =>
    event.kind === "note" ? event.tick + event.offset : event.tick;
  // Up to where it was told the take is the jam as it was going to be: who was in is that
  // jam's, so the plan says of every bar what its notes are. From there everyone is in.
  const asWas = (bar: PlanBar) => untold.plan.bars[bar.index] ?? bar;
  return {
    ...told,
    plan: {
      ...told.plan,
      bars: told.plan.bars.map((bar) => {
        if (bar.start >= toldAt) return bar;
        // Nor does a seat come in on a bar from before the word (`PlanBar.enters`): told later
        // in the pass, the seat was still out there.
        const { enters: _told, ...rest } = bar;
        return { ...rest, seats: asWas(bar).seats };
      }),
    },
    events: [
      ...untold.events.filter((event) => time(event) < join),
      ...told.events.filter((event) => time(event) >= join),
    ],
    // Each phrase as the take plays it: from the jam as it was going to be up to the join.
    moved: [
      ...untold.moved.filter((idea) => idea.tick < join),
      ...told.moved.filter((idea) => idea.tick >= join),
    ],
  };
}

function whole(text: string, style: StylePack, options: TakeOptions): Take {
  const parsed = parse(text);
  const written = options.key ? transpose(parsed.chart, options.key) : parsed.chart;
  // The chart as played, in the meter asked for: what the take says it played.
  const chart = chartIn(written, style, options);
  const roadmap = plan(chart, style, options);
  const played =
    options.soloInstrument === undefined
      ? style
      : { ...style, solo: { ...style.solo, instrument: options.soloInstrument } };
  const { events, moved } = performed(roadmap, played, options.seed);
  return { chart, diagnostics: parsed.diagnostics, plan: roadmap, events, moved };
}
