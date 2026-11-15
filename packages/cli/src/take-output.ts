// What `render` and `replay` share: finding a style, playing a take, and the recipe file.

import { writeFileSync } from "node:fs";
import type { StylePack, TakeOptions, TakeRecipe } from "@ensemble/engine";
import { recipeText, render, seconds, toMidi } from "@ensemble/engine";
import { styleById, styleIds } from "@ensemble/styles";
import { reportDiagnostics, UsageError } from "./command.ts";

export function findStyle(id: string): StylePack {
  const style = styleById(id);
  if (!style) throw new UsageError(`no style "${id}" (styles: ${styleIds().join(", ")})`);
  return style;
}

/** The recipe as the engine writes it (`recipeText`): the app's Export take writes the same. */
export function writeRecipe(path: string, recipe: TakeRecipe): void {
  writeFileSync(path, recipeText(recipe));
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
