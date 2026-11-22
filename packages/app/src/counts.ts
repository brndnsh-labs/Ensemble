// Counting the app's use: a few anonymous events, posted to the owner's own
// Umami from production only. Nothing is kept in the browser, no cookie is
// sent and nothing identifies anyone: each screen come to is a page view, and
// each event is its name, the screen it happened on (a fixed path, never the
// address, which can name a chart of the player's own), and the few fields its
// line below allows. Off production, or with do-not-track set, it does nothing
// at all. A send that fails is let go.
//
// Umami's send endpoint (docs.umami.is, "Sending stats"): a POST of
// `{ type: "event", payload: { website, hostname, url, title, referrer, language, screen, name, data } }`
// as JSON. It needs no token; the browser's own User-Agent is the one it asks for.

import type { Seat } from "@ensemble/engine";
import { routeOf } from "./address.ts";

const ENDPOINT = "https://umami.brndn.zip/api/send";
const WEBSITE = "3b7ffbc5-a7bd-4dcd-9587-8eef4053c0ad";
/** The one host that counts: production. The test site, development and the smoke journeys send nothing. */
const PRODUCTION = "ensemble.brndn.zip";

/**
 * How a chart is named in a count: a built-in by its file name, one of the
 * player's own only ever as "own". Made by `chartCalled` and nothing else, so
 * a title cannot be passed where a chart is counted.
 */
export type CountedChart = string & { readonly counted: unique symbol };

export const chartCalled = (chart: { readonly id: string; readonly own: boolean } | undefined) =>
  (chart && !chart.own ? chart.id : "own") as CountedChart;

/** How long a play went on, in minutes. */
export type Length = "0-1" | "1-3" | "3-10" | "10+";

export const lengthOf = (seconds: number): Length =>
  seconds < 60 ? "0-1" : seconds < 180 ? "1-3" : seconds < 600 ? "3-10" : "10+";

type Nothing = Record<string, never>;

/** Every event that may be sent, and exactly what it carries. */
interface Events {
  /** Once as the app is opened. */
  session_class: { device: "phone" | "tablet" | "desktop"; installed: boolean };
  play_started: {
    style: string;
    meter: string;
    mode: "jam" | "song";
    /** The soloist's instrument, or "none" when the soloist sits out. */
    soloist: string;
    chart: CountedChart;
  };
  /** Told to finish and ended, came to its end by itself, was stopped (Stop, Play again, the screen left), or the page was closed. */
  play_ended: { how: "finished" | "ran-out" | "stopped" | "closed"; length: Length };
  style_changed: { style: string };
  seat_toggled: { seat: Seat; on: boolean };
  soloist_changed: { instrument: string };
  /** From home's lately played, or else as a built-in or one of the player's own. */
  chart_opened: { from: "recent" | "library" | "own"; chart: CountedChart };
  chart_created: Nothing;
  chart_imported: Nothing;
  /** A stretch of editing that changed the chart: typed in the text, pressed on the chart or the grid, or both. */
  chart_saved: { editor: "text" | "grid" | "both" };
  take_kept: Nothing;
  midi_downloaded: Nothing;
  instruments_saved_offline: Nothing;
  /** A new build took charge of a page an older one was serving. */
  app_updated: Nothing;
}

type Event = keyof Events;

declare global {
  interface Window {
    /**
     * Set before the page loads, by a smoke journey's init script and nothing
     * else, to count here as on production. No address or query sets it.
     */
    ensembleCountsAsProduction?: boolean;
  }
}

const counting = (): boolean => {
  if (location.hostname !== PRODUCTION && window.ensembleCountsAsProduction !== true) return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  const asked = nav.doNotTrack ?? (window as { doNotTrack?: string }).doNotTrack;
  return asked !== "1" && asked !== "yes" && nav.globalPrivacyControl !== true;
};

/** The screen, as a fixed path: never the address itself. */
function screenPath(): string {
  const route = routeOf(location.hash);
  if (route.screen === "home") return route.takes ? "/takes" : "/";
  if (route.screen === "library") return "/charts";
  return `/${route.screen}`;
}

/** Post one thing to Umami, or do nothing. Never throws, never waits, never tries again. */
function send(what: { name: string; data?: object } | undefined): void {
  if (!counting()) return;
  try {
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "event",
        payload: {
          website: WEBSITE,
          hostname: location.hostname,
          url: screenPath(),
          title: "Ensemble",
          referrer: "",
          language: navigator.language,
          screen: `${screen.width}x${screen.height}`,
          ...what,
        },
      }),
      keepalive: true,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    }).catch(() => {});
  } catch {
    // A browser that will not send it: nothing is counted, and nothing else is touched.
  }
}

/** Send one event, or do nothing. */
export function count<E extends Event>(
  event: E,
  ...data: Events[E] extends Nothing ? [] : [Events[E]]
): void {
  send({ name: event, ...(data[0] ? { data: data[0] } : {}) });
}

let viewed: string | undefined;

/**
 * A screen come to: what Umami calls a page view, the thing with no name that its overview
 * counts visitors and views from (events alone leave it empty). The screen's fixed path and
 * nothing else; once for each screen arrived at, so another chart on the chart's screen is
 * not another view (`chart_opened` counts that).
 */
export function countView(): void {
  const path = screenPath();
  if (path === viewed) return;
  viewed = path;
  send(undefined);
}

/** Once as the app opens: what kind of device, and whether it runs installed. */
export function countSession(): void {
  const coarse = matchMedia("(pointer: coarse)").matches;
  const short = Math.min(screen.width, screen.height);
  const device = !coarse ? "desktop" : short < 600 ? "phone" : "tablet";
  const installed =
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  count("session_class", { device, installed });
}
