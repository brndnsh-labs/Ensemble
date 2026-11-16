// Where the player is, read from the address bar: `#/` and what follows it.
// Every place has an address, so the phone's own back gesture works, a reload
// lands on the same screen, and a chart can be bookmarked.
//
//   #/                    home
//   #/takes               home, showing the takes that were kept
//   #/charts              the library, every chart
//   #/charts/yours        the library, the player's own charts
//   #/charts/<style>      the library, the charts written for one style
//   #/charts?find=<text>  the library, what a search found
//   #/chart/<id>          a chart, to play
//   #/edit/<id>           one of the player's charts, in the editor
//   #/take/<id>           a kept take
//   #/credits

export type Route =
  | { readonly screen: "home"; readonly takes: boolean }
  /** `show` is empty for every chart, `yours`, or a style's id. A search is across all of them. */
  | { readonly screen: "library"; readonly show: string; readonly find: string }
  | { readonly screen: "chart" | "edit" | "take"; readonly id: string }
  | { readonly screen: "credits" };

export const HOME = "#/";
export const TAKES = "#/takes";
export const LIBRARY = "#/charts";
export const YOURS = "yours";

/** The library showing the player's own charts (`yours`) or one style's. */
export const showing = (show: string): string =>
  show === "" ? LIBRARY : `${LIBRARY}/${encodeURIComponent(show)}`;

/** The library showing what a search for this text finds. Nothing typed is every chart. */
export const finding = (text: string): string =>
  text === "" ? LIBRARY : `${LIBRARY}?find=${encodeURIComponent(text)}`;

const decoded = (part: string): string => {
  try {
    return decodeURIComponent(part);
  } catch {
    // A stray per cent sign, typed by hand: read it as written.
    return part;
  }
};

export function routeOf(hash: string): Route {
  const [path = "", query = ""] = hash.replace(/^#\/?/, "").split("?");
  const [first = "", ...rest] = path.split("/");
  const id = decoded(rest.join("/"));
  if (first === "takes") return { screen: "home", takes: true };
  if (first === "credits") return { screen: "credits" };
  if (first === "charts") {
    const find = /(?:^|&)find=([^&]*)/.exec(query)?.[1];
    return { screen: "library", show: id, find: find === undefined ? "" : decoded(find) };
  }
  if ((first === "chart" || first === "edit" || first === "take") && id !== "")
    return { screen: first, id };
  return { screen: "home", takes: false };
}

// ── Moving between addresses ────────────────────────────────────────────────

const listeners = new Set<() => void>();

/**
 * How the address being shown was reached: by going back or forward through
 * the browser's history (a screen seen before, wanted as it was left), or by
 * a press on something in the app (a place gone to afresh).
 */
let returned = false;
/** The address shown before this one. */
let before = "";
let current = location.hash;
let entries = 0;

/** A history entry the app has seen carries a mark; one it has not is new. */
const marked = (): boolean =>
  typeof (history.state as { ensemble?: unknown } | null)?.ensemble === "number";

const mark = (): void => {
  try {
    history.replaceState({ ensemble: ++entries }, "");
  } catch {
    // A browser that rations these: the entry goes unmarked, and coming back to it is taken for new.
  }
};

function arrive(byHistory: boolean): void {
  if (location.hash === current) return;
  before = current;
  current = location.hash;
  returned = byHistory;
  for (const listener of listeners) listener();
}

// The page's own scrolling is put back by the screens themselves, each to where it was left.
history.scrollRestoration = "manual";
if (!marked()) mark();
addEventListener("hashchange", () => {
  // A link pressed makes a new entry with no mark; the back gesture lands on one that has it.
  const known = marked();
  if (!known) mark();
  arrive(known);
});

/** For `useSyncExternalStore`: told at once when the address changes, however it was changed. */
export function subscribeAddress(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const address = (): string => current;

/** True when this address was come back to through the browser's history. */
export const cameBack = (): boolean => returned;

/** The address shown before this one, or empty when the app opened here. */
export const cameFrom = (): string => before;

/**
 * Go to an address, from a press. The screens are told before this returns:
 * a search box that writes each letter into the address must read it back in
 * the same breath, or the caret jumps.
 */
export function go(to: string): void {
  if (to === location.hash) return;
  history.pushState({ ensemble: ++entries }, "", to);
  arrive(false);
}

/** Put another address in this one's place: the back gesture will not stop at the one replaced. */
export function swap(to: string): void {
  if (to === location.hash) return;
  try {
    history.replaceState({ ensemble: ++entries }, "", to);
  } catch {
    // Safari allows a hundred of these in thirty seconds. Past that the address is a new entry instead.
    history.pushState({ ensemble: ++entries }, "", to);
  }
  const from = before;
  arrive(false);
  // Replaced, not left: where the player came from is where they were before the one replaced.
  before = from;
}
