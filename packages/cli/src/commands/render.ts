// ensemble render <chart> --style S --seed N [--minutes M | --passes P] --out take.mid [--save take.json]

import { basename } from "node:path";
import { parseArgs } from "node:util";
import { RECIPE_VERSION } from "@ensemble/engine";
import type { Command } from "../command.ts";
import { readChart, UsageError } from "../command.ts";
import { playTake, TAKE_FLAGS, TAKE_USAGE, takeOf, writeRecipe } from "../take-output.ts";

export const renderCommand: Command = {
  summary: "play the chart and write the performance as a MIDI file",
  usage: `<chart> [--out take.mid] [--save take.json] ${TAKE_USAGE}`,
  run(args) {
    const { positionals, values } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        out: { type: "string", short: "o" },
        save: { type: "string" },
        ...TAKE_FLAGS,
      },
    });
    const path = positionals[0];
    const text = readChart(path);
    if (values.out === undefined && values.save === undefined)
      throw new UsageError("where to? Give --out take.mid, --save take.json, or both");
    const { options, style } = takeOf(values, text);

    const chartName = path ? basename(path) : "";
    if (values.save !== undefined) {
      writeRecipe(values.save, {
        version: RECIPE_VERSION,
        chartName,
        chartText: text,
        style: style.id,
        options,
      });
      console.log(`${values.save}: recipe saved`);
    }
    playTake(chartName, text, style, options, values.out);
    return 0;
  },
};
