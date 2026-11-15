// Every style pack. A new style is a new folder and one line here.

import type { StylePack } from "@ensemble/engine";
import { blues } from "./blues/index.ts";
import { disco } from "./disco/index.ts";
import { funk } from "./funk/index.ts";
import { jazz } from "./jazz/index.ts";
import { rock } from "./rock/index.ts";

export { blues, disco, funk, jazz, rock };

/** The styles that ship: the suite holds every one of them to every property. */
export const STYLES: readonly StylePack[] = [blues, funk, jazz, rock, disco];

export function styleById(id: string): StylePack | undefined {
  return STYLES.find((style) => style.id === id);
}

/** Every style a take can be asked for by name. */
export function styleIds(): string[] {
  return STYLES.map((style) => style.id);
}
