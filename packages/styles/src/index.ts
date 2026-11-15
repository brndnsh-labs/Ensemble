// Every style pack. A new style is a new folder and one line here.

import type { StylePack } from "@ensemble/engine";
import { blues } from "./blues/index.ts";
import { funk } from "./funk/index.ts";
import { jazz } from "./jazz/index.ts";

export { blues, funk, jazz };

/** The styles that ship: the suite holds every one of them to every property. */
export const STYLES: readonly StylePack[] = [blues];

/**
 * Styles being written (stage 4). The CLI can render and score them; they join
 * `STYLES` when every seat is their own.
 */
export const UNFINISHED: readonly StylePack[] = [funk, jazz];

export function styleById(id: string): StylePack | undefined {
  return [...STYLES, ...UNFINISHED].find((style) => style.id === id);
}

/** Every style a take can be asked for by name. */
export function styleIds(): string[] {
  return [...STYLES, ...UNFINISHED].map((style) => style.id);
}
