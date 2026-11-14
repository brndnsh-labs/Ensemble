// ensemble parse <chart>: diagnostics, then the parsed model as JSON.

import { parseArgs } from "node:util";
import { parse } from "@ensemble/engine";
import type { Command } from "../command.ts";
import { hasErrors, readChart, reportDiagnostics } from "../command.ts";

export const parseCommand: Command = {
  summary: "diagnostics, and the parsed chart as JSON",
  usage: "<chart>",
  run(args) {
    const { positionals } = parseArgs({ args, allowPositionals: true });
    const path = positionals[0];
    const { chart, diagnostics } = parse(readChart(path));
    // Diagnostics go to stderr so that stdout is the JSON alone and can be piped.
    reportDiagnostics(path ?? "", diagnostics);
    console.log(JSON.stringify(chart, null, 2));
    return hasErrors(diagnostics) ? 1 : 0;
  },
};
