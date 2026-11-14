// A take: one performance, fully determined by chart text, style, options,
// and a seed. This is the engine's front door.

import { expand } from "./chart/expand.ts";
import type { Chart } from "./chart/model.ts";
import { parse } from "./chart/parse.ts";
import { transpose } from "./chart/transpose.ts";
import type { Diagnostic } from "./chart/types.ts";
import type { PerformanceEvent } from "./perform/notes.ts";
import { perform } from "./perform/perform.ts";
import { planBars } from "./plan/plan.ts";
import type { Plan, PlanOptions } from "./plan/types.ts";
import type { StylePack } from "./style/types.ts";
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
}

export interface Take {
  readonly chart: Chart;
  /** Problems found in the text. A chart with errors still plays. */
  readonly diagnostics: readonly Diagnostic[];
  readonly plan: Plan;
  readonly events: readonly PerformanceEvent[];
}

/** The roadmap of a performance, without playing it. */
export function plan(chart: Chart, style: StylePack, options: PlanOptions): Plan {
  return planBars(expand(chart), chart.tempo, style, options);
}

export function render(text: string, style: StylePack, options: TakeOptions): Take {
  const parsed = parse(text);
  const chart = options.key ? transpose(parsed.chart, options.key) : parsed.chart;
  const roadmap = plan(chart, style, options);
  const played =
    options.soloInstrument === undefined
      ? style
      : { ...style, solo: { ...style.solo, instrument: options.soloInstrument } };
  return {
    chart,
    diagnostics: parsed.diagnostics,
    plan: roadmap,
    events: perform(roadmap, played, options.seed),
  };
}
