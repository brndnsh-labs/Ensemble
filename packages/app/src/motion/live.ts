// Live tiles (5): a style's tile on home turns over, slowly and one at a time,
// between its name and a fact about it. A turn is 400 ms, every 6 to 10
// seconds; never two at once, never while a sheet is open or the band plays,
// and not at all while the page is hidden.

import { useEffect } from "react";
import { inView } from "./moves.ts";
import { moving, ms } from "./switches.ts";

const PERSPECTIVE = "perspective(900px)";

/** How many times each tile has shown a fact, so the next turn shows the next fact. */
const shown = new WeakMap<Element, number>();

function turnOver(tile: HTMLElement): void {
  const facts = [...tile.querySelectorAll<HTMLElement>(".tile-fact")];
  if (facts.length === 0) return;
  // Which face it shows: -1 its name, else the fact at that place.
  const now = facts.findIndex((fact) => fact.style.opacity === "1");
  let next = -1;
  if (now === -1) {
    const times = shown.get(tile) ?? 0;
    next = times % facts.length;
    shown.set(tile, times + 1);
  }
  const duration = ms(400);
  tile.animate(
    [
      { transform: `${PERSPECTIVE} rotateX(0deg)`, easing: "cubic-bezier(0.5, 0, 0.9, 0.6)" },
      { transform: `${PERSPECTIVE} rotateX(-90deg)`, offset: 0.5 },
      {
        transform: `${PERSPECTIVE} rotateX(90deg)`,
        offset: 0.5,
        easing: "cubic-bezier(0.1, 0.5, 0.4, 1)",
      },
      { transform: `${PERSPECTIVE} rotateX(0deg)` },
    ],
    { duration },
  );
  // The faces change edge-on, at the turn's middle: only their opacity, held either side.
  const face = (element: HTMLElement | undefined, from: number, to: number) => {
    if (!element) return;
    element.style.opacity = String(to);
    element.animate(
      [
        { opacity: from },
        { opacity: from, offset: 0.5 },
        { opacity: to, offset: 0.5 },
        { opacity: to },
      ],
      { duration },
    );
  };
  face(facts[now], 1, 0);
  face(facts[next], 0, 1);
}

export function useLiveTiles(on: boolean): void {
  useEffect(() => {
    if (!on) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last: Element | undefined;
    const schedule = () => {
      clearTimeout(timer);
      if (!document.hidden) timer = setTimeout(tick, 6000 + Math.random() * 4000);
    };
    const tick = () => {
      schedule();
      if (!moving("live")) return;
      if (document.querySelector("dialog[open]")) return;
      if (document.querySelector('.play:not([data-state="idle"])')) return;
      const tiles = [...document.querySelectorAll<HTMLElement>(".tile")].filter(
        (tile) =>
          tile !== last &&
          tile.querySelector(".tile-fact") &&
          inView(tile) &&
          !tile.matches(":active") &&
          tile.getAnimations({ subtree: true }).length === 0,
      );
      // Never two at once: a tile still turning, or pressed, waits for the next time.
      if (tiles.length === 0 || document.querySelector(".tile:active")) return;
      const tile = tiles[Math.floor(Math.random() * tiles.length)]!;
      last = tile;
      turnOver(tile);
    };
    const seen = () => (document.hidden ? clearTimeout(timer) : schedule());
    document.addEventListener("visibilitychange", seen);
    schedule();
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", seen);
    };
  }, [on]);
}
