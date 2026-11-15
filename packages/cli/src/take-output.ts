// What `render` and `replay` share: finding a style, playing a take, and the recipe file.

import { writeFileSync } from "node:fs";
import type { StylePack, TakeOptions, TakeRecipe } from "@ensemble/engine";
import { render, seconds, toMidi } from "@ensemble/engine";
import { styleById, styleIds } from "@ensemble/styles";
import { reportDiagnostics, UsageError } from "./command.ts";

export function findStyle(id: string): StylePack {
  const style = styleById(id);
  if (!style) throw new UsageError(`no style "${id}" (styles: ${styleIds().join(", ")})`);
  return style;
}

/** Pretty JSON, keys sorted at every level, trailing newline. */
export function writeRecipe(path: string, recipe: TakeRecipe): void {
  const sorted = (_key: string, value: unknown): unknown =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : value;
  writeFileSync(path, `${JSON.stringify(recipe, sorted, 2)}\n`);
}

/** Renders, reports diagnostics, writes the MIDI file (if asked), prints the one-line summary. */
export function playTake(
  chartName: string,
  text: string,
  style: StylePack,
  options: TakeOptions,
  out: string | undefined,
): void {
  const take = render(text, style, options);
  reportDiagnostics(chartName, take.diagnostics);
  if (out !== undefined) writeFileSync(out, toMidi(take.plan, take.events, style));
  const notes = take.events.filter((event) => event.kind === "note").length;
  const length = Math.round(seconds(take.plan));
  console.log(
    `${out ?? chartName}: ${style.name}, ${take.plan.tempo} bpm, ${take.plan.passes} ${take.plan.passes === 1 ? "pass" : "passes"}, ` +
      `${take.plan.bars.length} bars, ${Math.floor(length / 60)}:${String(length % 60).padStart(2, "0")}, ${notes} notes, seed ${options.seed}`,
  );
}
