// Asking the band for a performance. The engine runs in a worker
// (band-worker.ts); this is the page's side of that.

import type { Reply, Request } from "./band-worker.ts";
import type { Ask, JamSetup, Performance } from "./jam.ts";

export interface Made extends Performance {
  /** Seconds the engine took: how far ahead to ask next time. */
  readonly took: number;
}

let worker: Worker | undefined;
let asked = 0;
const waiting = new Map<
  number,
  { resolve: (made: Made) => void; reject: (error: Error) => void }
>();

/** Start the worker, so the first press of play does not wait for it. */
export function warmUp(): void {
  if (worker) return;
  worker = new Worker(new URL("./band-worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }: MessageEvent<Reply>) => {
    const asker = waiting.get(data.id);
    waiting.delete(data.id);
    if (!asker) return;
    if (data.performance) asker.resolve({ ...data.performance, took: data.took });
    else asker.reject(new Error(data.failed ?? "the band could not play this"));
  };
}

/** The performance of a jam, made off the page's thread. */
export function perform(setup: JamSetup, ask: Ask = {}): Promise<Made> {
  warmUp();
  const id = ++asked;
  const request: Request = { id, setup: { ...setup, style: setup.style.id }, ask };
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker!.postMessage(request);
  });
}
