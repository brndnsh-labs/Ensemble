// Every style pack that ships. A new style is a new folder and one line here.

import type { StylePack } from "@ensemble/engine";
import { blues } from "./blues/index.ts";

export { blues };

export const STYLES: readonly StylePack[] = [blues];

export function styleById(id: string): StylePack | undefined {
  return STYLES.find((style) => style.id === id);
}
