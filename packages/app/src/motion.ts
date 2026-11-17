// How the app moves: a thing pressed tilts toward the finger; a screen's pieces
// arrive one after another, the inks printed and the rest feathered in, the
// whole turned in from the side it came from; the thing pressed becomes the
// heading where it leads; the dock's ink is printed when the band starts.
//
// Every motion is the browser's own animation of `transform` and `opacity`
// only, started in the press's own task or before the screen's first frame.
// Nothing waits on one, and the next press cuts it short. Nothing moves where
// the device asks for less movement. The times and distances are the
// stylesheet's tokens (`--move-*` at the top of `style.css`), read once.

import { flushSync } from "react-dom";
import type { Route } from "./address.ts";
import { onArrival, routeOf } from "./address.ts";

const less = matchMedia("(prefers-reduced-motion: reduce)");

/** Asked at the moment a motion would start, so a change of the device's setting holds at once. */
const still = (): boolean => less.matches;

/** Quick, and out: the ease of everything that arrives. */
const OUT = "cubic-bezier(0.1, 0.9, 0.2, 1)";

let tokens: Record<string, number> | undefined;

/** A `--move-*` token of the stylesheet, as a number of milliseconds or pixels. */
function token(name: string): number {
  if (!tokens) {
    tokens = {};
    const root = getComputedStyle(document.documentElement);
    for (const each of [
      "press-back",
      "feather",
      "feather-step",
      "feather-in",
      "print",
      "turn",
      "turn-in",
    ])
      tokens[each] = Number.parseFloat(root.getPropertyValue(`--move-${each}`)) || 0;
  }
  return tokens[name] ?? 0;
}

// ── Tilt on press ───────────────────────────────────────────────────────────

/** What tilts under a finger: a tile, the poster and its bills, a row's play button, Play, a player, a sheet's option. */
const TILTS =
  ".tile, .last, .lately-item, .row-play, .last-play, .go, .player, .opt, .menu-line, .menu-pick";

let tilted: { readonly element: HTMLElement; readonly transform: string } | undefined;

