// The takes the player kept: performances they liked, to hear again exactly
// and to take away as files. A take is kept as its recipe, which carries the
// chart's text, so changing or deleting the chart later leaves the take as it
// was heard.

import type { Chart, Plan, StylePack, TakeRecipe } from "@ensemble/engine";
import { plan, RECIPE_VERSION } from "@ensemble/engine";
import { styleById } from "@ensemble/styles";
import { chartOf } from "./play/jam.ts";
import { askToKeep, storedList } from "./stored.ts";

export interface KeptTake {
  readonly id: string;
  /** When it was kept, in milliseconds since 1970: the shelf shows the latest first. */
  readonly kept: number;
  /** The chart's name to begin with; the player may change it. */
  readonly name: string;
  readonly recipe: TakeRecipe;
}

const KEY = "ensemble.takes.1";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** What `ensemble replay` would accept, and a name and a date: anything else is not a take. */
const isKept = (item: unknown): item is KeptTake => {
  if (!isObject(item) || !isObject(item.recipe)) return false;
  const { recipe } = item;
  return (
    typeof item.id === "string" &&
    typeof item.kept === "number" &&
    typeof item.name === "string" &&
    recipe.version === RECIPE_VERSION &&
    typeof recipe.chartName === "string" &&
    typeof recipe.chartText === "string" &&
    typeof recipe.style === "string" &&
    isObject(recipe.options) &&
    typeof recipe.options.mode === "string" &&
    (typeof recipe.options.seed === "number" || typeof recipe.options.seed === "string")
  );
};

let shelf: readonly KeptTake[] = [];
const takes = storedList(KEY, isKept, (items) => {
  shelf = [...items].sort((a, b) => b.kept - a.kept);
});

export const subscribeTakes = takes.subscribe;

/** The kept takes, the latest first. The same list until one changes. */
export const keptTakes = (): readonly KeptTake[] => shelf;

/** False when the browser would not keep the last change: the takes last for this visit only. */
export const takesKeptOnDevice = takes.kept;

export const findTake = (id: string): KeptTake | undefined => shelf.find((take) => take.id === id);

/** Keep a take, named for its chart, and say its id. */
export function keepTake(recipe: TakeRecipe): string {
  const id = takes.newId("take-");
  takes.write([...takes.items(), { id, kept: Date.now(), name: recipe.chartName, recipe }]);
  askToKeep();
  return id;
}

/** The take as it now stands, while the jam it was kept from goes on: made longer, or told to finish. */
export function followTake(id: string, recipe: TakeRecipe): void {
  if (!takes.items().some((take) => take.id === id)) return;
  takes.write(takes.items().map((take) => (take.id === id ? { ...take, recipe } : take)));
}

export function renameTake(id: string, name: string): void {
  takes.write(takes.items().map((take) => (take.id === id ? { ...take, name } : take)));
}

export function deleteTake(id: string): void {
  takes.write(takes.items().filter((take) => take.id !== id));
}

/** A take as it was heard: its style, its chart in the key it was played in, and its roadmap. */
export interface Heard {
  readonly style: StylePack;
  readonly chart: Chart;
  readonly plan: Plan;
}

const heard = new WeakMap<TakeRecipe, Heard | null>();

/**
 * What a take was, worked out from its recipe once. Undefined when it no
 * longer plays: its style is gone, or the engine will not plan it.
 */
export function heardAs(recipe: TakeRecipe): Heard | undefined {
  let known = heard.get(recipe);
  if (known === undefined) {
    const style = styleById(recipe.style);
    try {
      const chart = chartOf(recipe.chartText, recipe.options.key);
      known = style ? { style, chart, plan: plan(chart, style, recipe.options) } : null;
    } catch {
      known = null;
    }
    heard.set(recipe, known);
  }
  return known ?? undefined;
}
