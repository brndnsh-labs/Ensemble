// ensemble read <chart> [take flags] [--bars 13-24] [--seats solo,bass] [--timing]:
// the take as a transcription a musician can read (`transcription.ts`).

import { basename } from "node:path";
import { parseArgs } from "node:util";
import { render } from "@ensemble/engine";
import type { Command } from "../command.ts";
import { readChart, reportDiagnostics, UsageError } from "../command.ts";
import { seatList, TAKE_FLAGS, TAKE_USAGE, takeOf } from "../take-output.ts";
import { transcription } from "../transcription.ts";

function barRange(value: string | undefined): [number, number] | undefined {
  if (value === undefined) return undefined;
  const match = /^(\d+)(?:-(\d+))?$/.exec(value.trim());
  const first = Number(match?.[1]);
  const last = Number(match?.[2] ?? match?.[1]);
  if (!match || first < 0 || last < first)
    throw new UsageError(`--bars is a bar or a range of bars (13, or 13-24), not "${value}"`);
  return [first, last];
}

export const readCommand: Command = {
  summary:
    "print the take as a transcription: each bar, each seat, the notes a musician would write",
  usage: `<chart> ${TAKE_USAGE} [--bars 13-24] [--seats solo,bass] [--timing]`,
  run(args) {
    const { positionals, values } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        ...TAKE_FLAGS,
        bars: { type: "string", short: "b" },
        seats: { type: "string" },
        timing: { type: "boolean", default: false },
      },
    });
    const path = positionals[0];
    const text = readChart(path);
    const { options, style } = takeOf(values, text);
    const bars = barRange(values.bars);
    const seats = seatList("seats", values.seats);
    const chartName = path ? basename(path) : "";
    const take = render(text, style, options);
    reportDiagnostics(chartName, take.diagnostics);
    const music = take.plan.bars.filter((bar) => bar.kind === "music").length;
    if (bars && bars[0] > music)
      throw new UsageError(`--bars ${values.bars}: the take has ${music} bars of music`);
    process.stdout.write(
      transcription(take, style, {
        chartName,
        options,
        ...(bars ? { bars } : {}),
        ...(seats.length > 0 ? { seats } : {}),
        timing: values.timing,
      }),
    );
    return 0;
  },
};
