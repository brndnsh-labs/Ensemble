// Asking the band for a performance. The engine runs in a worker
// (band-worker.ts); this is the page's side of that.

import type { TakeRecipe } from "@ensemble/engine";
import type { Reply, Request } from "./band-worker.ts";
import type { Performance } from "./jam.ts";

export interface Made extends Performance {
  /** Seconds the engine took: how far ahead to ask next time. */
  readonly took: number;
}

let worker: Worker | undefined;
let asked = 0;
const waiting = new Map<
  number,
  { resolve: (reply: Reply) => void; reject: (error: Error) => void }
>();

/** Start the worker, so the first press of play does not wait for it. */
export function warmUp(): void {
  if (worker) return;
  worker = new Worker(new URL("./band-worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }: MessageEvent<Reply>) => {
    const asker = waiting.get(data.id);
    waiting.delete(data.id);
    if (!asker) return;
    if (data.failed === undefined) asker.resolve(data);
    else asker.reject(new Error(data.failed));
  };
}

function ask(request: Omit<Request, "id">): Promise<Reply> {
  warmUp();
  const id = ++asked;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker!.postMessage({ ...request, id } satisfies Request);
  });
}

/** A take played through, made off the page's thread. `since` leaves out what has been played. */
export async function perform(recipe: TakeRecipe, since = 0): Promise<Made> {
  const reply = await ask({ recipe, since });
  if (!reply.performance) throw new Error("the band could not play this");
  return { ...reply.performance, took: reply.took };
}

/** A take as a Standard MIDI File: the same bytes `ensemble replay` writes for it. */
export async function midiOf(recipe: TakeRecipe): Promise<Uint8Array<ArrayBuffer>> {
  const reply = await ask({ recipe, midi: true });
  if (!reply.midi) throw new Error("the take could not be written");
  // Copied across from the worker, so it sits in a plain buffer of its own, as a file's bytes may.
  return reply.midi as Uint8Array<ArrayBuffer>;
}
