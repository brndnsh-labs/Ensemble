// ensemble fmt <chart> [--write]: the chart in canonical form.

import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parse, print } from "@ensemble/engine";
import type { Command } from "../command.ts";
import { hasErrors, readChart, reportDiagnostics } from "../command.ts";

export const fmtCommand: Command = {
  summary: "print the chart in canonical form",
  usage: "<chart> [--write]",
  run(args) {
    const { positionals, values } = parseArgs({
      args,
      allowPositionals: true,
      options: { write: { type: "boolean", short: "w", default: false } },
    });
    const path = positionals[0];
    const text = readChart(path);
    const { chart, diagnostics } = parse(text);
    const formatted = print(chart);
    // Only errors are shown: fmt is for layout, and `parse` gives the full list.
    const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
    reportDiagnostics(path ?? "", errors);
    if (!values.write) process.stdout.write(formatted);
    else if (formatted !== text && path !== undefined) writeFileSync(path, formatted);
    return hasErrors(diagnostics) ? 1 : 0;
  },
};