function release(): void {
  if (!tilted) return;
  const { element, transform } = tilted;
  tilted = undefined;
  element.style.transform = "";
  // A spring back, a hair past level and home, rather than a fade.
  element.animate(
    [{ transform }, { transform: "scale(1.004)", offset: 0.7 }, { transform: "none" }],
    { duration: token("press-back"), easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" },
  );
}

function tilt(event: PointerEvent): void {
  if (still() || event.button !== 0 || !(event.target instanceof Element)) return;
  const element = event.target.closest<HTMLElement>(TILTS);
  if (!element || (element as HTMLButtonElement).disabled) return;
  // The editor's dock holds still under the keyboard: Play there does not tilt.
  if (element.closest(".play.editing .band-dock")) return;
  release();
  // Pressed while it is still arriving: put down where it is going, so the tilt is what shows.
  for (const running of element.getAnimations({ subtree: true })) running.finish();
  const box = element.getBoundingClientRect();
  const size = Math.max(box.width, box.height);
  // Where it was pressed, from -1 to 1 across and down; the side pressed goes in.
  const across = Math.max(-1, Math.min(1, ((event.clientX - box.left) / box.width) * 2 - 1));
  const down = Math.max(-1, Math.min(1, ((event.clientY - box.top) / box.height) * 2 - 1));
  // A small thing tilts further than a large one, so that both are seen to.
  const most = Math.max(4, Math.min(10, 900 / size));
  const centred = 1 - Math.max(Math.abs(across), Math.abs(down));
  const scale = 0.985 - 0.015 * centred;
  const transform = `perspective(${Math.round(Math.max(300, size * 3))}px) rotateX(${(-down * most).toFixed(2)}deg) rotateY(${(across * most).toFixed(2)}deg) scale(${scale.toFixed(3)})`;
  // Written in the press's own task, with no transition: the frame of the press shows it.
  element.style.transform = transform;
  tilted = { element, transform };
}

// ── Arriving on a screen: printed, feathered, turned ────────────────────────

/** A field of a style's ink, printed rather than feathered. */
const INK = ".last, .lately-item, .tile, .style-head";
/** The pieces an arrival stages: home's poster, bills and tiles, and a list's rows. */
const PIECES = `${INK}, .rows > li`;

/** Lines staged one after another at most: past the fifth, the rest come with the fifth. */
const LINES = 5;

/** How faint a piece is at the start of its arrival, or a field of ink as it is printed: enough to read from the first frame. */
const ARRIVING_FROM = 0.5;

const inView = (element: Element): boolean => {
  const box = element.getBoundingClientRect();
  return (
    box.height > 0 &&
    box.bottom > 0 &&
    box.top < innerHeight &&
    box.right > 0 &&
    box.left < innerWidth
  );
};

/**
 * The pieces in view, one line after another: pieces at the same height come
 * together. A short move from the right with a little fade, all in by about
 * 200 ms; the pieces are where they will be, legible and pressable, from the
 * first frame.
 */
function feather(root: ParentNode, selector: string, skip = ""): void {
  const pieces = [...root.querySelectorAll<HTMLElement>(selector)].filter(
    (piece) => inView(piece) && !(skip && piece.matches(skip)),
  );
  const heights = pieces.map((piece) => Math.round(piece.getBoundingClientRect().top / 8));
  const lines = [...new Set(heights)].sort((a, b) => a - b);
  pieces.forEach((piece, at) => {
    const line = lines.indexOf(heights[at] ?? 0);
    piece.animate(
      [
        { transform: `translateX(${token("feather-in")}px)`, opacity: ARRIVING_FROM },
        { transform: "none", opacity: 1 },
      ],
      {
        duration: token("feather"),
        delay: Math.min(line, LINES - 1) * token("feather-step"),
        easing: OUT,
        fill: "backwards",
      },
    );
  });
}

/** Ink pressed onto the paper: from a hair oversize to size, as it comes up to full. */
function print(elements: Iterable<HTMLElement>, over: number): void {
  for (const element of elements)
    element.animate(
      [
        { transform: `scale(${over})`, opacity: ARRIVING_FROM },
        { transform: "none", opacity: 1 },
      ],
      { duration: token("print"), easing: "cubic-bezier(0.3, 0.6, 0.2, 1)" },
    );
}

/** Which screen an address is, for arriving: none for a search being typed, which is not arrived at. */
export function screenOf(
  route: Route,
): { readonly key: string; readonly depth: number } | undefined {
  switch (route.screen) {
    case "home":
      return { key: "home", depth: 0 };
    case "library":
      return route.find.trim() === "" ? { key: `library:${route.show}`, depth: 1 } : undefined;
    case "chart":
    case "edit":
      // Playing and editing a chart are one screen.
      return { key: `chart:${route.id}`, depth: 2 };
    case "take":
      return { key: `take:${route.id}`, depth: 2 };
    default:
      return { key: route.screen, depth: 1 };
  }
}

/**
 * A screen arrived at, before its first frame: its content turned in from the
 * right going forward and from the left going back, with nothing leaving, and
 * its pieces in view printed or feathered. Not into the editing mode, where the
 * keyboard may be coming up and the frame holds still for it.
 */
export function arrived(root: HTMLElement, route: Route, back: boolean | undefined): void {
  if (still() || route.screen === "edit") return;
  if (back !== undefined)
    root.animate(
      [{ transform: `translateX(${back ? -token("turn-in") : token("turn-in")}px)` }, {}],
      { duration: token("turn"), easing: OUT },
    );
  print([...root.querySelectorAll<HTMLElement>(INK)].filter(inView), 1.03);
  feather(root, PIECES, INK);
}

/** A sheet's options, as it opens: never over the chart while the band plays. */
export function stageSheet(sheet: HTMLElement): void {
  if (still() || document.querySelector('.play:not([data-state="idle"])')) return;
  feather(sheet, ".opt, .menu > li, .tempo-set, .tempo-range");
}

/** The dock's flood of the style's ink, printed from the press of Play. */
export function flood(field: HTMLElement): void {
  if (!still()) print([field], 1.02);
}

// ── Continuum ───────────────────────────────────────────────────────────────

/** What a press last landed on: the thing that becomes the next screen's name, if it leads there. */
let pressed: Element | null = null;

const LINKS = "a.tile, a.row-open, a.lately-open, a.last-open";

/** The words of a link to an address, in view: a tile's name, a row's title, the poster's title. */
function linkTo(address: string): HTMLElement | undefined {
  const want = address.replace(/^#\/edit\//, "#/chart/");
  const holder = pressed?.closest(".tile, .row, .lately-item, .last");
  const candidates = [
    ...(holder ? holder.querySelectorAll<HTMLAnchorElement>(LINKS) : []),
    ...(holder?.matches(LINKS) ? [holder as HTMLAnchorElement] : []),
    ...document.querySelectorAll<HTMLAnchorElement>(LINKS),
  ];
  const link = candidates.find((a) => a.getAttribute("href") === want && inView(a));
  if (!link) return undefined;
  return link.querySelector<HTMLElement>(".poster-name, .row-title") ?? link;
}

/** The screen's own name: a chart's title, or a style's poster name. */
function headingOf(address: string): HTMLElement | undefined {
  const route = routeOf(address);
  const heading =
    route.screen === "chart"
      ? document.querySelector<HTMLElement>(".chart-title")
      : route.screen === "library" && route.find === "" && route.show !== ""
        ? document.querySelector<HTMLElement>(".style-head .poster-name")
        : null;
  return heading && inView(heading) ? heading : undefined;
}

/** The flight under way, and how to show its screen at once if a press comes before the browser has. */
let running: { readonly transition: ViewTransition; readonly reveal: () => void } | undefined;

/**
 * A press while a flight is under way: it ends where it is, and the press is
 * answered at once. Before the browser has captured the screen being left,
 * the screen arrived at is shown in the press's own task, not after the capture.
 */
function cut(): void {
  if (!running) return;
  const { transition, reveal } = running;
  transition.skipTransition();
  reveal();
}

/**
 * The thing pressed becomes the heading where it leads, and back again, by
 * the browser's same-document view transition. Only the pair moves: the rest
 * of the page is not captured, so it changes at once, under the pair, and
 * stays pressable. Where the browser has no view transitions, or no pair is
 * in view, the screen simply changes.
 */
function continuum(from: string, to: string, show: () => void): boolean {
  if (running) {
    cut();
    return false;
  }
  if (still() || typeof document.startViewTransition !== "function") return false;
  // A play button starts the band as its screen opens: that is not held back a frame for a flight.
  if (pressed?.closest(".row-play, .last-play")) return false;
  const [fromRoute, toRoute] = [routeOf(from), routeOf(to)];
  // Into or out of the editing mode the keyboard has the screen.
  if (fromRoute.screen === "edit" || toRoute.screen === "edit") return false;
  const [fromScreen, toScreen] = [screenOf(fromRoute), screenOf(toRoute)];
  if (!fromScreen || !toScreen || fromScreen.key === toScreen.key) return false;
  // Going to where a link on this screen leads: its words become the heading there.
  // Otherwise, leaving a screen whose heading a link on the next one leads back to.
  const forward = linkTo(to);
  const old = forward ?? headingOf(from);
  if (!old) return false;
  const root = document.documentElement;
  root.classList.add("continuum");
  old.style.viewTransitionName = "continuum";
  let shown = false;
  const reveal = () => {
    if (shown) return;
    shown = true;
    old.style.viewTransitionName = "";
    flushSync(show);
  };
  let landing: HTMLElement | undefined;
  const transition = document.startViewTransition(() => {
    if (shown) return;
    reveal();
    landing = forward ? headingOf(to) : linkTo(from);
    if (!landing) {
      transition.skipTransition();
      return;
    }
    landing.style.viewTransitionName = "continuum";
    // What it lands in is not also staged: it is already moving.
    for (const piece of [landing, landing.closest<HTMLElement>(PIECES)])
      for (const animation of piece?.getAnimations() ?? []) animation.cancel();
  });
  running = { transition, reveal };
  const done = () => {
    old.style.viewTransitionName = "";
    if (landing) landing.style.viewTransitionName = "";
    root.classList.remove("continuum");
    if (running?.transition === transition) running = undefined;
  };
  transition.finished.then(done, done);
  transition.ready.catch(() => {});
  transition.updateCallbackDone.catch(() => {});
  return true;
}

// ── Installed once ──────────────────────────────────────────────────────────

export function installMotion(): void {
  document.addEventListener(
    "pointerdown",
    (event) => {
      pressed = event.target instanceof Element ? event.target : null;
      cut();
      tilt(event);
    },
    { capture: true, passive: true },
  );
  // A key pressed acts on what has the focus.
  document.addEventListener(
    "keydown",
    () => {
      pressed = document.activeElement;
      cut();
    },
    { capture: true, passive: true },
  );
  for (const type of ["pointerup", "pointercancel"] as const)
    document.addEventListener(type, release, { capture: true, passive: true });
  addEventListener("blur", release);
  onArrival(continuum);
}
