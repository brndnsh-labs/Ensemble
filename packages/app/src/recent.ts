// What was played lately: the charts and kept takes whose play button was
// pressed, the latest first, so the home screen can put them a tap away. Kept
// in the browser with the rest (`stored.ts`); a browser that refuses to keep
// it still has the list for as long as the visit.

import { storedList } from "./stored.ts";

interface Played {
  /** The address of a chart's or a take's screen: `#/chart/blues-12-bar-a`, `#/take/take-1x2y3z`. */
  readonly id: string;
  /** When play was last pressed there, in milliseconds since 1970. */
  readonly played: number;
}

const KEY = "ensemble.recent.1";

/** More than the home screen shows, so that deleting a chart does not leave the shelf short. */
const REMEMBERED = 12;

const isPlayed = (item: unknown): item is Played => {
  const it = item as Partial<Played> | null;
  return typeof it?.id === "string" && typeof it.played === "number";
};

let shelf: readonly string[] = [];
const recent = storedList(KEY, isPlayed, (items) => {
  shelf = [...items].sort((a, b) => b.played - a.played).map((item) => item.id);
});

export const subscribeRecent = recent.subscribe;

/**
 * The addresses played lately, the latest first. The same list until one is
 * played. A chart or a take since deleted is still in it: whoever shows the
 * list leaves out what is no longer there.
 */
export const recentlyPlayed = (): readonly string[] => shelf;

/** Play was pressed on the screen at this address. */
export function notePlayed(address: string): void {
  const others = recent.items().filter((item) => item.id !== address);
  recent.write(
    [{ id: address, played: Date.now() }, ...others]
      .sort((a, b) => b.played - a.played)
      .slice(0, REMEMBERED),
  );
}
