// ensemble replay <take.json> --out take.mid

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { TakeOptions, TakeRecipe } from "@ensemble/engine";
import { RECIPE_VERSION } from "@ensemble/engine";
import type { Command } from "../command.ts";
import { UsageError } from "../command.ts";
import { findStyle, playTake } from "../take-output.ts";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function readRecipe(path: string): TakeRecipe {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new UsageError(`cannot read ${path}: ${error instanceof Error ? error.message : error}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new UsageError(`${path} is not a saved take (not JSON); make one with render --save`);
  }
  if (!isObject(json)) throw new UsageError(`${path} is not a saved take (expected a JSON object)`);
  if (json.version !== RECIPE_VERSION) {
    throw new UsageError(
      `${path} is take format version ${String(json.version)}; this replay reads version ${RECIPE_VERSION}`,
    );
  }
  const { chartName, chartText, style, options } = json;
  if (typeof chartName !== "string") throw new UsageError(`${path}: missing "chartName"`);
  if (typeof chartText !== "string") throw new UsageError(`${path}: missing "chartText"`);
  if (typeof style !== "string") throw new UsageError(`${path}: missing "style"`);
  if (!isObject(options)) throw new UsageError(`${path}: missing "options"`);
  if (typeof options.mode !== "string") throw new UsageError(`${path}: options has no "mode"`);
  if (options.seed === undefined) throw new UsageError(`${path}: options has no "seed"`);
  return {
    version: RECIPE_VERSION,
    chartName,
    chartText,
    style,
    options: options as unknown as TakeOptions,
  };
}

export const replayCommand: Command = {
  summary: "play a saved take again, exactly, and write it as a MIDI file",
  usage: "<take.json> --out take.mid",
  run(args) {
    const { positionals, values } = parseArgs({
      args,
      allowPositionals: true,
      options: { out: { type: "string", short: "o" } },
    });
    const path = positionals[0];
    if (path === undefined)
      throw new UsageError("which take? Give a .json saved by render --save.");
    if (values.out === undefined) throw new UsageError("where to? Give --out take.mid");
    const recipe = readRecipe(path);
    const style = findStyle(recipe.style);
    playTake(recipe.chartName, recipe.chartText, style, recipe.options, values.out);
    return 0;
  },
};
