// The band, playing a jam through off the page's own thread. A long jam takes
// the engine a second or more to make, and the page cannot stop for that long:
// the scheduler hands notes over a second and a half ahead, and a frozen page
// hands over nothing.

import { styleById } from "@ensemble/styles";
import type { Ask, JamSetup, Performance } from "./jam.ts";
import { performanceOf } from "./jam.ts";

/** A jam as it crosses to the worker: its style by name, since the worker has the styles too. */
export type SentSetup = Omit<JamSetup, "style"> & { readonly style: string };

export interface Request {
  readonly id: number;
  readonly setup: SentSetup;
  readonly ask: Ask;
}

export interface Reply {
  readonly id: number;
  readonly performance?: Performance;
  /** Seconds the engine took. */
  readonly took: number;
  readonly failed?: string;
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(reply: Reply): void;
};

scope.onmessage = ({ data }) => {
  const started = performance.now();
  try {
    const style = styleById(data.setup.style);
    if (!style) throw new Error(`no style "${data.setup.style}"`);
    const made = performanceOf({ ...data.setup, style }, data.ask);
    scope.postMessage({
      id: data.id,
      performance: made,
      took: (performance.now() - started) / 1000,
    });
  } catch (error) {
    scope.postMessage({ id: data.id, took: 0, failed: String(error) });
  }
};
