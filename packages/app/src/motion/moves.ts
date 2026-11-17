// The study's motions. Every one animates `transform` and `opacity` only, by the
// browser's own animations (`Element.animate`), which run off the main thread
// where they can; none waits on anything before a press is acted on, and each
// is cut short by the next press. Nothing here runs where the device asks for
// less movement.

import { flushSync } from "react-dom";
import type { Route } from "../address.ts";
import { onArrival, routeOf } from "../address.ts";
import { moving, ms } from "./switches.ts";

/** Metro's ease: quick, and out. */
const OUT = "cubic-bezier(0.1, 0.9, 0.2, 1)";

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
  // Back in under 120 ms, a hair past level and home: a spring, not a fade.
  element.animate(
    [{ transform }, { transform: "scale(1.004)", offset: 0.7 }, { transform: "none" }],
    {
      duration: ms(100),
      easing: "cubic-bezier(0.2, 0.7, 0.3, 1)",
    },
  );
}

function press(event: PointerEvent): void {
  if (!moving("tilt") || event.button !== 0 || !(event.target instanceof Element)) return;
  const element = event.target.closest<HTMLElement>(TILTS);
  if (!element || element.closest(".motion-sheet") || (element as HTMLButtonElement).disabled)
    return;
  release();
  // A live tile in the middle of turning over is put down where it is going.
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
  // In the frame of the press: written at once, with no transition.
  element.style.transform = transform;
  tilted = { element, transform };
}

// ── Arriving on a screen: feathered, printed, turned ────────────────────────

/** A field of a style's ink: printed where (9) is on, rather than feathered. */
const INK = ".last, .lately-item, .tile, .style-head";
/** The pieces a screen's arrival stages: home's poster, bills and tiles, and a list's rows. */
const PIECES = `${INK}, .rows > li`;

const STEP = 22;
const PIECE = 110;
/** Steps at most: the last starts at 88 ms and is in by 198 ms. */
const STEPS = 5;

