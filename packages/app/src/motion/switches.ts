// A study, not the app: motions in the spirit of Metro, and two of the poster
// wall's own, each behind a switch, for the owner to try and choose from.
// What is switched on is kept in the browser, and said to the stylesheet as a
// class on the page's root (`m-<id>`), so that every rule of the study is
// gated by its switch and the app with every switch off is the app as it was.

import { useSyncExternalStore } from "react";

export type MotionId =
  | "tilt"
  | "feather"
  | "continuum"
  | "turn"
  | "live"
  | "pivot"
  | "titles"
  | "flood"
  | "print"
  | "marks";

export const MOTIONS: readonly {
  readonly id: MotionId;
  readonly name: string;
  readonly says: string;
}[] = [
  { id: "tilt", name: "Tilt on press", says: "A thing pressed pushes in toward the finger" },
  {
    id: "feather",
    name: "Feathered entrances",
    says: "A screen's pieces come in one after another",
  },
  { id: "continuum", name: "Continuum", says: "What was pressed becomes the next screen's name" },
  { id: "turn", name: "A page turn", says: "Forward from the right, back from the left" },
  { id: "live", name: "Live tiles", says: "Home's styles turn over, one at a time" },
  { id: "pivot", name: "A pivot", says: "The library's places in one row of large words" },
  {
    id: "titles",
    name: "Oversized titles",
    says: "On a phone, home's and a style's name run off the edge",
  },
  { id: "flood", name: "The flood wipes in", says: "Play's ink rises from Play over the dock" },
  {
    id: "print",
    name: "Ink goes down like a print",
    says: "A field of ink lands from a hair oversize",
  },
  {
    id: "marks",
    name: "The marks are drawn",
    says: "An underline or a chosen mark is drawn left to right",
  },
];

/** How long things take, against the times specified: as specified, half, or one and a half. */
export type Speed = 1 | 0.5 | 1.5;

export interface Switches {
  readonly on: Readonly<Record<MotionId, boolean>>;
  readonly speed: Speed;
}

const KEY = "ensemble.motion-study.1";

/** All on to begin with; a build made with `VITE_MOTION=off` begins with all off (the smoke journeys with the switches off). */
const START = import.meta.env.VITE_MOTION !== "off";

const every = (value: boolean): Record<MotionId, boolean> =>
  Object.fromEntries(MOTIONS.map(({ id }) => [id, value])) as Record<MotionId, boolean>;

function load(): Switches {
  const fallback: Switches = { on: every(START), speed: 1 };
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Switches> | null;
    if (!stored || typeof stored !== "object") return fallback;
    const on = { ...fallback.on };
    for (const { id } of MOTIONS) if (typeof stored.on?.[id] === "boolean") on[id] = stored.on[id];
    const speed = stored.speed === 0.5 || stored.speed === 1.5 ? stored.speed : 1;
    return { on, speed };
  } catch {
    return fallback;
  }
}

let state = load();
const listeners = new Set<() => void>();

/** Say the switches to the stylesheet: a class for each one on, and the speed. */
function apply(): void {
  const root = document.documentElement;
  for (const { id } of MOTIONS) root.classList.toggle(`m-${id}`, state.on[id]);
  root.style.setProperty("--m-speed", String(state.speed));
}
apply();

export function setSwitches(next: Switches): void {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Not kept: the choice lasts as long as the visit.
  }
  apply();
  for (const listener of listeners) listener();
}

export const switches = (): Switches => state;

export const allSwitched = (value: boolean): Record<MotionId, boolean> => every(value);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useSwitches = (): Switches => useSyncExternalStore(subscribe, switches);

const less = matchMedia("(prefers-reduced-motion: reduce)");

/** The device asks for less movement: nothing of the study moves (the pivot and the titles, being layout, stay). */
export const reduced = (): boolean => less.matches;

/** A motion that is switched on and may move now. */
export const moving = (id: MotionId): boolean => state.on[id] && !reduced();

/** A duration in milliseconds, at the speed chosen. */
export const ms = (specified: number): number => specified * state.speed;
