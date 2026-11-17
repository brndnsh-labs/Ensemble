// The band, playing a jam through off the page's own thread. A long jam takes
// the engine a second or more to make, and the page cannot stop for that long:
// the scheduler hands notes over a second and a half ahead, and a frozen page
// hands over nothing.

import type { TakeRecipe } from "@ensemble/engine";
import { render, toMidi } from "@ensemble/engine";
import { styleById } from "@ensemble/styles";
import type { Performance } from "./jam.ts";
import { performanceOf } from "./jam.ts";

export interface Request {
  readonly id: number;
  /** The take, its style by name: the worker has the styles too. */
  readonly recipe: TakeRecipe;
  /** Leave out the sounds before this second. */
  readonly since?: number;
  /** Wanted as a MIDI file, not as sounds. */
  readonly midi?: boolean;
}

export interface Reply {
  readonly id: number;
  readonly performance?: Performance;
  readonly midi?: Uint8Array;
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
  const took = () => (performance.now() - started) / 1000;
  try {
    const { recipe } = data;
    const style = styleById(recipe.style);
    if (!style) throw new Error(`no style "${recipe.style}"`);
    if (data.midi) {
      const take = render(recipe.chartText, style, recipe.options);
      const midi = toMidi(take.plan, take.events, style, recipe.options.instruments);
      scope.postMessage({ id: data.id, midi, took: took() });
    } else {
      const made = performanceOf(recipe, style, data.since);
      scope.postMessage({ id: data.id, performance: made, took: took() });
    }
  } catch (error) {
    scope.postMessage({ id: data.id, took: 0, failed: String(error) });
  }
};