export const inView = (element: Element): boolean => {
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
 * Stage the pieces in view, one line after another: pieces at the same height
 * come together, and past the fifth line the rest come with the fifth. A move
 * and a fade each, all in by 200 ms. The pieces are where they will be, and
 * pressable, from the first frame.
 */
export function feather(root: ParentNode, selector: string, skip = ""): void {
  const pieces = [...root.querySelectorAll<HTMLElement>(selector)].filter(
    (piece) => inView(piece) && !(skip && piece.matches(skip)),
  );
  const lines = [
    ...new Set(pieces.map((piece) => Math.round(piece.getBoundingClientRect().top / 8))),
  ].sort((a, b) => a - b);
  for (const piece of pieces) {
    const line = lines.indexOf(Math.round(piece.getBoundingClientRect().top / 8));
    piece.animate(
      [
        { transform: "translateX(28px)", opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      {
        duration: ms(PIECE),
        delay: ms(Math.min(line, STEPS - 1) * STEP),
        easing: OUT,
        fill: "backwards",
      },
    );
  }
}

/** Ink pressed onto the paper: from a hair oversize to size, as it comes up from nothing. */
export function print(elements: Iterable<HTMLElement>, over = 1.03): void {
  for (const element of elements) {
    element.animate(
      [
        { transform: `scale(${over})`, opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      { duration: ms(120), easing: "cubic-bezier(0.3, 0.6, 0.2, 1)" },
    );
  }
}

/** The pieces of a screen just arrived at, staged by whichever of (2) and (9) is on. */
export function stage(root: ParentNode): void {
  if (moving("print")) print([...root.querySelectorAll<HTMLElement>(INK)].filter(inView));
  if (moving("feather")) feather(root, PIECES, moving("print") ? INK : "");
}

/** A sheet's options, as it opens: never over the chart while the band plays. */
export function stageSheet(sheet: HTMLElement): void {
  if (!moving("feather") || sheet.classList.contains("motion-sheet")) return;
  if (document.querySelector('.play:not([data-state="idle"])')) return;
  feather(sheet, ".opt, .menu > li, .tempo-set, .tempo-range");
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

/** The arriving screen's content, from the right going forward and from the left going back: 150 ms, nothing leaving. */
export function turn(root: HTMLElement, back: boolean): void {
  if (!moving("turn")) return;
  root.animate([{ transform: `translateX(${back ? -32 : 32}px)` }, { transform: "none" }], {
    duration: ms(150),
    easing: OUT,
  });
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
    route.screen === "chart" || route.screen === "edit"
      ? document.querySelector<HTMLElement>(".chart-title")
      : route.screen === "library" && route.find === "" && route.show !== ""
        ? document.querySelector<HTMLElement>(".style-head .poster-name")
        : null;
  return heading && inView(heading) ? heading : undefined;
}

let running: ViewTransition | undefined;

/**
 * The thing pressed becomes the heading where it leads, and back again, by
 * the browser's same-document view transition. Only the pair moves: the rest
 * of the page is not captured, so it changes at once, under the pair, and
 * stays pressable. Where the browser has no view transitions, or no pair is
 * in view, the screen simply changes.
 */
function continuum(from: string, to: string, show: () => void): boolean {
  if (running) {
    // A press while one is under way: it ends where it is, and this one is acted on at once.
    running.skipTransition();
    return false;
  }
  if (!moving("continuum") || typeof document.startViewTransition !== "function") return false;
  // A play button starts the band as its screen opens: that is not held back a frame for a flight.
  if (pressed?.closest(".row-play, .last-play")) return false;
  const [fromScreen, toScreen] = [screenOf(routeOf(from)), screenOf(routeOf(to))];
  if (!fromScreen || !toScreen || fromScreen.key === toScreen.key) return false;
  // Going to where a link on this screen leads: its words become the heading there.
  // Otherwise, leaving a screen whose heading a link on the next one leads back to.
  const forward = linkTo(to);
  const old = forward ?? headingOf(from);
  if (!old) return false;
  const root = document.documentElement;
  root.classList.add("m-continuum-run");
  old.style.viewTransitionName = "continuum";
  let arrived: HTMLElement | undefined;
  const transition = document.startViewTransition(() => {
    old.style.viewTransitionName = "";
    flushSync(show);
    arrived = forward ? headingOf(to) : linkTo(from);
    if (!arrived) {
      transition.skipTransition();
      return;
    }
    arrived.style.viewTransitionName = "continuum";
    // What it lands in is not also staged: it is already moving.
    for (const piece of [arrived, arrived.closest<HTMLElement>(PIECES)])
      for (const animation of piece?.getAnimations() ?? []) animation.cancel();
  });
  running = transition;
  const done = () => {
    old.style.viewTransitionName = "";
    if (arrived) arrived.style.viewTransitionName = "";
    root.classList.remove("m-continuum-run");
    if (running === transition) running = undefined;
  };
  transition.finished.then(done, done);
  transition.ready.catch(() => {});
  transition.updateCallbackDone.catch(() => {});
  return true;
}

// ── The flood ───────────────────────────────────────────────────────────────

/**
 * The dock's flood of the style's ink, from the press of Play: risen from
 * Play's own block in 120 ms (8), or pressed on as a print (9, which is taken
 * where both are on). `flood` covers the dock, under its words.
 */
export function flood(flood: HTMLElement, dock: HTMLElement): void {
  if (moving("print")) {
    flood.style.transformOrigin = "50% 50%";
    print([flood], 1.02);
    return;
  }
  if (!moving("flood")) return;
  const go = dock.querySelector(".go");
  if (!go) return;
  const whole = dock.getBoundingClientRect();
  const from = go.getBoundingClientRect();
  if (whole.width === 0 || whole.height === 0) return;
  flood.style.transformOrigin = "";
  flood.animate(
    [
      {
        transform: `translate(${from.left - whole.left}px, ${from.top - whole.top}px) scale(${from.width / whole.width}, ${from.height / whole.height})`,
      },
      { transform: "none" },
    ],
    { duration: ms(120), easing: "cubic-bezier(0.3, 0.5, 0.2, 1)" },
  );
}

// ── Installed once ──────────────────────────────────────────────────────────

let installed = false;

export function installMotion(): void {
  if (installed) return;
  installed = true;
  document.addEventListener(
    "pointerdown",
    (event) => {
      pressed = event.target instanceof Element ? event.target : null;
      press(event);
    },
    { capture: true, passive: true },
  );
  // A key pressed acts on what has the focus.
  document.addEventListener(
    "keydown",
    () => {
      pressed = document.activeElement;
    },
    { capture: true, passive: true },
  );
  for (const type of ["pointerup", "pointercancel"] as const)
    document.addEventListener(type, release, { capture: true, passive: true });
  addEventListener("blur", release);
  onArrival(continuum);
}
